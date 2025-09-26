import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

function isAdmin(role) {
  return role === 'society_admin' || role === 'university_admin';
}

const sendSchema = z.object({
  // Accept either recipientIds OR universityNumbers (at least one required)
  recipientIds: z.array(z.string().uuid()).optional(),
  universityNumbers: z.array(z.string().min(1)).optional(),
  type: z.enum([
    'membership_update',
    'event_created',
    'event_reminder',
    'announcement',
    'post',
    'general',
  ]),
  message: z.string().min(1).max(2000),
  linkUrl: z.string().url().optional().nullable(),
}).refine(
  (v) => (v.recipientIds && v.recipientIds.length) || (v.universityNumbers && v.universityNumbers.length),
  { message: 'Provide recipientIds (UUIDs) or universityNumbers (strings).' }
);

/**
 * @openapi
 * tags:
 *   - name: Notifications
 *     description: User notifications
 *
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:           { type: string, example: "123" }    # BigInt -> string
 *         recipientId:  { type: string, format: uuid }
 *         type:         { type: string, enum: ["membership_update","event_created","event_reminder","announcement","post","general"] }
 *         message:      { type: string }
 *         linkUrl:      { type: string, nullable: true }
 *         seenAt:       { type: string, format: date-time, nullable: true }
 *         createdAt:    { type: string, format: date-time }
 *
 *     NotificationFeedResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items: { $ref: '#/components/schemas/Notification' }
 *         page:   { type: integer, example: 1 }
 *         limit:  { type: integer, example: 20 }
 *         total:  { type: integer, example: 57 }
 *         unread: { type: integer, example: 12 }
 */

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get my notifications (paginated, newest first)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NotificationFeedResponse' }
 */
router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const [total, unread, rows] = await Promise.all([
      prisma.notification.count({ where: { recipient_id: req.user.uid } }),
      prisma.notification.count({ where: { recipient_id: req.user.uid, seen_at: null } }),
      prisma.notification.findMany({
        where: { recipient_id: req.user.uid },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          notification_id: true,
          recipient_id: true,
          type: true,
          message: true,
          link_url: true,
          seen_at: true,
          created_at: true,
        },
      }),
    ]);

    const data = rows.map(n => ({
      id: String(n.notification_id),
      recipientId: n.recipient_id,
      type: n.type,
      message: n.message,
      linkUrl: n.link_url ?? null,
      seenAt: n.seen_at,
      createdAt: n.created_at,
    }));

    res.json({ data, page, limit, total, unread });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/notifications/{id}/seen:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark a notification as seen
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       200:
 *         description: Marked as seen
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Notification' }
 *       400:
 *         description: Invalid id
 *       404:
 *         description: Not found
 */
router.put('/notifications/:id/seen', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) return res.status(400).json({ message: 'Invalid id' });
    const notifId = BigInt(id);

    // Ownership check unless admin
    const notif = await prisma.notification.findUnique({
      where: { notification_id: notifId },
      select: { recipient_id: true, notification_id: true, type: true, message: true, link_url: true, seen_at: true, created_at: true },
    });
    if (!notif) return res.status(404).json({ message: 'Not found' });
    if (!isAdmin(req.user.role) && notif.recipient_id !== req.user.uid) {
      return res.status(404).json({ message: 'Not found' }); // hide existence
    }

    const updated = await prisma.notification.update({
      where: { notification_id: notifId },
      data: { seen_at: new Date() },
      select: { notification_id: true, recipient_id: true, type: true, message: true, link_url: true, seen_at: true, created_at: true },
    });

    res.json({
      id: String(updated.notification_id),
      recipientId: updated.recipient_id,
      type: updated.type,
      message: updated.message,
      linkUrl: updated.link_url ?? null,
      seenAt: updated.seen_at,
      createdAt: updated.created_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/notifications/send:
 *   post:
 *     tags: [Notifications]
 *     summary: Send notifications to recipients (admin/internal)
 *     description: Recipients can be specified by UUIDs or university numbers. UUIDs take precedence when both are provided.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, message]
 *             properties:
 *               recipientIds:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *                 example: ["a7e587e5-849a-4859-bd66-859ec4b361d6"]
 *               universityNumbers:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["12345678","87654321"]
 *               type:
 *                 type: string
 *                 enum: ["membership_update","event_created","event_reminder","announcement","post","general"]
 *               message:
 *                 type: string
 *                 example: "Your RSVP is confirmed for tonight’s event."
 *               linkUrl:
 *                 type: string
 *                 nullable: true
 *                 example: "https://pukkeconnect/n/events/42"
 *     responses:
 *       200:
 *         description: Created notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer, example: 2 }
 *                 resolvedRecipientIds:
 *                   type: array
 *                   items: { type: string, format: uuid }
 *                 missingUniversityNumbers:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 */

router.post('/notifications/send', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const body = sendSchema.parse(req.body);

    // Start with any provided UUIDs
    let recipientIds = new Set(body.recipientIds ?? []);

    // Resolve universityNumbers -> user_ids
    let missingUniversityNumbers = [];
    if (body.universityNumbers?.length) {
      const users = await prisma.app_user.findMany({
        where: { university_number: { in: body.universityNumbers } },
        select: { user_id: true, university_number: true },
      });

      const foundByUN = new Map(users.map(u => [u.university_number, u.user_id]));
      for (const un of body.universityNumbers) {
        const uid = foundByUN.get(un);
        if (uid) recipientIds.add(uid);
        else missingUniversityNumbers.push(un);
      }
    }

    const ids = Array.from(recipientIds);
    if (ids.length === 0) {
      return res.status(400).json({ message: 'No valid recipients resolved', missingUniversityNumbers });
    }

    const result = await prisma.notification.createMany({
      data: ids.map(r => ({
        recipient_id: r,
        type: body.type,
        message: body.message,
        link_url: body.linkUrl ?? null,
      })),
    });

    res.json({
      count: result.count,
      resolvedRecipientIds: ids,
      missingUniversityNumbers,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
});
export default router;
