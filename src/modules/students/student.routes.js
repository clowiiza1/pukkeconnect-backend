import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();
const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

/**
 * API payloads use camelCase, DB uses snake_case.
 * Zod schema for validation:
 */
const upsertProfileSchema = z.object({
  studyField: z.string().min(1).max(100).optional(),
  interests: z.array(z.string()).optional().default([]),
  availability: z.string().min(1).max(100).optional(),
});

/**
 * @openapi
 * components:
 *   schemas:
 *     StudentProfile:
 *       type: object
 *       properties:
 *         studentId:    { type: string, format: uuid }
 *         studyField:   { type: string, nullable: true, example: "Information Technology" }
 *         interests:
 *           type: array
 *           items: { type: string }
 *           example: ["AI", "Hackathons"]
 *         availability: { type: string, nullable: true, example: "Weeknights after 18:00" }
 *         createdAt:    { type: string, format: date-time }
 *         updatedAt:    { type: string, format: date-time }
 *
 *     UpsertStudentProfileInput:
 *       type: object
 *       properties:
 *         studyField:   { type: string, example: "Information Technology" }
 *         interests:
 *           type: array
 *           items: { type: string }
 *           example: ["AI", "Hackathons"]
 *         availability: { type: string, example: "Weeknights after 18:00" }
 */
/**
 * @openapi
 * /api/students/me/profile:
 *   get:
 *     tags: [Students]
 *     summary: Get my profile
 *     description: Returns the authenticated student's profile (derived from JWT).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfile' }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */

/**
 * @openapi
 * /api/students/{studentId}/societies:
 *   get:
 *     tags: [Students]
 *     summary: List societies a student belongs to
 *     description: Students can view their own memberships. Society or university admins can view any student's memberships.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Memberships retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer, example: 2 }
 *                 memberships:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       society:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           name: { type: string }
 *                           category: { type: string, nullable: true }
 *                           campus: { type: string, nullable: true }
 *                           description: { type: string, nullable: true }
 *                       status: { type: string, example: "active" }
 *                       joinDate: { type: string, format: date-time, nullable: true }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Student not found
 */

/**
 * @openapi
 * /api/students/me/profile:
 *   put:
 *     tags: [Students]
 *     summary: Create or replace my profile
 *     description: Upserts the authenticated student's profile.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpsertStudentProfileInput' }
 *     responses:
 *       200:
 *         description: Saved
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfile' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
/**
 * @openapi
 * /api/students/me/profile:
 *   patch:
 *     tags: [Students]
 *     summary: Partially update my profile
 *     description: Updates only the provided fields on the authenticated student's profile.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpsertStudentProfileInput' }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfile' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
/**
 * @openapi
 * /api/students/{userId}/profile:
 *   get:
 *     tags: [Students]
 *     summary: Get a student's profile by userId (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string}
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfile' }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Profile not found
 */
/**
 * @openapi
 * /api/students/{userId}/profile:
 *   patch:
 *     tags: [Students]
 *     summary: Update a student's profile by userId (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpsertStudentProfileInput' }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/StudentProfile' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Profile not found
 */


/**
 * @openapi
 * /api/students/me/profile:
 *   get:
 *     summary: Get the authenticated student's profile
 *     tags: [Students]
 *   put:
 *     summary: Create or replace the authenticated student's profile
 *     tags: [Students]
 *   patch:
 *     summary: Partially update the authenticated student's profile
 *     tags: [Students]
 */

//Api for student to get their profile
//. /api/students/me/profile
router.get('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const studentId = req.user.id; // from JWT
    const profile = await prisma.student_profile.findUnique({
      where: { student_id: studentId },
    });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    // map snake_case -> camelCase
    const out = {
      studentId: profile.student_id,
      studyField: profile.study_field ?? null,
      interests: profile.interests ?? [],
      availability: profile.availability ?? null,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/:studentId/societies', requireAuth, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const requesterId = req.user.uid || req.user.id;
    if (requesterId !== studentId && !isAdmin(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const studentExists = await prisma.app_user.findUnique({
      where: { user_id: studentId },
      select: { user_id: true },
    });
    if (!studentExists) return res.status(404).json({ message: 'Student not found' });

    const memberships = await prisma.membership.findMany({
      where: { student_id: studentId },
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

    const response = memberships.map((membership) => ({
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

    return res.json({ total: response.length, memberships: response });
  } catch (err) {
    next(err);
  }
});

// GET /api/students/:universityNumber/profile (admin only)
router.get('/:universityNumber/profile', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'university_admin' && req.user.role !== 'society_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const user = await prisma.app_user.findUnique({
      where: { university_number: req.params.universityNumber },
      select: {
        university_number: true,
        student_profile: {
          select: {
            study_field: true,
            interests: true,
            availability: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });

    const profile = user?.student_profile;
    if (!user || !profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({
      studentId: user.university_number,
      studyField: profile.study_field ?? null,
      interests: profile.interests ?? [],
      availability: profile.availability ?? null,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/students/me/profile (student)
router.put('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const body = upsertProfileSchema.parse(req.body);
    const universityNumber = req.user.universityNumber; // use university number from JWT
    const studentId = req.user.id; // internal UUID for relations

    const saved = await prisma.student_profile.upsert({
      where: { student_id: studentId },
      create: {
        student_id: studentId,
        study_field: body.studyField ?? null,
        interests: body.interests ?? [],
        availability: body.availability ?? null,
      },
      update: {
        study_field: body.studyField ?? null,
        interests: body.interests ?? [],
        availability: body.availability ?? null,
        updated_at: new Date(),
      },
    });

    res.status(200).json({
      studentId: universityNumber,
      studyField: saved.study_field ?? null,
      interests: saved.interests ?? [],
      availability: saved.availability ?? null,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
});

// PATCH /api/students/me/profile (student)
router.patch('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const partial = upsertProfileSchema.partial().parse(req.body);
    const universityNumber = req.user.universityNumber;
    const studentId = req.user.id;

    const existing = await prisma.student_profile.findUnique({
      where: { student_id: studentId },
    });
    if (!existing) return res.status(404).json({ message: 'Profile not found' });

    const saved = await prisma.student_profile.update({
      where: { student_id: studentId },
      data: {
        study_field: partial.studyField ?? existing.study_field,
        interests: partial.interests ?? existing.interests,
        availability: partial.availability ?? existing.availability,
        updated_at: new Date(),
      },
    });

    res.json({
      studentId: universityNumber,
      studyField: saved.study_field ?? null,
      interests: saved.interests ?? [],
      availability: saved.availability ?? null,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
});

export default router;
