import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod schema for updating membership status
const updateStatusSchema = z.object({
  status: z.enum(['active', 'rejected', 'suspended', 'left'])
});

/**
 * POST /api/societies/:societyId/memberships
 * Request to join society
 */
export const requestMembership = async (req, res, next) => {
  const { societyId } = req.params;
  const studentId = req.user.id;

  try {
    // Prevent duplicate requests
    const existing = await prisma.membership.findUnique({
      where: { student_id_society_id: { student_id: studentId, society_id: parseInt(societyId) } }
    });
    if (existing) return res.status(409).json({ message: 'Membership request already exists' });

    const membership = await prisma.membership.create({
      data: {
        student_id: studentId,
        society_id: parseInt(societyId),
        status: 'pending'
      }
    });

    res.status(201).json({
      studentId,
      societyId: parseInt(societyId),
      status: membership.status,
      joinDate: membership.join_date
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/societies/:societyId/memberships/:studentId
 * Update membership status
 */
export const updateMembershipStatus = async (req, res, next) => {
  const { societyId, studentId } = req.params;

  try {
    const body = updateStatusSchema.parse(req.body);

    const membership = await prisma.membership.update({
      where: {
        student_id_society_id: { student_id: studentId, society_id: parseInt(societyId) }
      },
      data: { status: body.status, updated_at: new Date() }
    });

    // Create notification
    await prisma.notification.create({
      data: {
        recipient_id: studentId,
        type: 'membership_update',
        message: `Your membership status for society ${societyId} is now ${body.status}`
      }
    });

    res.json({
      studentId,
      societyId: parseInt(societyId),
      status: membership.status,
      updatedAt: membership.updated_at
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
};

/**
 * GET /api/societies/:societyId/members
 * List members
 */
export const listMembers = async (req, res, next) => {
  const { societyId } = req.params;

  try {
    const members = await prisma.membership.findMany({
      where: { society_id: parseInt(societyId) },
      include: {
        student_profile: { include: { app_user: true } }
      }
    });

    const result = members.map(m => ({
      studentId: m.student_id,
      firstName: m.student_profile?.app_user?.first_name ?? null,
      lastName: m.student_profile?.app_user?.last_name ?? null,
      status: m.status,
      joinDate: m.join_date
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
};
