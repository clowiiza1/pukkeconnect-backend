import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

/**
 * @openapi
 * /api/posts/{post_id}/like:
 *   post:
 *     tags: [Post Likes]
 *     summary: Like a post (idempotent)
 *     description: Logged-in users only. If already liked, still returns 200.
 *     parameters:
 *       - in: path
 *         name: post_id
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
 *                 postId:    { type: string, example: "123" }
 *                 likedByMe: { type: boolean, example: true }
 *                 likeCount: { type: integer, example: 8 }
 *       400:
 *         description: Invalid post_id
 *       404:
 *         description: Post not found
 *   delete:
 *     tags: [Post Likes]
 *     summary: Unlike a post (idempotent)
 *     description: Logged-in users only. If not liked, still returns 204.
 *     parameters:
 *       - in: path
 *         name: post_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       204:
 *         description: Unliked (or no-op)
 *       400:
 *         description: Invalid post_id
 */

router.post('/posts/:post_id/like', requireAuth, async (req, res, next) => {
  try {
    const { post_id } = req.params;
    if (!/^\d+$/.test(post_id)) return res.status(400).json({ message: 'Invalid post_id' });
    const postId = BigInt(post_id);

    // Ensure post exists
    const exists = await prisma.post.findUnique({
      where: { post_id: postId },
      select: { post_id: true },
    });
    if (!exists) return res.status(404).json({ message: 'Post not found' });

    // Idempotent upsert
    await prisma.post_like.upsert({
      where: { student_id_post_id: { student_id: req.user.uid, post_id: postId } },
      update: {},
      create: { student_id: req.user.uid, post_id: postId },
    });

    const likeCount = await prisma.post_like.count({ where: { post_id: postId } });
    res.json({ postId: String(postId), likedByMe: true, likeCount });
  } catch (err) {
    next(err);
  }
});

router.delete('/posts/:post_id/like', requireAuth, async (req, res, next) => {
  try {
    const { post_id } = req.params;
    if (!/^\d+$/.test(post_id)) return res.status(400).json({ message: 'Invalid post_id' });
    const postId = BigInt(post_id);

    // Delete if exists, else no-op
    await prisma.post_like.deleteMany({
      where: { student_id: req.user.uid, post_id: postId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
