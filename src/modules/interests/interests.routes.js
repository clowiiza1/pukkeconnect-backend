import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';
import { z } from 'zod';
import { syncStudentProfileInterests } from '../../lib/interestSync.js';

const prisma = new PrismaClient();
const router = Router();
const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

const numericId = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative(),
]);

const createInterestSchema = z.object({
  name: z.string().min(1).max(80),
  parentId: numericId.optional(),
});
const bulkReplaceSchema = z.object({
  interestIds: z.array(numericId).max(100).optional(),
});

/**
 * @openapi
 * /api/interests:
 *   get:
 *     tags: [Interests]
 *     summary: List all interests
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [Interests]
 *     summary: Create an interest (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "AI" }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Duplicate name }
 */
router.get('/interests', requireAuth, async (_req, res, next) => {
  try {
    const rows = await prisma.interest.findMany({ orderBy: { name: 'asc' } });
    res.json(rows.map(i => ({
      id: String(i.interest_id),
      name: i.name,
      parentId: i.parent_id ? String(i.parent_id) : null,
    })));
  } catch (e) { next(e); }
});

router.post('/interests', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const body = createInterestSchema.parse(req.body);
    try {
      const saved = await prisma.interest.create({
        data: {
          name: body.name,
          parent_id: body.parentId !== undefined ? BigInt(body.parentId) : null,
        },
      });
      res.status(201).json({
        id: String(saved.interest_id),
        name: saved.name,
        parentId: saved.parent_id ? String(saved.parent_id) : null,
      });
    } catch (e) {
      if (e?.code === 'P2002') return res.status(409).json({ message: 'Interest name already exists' });
      if (e?.code === 'P2003') return res.status(400).json({ message: 'Parent interest does not exist' });
      throw e;
    }
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

/**
 * @openapi
 * /api/students/{student_id}/interests:
 *   get:
 *     tags: [Interests]
 *     summary: List a student's interests (self or admin)
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Forbidden }
 *       404: { description: Student not found }
 *   post:
 *     tags: [Interests]
 *     summary: Bulk attach interests to a student
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [interestIds]
 *             properties:
 *               interestIds:
 *                 type: array
 *                 items: { type: string, example: "12" }
 *     responses:
 *       200: { description: Attached }
 *       403: { description: Forbidden }
 */
router.get('/students/:student_id/interests', requireAuth, async (req, res, next) => {
  try {
    const { student_id } = req.params;
    if (req.user.uid !== student_id && !isAdmin(req.user.role))
      return res.status(403).json({ message: 'Forbidden' });

    const student = await prisma.student_profile.findUnique({
      where: { student_id },
      select: { student_id: true },
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const rows = await prisma.student_interest.findMany({
      where: { student_id },
      include: {
        interest: {
          select: { interest_id: true, name: true, parent_id: true },
        },
      },
      orderBy: { interest: { name: 'asc' } },
    });

    res.json({
      total: rows.length,
      interests: rows.map(row => ({
        id: String(row.interest.interest_id),
        name: row.interest.name,
        parentId: row.interest.parent_id ? String(row.interest.parent_id) : null,
        weight: row.weight,
      })),
    });
  } catch (e) { next(e); }
});

router.post('/students/:student_id/interests', requireAuth, async (req, res, next) => {
  try {
    const { student_id } = req.params;
    if (req.user.uid !== student_id && !isAdmin(req.user.role))
      return res.status(403).json({ message: 'Forbidden' });

    const body = bulkReplaceSchema.parse(req.body);
    const uniqueIds = Array.from(new Set((body.interestIds ?? []).map(String)));
    const bigintIds = uniqueIds.map(id => BigInt(id));

    if (bigintIds.length) {
      const valid = await prisma.interest.findMany({
        where: { interest_id: { in: bigintIds } },
        select: { interest_id: true },
      });
      if (valid.length !== bigintIds.length) {
        return res.status(400).json({ message: 'One or more interest IDs are invalid' });
      }
    }

    const final = await prisma.$transaction(async (tx) => {
      if (bigintIds.length) {
        await tx.student_interest.deleteMany({
          where: {
            student_id,
            interest_id: { notIn: bigintIds },
          },
        });
        const data = bigintIds.map(id => ({ student_id, interest_id: id }));
        if (data.length) {
          await tx.student_interest.createMany({ data, skipDuplicates: true });
        }
      } else {
        await tx.student_interest.deleteMany({ where: { student_id } });
      }

      const synced = await syncStudentProfileInterests(tx, student_id);
      return synced;
    });

    res.json({
      total: final.length,
      interests: final.map(row => ({
        id: String(row.interest.interest_id),
        name: row.interest.name,
      })),
    });
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

/**
 * @openapi
 * /api/students/{student_id}/interests/{interest_id}:
 *   delete:
 *     tags: [Interests]
 *     summary: Detach one interest from a student
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: interest_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       204: { description: Removed }
 *       403: { description: Forbidden }
 */
router.delete('/students/:student_id/interests/:interest_id', requireAuth, async (req, res, next) => {
  try {
    const { student_id, interest_id } = req.params;
    if (req.user.uid !== student_id && !isAdmin(req.user.role))
      return res.status(403).json({ message: 'Forbidden' });

    await prisma.$transaction(async (tx) => {
      await tx.student_interest.deleteMany({
        where: { student_id, interest_id: BigInt(interest_id) },
      });
      await syncStudentProfileInterests(tx, student_id);
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
