import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod schema for updating membership status
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'active', 'approved', 'rejected', 'suspended', 'left'])
});

const uuidSchema = z.string().uuid();

const isAdminRole = (role) => role === 'society_admin' || role === 'university_admin';

const resolveStudentByIdentifier = async (identifier) => {
  const trimmed = identifier.trim();
  const identifierIsUuid = uuidSchema.safeParse(trimmed).success;

  return prisma.app_user.findUnique({
    where: identifierIsUuid ? { user_id: trimmed } : { university_number: trimmed },
    select: {
      user_id: true,
      university_number: true,
    },
  });
};

const canAccessStudentRecord = (reqUser, student) => {
  if (!reqUser || !student) return false;
  const requesterId = reqUser.uid || reqUser.id;
  const requesterUniversityNumber = reqUser.universityNumber;

  if (requesterId && requesterId === student.user_id) return true;
  if (requesterUniversityNumber && requesterUniversityNumber === student.university_number) return true;

  return isAdminRole(reqUser.role);
};

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
    if (existing) {
      if (existing.status === 'left') {
        const updatedMembership = await prisma.membership.update({
          where: { student_id_society_id: { student_id: studentId, society_id: parseInt(societyId) } },
          data: {
            status: 'pending',
            join_date: new Date(),
            updated_at: new Date(),
          },
        });

        return res.status(200).json({
          studentId,
          societyId: parseInt(societyId),
          status: updatedMembership.status,
          joinDate: updatedMembership.join_date,
        });
      }

      return res.status(409).json({ message: 'Membership request already exists' });
    }

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
    console.log('Update membership - params:', req.params);
    console.log('Update membership - body:', req.body);
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
      email: m.student_profile?.app_user?.email ?? null,
      phoneNumber: m.student_profile?.app_user?.phone_number ?? null,
      universityNumber: m.student_profile?.app_user?.university_number ?? null,
      status: m.status,
      joinDate: m.join_date
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/memberships/students/:studentId/societies
 * List societies a student belongs to
 */
export const listStudentSocieties = async (req, res, next) => {
  const { studentIdentifier } = req.params;

  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const student = await resolveStudentByIdentifier(studentIdentifier);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!canAccessStudentRecord(req.user, student)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const memberships = await prisma.membership.findMany({
      where: { student_id: student.user_id },
      include: {
        society: {
          select: {
            society_id: true,
            society_name: true,
            category: true,
            campus: true,
            description: true,
          },
        },
      },
      orderBy: { join_date: 'desc' },
    });

    const result = memberships.map((membership) => ({
      society: {
        id: String(membership.society.society_id),
        name: membership.society.society_name,
        category: membership.society.category ?? null,
        campus: membership.society.campus ?? null,
        description: membership.society.description ?? null,
      },
      status: membership.status,
      joinDate: membership.join_date,
    }));

    return res.json({
      studentId: student.user_id,
      universityNumber: student.university_number,
      total: result.length,
      memberships: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/memberships/students/:studentIdentifier/societies/:societyId/status
 * Get membership status for a specific society
 */
export const getStudentMembershipStatus = async (req, res, next) => {
  const { studentIdentifier, societyId } = req.params;
  const societyIdNumber = Number(societyId);

  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const student = await resolveStudentByIdentifier(studentIdentifier);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!canAccessStudentRecord(req.user, student)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        student_id_society_id: {
          student_id: student.user_id,
          society_id: societyIdNumber,
        },
      },
      include: {
        society: {
          select: {
            society_id: true,
            society_name: true,
            category: true,
            campus: true,
            description: true,
          },
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ message: 'Membership not found' });
    }

    return res.json({
      studentId: student.user_id,
      universityNumber: student.university_number,
      society: {
        id: String(membership.society.society_id),
        name: membership.society.society_name,
        category: membership.society.category ?? null,
        campus: membership.society.campus ?? null,
        description: membership.society.description ?? null,
      },
      status: membership.status,
      joinDate: membership.join_date,
      updatedAt: membership.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/memberships/societies/:societyId/leave
 * Allow a student to leave a society by marking the membership as left
 */
export const leaveSociety = async (req, res, next) => {
  const studentId = req.user?.id;
  const societyId = Number(req.params.societyId);

  if (!studentId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const membership = await prisma.membership.findUnique({
      where: {
        student_id_society_id: {
          student_id: studentId,
          society_id: societyId,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ message: 'Membership not found' });
    }

    if (membership.status === 'left') {
      return res.status(409).json({ message: 'You already left this society' });
    }

    if (membership.status === 'rejected') {
      return res.status(409).json({ message: 'Cannot leave a rejected membership request' });
    }

    const updatedMembership = await prisma.membership.update({
      where: {
        student_id_society_id: {
          student_id: studentId,
          society_id: societyId,
        },
      },
      data: { status: 'left', updated_at: new Date() },
    });

    return res.json({
      studentId,
      societyId,
      status: updatedMembership.status,
      updatedAt: updatedMembership.updated_at,
    });
  } catch (err) {
    next(err);
  }
};
