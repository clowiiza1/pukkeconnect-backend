import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';
import { z } from 'zod';

const prisma = new PrismaClient();
const router = Router();
const isAdmin = (role) => role === 'university_admin' || role === 'society_admin';

const createReportSchema = z.object({
  targetType: z.string().min(1).max(30),
  targetId: z.string().min(1).max(100),
  reason: z.string().min(1).max(2000),
});

const updateReportSchema = z.object({
  status: z.enum(['open','in_review','resolved','dismissed']),
});

/**
 * @openapi
 * /api/reports:
 *   post:
 *     tags: [Reports]
 *     summary: Create a report
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, targetId, reason]
 *             properties:
 *               targetType: { type: string, example: "post" }
 *               targetId:   { type: string, example: "123" }
 *               reason:     { type: string, example: "Spam" }
 *     responses:
 *       201: { description: Created }
 *   get:
 *     tags: [Reports]
 *     summary: List reports (admin)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["open","in_review","resolved","dismissed"] }
 *     responses:
 *       200: { description: OK }
 */
router.post('/reports', requireAuth, async (req, res, next) => {
  try {
    const body = createReportSchema.parse(req.body);
    const saved = await prisma.report.create({
      data: {
        reporter_id: req.user.uid,
        target_type: body.targetType,
        target_id: body.targetId,
        reason: body.reason,
      },
    });
    res.status(201).json({
      reportId: String(saved.report_id),
      status: saved.status,
      createdAt: saved.created_at,
    });
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const status = req.query.status;
    const rows = await prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: 'desc' },
    });
    res.json(rows.map(r => ({
      reportId: String(r.report_id),
      status: r.status,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      reporterId: r.reporter_id,
    })));
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /api/reports/{report_id}:
 *   put:
 *     tags: [Reports]
 *     summary: Update report status (admin)
 *     parameters:
 *       - in: path
 *         name: report_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ["open","in_review","resolved","dismissed"]
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
router.put('/reports/:report_id', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const { report_id } = req.params;
    if (!/^\d+$/.test(report_id)) return res.status(400).json({ message: 'Invalid report_id' });
    const body = updateReportSchema.parse(req.body);

    const updated = await prisma.report.update({
      where: { report_id: BigInt(report_id) },
      data: { status: body.status, updated_at: new Date() },
    });
    res.json({
      reportId: String(updated.report_id),
      status: updated.status,
      updatedAt: updated.updated_at,
    });
  } catch (e) {
    if (e?.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

export default router;
