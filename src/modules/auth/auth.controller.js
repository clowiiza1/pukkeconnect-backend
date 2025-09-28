import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config.js';
import { sendPasswordResetEmail } from '../../lib/mailer.js';

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

const requestResetSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
});

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  token: z.string().min(1),
  newPassword: z.string().min(8),
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
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid username or password' });

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

export async function requestPasswordReset(req, res) {
  const parsed = requestResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'identifier is required' });
  }

  const identifierInput = parsed.data.identifier.trim();
  const identifier = identifierInput.toLowerCase();
  const where = identifier.includes('@')
    ? { email: identifier }
    : { university_number: identifier };

  try {
    const user = await prisma.app_user.findUnique({ where });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(rawToken, 12);
      const expiresAt = new Date(Date.now() + env.resetTokenTtlMinutes * 60 * 1000);
      const requestIp = req.ip ? String(req.ip).slice(0, 45) : null;
      const userAgent = req.get?.('user-agent') ? req.get('user-agent').slice(0, 255) : null;

      await prisma.$transaction(async trx => {
        await trx.password_reset_token.updateMany({
          where: { user_id: user.user_id, consumed_at: null },
          data: { consumed_at: new Date() },
        });

        await trx.password_reset_token.create({
          data: {
            user_id: user.user_id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            request_ip: requestIp,
            user_agent: userAgent,
          },
        });
      });

      let link;
      try {
        const url = new URL(env.frontendResetUrl);
        url.searchParams.set('uid', user.user_id);
        url.searchParams.set('token', rawToken);
        link = url.toString();
      } catch (err) {
        const sep = env.frontendResetUrl.includes('?') ? '&' : '?';
        link = `${env.frontendResetUrl}${sep}uid=${encodeURIComponent(user.user_id)}&token=${encodeURIComponent(rawToken)}`;
      }

      try {
        await sendPasswordResetEmail({ to: user.email, link });
      } catch (emailErr) {
        console.error('sendPasswordResetEmail error', emailErr);
      }
    }
  } catch (err) {
    console.error('requestPasswordReset error', err);
  }

  return res.json({ message: 'If an account exists for the provided details, a password reset email has been sent.' });
}

export async function resetPassword(req, res) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
  }

  const { userId, token, newPassword } = parsed.data;

  try {
    const record = await prisma.password_reset_token.findFirst({
      where: { user_id: userId, consumed_at: null },
      orderBy: { created_at: 'desc' },
    });

    const now = new Date();
    if (!record || record.expires_at <= now) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const match = await bcrypt.compare(token, record.token_hash);
    if (!match) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async trx => {
      await trx.app_user.update({
        where: { user_id: userId },
        data: { password_hash: newHash },
      });

      await trx.password_reset_token.update({
        where: { token_id: record.token_id },
        data: { consumed_at: now },
      });

      await trx.password_reset_token.updateMany({
        where: {
          user_id: userId,
          consumed_at: null,
          token_id: { not: record.token_id },
        },
        data: { consumed_at: now },
      });
    });

    return res.status(204).send();
  } catch (err) {
    console.error('resetPassword error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
