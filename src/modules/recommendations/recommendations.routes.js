import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';

const prisma = new PrismaClient();
const router = Router();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number.parseFloat(value);
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
};

const createSeededRandom = (seedInput) => {
  const seedString = String(seedInput ?? 'default');
  let hash = 0;
  for (let i = 0; i < seedString.length; i += 1) {
    const chr = seedString.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // force 32-bit int
  }
  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shortCampusLabel = (campus) => {
  if (!campus) return null;
  switch (campus) {
    case 'Potchefstroom':
      return 'Potch';
    case 'Vanderbijlpark':
      return 'VDBP';
    default:
      return campus;
  }
};

const describeTimeslot = (dateLike) => {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString('en-US', { weekday: 'short' });
  const hour = date.getHours();
  const slot = hour < 12 ? 'mornings' : hour < 17 ? 'afternoons' : 'evenings';
  return `${day} ${slot}`;
};

const buildReasonPills = (candidate) => {
  const pills = [];
  const matches = candidate.interestMatches;
  if (matches.length === 1) {
    pills.push(matches[0].name);
  } else if (matches.length === 2) {
    pills.push(`${matches[0].name} & ${matches[1].name}`);
  } else if (matches.length > 2) {
    pills.push(`${matches[0].name} +${matches.length - 1}`);
  }

  if (candidate.campusMatch && candidate.society.campus) {
    const label = shortCampusLabel(candidate.society.campus);
    if (label) pills.push(`Near ${label}`);
  }

  if (candidate.upcomingSlot) pills.push(candidate.upcomingSlot);
  if (candidate.freshnessNorm >= 0.7) pills.push('Fresh this week');
  if (candidate.popularityNorm >= 0.7) pills.push('Popular pick');

  return [...new Set(pills)].slice(0, 3);
};

const formatCard = (candidate) => ({
  societyId: String(candidate.society.society_id),
  name: candidate.society.society_name,
  category: candidate.society.category ?? null,
  campus: candidate.society.campus ?? null,
  description: candidate.society.description ?? null,
  matchScore: Number(candidate.matchScore.toFixed(3)),
  reasonPills: candidate.reasonPills,
  interestTags: candidate.interestMatches.slice(0, 3).map((m) => m.name),
  campusMatch: candidate.campusMatch,
});

const diversify = (items, { limit, perCategory = 3 }) => {
  if (!limit || limit <= 0) return [];
  const picked = [];
  const seen = new Set();
  const counts = new Map();

  for (const item of items) {
    if (picked.length >= limit) break;
    const category = item.society.category ?? 'uncategorised';
    const used = counts.get(category) ?? 0;
    if (used >= perCategory) continue;
    picked.push(item);
    seen.add(item);
    counts.set(category, used + 1);
  }

  if (picked.length < limit) {
    for (const item of items) {
      if (picked.length >= limit) break;
      if (seen.has(item)) continue;
      picked.push(item);
    }
  }

  return picked;
};

/**
 * @openapi
 * /api/recommendations:
 *   get:
 *     tags: [Recommendations]
 *     summary: Personalised matchmaker recommendations
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50 }
 *         description: Maximum number of items in the primary rail (defaults to 20)
 *       - in: query
 *         name: seed
 *         schema: { type: string }
 *         description: Optional seed to stabilise random tie-breaking
 *     responses:
 *       200: { description: OK }
 */
router.get('/recommendations', requireAuth, async (req, res, next) => {
  try {
    const limitInput = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(limitInput) && limitInput > 0
      ? clamp(limitInput, 1, 50)
      : 20;
    const seed = req.query.seed ? String(req.query.seed) : `${req.user.uid}-default`;
    const rng = createSeededRandom(seed);
    const studentId = req.user.uid;
    const now = new Date();

    const [studentInterests, student, dismissals, baseMatchesRaw] = await Promise.all([
      prisma.student_interest.findMany({
        where: { student_id: studentId },
        include: { interest: { select: { interest_id: true, name: true } } },
      }),
      prisma.app_user.findUnique({
        where: { user_id: studentId },
        select: { campus: true },
      }),
      prisma.recommendation_event.findMany({
        where: {
          student_id: studentId,
          event: 'dismiss',
          entity_type: 'society',
        },
        orderBy: { created_at: 'desc' },
        take: 200,
      }),
      prisma.$queryRaw`
        SELECT si.society_id,
               SUM(sti.weight * si.weight) AS base_score
        FROM society_interest si
        JOIN student_interest sti ON sti.interest_id = si.interest_id
        WHERE sti.student_id = ${studentId}::uuid
        GROUP BY si.society_id
      `,
    ]);

    const studentInterestMap = new Map();
    for (const row of studentInterests) {
      const interestId = String(row.interest_id);
      studentInterestMap.set(interestId, {
        name: row.interest.name,
        weight: row.weight,
      });
    }

    const baseMatchMap = new Map();
    for (const row of baseMatchesRaw) {
      const societyId = typeof row.society_id === 'bigint'
        ? row.society_id.toString()
        : String(row.society_id);
      baseMatchMap.set(societyId, toNumber(row.base_score));
    }

    const dismissalCounts = new Map();
    for (const event of dismissals) {
      const key = String(event.entity_id);
      dismissalCounts.set(key, (dismissalCounts.get(key) ?? 0) + 1);
    }

    const societyInclude = {
      society_interest: {
        include: { interest: { select: { interest_id: true, name: true } } },
      },
      society_score: true,
      event: {
        where: { starts_at: { gte: now } },
        orderBy: { starts_at: 'asc' },
        take: 2,
        select: { starts_at: true },
      },
    };

    // If user has no interests, return empty recommendations
    if (baseMatchMap.size === 0) {
      return res.json({ rails: [] });
    }

    // Fetch societies that match the student's interests
    const ids = [...baseMatchMap.keys()].map((id) => BigInt(id));
    const societies = await prisma.society.findMany({
      where: { society_id: { in: ids } },
      include: societyInclude,
    });

    if (!societies.length) {
      return res.json({ rails: [] });
    }

    let maxBase = 0;
    let maxPopularity = 0;
    let maxFreshness = 0;

    const enriched = societies.map((society) => {
      const societyId = String(society.society_id);
      const baseScore = baseMatchMap.get(societyId) ?? 0;
      maxBase = Math.max(maxBase, baseScore);

      const popularityRaw = toNumber(society.society_score?.popularity_score ?? 0);
      const freshnessRaw = toNumber(society.society_score?.freshness_score ?? 0);
      maxPopularity = Math.max(maxPopularity, popularityRaw);
      maxFreshness = Math.max(maxFreshness, freshnessRaw);

      const interestMatches = society.society_interest
        .filter((si) => studentInterestMap.has(String(si.interest_id)))
        .map((si) => {
          const id = String(si.interest_id);
          const studentMeta = studentInterestMap.get(id) ?? { name: si.interest.name, weight: 0 };
          const combinedWeight = (studentMeta.weight ?? 0) * si.weight;
          return {
            id,
            name: studentMeta.name,
            studentWeight: studentMeta.weight ?? 0,
            societyWeight: si.weight,
            combinedWeight,
          };
        })
        .sort((a, b) => b.combinedWeight - a.combinedWeight);

      const campusMatch = Boolean(student?.campus && society.campus === student.campus);
      const upcomingSlot = describeTimeslot(society.event[0]?.starts_at ?? null);
      const dismissalCount = dismissalCounts.get(societyId) ?? 0;

      let finalScore = baseScore;
      finalScore += popularityRaw * 0.6;
      finalScore += freshnessRaw * 0.5;
      if (campusMatch) finalScore += 12;
      if (interestMatches.length) {
        const interestBonus = interestMatches.reduce((sum, match) => sum + match.combinedWeight * 0.05, 0);
        finalScore += interestBonus;
      }
      if (upcomingSlot) finalScore += 4;
      finalScore -= dismissalCount * 8;
      finalScore = Math.max(finalScore, 0);

      return {
        society,
        societyId,
        baseScore,
        popularityRaw,
        freshnessRaw,
        campusMatch,
        upcomingSlot,
        interestMatches,
        dismissalCount,
        finalScore,
        tieBreaker: rng(),
      };
    });

    let maxFinal = 0;
    for (const candidate of enriched) {
      if (candidate.finalScore > maxFinal) maxFinal = candidate.finalScore;
    }

    for (const candidate of enriched) {
      candidate.interestNorm = maxBase > 0 ? candidate.baseScore / maxBase : 0;
      candidate.popularityNorm = maxPopularity > 0 ? candidate.popularityRaw / maxPopularity : 0;
      candidate.freshnessNorm = maxFreshness > 0 ? candidate.freshnessRaw / maxFreshness : 0;
      candidate.matchScore = maxFinal > 0 ? candidate.finalScore / maxFinal : 0;
      candidate.reasonPills = buildReasonPills(candidate);
    }

    const sorted = [...enriched].sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return b.tieBreaker - a.tieBreaker;
    });

    const topCandidates = diversify(sorted, { limit, perCategory: 3 });
    const topCards = topCandidates.map(formatCard);

    const rails = [];

    if (topCards.length) {
      const totalInterestMatches = topCandidates.reduce((sum, candidate) => sum + candidate.interestMatches.length, 0);
      const topReasons = [];
      if (totalInterestMatches > 1) {
        topReasons.push(`Matches ${totalInterestMatches} of your interests`);
      } else if (totalInterestMatches === 1) {
        const firstMatch = topCandidates.find((candidate) => candidate.interestMatches.length)?.interestMatches[0];
        if (firstMatch) topReasons.push(`Matches your interest in ${firstMatch.name}`);
      }
      if (topCandidates.some((candidate) => candidate.campusMatch)) topReasons.push('Same campus');
      if (topCandidates.some((candidate) => candidate.freshnessNorm >= 0.7)) topReasons.push('Fresh this week');
      if (!topReasons.length) topReasons.push('Personalised suggestions based on your activity');

      rails.push({ title: 'Top Picks for You', items: topCards, reasons: topReasons });
    }

    const secondaryLimit = Math.min(Math.ceil(limit / 2), Math.max(6, limit));
    const interestAggregate = new Map();
    for (const candidate of sorted) {
      for (const match of candidate.interestMatches) {
        const entry = interestAggregate.get(match.id) ?? { name: match.name, weight: 0, count: 0 };
        entry.weight += match.combinedWeight;
        entry.count += 1;
        interestAggregate.set(match.id, entry);
      }
    }

    let becauseAdded = false;
    if (interestAggregate.size) {
      const [interestId, interestMeta] = [...interestAggregate.entries()].sort((a, b) => {
        if (b[1].weight !== a[1].weight) return b[1].weight - a[1].weight;
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return rng() - 0.5;
      })[0];
      const becauseCandidates = sorted.filter((candidate) => candidate.interestMatches.some((match) => match.id === interestId));
      const becauseCards = diversify(becauseCandidates, {
        limit: Math.min(secondaryLimit, becauseCandidates.length || secondaryLimit),
        perCategory: 2,
      }).map(formatCard);
      if (becauseCards.length) {
        rails.push({
          title: `Because you liked ${interestMeta.name}`,
          reasonTag: interestMeta.name,
          items: becauseCards,
        });
        becauseAdded = true;
      }
    }

    if (!becauseAdded) {
      const popularCards = [...sorted]
        .sort((a, b) => {
          if (b.popularityRaw !== a.popularityRaw) return b.popularityRaw - a.popularityRaw;
          if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
          return b.tieBreaker - a.tieBreaker;
        })
        .slice(0, secondaryLimit)
        .map(formatCard);
      if (popularCards.length) {
        rails.push({ title: 'Popular right now', items: popularCards });
      }
    }

    const freshCandidates = sorted.filter((candidate) => candidate.freshnessRaw > 0 || candidate.freshnessNorm >= 0.3);
    const freshCards = diversify(freshCandidates, {
      limit: Math.min(secondaryLimit, freshCandidates.length || secondaryLimit),
      perCategory: 2,
    }).map(formatCard);
    if (freshCards.length) {
      rails.push({ title: 'Fresh this week', items: freshCards });
    }

    return res.json({ rails });
  } catch (err) {
    next(err);
  }
});

export default router;
