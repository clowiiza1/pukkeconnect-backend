import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

// Request validation
const rsvpSchema = z.object({
  // keep to the 3 user-facing states for now (as requested)
  status: z.enum(['going', 'interested', 'waitlisted']),
});

/**
 * @openapi
 * tags:
 *   - name: Event RSVPs
 *     description: Create / update / cancel event RSVPs
 */

/**
 * @openapi
 * /api/events/{event_id}/rsvp:
 *   post:
 *     tags: [Event RSVPs]
 *     summary: Create or update my RSVP (idempotent upsert)
 *     description: Logged-in users only. Uses a composite PK (student_id, event_id) to prevent duplicates.
 *     parameters:
 *       - in: path
 *         name: event_id
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
 *                 enum: ["going","interested","waitlisted"]
 *     responses:
 *       200:
 *         description: Saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eventId:   { type: string, example: "42" }
 *                 studentId: { type: string, format: uuid }
 *                 status:    { type: string, enum: ["going","interested","waitlisted"] }
 *                 updatedAt: { type: string, format: date-time }
 *       400: { description: Invalid event_id or payload }
 *       404: { description: Event not found }
 *   delete:
 *     tags: [Event RSVPs]
 *     summary: Cancel my RSVP (idempotent)
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       204: { description: Deleted (or no-op) }
 *       400: { description: Invalid event_id }
 */

/**
 * @openapi
 * /api/events/{event_id}/rsvps:
 *   get:
 *     tags: [Event RSVPs]
 *     summary: List RSVPs for an event (admin only)
 *     description: Returns paginated RSVPs. Use status filter to narrow results.
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["interested","going","declined","waitlisted","attended"] }
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
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       studentId: { type: string, format: uuid }
 *                       status:    { type: string }
 *                       updatedAt: { type: string, format: date-time }
 *                       student:
 *                         type: object
 *                         properties:
 *                           firstName: { type: string }
 *                           lastName:  { type: string }
 *                           universityNumber: { type: string }
 *                 page:  { type: integer }
 *                 limit: { type: integer }
 *                 total: { type: integer }
 *       400: { description: Invalid event_id }
 *       403: { description: Forbidden }
 */

router.post('/events/:event_id/rsvp', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });
    const eventId = BigInt(event_id);

    const body = rsvpSchema.parse(req.body);

    // Ensure event exists (avoid generic FK 500s)
    const exists = await prisma.event.findUnique({
      where: { event_id: eventId },
      select: { event_id: true },
    });
    if (!exists) return res.status(404).json({ message: 'Event not found' });

    const saved = await prisma.event_rsvp.upsert({
      where: { student_id_event_id: { student_id: req.user.uid, event_id: eventId } },
      create: { student_id: req.user.uid, event_id: eventId, status: body.status },
      update: { status: body.status, updated_at: new Date() },
      select: { student_id: true, event_id: true, status: true, updated_at: true },
    });

    res.json({
      eventId: String(saved.event_id),
      studentId: saved.student_id,
      status: saved.status,
      updatedAt: saved.updated_at,
    });
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

router.delete('/events/:event_id/rsvp', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });
    const eventId = BigInt(event_id);

    await prisma.event_rsvp.deleteMany({
      where: { student_id: req.user.uid, event_id: eventId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/events/:event_id/rsvps', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });
    const eventId = BigInt(event_id);

    const statusFilter = req.query.status
      ? String(req.query.status)
      : undefined;

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const where = {
      event_id: eventId,
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.event_rsvp.count({ where }),
      prisma.event_rsvp.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip,
        take: limit,
        select: {
          student_id: true,
          status: true,
          updated_at: true,
          student_profile: {
            select: {
              app_user: {
                select: {
                  first_name: true,
                  last_name: true,
                  university_number: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const data = rows.map((r) => ({
      studentId: r.student_id,
      status: r.status,
      updatedAt: r.updated_at,
      student: {
        firstName: r.student_profile?.app_user?.first_name ?? null,
        lastName: r.student_profile?.app_user?.last_name ?? null,
        universityNumber: r.student_profile?.app_user?.university_number ?? null,
      },
    }));

    res.json({ data, page, limit, total });
  } catch (err) {
    next(err);
  }
});

export default router;
