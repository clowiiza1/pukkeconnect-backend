import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config.js';

const prisma = new PrismaClient();


const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
  phoneNumber: z.string().min(10).max(20), 
  major: z.string().min(1).optional(),
  campus: z.enum(['Mafikeng', 'Potchefstroom', 'Vanderbijlpark']).optional(),
  universityNumber: z.string().length(8), 
});

export async function login(req, res) {
  try {
    // Accept either: { universityNumber, password } OR { email, password }
    const { universityNumber, email, password } = req.body || {};

    if ((!universityNumber && !email) || !password) {
      return res.status(400).json({ message: 'University number (or email) and password required' });
    }

    // Decide whether to search by email or university_number
    // If universityNumber provided -> use that.
    // Otherwise if email provided and it contains '@' -> search by email,
    // else treat provided email value as university number.
    let where;
    if (universityNumber) {
      const uniLower = String(universityNumber).toLowerCase();
      where = { university_number: uniLower };
    } else if (email) {
      const val = String(email).trim();
      const isEmail = /@/.test(val);
      where = isEmail ? { email: val.toLowerCase() } : { university_number: val.toLowerCase() };
    }

    const user = await prisma.app_user.findUnique({ where });

    // 401 for auth failures (do not reveal which part failed)
    if (!user || !user.password_hash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    // Issue token (keep existing shape: sub = university_number, uid = user_id, role)
    const token = jwt.sign(
      { sub: user.university_number, uid: user.user_id, role: user.role },
      env.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({
      user: {
        id: user.user_id,
        role: user.role,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        universityNumber: user.university_number,
        major: user.major ?? null,
        campus: user.campus ?? null,
        phoneNumber: user.phone_number ?? null,
      },
      token,
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}




export async function register(req, res) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    }
    const data = parsed.data;

    // 1) Sanitize & validate phone (SA format: 10 digits after stripping)
    const phoneDigits = (data.phoneNumber || '').replace(/\D+/g, '');
    if (phoneDigits.length !== 10) {
      return res.status(400).json({ message: 'phoneNumber must be 10 digits (SA mobile/phone)' });
    }

    // 2) Build NWU email from student number
    const universityNumber = data.universityNumber.toLowerCase();
    const email = `${universityNumber}@mynwu.ac.za`;

    // 3) Pre-check duplicates for nicer errors (optional—Prisma will also catch)
    const [emailExists, numExists] = await Promise.all([
      prisma.app_user.findUnique({ where: { email } }),
      prisma.app_user.findUnique({ where: { university_number: universityNumber } }),
    ]);
    if (emailExists || numExists) {
      return res.status(409).json({ message: 'Account already exists for this student number/email' });
    }

    // 4) Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // 5) Create user (force student role; admins will elevate later)
    const created = await prisma.app_user.create({
      data: {
        role: 'student',
        email,
        first_name: data.firstName,
        last_name: data.lastName,
        phone_number: phoneDigits,
        university_number: universityNumber,
        password_hash: passwordHash,
        major: data.major ?? null,
        campus: data.campus ?? null,
      },
      select: {
        user_id: true,
        role: true,
        email: true,
        first_name: true,
        last_name: true,
        phone_number: true,
        university_number: true,
        major: true,
        campus: true,
      },
    });

    // 6) Create empty student_profile shell (smooth UC2: Maintain Profile)
    await prisma.student_profile.upsert({
      where: { student_id: created.user_id },
      update: {},
      create: {
        student_id: created.user_id,
        study_field: created.major ?? null,
        interests: [],   // Postgres text[] (Prisma: string[])
        availability: null,
      },
    });

    // 7) JWT
    const token = jwt.sign(
      { sub: created.user_id, role: created.role },
      env.jwtSecret,
      { expiresIn: '1h' }
    );

    return res.status(201).json({
      user: {
        id: created.user_id,
        role: created.role,
        email: created.email,
        firstName: created.first_name,
        lastName: created.last_name,
        phoneNumber: created.phone_number,
        universityNumber: created.university_number,
        major: created.major,
        campus: created.campus,
      },
      token,
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      // Unique violation (email or university_number)
      return res.status(409).json({ message: 'Email or student number already in use' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
}
