import { Router } from 'express';
import pkg from '@prisma/client';
const { PrismaClient, $Enums } = pkg;
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const isUniAdmin = (role) => role === 'university_admin';

const CAMPUS_VALUES = ($Enums?.campus_type && Object.values($Enums.campus_type)) || [
  'Mafikeng',
  'Potchefstroom',
  'Vanderbijlpark',
];
const CampusEnum = z.enum(CAMPUS_VALUES);
const ROLE_VALUES = ($Enums?.user_role && Object.values($Enums.user_role)) || [
  'student',
  'society_admin',
  'university_admin',
];
const RoleEnum = z.enum(ROLE_VALUES);

const listUsersSchema = z.object({
  q: z.string().trim().optional(),
  role: RoleEnum.optional(),
  campus: CampusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phoneNumber: z.string().trim().max(20).optional(),
  campus: CampusEnum.nullable().optional(),
  major: z.string().trim().max(200).nullable().optional(),
  role: RoleEnum.optional(),
});

const userSelect = {
  user_id: true,
  email: true,
  first_name: true,
  last_name: true,
  university_number: true,
  role: true,
  campus: true,
  major: true,
  phone_number: true,
  created_at: true,
  updated_at: true,
  student_profile: {
    select: {
      membership: {
        where: { status: 'active' },
        include: {
          society: {
            select: { society_id: true, society_name: true },
          },
        },
      },
    },
  },
  society_managed_by_admin: {
    select: {
      society_id: true,
      society_name: true,
    },
  },
};

function shapeUserRow(user) {
  const memberships = user.student_profile?.membership ?? [];
  const societies = memberships.map((membership) => ({
    societyId: String(membership.society_id),
    name: membership.society?.society_name ?? 'Unknown',
    status: membership.status,
  }));

  const managedSocieties = (user.society_managed_by_admin ?? []).map((society) => ({
    societyId: String(society.society_id),
    name: society.society_name,
  }));

  return {
    id: user.user_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    universityNumber: user.university_number,
    role: user.role,
    campus: user.campus ?? null,
    major: user.major ?? null,
    phoneNumber: user.phone_number ?? null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    societies,
    managedSocieties,
  };
}

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Basic platform metrics (university_admin only)
 *     responses:
 *       200: { description: OK }
 *       403: { description: Forbidden }
 */
router.get('/admin/stats', requireAuth, async (req, res, next) => {
  try {
    if (!isUniAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const [users, societies, events, rsvps] = await Promise.all([
      prisma.app_user.count(),
      prisma.society.count(),
      prisma.event.count(),
      prisma.event_rsvp.count(),
    ]);

    res.json({ users, societies, events, rsvps });
  } catch (e) {
    next(e);
  }
});

router.get('/admin/users', requireAuth, async (req, res, next) => {
  try {
    if (!isUniAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const filters = listUsersSchema.parse(req.query);
    const where = {};
    const and = [];

    if (filters.q) {
      const term = filters.q;
      and.push({
        OR: [
          { first_name: { contains: term, mode: 'insensitive' } },
          { last_name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { university_number: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.role) and.push({ role: filters.role });
    if (filters.campus) and.push({ campus: filters.campus });

    if (and.length) where.AND = and;

    const skip = (filters.page - 1) * filters.limit;

    const [total, rows] = await Promise.all([
      prisma.app_user.count({ where }),
      prisma.app_user.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: filters.limit,
        select: userSelect,
      }),
    ]);

    res.json({
      data: rows.map(shapeUserRow),
      total,
      page: filters.page,
      limit: filters.limit,
    });
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

router.put('/admin/users/:user_id', requireAuth, async (req, res, next) => {
  try {
    if (!isUniAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const { user_id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(user_id)) {
      return res.status(400).json({ message: 'Invalid user_id' });
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
    }

    const body = parsed.data;
    const data = {};

    if (body.firstName !== undefined) data.first_name = body.firstName.trim();
    if (body.lastName !== undefined) data.last_name = body.lastName.trim();
    if (body.phoneNumber !== undefined) {
      const trimmed = body.phoneNumber.trim();
      data.phone_number = trimmed.length ? trimmed : null;
    }
    if (body.campus !== undefined) data.campus = body.campus;
    if (body.major !== undefined) {
      const trimmed = body.major?.trim();
      data.major = trimmed && trimmed.length ? trimmed : null;
    }
    if (body.role !== undefined) data.role = body.role;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    data.updated_at = new Date();

    const updated = await prisma.app_user.update({
      where: { user_id },
      data,
      select: userSelect,
    });

    res.json(shapeUserRow(updated));
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

router.delete('/admin/users/:user_id', requireAuth, async (req, res, next) => {
  try {
    if (!isUniAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const { user_id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(user_id)) {
      return res.status(400).json({ message: 'Invalid user_id' });
    }

    if (req.user.id === user_id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    await prisma.app_user.delete({ where: { user_id } });
    res.status(204).send();
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    next(err);
  }
});

export default router;