import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';
import { z } from 'zod';

const prisma = new PrismaClient();
const router = Router();
const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

const createInterestSchema = z.object({ name: z.string().min(1).max(80) });
const bulkAttachSchema = z.object({ interestIds: z.array(z.string()).min(1) });

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
    res.json(rows.map(i => ({ id: String(i.interest_id), name: i.name })));
  } catch (e) { next(e); }
});

router.post('/interests', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const body = createInterestSchema.parse(req.body);
    try {
      const saved = await prisma.interest.create({ data: { name: body.name } });
      res.status(201).json({ id: String(saved.interest_id), name: saved.name });
    } catch (e) {
      if (e?.code === 'P2002') return res.status(409).json({ message: 'Interest name already exists' });
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
router.post('/students/:student_id/interests', requireAuth, async (req, res, next) => {
  try {
    const { student_id } = req.params;
    if (req.user.uid !== student_id && !isAdmin(req.user.role))
      return res.status(403).json({ message: 'Forbidden' });

    const body = bulkAttachSchema.parse(req.body);
    const values = [...new Set(body.interestIds)].map(id => ({ student_id, interest_id: BigInt(id) }));
    if (!values.length) return res.json({ added: 0 });

    await prisma.student_interest.createMany({ data: values, skipDuplicates: true });
    const count = await prisma.student_interest.count({ where: { student_id } });
    res.json({ added: values.length, totalForStudent: count });
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

    await prisma.student_interest.deleteMany({
      where: { student_id, interest_id: BigInt(interest_id) },
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
