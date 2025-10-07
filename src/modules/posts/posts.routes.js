import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

// ---------- Validation ----------
const createPostSchema = z.object({
  content: z.string().min(1).max(4000),
});

const updatePostSchema = z.object({
  content: z.string().min(1).max(4000),
});

// ---------- Helpers ----------
function toPostDTO(p, currentUserId) {
  // BigInt cannot be JSON’d: cast ids to strings
  return {
    postId: String(p.post_id),
    societyId: String(p.society_id),
    authorId: p.author_id,
    content: p.content,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    likeCount: p._count?.post_like ?? 0,
    likedByMe: (p.post_like?.length ?? 0) > 0,
    author: p.app_user
      ? {
          userId: p.app_user.user_id,
          firstName: p.app_user.first_name,
          lastName: p.app_user.last_name,
          universityNumber: p.app_user.university_number,
        }
      : null,
  };
}

async function isActiveMember(studentId, societyIdBigInt) {
  const m = await prisma.membership.findUnique({
    where: {
      student_id_society_id: {
        student_id: studentId,
        society_id: societyIdBigInt,
      },
    },
    select: { status: true },
  });
  return m?.status === 'active';
}

function isPlatformAdmin(role) {
  return role === 'society_admin' || role === 'university_admin';
}

// ---------- OpenAPI (Swagger) ----------
/**
 * @openapi
 * components:
 *   schemas:
 *     Post:
 *       type: object
 *       properties:
 *         postId:     { type: string, example: "123" }
 *         societyId:  { type: string, example: "42" }
 *         authorId:   { type: string, format: uuid }
 *         content:    { type: string }
 *         createdAt:  { type: string, format: date-time }
 *         updatedAt:  { type: string, format: date-time }
 *         likeCount:  { type: integer, example: 7 }
 *         likedByMe:  { type: boolean, example: true }
 *         author:
 *           type: object
 *           nullable: true
 *           properties:
 *             userId:           { type: string, format: uuid }
 *             firstName:        { type: string }
 *             lastName:         { type: string }
 *             universityNumber: { type: string }
 *     CreatePostInput:
 *       type: object
 *       required: [content]
 *       properties:
 *         content: { type: string, example: "Welcome to our kickoff meeting tonight at 18:00!" }
 *
 * /api/societies/{society_id}/posts:
 *   get:
 *     tags: [Posts]
 *     summary: Get society post feed
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
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
 *                   items: { $ref: '#/components/schemas/Post' }
 *                 page:  { type: integer }
 *                 limit: { type: integer }
 *                 total: { type: integer }
 *   post:
 *     tags: [Posts]
 *     summary: Create a post (society member or admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePostInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Post' }
 *
 * /api/posts/{post_id}:
 *   get:
 *     tags: [Posts]
 *     summary: Get a single post
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: post_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Post' }
 *       404:
 *         description: Not found
 *   put:
 *     tags: [Posts]
 *     summary: Update a post (author or admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: post_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePostInput' }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Post' }
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *   delete:
 *     tags: [Posts]
 *     summary: Delete a post (author or admin)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: post_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */

// ---------- Routes ----------

// GET /api/posts/feed (student's feed from all joined societies)
router.get('/posts/feed', requireAuth, async (req, res, next) => {
  try {
    console.log('📰 GET /posts/feed - User:', req.user?.uid);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    // Get societies the student is an active member of
    const memberships = await prisma.membership.findMany({
      where: {
        student_id: req.user.uid,
        status: 'active',
      },
      select: { society_id: true },
    });

    console.log('📰 Found memberships:', memberships.length);
    const societyIds = memberships.map((m) => m.society_id);

    if (societyIds.length === 0) {
      console.log('📰 No active memberships, returning empty feed');
      return res.json({ data: [], page, limit, total: 0 });
    }

    console.log('📰 Fetching posts from societies:', societyIds);
    const [total, rows] = await Promise.all([
      prisma.post.count({ where: { society_id: { in: societyIds } } }),
      prisma.post.findMany({
        where: { society_id: { in: societyIds } },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { post_like: true } },
          post_like: {
            where: { student_id: req.user.uid },
            select: { student_id: true },
          },
          app_user: {
            select: {
              user_id: true,
              first_name: true,
              last_name: true,
              university_number: true,
            },
          },
          society: {
            select: {
              society_id: true,
              society_name: true,
            },
          },
        },
      }),
    ]);

    console.log('📰 Found posts:', rows.length, 'Total:', total);
    const data = rows.map((p) => ({
      ...toPostDTO(p, req.user.uid),
      society: p.society
        ? {
            societyId: String(p.society.society_id),
            name: p.society.society_name,
          }
        : null,
    }));

    res.json({ data, page, limit, total });
  } catch (err) {
    console.error('📰 ERROR in /posts/feed:', err);
    next(err);
  }
});

// GET /api/societies/:society_id/posts (feed)
router.get('/societies/:society_id/posts', requireAuth, async (req, res, next) => {
  try {
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const societyId = BigInt(society_id);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      prisma.post.count({ where: { society_id: societyId } }),
      prisma.post.findMany({
        where: { society_id: societyId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { post_like: true } },
          // whether current user liked each post (0/1)
          post_like: {
            where: { student_id: req.user.uid },
            select: { student_id: true },
          },
          app_user: {
            select: {
              user_id: true,
              first_name: true,
              last_name: true,
              university_number: true,
            },
          },
        },
      }),
    ]);

    const data = rows.map((p) => toPostDTO(p, req.user.uid));
    res.json({ data, page, limit, total });
  } catch (err) {
    next(err);
  }
});

// POST /api/societies/:society_id/posts (create post by society member/admin)
router.post('/societies/:society_id/posts', requireAuth, async (req, res, next) => {
  try {
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const societyId = BigInt(society_id);

    const body = createPostSchema.parse(req.body);

    // Authorization: active member of society OR platform admin
    const allowed =
      isPlatformAdmin(req.user.role) || (await isActiveMember(req.user.uid, societyId));

    if (!allowed) return res.status(403).json({ message: 'Forbidden: not a member/admin' });

    const created = await prisma.post.create({
      data: {
        society_id: societyId,
        author_id: req.user.uid,
        content: body.content,
      },
      include: {
        _count: { select: { post_like: true } },
        post_like: {
          where: { student_id: req.user.uid },
          select: { student_id: true },
        },
        app_user: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            university_number: true,
          },
        },
      },
    });

    res.status(201).json(toPostDTO(created, req.user.uid));
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
});

// GET /api/posts/:post_id
router.get('/posts/:post_id', requireAuth, async (req, res, next) => {
  try {
    const { post_id } = req.params;
    if (!/^\d+$/.test(post_id)) return res.status(400).json({ message: 'Invalid post_id' });
    const postId = BigInt(post_id);

    const p = await prisma.post.findUnique({
      where: { post_id: postId },
      include: {
        _count: { select: { post_like: true } },
        post_like: {
          where: { student_id: req.user.uid },
          select: { student_id: true },
        },
        app_user: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            university_number: true,
          },
        },
      },
    });

    if (!p) return res.status(404).json({ message: 'Post not found' });
    res.json(toPostDTO(p, req.user.uid));
  } catch (err) {
    next(err);
  }
});

// PUT /api/posts/:post_id (author or admin)
router.put('/posts/:post_id', requireAuth, async (req, res, next) => {
  try {
    const { post_id } = req.params;
    if (!/^\d+$/.test(post_id)) return res.status(400).json({ message: 'Invalid post_id' });
    const postId = BigInt(post_id);
    const body = updatePostSchema.parse(req.body);

    const existing = await prisma.post.findUnique({
      where: { post_id: postId },
      select: { author_id: true, society_id: true },
    });
    if (!existing) return res.status(404).json({ message: 'Post not found' });

    const canEdit =
      isPlatformAdmin(req.user.role) || existing.author_id === req.user.uid;

    if (!canEdit) return res.status(403).json({ message: 'Forbidden' });

    const saved = await prisma.post.update({
      where: { post_id: postId },
      data: {
        content: body.content,
        updated_at: new Date(),
      },
      include: {
        _count: { select: { post_like: true } },
        post_like: {
          where: { student_id: req.user.uid },
          select: { student_id: true },
        },
        app_user: {
          select: {
            user_id: true,
            first_name: true,
            last_name: true,
            university_number: true,
          },
        },
      },
    });

    res.json(toPostDTO(saved, req.user.uid));
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
});

// DELETE /api/posts/:post_id (author or admin)
router.delete('/posts/:post_id', requireAuth, async (req, res, next) => {
  try {
    const { post_id } = req.params;
    if (!/^\d+$/.test(post_id)) return res.status(400).json({ message: 'Invalid post_id' });
    const postId = BigInt(post_id);

    const existing = await prisma.post.findUnique({
      where: { post_id: postId },
      select: { author_id: true },
    });
    if (!existing) return res.status(404).json({ message: 'Post not found' });

    const canDelete =
      isPlatformAdmin(req.user.role) || existing.author_id === req.user.uid;

    if (!canDelete) return res.status(403).json({ message: 'Forbidden' });

    await prisma.post.delete({ where: { post_id: postId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
