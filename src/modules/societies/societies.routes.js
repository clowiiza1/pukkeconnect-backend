import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const campusEnum = z.enum(['Mafikeng', 'Potchefstroom', 'Vanderbijlpark']);
const campusInputSchema = campusEnum.nullish();
const hasSocietyCampus = 'campus' in prisma.society.fields;

const isUniAdmin    = (role) => role === 'university_admin';
const isSocOrUniAdm = (role) => role === 'society_admin' || role === 'university_admin';

// ---------- Validation ----------
const listSchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  campus: campusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(4000).optional(),
  category: z.string().max(100).optional(),
  campus: campusInputSchema,
  // optionally allow assigning a university owner (admin-only field, ignored for students)
  universityOwnerId: z.string().uuid().optional(),
});

const updateSchema = createSchema.partial();

// ---------- OpenAPI ----------
/**
 * @openapi
 * tags:
 *   - name: Societies
 *     description: Create, search, and manage societies
 *
 * components:
 *   schemas:
 *     SocietyInput:
 *       type: object
 *       properties:
 *         name:        { type: string, example: "NWU AI Society" }
 *         description: { type: string, example: "We explore ML & AI." }
 *         category:    { type: string, example: "AI" }
 *         universityOwnerId: { type: string, format: uuid, nullable: true }
 */

/**
 * @openapi
 * /api/societies:
 *   get:
 *     tags: [Societies]
 *     summary: List & search societies
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: campus
 *         schema: { type: string, enum: ["Mafikeng","Potchefstroom","Vanderbijlpark"] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     tags: [Societies]
 *     summary: Create a society (auth required)
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SocietyInput' }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Name already exists }
 */

/**
 * @openapi
 * /api/societies/{society_id}:
 *   get:
 *     tags: [Societies]
 *     summary: Get society details (with recent events/posts & counts)
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *       - in: query
 *         name: recent_limit
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 5 }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 *   put:
 *     tags: [Societies]
 *     summary: Update a society (creator or university_admin)
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
 *           schema: { $ref: '#/components/schemas/SocietyInput' }
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Societies]
 *     summary: Soft-delete a society (admins only)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: Forbidden }
 */

// ---------- Routes ----------

// GET /api/societies
router.get('/societies', async (req, res, next) => {
  try {
    const q = listSchema.parse(req.query);
    const where = {
      ...( 'deleted_at' in prisma.society.fields ? { deleted_at: null } : {} ),
    };

    const andFilters = [];
    if (q.q) {
      andFilters.push({
        OR: [
          { society_name: { contains: q.q, mode: 'insensitive' } },
          { description:  { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }

    if (q.category) {
      andFilters.push({ category: { equals: q.category, mode: 'insensitive' } });
    }

    if (q.campus) {
      if (hasSocietyCampus) {
        andFilters.push({
          OR: [
            { campus: q.campus },
            { app_user_society_created_byToapp_user: { campus: q.campus } },
          ],
        });
      } else {
        andFilters.push({ app_user_society_created_byToapp_user: { campus: q.campus } });
      }
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    const skip = (q.page - 1) * q.limit;

    const baseSelect = {
      society_id: true,
      society_name: true,
      category: true,
      description: true,
      created_at: true,
      updated_at: true,
      ...(hasSocietyCampus ? { campus: true } : {}),
      app_user_society_created_byToapp_user: {
        select: { first_name: true, last_name: true, campus: true },
      },
      _count: { select: { membership: true, event: true, post: true } },
    };

    const [total, rows] = await Promise.all([
      prisma.society.count({ where }),
      prisma.society.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: q.limit,
        select: baseSelect,
      }),
    ]);

    const data = rows.map(s => ({
      societyId: String(s.society_id),
      name: s.society_name,
      category: s.category ?? null,
      description: s.description ?? null,
      createdAt: s.created_at,
      campus: hasSocietyCampus
        ? (s.campus ?? s.app_user_society_created_byToapp_user.campus ?? null)
        : (s.app_user_society_created_byToapp_user.campus ?? null),
      createdBy: {
        firstName: s.app_user_society_created_byToapp_user.first_name,
        lastName: s.app_user_society_created_byToapp_user.last_name,
        campus: s.app_user_society_created_byToapp_user.campus ?? null,
      },
      counts: {
        members: s._count.membership,
        events:  s._count.event,
        posts:   s._count.post,
      },
    }));

    res.json({ data, page: q.page, limit: q.limit, total });
  } catch (err) {
    next(err);
  }
});

// POST /api/societies
router.post('/societies', requireAuth, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);

    // Any authenticated user may create; universityOwnerId only honored for admins
    const uniOwner = isUniAdmin(req.user.role) ? (body.universityOwnerId ?? null) : null;

    try {
      const saved = await prisma.society.create({
        data: {
          society_name: body.name,
          description: body.description ?? null,
          category: body.category ?? null,
          ...(hasSocietyCampus ? { campus: body?.campus ?? null } : {}),
          created_by: req.user.uid,
          university_owner: uniOwner,
        },
      });

      res.status(201).json({
        societyId: String(saved.society_id),
        name: saved.society_name,
        createdAt: saved.created_at,
        campus: hasSocietyCampus ? (saved.campus ?? null) : null,
      });
    } catch (e) {
      // unique name
      if (e?.code === 'P2002') return res.status(409).json({ message: 'Society name already exists' });
      throw e;
    }
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

// GET /api/societies/:society_id
router.get('/societies/:society_id', async (req, res, next) => {
  try {
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const recentLimit = Math.max(1, Math.min(20, parseInt(String(req.query.recent_limit ?? '5'), 10) || 5));
    const id = BigInt(society_id);

    const s = await prisma.society.findUnique({
      where: { society_id: id },
      select: {
        society_id: true,
        society_name: true,
        category: true,
        description: true,
        created_at: true,
        updated_at: true,
        ...(hasSocietyCampus ? { campus: true } : {}),
        app_user_society_created_byToapp_user: { select: { first_name: true, last_name: true, campus: true } },
        _count: { select: { membership: true, event: true, post: true } },
      },
    });

    // soft-delete aware (if you added the column)
    if (!s || ('deleted_at' in s && s.deleted_at)) return res.status(404).json({ message: 'Not found' });

    const [recentEvents, recentPosts] = await Promise.all([
      prisma.event.findMany({
        where: { society_id: id, deleted_at: null },
        orderBy: { starts_at: 'asc' },
        take: recentLimit,
        select: { event_id: true, title: true, starts_at: true, location: true, capacity: true },
      }),
      prisma.post.findMany({
        where: { society_id: id },
        orderBy: { created_at: 'desc' },
        take: recentLimit,
        select: { post_id: true, content: true, created_at: true },
      }),
    ]);

    const creatorCampus = s.app_user_society_created_byToapp_user.campus ?? null;
    const campus = hasSocietyCampus ? (s.campus ?? creatorCampus) : creatorCampus;

    res.json({
      societyId: String(s.society_id),
      name: s.society_name,
      category: s.category ?? null,
      description: s.description ?? null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      campus,
      createdBy: {
        firstName: s.app_user_society_created_byToapp_user.first_name,
        lastName:  s.app_user_society_created_byToapp_user.last_name,
        campus:    creatorCampus,
      },
      counts: {
        members: s._count.membership,
        events:  s._count.event,
        posts:   s._count.post,
      },
      recentEvents: recentEvents.map(e => ({
        eventId: String(e.event_id), title: e.title, startsAt: e.starts_at, location: e.location ?? null, capacity: e.capacity ?? null,
      })),
      recentPosts: recentPosts.map(p => ({
        postId: String(p.post_id), content: p.content, createdAt: p.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/societies/:society_id
router.put('/societies/:society_id', requireAuth, async (req, res, next) => {
  try {
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const id = BigInt(society_id);

    const body = updateSchema.parse(req.body);

    const existing = await prisma.society.findUnique({
      where: { society_id: id },
      select: { created_by: true },
    });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    if (!(isUniAdmin(req.user.role) || existing.created_by === req.user.uid)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const updated = await prisma.society.update({
        where: { society_id: id },
        data: {
          ...(body.name !== undefined ? { society_name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description ?? null } : {}),
          ...(body.category !== undefined ? { category: body.category ?? null } : {}),
          ...(body.campus !== undefined && hasSocietyCampus ? { campus: body.campus ?? null } : {}),
          ...(body.universityOwnerId !== undefined && isUniAdmin(req.user.role)
              ? { university_owner: body.universityOwnerId ?? null } : {}),
          updated_at: new Date(),
        },
        select: {
          society_id: true,
          society_name: true,
          category: true,
          description: true,
          updated_at: true,
          ...(hasSocietyCampus ? { campus: true } : {}),
        },
      });

      res.json({
        societyId: String(updated.society_id),
        name: updated.society_name,
        category: updated.category ?? null,
        description: updated.description ?? null,
        updatedAt: updated.updated_at,
        campus: hasSocietyCampus ? (updated.campus ?? null) : null,
      });
    } catch (e) {
      if (e?.code === 'P2002') return res.status(409).json({ message: 'Society name already exists' });
      throw e;
    }
  } catch (err) {
    if (err?.issues) return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    next(err);
  }
});

// DELETE /api/societies/:society_id (soft delete)
router.delete('/societies/:society_id', requireAuth, async (req, res, next) => {
  try {
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    if (!isSocOrUniAdm(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const id = BigInt(society_id);

    // If you added a deleted_at column on society:
    //   ALTER TABLE society ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    // Prisma model: deleted_at DateTime? @db.Timestamptz(6)
    // Then:
    const hasSoftDelete = 'deleted_at' in prisma.society.fields;

    if (hasSoftDelete) {
      await prisma.society.update({
        where: { society_id: id },
        data: { updated_at: new Date(), deleted_at: new Date() },
      });
    } else {
      // Fallback to hard delete if soft-delete column not present
      await prisma.society.delete({ where: { society_id: id } });
    }

    res.status(204).send();
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    next(err);
  }
});

export default router;
