import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

/**
 * @openapi
 * /api/events/{event_id}/like:
 *   post:
 *     tags: [Event Likes]
 *     summary: Like an event (idempotent)
 *     description: Only logged-in users. If already liked, returns 200 (no-op).
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       200:
 *         description: Liked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eventId:   { type: string, example: "123" }
 *                 likedByMe: { type: boolean, example: true }
 *                 likeCount: { type: integer, example: 8 }
 *       400: { description: Invalid event_id }
 *       404: { description: Event not found }
 *   delete:
 *     tags: [Event Likes]
 *     summary: Unlike an event (idempotent)
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       204: { description: Unliked (or no-op) }
 *       400: { description: Invalid event_id }
 */

router.post('/events/:event_id/like', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });
    const eventId = BigInt(event_id);

    const exists = await prisma.event.findUnique({
      where: { event_id: eventId },
      select: { event_id: true },
    });
    if (!exists) return res.status(404).json({ message: 'Event not found' });

    await prisma.event_like.upsert({
      where: { student_id_event_id: { student_id: req.user.uid, event_id: eventId } },
      update: {},
      create: { student_id: req.user.uid, event_id: eventId },
    });

    const likeCount = await prisma.event_like.count({ where: { event_id: eventId } });
    res.json({ eventId: String(eventId), likedByMe: true, likeCount });
  } catch (err) {
    next(err);
  }
});

router.delete('/events/:event_id/like', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });
    const eventId = BigInt(event_id);

    await prisma.event_like.deleteMany({
      where: { student_id: req.user.uid, event_id: eventId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
