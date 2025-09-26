import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';
import { z } from 'zod';

const prisma = new PrismaClient();
const router = Router();

const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

const categorySchema = z.object({ category: z.string().min(1).max(100) });

/**
 * @openapi
 * /api/societies/{society_id}/category:
 *   patch:
 *     tags: [Societies]
 *     summary: Update society category (acts as tag until multi-tags are added)
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category: { type: string, example: "AI" }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Invalid input }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
router.patch('/societies/:society_id/category', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const body = categorySchema.parse(req.body);

    const exists = await prisma.society.findUnique({ where: { society_id: BigInt(society_id) }, select: { society_id: true } });
    if (!exists) return res.status(404).json({ message: 'Society not found' });

    const saved = await prisma.society.update({
      where: { society_id: BigInt(society_id) },
      data: { category: body.category, updated_at: new Date() },
      select: { society_id: true, society_name: true, category: true, updated_at: true },
    });

    res.json({ societyId: String(saved.society_id), name: saved.society_name, category: saved.category, updatedAt: saved.updated_at });
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

/* ---------- Future: multi-tags ----------
Add to Prisma:
model society_interest {
  society_id BigInt
  interest_id BigInt
  @@id([society_id, interest_id])
  society society @relation(fields: [society_id], references: [society_id], onDelete: Cascade)
  interest interest @relation(fields: [interest_id], references: [interest_id], onDelete: Cascade)
}

Then expose:
- PUT /api/societies/:society_id/interests (replace all)
- POST /api/societies/:society_id/interests/:interest_id (attach)
- DELETE /api/societies/:society_id/interests/:interest_id (detach)
-------------------------------------------*/
export default router;
