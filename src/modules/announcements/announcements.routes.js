import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';
import { z } from 'zod';

const prisma = new PrismaClient();
const router = Router();
const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

const createAnnSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
});

/**
 * @openapi
 * /api/announcements:
 *   get:
 *     tags: [Announcements]
 *     summary: List announcements (optionally filter by campus)
 *     parameters:
 *       - in: query
 *         name: campus
 *         schema: { type: string, enum: ["Mafikeng","Potchefstroom","Vanderbijlpark"] }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [Announcements]
 *     summary: Create announcement (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *     responses:
 *       201: { description: Created }
 *       403: { description: Forbidden }
 */
router.get('/announcements', requireAuth, async (req, res, next) => {
  try {
    const campus = req.query.campus;
    const rows = await prisma.announcement.findMany({
      where: campus ? { app_user: { campus: campus } } : undefined,
      orderBy: { created_at: 'desc' },
      include: { app_user: { select: { user_id: true, first_name: true, last_name: true, campus: true } } },
    });
    res.json(rows.map(a => ({
      id: String(a.announcement_id),
      title: a.title,
      description: a.description ?? null,
      createdAt: a.created_at,
      createdBy: {
        userId: a.app_user.user_id,
        firstName: a.app_user.first_name,
        lastName: a.app_user.last_name,
        campus: a.app_user.campus ?? null,
      },
    })));
  } catch (e) { next(e); }
});

router.post('/announcements', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const body = createAnnSchema.parse(req.body);
    const saved = await prisma.announcement.create({
      data: { title: body.title, description: body.description ?? null, created_by: req.user.uid },
      include: { app_user: { select: { first_name: true, last_name: true, campus: true } } },
    });
    res.status(201).json({
      id: String(saved.announcement_id),
      title: saved.title,
      description: saved.description ?? null,
      createdAt: saved.created_at,
      createdBy: {
        userId: req.user.uid,
        firstName: saved.app_user.first_name,
        lastName: saved.app_user.last_name,
        campus: saved.app_user.campus ?? null,
      },
    });
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

/**
 * @openapi
 * /api/announcements/{id}:
 *   get:
 *     tags: [Announcements]
 *     summary: Get announcement by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */
router.get('/announcements/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) return res.status(400).json({ message: 'Invalid id' });
    const a = await prisma.announcement.findUnique({
      where: { announcement_id: BigInt(id) },
      include: { app_user: { select: { user_id: true, first_name: true, last_name: true, campus: true } } },
    });
    if (!a) return res.status(404).json({ message: 'Not found' });
    res.json({
      id: String(a.announcement_id),
      title: a.title,
      description: a.description ?? null,
      createdAt: a.created_at,
      createdBy: {
        userId: a.app_user.user_id,
        firstName: a.app_user.first_name,
        lastName: a.app_user.last_name,
        campus: a.app_user.campus ?? null,
      },
    });
  } catch (e) { next(e); }
});

export default router;
