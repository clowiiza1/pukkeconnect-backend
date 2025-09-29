import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const allowedEvents = new Set(['dismiss']);

const trackEventSchema = z.object({
  event: z.string().min(1).max(50),
  entity: z.string().min(1).max(50),
  id: z.union([z.string(), z.number()]).transform((val) => String(val)),
  payload: z.record(z.any()).optional(),
});

/**
 * @openapi
 * /api/track:
 *   post:
 *     tags: [Recommendations]
 *     summary: Capture lightweight recommendation events (e.g. dismiss)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event, entity, id]
 *             properties:
 *               event: { type: string, example: "dismiss" }
 *               entity: { type: string, example: "society" }
 *               id: { type: string, example: "123" }
 *               payload: { type: object }
 *     responses:
 *       202: { description: Accepted }
 *       400: { description: Invalid payload }
 */
router.post('/track', requireAuth, async (req, res, next) => {
  try {
    const body = trackEventSchema.parse(req.body ?? {});
    if (!allowedEvents.has(body.event)) {
      return res.status(400).json({ message: `Unsupported event type: ${body.event}` });
    }

    await prisma.recommendation_event.create({
      data: {
        student_id: req.user.uid,
        event: body.event,
        entity_type: body.entity,
        entity_id: body.id,
        payload: body.payload ?? null,
      },
    });

    res.status(202).json({ accepted: true });
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

export default router;
