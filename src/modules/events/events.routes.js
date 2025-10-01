import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();
const hasSocietyCampus = 'campus' in prisma.society.fields;

const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

// ---------- Validation ----------
const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),              // ISO string
  endsAt: z.string().datetime().optional(),     // ISO string
  location: z.string().max(200).optional(),
  capacity: z.number().int().positive().optional(),
});

const updateEventSchema = createEventSchema.partial();

// ---------- OpenAPI ----------
/**
 * @openapi
 * tags:
 *   - name: Events
 *     description: Event feed, management, and details
 *
 * components:
 *   schemas:
 *     EventInput:
 *       type: object
 *       properties:
 *         title:       { type: string, example: "Hackathon Kickoff" }
 *         description: { type: string }
 *         startsAt:    { type: string, format: date-time }
 *         endsAt:      { type: string, format: date-time }
 *         location:    { type: string, example: "Main Hall A" }
 *         capacity:    { type: integer, example: 120 }
 */

/**
 * @openapi
 * /api/events:
 *   get:
 *     tags: [Events]
 *     summary: Global feed (filterable)
 *     parameters:
 *       - in: query
 *         name: society_id
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *       - in: query
 *         name: campus
 *         schema: { type: string, enum: ["Mafikeng","Potchefstroom","Vanderbijlpark"] }
 *       - in: query
 *         name: starts_after
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: starts_before
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *     responses:
 *       200: { description: OK }
 */

/**
 * @openapi
 * /api/societies/{society_id}/events:
 *   post:
 *     tags: [Events]
 *     summary: Create event (society admin or university admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/EventInput' }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Invalid input }
 *       403: { description: Forbidden }
 */

/**
 * @openapi
 * /api/events/{event_id}:
 *   get:
 *     tags: [Events]
 *     summary: Get event details
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 *   put:
 *     tags: [Events]
 *     summary: Update event (creator or admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/EventInput' }
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Events]
 *     summary: Soft-delete event (creator or admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */

// ---------- Routes ----------

// GET /api/events (feed + filters)
router.get('/events', async (req, res, next) => {
  try {
    const { society_id, campus, starts_after, starts_before } = req.query;

    const page  = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip  = (page - 1) * limit;

    const where = {
      deleted_at: null, // soft-delete filter
    };

    if (society_id && /^\d+$/.test(String(society_id))) {
      where.society_id = BigInt(String(society_id));
    }

    // Campus via event.society.created_by user's campus
    if (campus) {
      const campusValue = String(campus);
      if (hasSocietyCampus) {
        where.society = {
          OR: [
            { campus: campusValue },
            { app_user_society_created_byToapp_user: { campus: campusValue } },
          ],
        };
      } else {
        where.society = {
          app_user_society_created_byToapp_user: { campus: campusValue }
        };
      }
    }

    if (starts_after || starts_before) {
      where.starts_at = {};
      if (starts_after) where.starts_at.gte = new Date(String(starts_after));
      if (starts_before) where.starts_at.lte = new Date(String(starts_before));
    }

    const [total, rows] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.findMany({
        where,
        orderBy: { starts_at: 'asc' },                // uses idx_event_society_time
        skip,
        take: limit,
        include: {
          app_user: { select: { first_name: true, last_name: true, university_number: true } },
          society:  { select: { society_name: true, society_id: true } },
          _count:   { select: { event_like: true, event_rsvp: true } },
        },
      }),
    ]);

    // BigInt → string for IDs
    const data = rows.map(e => ({
      eventId: String(e.event_id),
      societyId: String(e.society_id),
      title: e.title,
      description: e.description ?? null,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      location: e.location ?? null,
      capacity: e.capacity ?? null,
      status: e.status,
      createdBy: {
        firstName: e.app_user.first_name,
        lastName: e.app_user.last_name,
        universityNumber: e.app_user.university_number,
      },
      society: {
        societyId: String(e.society.society_id),
        name: e.society.society_name,
      },
      likes: e._count.event_like,
      rsvps: e._count.event_rsvp,
    }));

    res.json({ data, page, limit, total });
  } catch (err) {
    next(err);
  }
});

// POST /api/societies/:society_id/events (create)
router.post('/societies/:society_id/events', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });

    const body = createEventSchema.parse(req.body);

    const saved = await prisma.event.create({
      data: {
        society_id: BigInt(society_id),
        title: body.title,
        description: body.description ?? null,
        starts_at: new Date(body.startsAt),
        ends_at: body.endsAt ? new Date(body.endsAt) : null,
        location: body.location ?? null,
        capacity: body.capacity ?? null,
        created_by: req.user.uid,
      },
      include: {
        society: { select: { society_name: true } },
      },
    });

    res.status(201).json({
      eventId: String(saved.event_id),
      societyId: String(saved.society_id),
      title: saved.title,
      description: saved.description ?? null,
      startsAt: saved.starts_at,
      endsAt: saved.ends_at,
      location: saved.location ?? null,
      capacity: saved.capacity ?? null,
      createdAt: saved.created_at,
      society: { name: saved.society.society_name },
    });
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

// GET /api/events/:event_id
router.get('/events/:event_id', async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });

    const e = await prisma.event.findUnique({
      where: { event_id: BigInt(event_id) },
      include: {
        app_user: { select: { first_name: true, last_name: true, university_number: true } },
        society:  { select: { society_name: true, society_id: true } },
        _count:   { select: { event_like: true, event_rsvp: true } },
      },
    });

    if (!e || e.deleted_at) return res.status(404).json({ message: 'Not found' });

    res.json({
      eventId: String(e.event_id),
      societyId: String(e.society_id),
      title: e.title,
      description: e.description ?? null,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      location: e.location ?? null,
      capacity: e.capacity ?? null,
      status: e.status,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      createdBy: {
        firstName: e.app_user.first_name,
        lastName: e.app_user.last_name,
        universityNumber: e.app_user.university_number,
      },
      society: {
        societyId: String(e.society.society_id),
        name: e.society.society_name,
      },
      likes: e._count.event_like,
      rsvps: e._count.event_rsvp,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/events/:event_id (update)
router.put('/events/:event_id', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });

    const body = updateEventSchema.parse(req.body);

    const existing = await prisma.event.findUnique({
      where: { event_id: BigInt(event_id) },
      select: { created_by: true, deleted_at: true },
    });
    if (!existing || existing.deleted_at) return res.status(404).json({ message: 'Not found' });

    if (!(isAdmin(req.user.role) || existing.created_by === req.user.uid)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const updated = await prisma.event.update({
      where: { event_id: BigInt(event_id) },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.startsAt !== undefined ? { starts_at: new Date(body.startsAt) } : {}),
        ...(body.endsAt !== undefined ? { ends_at: body.endsAt ? new Date(body.endsAt) : null } : {}),
        ...(body.location !== undefined ? { location: body.location ?? null } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity ?? null } : {}),
        updated_at: new Date(),
      },
      include: { society: { select: { society_name: true } } },
    });

    res.json({
      eventId: String(updated.event_id),
      societyId: String(updated.society_id),
      title: updated.title,
      description: updated.description ?? null,
      startsAt: updated.starts_at,
      endsAt: updated.ends_at,
      location: updated.location ?? null,
      capacity: updated.capacity ?? null,
      updatedAt: updated.updated_at,
      society: { name: updated.society.society_name },
    });
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

// DELETE /api/events/:event_id (soft-delete)
router.delete('/events/:event_id', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });

    const existing = await prisma.event.findUnique({
      where: { event_id: BigInt(event_id) },
      select: { created_by: true, deleted_at: true },
    });
    if (!existing || existing.deleted_at) return res.status(404).json({ message: 'Not found' });

    if (!(isAdmin(req.user.role) || existing.created_by === req.user.uid)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await prisma.event.update({
      where: { event_id: BigInt(event_id) },
      data: { deleted_at: new Date() },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/events/:event_id/cancel (cancel event and notify RSVPs)
router.post('/events/:event_id/cancel', requireAuth, async (req, res, next) => {
  try {
    const { event_id } = req.params;
    if (!/^\d+$/.test(event_id)) return res.status(400).json({ message: 'Invalid event_id' });

    const existing = await prisma.event.findUnique({
      where: { event_id: BigInt(event_id) },
      select: { created_by: true, deleted_at: true, status: true, title: true },
    });

    if (!existing || existing.deleted_at) return res.status(404).json({ message: 'Not found' });
    if (existing.status === 'cancelled') return res.status(400).json({ message: 'Event already cancelled' });

    if (!(isAdmin(req.user.role) || existing.created_by === req.user.uid)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Update event status to cancelled
    const updated = await prisma.event.update({
      where: { event_id: BigInt(event_id) },
      data: { status: 'cancelled', updated_at: new Date() },
    });

    // Get all students who RSVP'd
    const rsvps = await prisma.event_rsvp.findMany({
      where: { event_id: BigInt(event_id) },
      select: { student_id: true },
    });

    // Create notifications for all RSVP'd students
    if (rsvps.length > 0) {
      await prisma.notification.createMany({
        data: rsvps.map(rsvp => ({
          recipient_id: rsvp.student_id,
          type: 'event_reminder',
          message: `Event "${existing.title}" has been cancelled.`,
        })),
      });
    }

    res.json({
      eventId: String(updated.event_id),
      status: updated.status,
      notifiedStudents: rsvps.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
