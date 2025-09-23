import { Router } from 'express';
import { Prisma, PrismaClient, $Enums } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const CAMPUS_VALUES =
  ($Enums && $Enums.campus_type && Object.values($Enums.campus_type)) ||
  ['Mafikeng', 'Potchefstroom', 'Vanderbijlpark'];

const CampusEnum = z.enum(CAMPUS_VALUES);
/**
 * Allowed updates for the logged-in user.
 * All fields are optional; only provided ones will be changed.
 * - campus can be one of the enum values, or null to clear it.
 * - major is a free text (nullable) field.
 */
const updateMeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phoneNumber: z.string().max(20).optional(),
  major: z.string().min(1).nullable().optional(),
  campus: CampusEnum.nullable().optional(), // enum-aware and nullable
});

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Get current authenticated user
 */
router.get('/me', requireAuth, async (req, res) => {
  const me = await prisma.app_user.findUnique({
    where: { user_id: req.user.id },
    select: {
      user_id: true,
      role: true,
      email: true,
      first_name: true,
      last_name: true,
      university_number: true,
      phone_number: true,
      major: true,
      campus: true,
    },
  });

  if (!me) return res.status(404).json({ message: 'User not found' });

  res.json({
    id: me.user_id,
    role: me.role,
    email: me.email,
    firstName: me.first_name,
    lastName: me.last_name,
    universityNumber: me.university_number,
    phoneNumber: me.phone_number,
    major: me.major,
    campus: me.campus, // one of enum values or null
  });
});

/**
 * @openapi
 * /api/users/me:
 *   patch:
 *     summary: Update current user profile (major, campus, names, phone)
 */
router.patch('/me', requireAuth, async (req, res) => {
  // 1) Validate input (incl. campus enum)
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
  }

  // 2) Map camelCase -> DB snake_case only for provided fields
  const data = {};
  const b = parsed.data;

  if (b.firstName !== undefined) data.first_name = b.firstName;
  if (b.lastName !== undefined) data.last_name = b.lastName;
  if (b.phoneNumber !== undefined) data.phone_number = b.phoneNumber;

  // Nullable text
  if (b.major !== undefined) data.major = b.major; // string or null

  // Enum (nullable). If provided, it’s guaranteed valid by Zod.
  if (b.campus !== undefined) data.campus = b.campus; // enum value or null

  // If nothing to update, short-circuit
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'No fields provided to update' });
  }

  // 3) Persist and return a normalized shape
  const updated = await prisma.app_user.update({
    where: { user_id: req.user.id },
    data,
    select: {
      user_id: true,
      role: true,
      email: true,
      first_name: true,
      last_name: true,
      university_number: true,
      phone_number: true,
      major: true,
      campus: true,
      updated_at: true,
    },
  });

  res.json({
    id: updated.user_id,
    role: updated.role,
    email: updated.email,
    firstName: updated.first_name,
    lastName: updated.last_name,
    universityNumber: updated.university_number,
    phoneNumber: updated.phone_number,
    major: updated.major,
    campus: updated.campus, // enum value or null
    updatedAt: updated.updated_at,
  });
});

export default router;
