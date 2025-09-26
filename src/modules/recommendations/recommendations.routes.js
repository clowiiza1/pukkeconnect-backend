import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const DAYS = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/**
 * @openapi
 * /api/recommendations/home:
 *   get:
 *     tags: [Recommendations]
 *     summary: Personalized home rows of societies
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/recommendations/home', requireAuth, async (req, res, next) => {
  try {
    // 1) get me + my interests
    const me = await prisma.student_profile.findUnique({
      where: { student_id: req.user.uid },
      select: { interests: true },
    });
    const myInterests = new Set(me?.interests ?? []);

    // 2) prefetch popularity (active members)
    const popular = await prisma.membership.groupBy({
      by: ['society_id'],
      where: { status: 'active' },
      _count: { society_id: true },
      orderBy: { _count: { society_id: 'desc' } },
      take: 100,
    });
    const popCountBySoc = new Map(popular.map(p => [String(p.society_id), p._count.society_id]));

    // 3) recent activity: posts/events in last 14 days
    const since = DAYS(14);
    const [activePosts, activeEvents] = await Promise.all([
      prisma.post.groupBy({
        by: ['society_id'],
        where: { created_at: { gte: since } },
        _count: { society_id: true },
      }),
      prisma.event.groupBy({
        by: ['society_id'],
        where: { starts_at: { gte: since } },
        _count: { society_id: true },
      }),
    ]);
    const actScore = new Map(); // societyId -> activity count
    for (const g of activePosts) actScore.set(String(g.society_id), (actScore.get(String(g.society_id)) || 0) + g._count.society_id);
    for (const g of activeEvents) actScore.set(String(g.society_id), (actScore.get(String(g.society_id)) || 0) + g._count.society_id);

    // 4) load candidate societies
    const societies = await prisma.society.findMany({
      select: {
        society_id: true,
        society_name: true,
        category: true,
        description: true,
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    // 5) score
    const scored = societies.map(s => {
      const sid = String(s.society_id);
      const pop = popCountBySoc.get(sid) || 0;
      const act = actScore.get(sid) || 0;
      // interest match: simple match category in myInterests
      const interestMatch = (s.category && myInterests.has(s.category)) ? 1 : 0;

      // weights: interests 0.5, popularity 0.3, activity 0.2 (normalize popularity/activity)
      const popNorm = Math.min(1, pop / 50); // scale as you like
      const actNorm = Math.min(1, act / 5);

      const score = 0.5 * interestMatch + 0.3 * popNorm + 0.2 * actNorm;

      const reasons = [];
      if (interestMatch) reasons.push(`Matches interest: ${s.category}`);
      if (pop > 0) reasons.push('Popular with students');
      if (act > 0) reasons.push('Active recently');

      return {
        societyId: sid,
        name: s.society_name,
        category: s.category ?? null,
        description: s.description ?? null,
        matchScore: Number(score.toFixed(3)),
        reasons,
      };
    });

    // 6) build rows
    const becauseInterest = (() => {
      // pick a top interest the user has that exists as a society category
      const cats = new Set(societies.map(s => s.category).filter(Boolean));
      const picks = [...myInterests].filter(i => cats.has(i));
      const title = picks.length ? `Because you like ${picks[0]}` : 'Recommended for you';
      const items = scored
        .filter(s => (picks.length ? s.category === picks[0] : true))
        .sort((a,b) => b.matchScore - a.matchScore)
        .slice(0, 12);
      return { title, societies: items };
    })();

    const popularRow = {
      title: 'Popular this week',
      societies: scored
        .sort((a,b) => b.matchScore - a.matchScore)
        .slice(0, 12),
    };

    const activeRow = {
      title: 'Active right now',
      societies: scored
        .filter(s => s.reasons.includes('Active recently'))
        .sort((a,b) => b.matchScore - a.matchScore)
        .slice(0, 12),
    };

    res.json({ rows: [becauseInterest, popularRow, activeRow] });
  } catch (err) {
    next(err);
  }
});

export default router;
