import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const isUniAdmin = (role) => role === 'university_admin';

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
  } catch (e) { next(e); }
});

export default router;
