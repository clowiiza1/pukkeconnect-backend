import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';
import { syncStudentProfileInterests } from '../../lib/interestSync.js';

const prisma = new PrismaClient();
const router = Router();

const isAdmin = (role) => role === 'society_admin' || role === 'university_admin';

// ---------- Validation ----------
const createQuizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  questions: z.array(
    z.object({
      prompt: z.string().min(1),
      kind: z.enum(['single','multi','text']).default('single'),
      options: z.array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1),
        })
      ).default([]),
    })
  ).min(1).max(50)
});

const submitResponseSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.union([z.string(), z.number().int().nonnegative()]), // BigInt as string
      // one of optionId OR freeText
      optionIds: z.array(z.union([z.string(), z.number().int().nonnegative()])).optional(),
      freeText: z.string().optional(),
    })
  ).min(1),
});

const validationError = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const normalizeAnswers = (quizQuestions, answers) => {
  const questionMap = new Map(
    quizQuestions.map((q) => [String(q.question_id), q])
  );

  const normalized = [];
  const selectedOptionIds = new Set();

  for (const answer of answers) {
    const questionKey = String(answer.questionId);
    const question = questionMap.get(questionKey);
    if (!question) throw validationError(`Unknown question ${questionKey}`);

    const entry = {
      questionId: BigInt(question.question_id),
      freeText: null,
      optionIds: [],
    };

    if (question.kind === 'text') {
      if (!answer.freeText || answer.optionIds?.length) {
        throw validationError(`Question ${questionKey} requires freeText only`);
      }
      entry.freeText = answer.freeText;
    } else {
      const rawOptionIds = (answer.optionIds ?? []).map(String);
      if (!rawOptionIds.length) {
        throw validationError(`Question ${questionKey} requires optionIds`);
      }
      if (question.kind === 'single' && rawOptionIds.length !== 1) {
        throw validationError(`Question ${questionKey} allows exactly one option`);
      }
      const validOptions = new Set(question.quiz_option.map((o) => String(o.option_id)));
      for (const optionId of rawOptionIds) {
        if (!validOptions.has(optionId)) {
          throw validationError(`Invalid option ${optionId} for question ${questionKey}`);
        }
        const bigintOption = BigInt(optionId);
        entry.optionIds.push(bigintOption);
        selectedOptionIds.add(bigintOption);
      }
    }

    normalized.push(entry);
  }

  return { normalized, selectedOptionIds: Array.from(selectedOptionIds) };
};

// ---------- OpenAPI (trimmed for brevity) ----------
/**
 * @openapi
 * tags:
 *   - name: Quizzes
 *     description: Quiz authoring & responses
 */

/**
 * @openapi
 * /api/societies/{society_id}/quizzes:
 *   get:
 *     tags: [Quizzes]
 *     summary: List quizzes for a society
 *     parameters:
 *       - in: path
 *         name: society_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     tags: [Quizzes]
 *     summary: Create quiz with nested questions & options (admin)
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { } } }
 *     responses:
 *       201: { description: Created }
 */

/**
 * @openapi
 * /api/quizzes/{quiz_id}:
 *   get:
 *     tags: [Quizzes]
 *     summary: Get a quiz (with questions & options)
 *     parameters:
 *       - in: path
 *         name: quiz_id
 *         required: true
 *         schema: { type: string, pattern: "^[0-9]+$" }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */

/**
 * @openapi
 * /api/quizzes/{quiz_id}/responses:
 *   post:
 *     tags: [Quizzes]
 *     summary: Submit quiz responses (student)
 *     responses:
 *       201: { description: Submitted }
 *       409: { description: Already submitted }
 */

/**
 * @openapi
 * /api/quizzes/{quiz_id}/responses/{student_id}:
 *   get:
 *     tags: [Quizzes]
 *     summary: Get a student's responses (admin or the student)
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */

/**
 * @openapi
 * /api/matchmaker/quiz:
 *   get:
 *     tags: [Matchmaker]
 *     summary: Fetch the active matchmaker quiz (global)
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Matchmaker quiz not configured
 */

/**
 * @openapi
 * /api/matchmaker/quiz/submit:
 *   post:
 *     tags: [Matchmaker]
 *     summary: Submit onboarding quiz answers and derive interests
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [questionId]
 *                   properties:
 *                     questionId:
 *                       oneOf:
 *                         - { type: string }
 *                         - { type: integer }
 *                     optionIds:
 *                       type: array
 *                       items:
 *                         oneOf:
 *                           - { type: string }
 *                           - { type: integer }
 *                     freeText: { type: string }
 *     responses:
 *       201:
 *         description: Submitted and interests updated
 *       400:
 *         description: Invalid input or validation error
 *       404:
 *         description: Matchmaker quiz not configured
 */

// ---------- Routes ----------

// List quizzes for a society
router.get('/societies/:society_id/quizzes', requireAuth, async (req, res, next) => {
  try {
    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const societyId = BigInt(society_id);

    const quizzes = await prisma.quiz.findMany({
      where: { society_id: societyId },
      orderBy: { created_at: 'desc' },
      select: {
        quiz_id: true, title: true, description: true, due_at: true, created_at: true
      }
    });

    res.json(quizzes.map(q => ({
      quizId: String(q.quiz_id),
      title: q.title,
      description: q.description ?? null,
      dueAt: q.due_at,
      createdAt: q.created_at,
    })));
  } catch (e) { next(e); }
});

// Create quiz with nested questions & options (transaction)
router.post('/societies/:society_id/quizzes', requireAuth, async (req, res, next) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ message: 'Forbidden' });

    const { society_id } = req.params;
    if (!/^\d+$/.test(society_id)) return res.status(400).json({ message: 'Invalid society_id' });
    const societyId = BigInt(society_id);

    const body = createQuizSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: {
          society_id: societyId,
          title: body.title,
          description: body.description ?? null,
          created_by: req.user.uid,
        }
      });

      for (const q of body.questions) {
        const question = await tx.quiz_question.create({
          data: {
            quiz_id: quiz.quiz_id,
            prompt: q.prompt,
            kind: q.kind,
          }
        });
        if (q.options?.length) {
          await tx.quiz_option.createMany({
            data: q.options.map(o => ({
              question_id: question.question_id,
              label: o.label,
              value: o.value,
            }))
          });
        }
      }

      // Return full quiz with nested for client preview
      const full = await tx.quiz.findUnique({
        where: { quiz_id: quiz.quiz_id },
        include: {
          quiz_question: {
            include: { quiz_option: true }
          }
        }
      });
      return full;
    });

    res.status(201).json({
      quizId: String(created.quiz_id),
      title: created.title,
      description: created.description ?? null,
      createdAt: created.created_at,
      questions: created.quiz_question.map(qq => ({
        questionId: String(qq.question_id),
        prompt: qq.prompt,
        kind: qq.kind,
        options: qq.quiz_option.map(op => ({
          optionId: String(op.option_id),
          label: op.label,
          value: op.value,
        })),
      })),
    });
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    if (e?.status === 400) return res.status(400).json({ message: e.message });
    next(e);
  }
});

// Get quiz detail
router.get('/quizzes/:quiz_id', requireAuth, async (req, res, next) => {
  try {
    const { quiz_id } = req.params;
    if (!/^\d+$/.test(quiz_id)) return res.status(400).json({ message: 'Invalid quiz_id' });
    const quizId = BigInt(quiz_id);

    const q = await prisma.quiz.findUnique({
      where: { quiz_id: quizId },
      include: { quiz_question: { include: { quiz_option: true } } }
    });
    if (!q) return res.status(404).json({ message: 'Quiz not found' });

    res.json({
      quizId: String(q.quiz_id),
      societyId: q.society_id ? String(q.society_id) : null,
      title: q.title,
      description: q.description ?? null,
      createdAt: q.created_at,
      questions: q.quiz_question.map(qq => ({
        questionId: String(qq.question_id),
        prompt: qq.prompt,
        kind: qq.kind,
        options: qq.quiz_option.map(op => ({
          optionId: String(op.option_id),
          label: op.label,
          value: op.value,
        })),
      })),
    });
  } catch (e) { next(e); }
});

// Submit responses (enforce unique per quiz/student)
router.post('/quizzes/:quiz_id/responses', requireAuth, async (req, res, next) => {
  try {
    const { quiz_id } = req.params;
    if (!/^\d+$/.test(quiz_id)) return res.status(400).json({ message: 'Invalid quiz_id' });
    const quizId = BigInt(quiz_id);
    const body = submitResponseSchema.parse(req.body);

    // Load quiz questions for validation
    const quiz = await prisma.quiz.findUnique({
      where: { quiz_id: quizId },
      include: { quiz_question: { include: { quiz_option: true } } }
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const { normalized: normalizedAnswers } = normalizeAnswers(quiz.quiz_question, body.answers);

    // Transactional write
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const response = await tx.quiz_response.create({
          data: { quiz_id: quizId, student_id: req.user.uid }
        });

        // Flatten answers
        for (const answer of normalizedAnswers) {
          if (answer.freeText) {
            await tx.quiz_response_answer.create({
              data: {
                response_id: response.response_id,
                question_id: answer.questionId,
                free_text: answer.freeText,
              }
            });
          }
          if (answer.optionIds.length) {
            for (const oid of answer.optionIds) {
              await tx.quiz_response_answer.create({
                data: {
                  response_id: response.response_id,
                  question_id: answer.questionId,
                  option_id: oid,
                }
              });
            }
          }
        }

        return response;
      });

      return res.status(201).json({
        responseId: String(saved.response_id),
        quizId: String(saved.quiz_id),
        studentId: saved.student_id,
        submittedAt: saved.submitted_at,
      });
    } catch (e) {
      // P2002 unique constraint (quiz_id, student_id)
      if (e?.code === 'P2002') {
        return res.status(409).json({ message: 'You have already submitted this quiz' });
      }
      throw e;
    }
  } catch (e) {
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    next(e);
  }
});

// Get a student’s responses (admin or the student)
router.get('/quizzes/:quiz_id/responses/:student_id', requireAuth, async (req, res, next) => {
  try {
    const { quiz_id, student_id } = req.params;
    if (!/^\d+$/.test(quiz_id)) return res.status(400).json({ message: 'Invalid quiz_id' });

    if (req.user.uid !== student_id && !isAdmin(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const quizId = BigInt(quiz_id);
    const resp = await prisma.quiz_response.findUnique({
      where: { quiz_id_student_id: { quiz_id: quizId, student_id } },
      include: {
        quiz: { select: { title: true } },
        quiz_response_answer: {
          include: {
            quiz_question: { select: { prompt: true, kind: true } },
            quiz_option: { select: { label: true, value: true } },
          }
        }
      }
    });

    if (!resp) return res.status(404).json({ message: 'No response found' });

    res.json({
      quizId: String(resp.quiz_id),
      quizTitle: resp.quiz.title,
      studentId: resp.student_id,
      submittedAt: resp.submitted_at,
      answers: resp.quiz_response_answer.map(a => ({
        questionId: String(a.question_id),
        prompt: a.quiz_question.prompt,
        kind: a.quiz_question.kind,
        option: a.quiz_option ? { label: a.quiz_option.label, value: a.quiz_option.value } : null,
        freeText: a.free_text ?? null,
      })),
    });
  } catch (e) { next(e); }
});

// Matchmaker: fetch the latest global quiz (society_id null)
router.get('/matchmaker/quiz', requireAuth, async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { society_id: null },
      orderBy: { created_at: 'desc' },
      include: {
        quiz_question: {
          include: { quiz_option: { select: { option_id: true, label: true, value: true } } },
        },
      },
    });

    if (!quiz) return res.status(404).json({ message: 'Matchmaker quiz is not configured' });

    const existingResponse = await prisma.quiz_response.findUnique({
      where: { quiz_id_student_id: { quiz_id: quiz.quiz_id, student_id: req.user.uid } },
      select: { submitted_at: true },
    });

    res.json({
      quizId: String(quiz.quiz_id),
      title: quiz.title,
      description: quiz.description ?? null,
      createdAt: quiz.created_at,
      lastSubmittedAt: existingResponse?.submitted_at ?? null,
      questions: quiz.quiz_question.map((qq) => ({
        questionId: String(qq.question_id),
        prompt: qq.prompt,
        kind: qq.kind,
        options: qq.quiz_option.map((op) => ({
          optionId: String(op.option_id),
          label: op.label,
          value: op.value,
        })),
      })),
    });
  } catch (e) { next(e); }
});

// Matchmaker: submit quiz responses and derive interests
router.post('/matchmaker/quiz/submit', requireAuth, async (req, res, next) => {
  try {
    const body = submitResponseSchema.parse(req.body);

    const quiz = await prisma.quiz.findFirst({
      where: { society_id: null },
      orderBy: { created_at: 'desc' },
      include: {
        quiz_question: { include: { quiz_option: true } },
      },
    });

    if (!quiz) return res.status(404).json({ message: 'Matchmaker quiz is not configured' });

    const { normalized: normalizedAnswers, selectedOptionIds } = normalizeAnswers(quiz.quiz_question, body.answers);

    const studentId = req.user.uid;

    const result = await prisma.$transaction(async (tx) => {
      const existingInterests = await tx.student_interest.findMany({
        where: { student_id: studentId },
        select: { interest_id: true, weight: true },
      });
      const existingInterestSet = new Set(existingInterests.map((row) => row.interest_id.toString()));
      const existingWeightMap = new Map(existingInterests.map((row) => [row.interest_id.toString(), row.weight]));

      await tx.quiz_response.deleteMany({ where: { quiz_id: quiz.quiz_id, student_id: studentId } });

      const response = await tx.quiz_response.create({
        data: { quiz_id: quiz.quiz_id, student_id: studentId },
      });

      for (const answer of normalizedAnswers) {
        if (answer.freeText) {
          await tx.quiz_response_answer.create({
            data: {
              response_id: response.response_id,
              question_id: answer.questionId,
              free_text: answer.freeText,
            },
          });
        }
        if (answer.optionIds.length) {
          for (const oid of answer.optionIds) {
            await tx.quiz_response_answer.create({
              data: {
                response_id: response.response_id,
                question_id: answer.questionId,
                option_id: oid,
              },
            });
          }
        }
      }

      const derivedInterestWeights = new Map();
      if (selectedOptionIds.length) {
        const links = await tx.quiz_option_interest.findMany({
          where: { option_id: { in: selectedOptionIds } },
          select: { interest_id: true, weight: true },
        });
        for (const link of links) {
          const interestId = link.interest_id;
          const current = derivedInterestWeights.get(interestId) ?? 0;
          const next = Math.max(current, link.weight ?? 10);
          derivedInterestWeights.set(interestId, next);
        }
        for (const [interestId, weight] of derivedInterestWeights.entries()) {
          const key = interestId.toString();
          const existingWeight = existingWeightMap.get(key);
          const upsertWeight = existingWeight !== undefined ? Math.max(existingWeight, weight) : weight;
          await tx.student_interest.upsert({
            where: { student_id_interest_id: { student_id: studentId, interest_id: interestId } },
            update: { weight: upsertWeight },
            create: { student_id: studentId, interest_id: interestId, weight: upsertWeight },
          });
        }
      }

      const derivedInterestIds = new Set(derivedInterestWeights.keys());

      const synced = await syncStudentProfileInterests(tx, studentId);
      const newlyAddedIds = Array.from(derivedInterestIds).filter((interestId) => !existingInterestSet.has(interestId.toString()));
      const newlyAdded = synced.filter((row) => newlyAddedIds.some((id) => id === row.interest.interest_id));

      return {
        response,
        synced,
        derivedInterestIds: Array.from(derivedInterestIds).map((id) => String(id)),
        newlyAdded,
      };
    });

    res.status(201).json({
      responseId: String(result.response.response_id),
      quizId: String(result.response.quiz_id),
      studentId,
      submittedAt: result.response.submitted_at,
      derivedInterestIds: result.derivedInterestIds,
      interestsAdded: result.newlyAdded.map((row) => ({
        id: String(row.interest.interest_id),
        name: row.interest.name,
      })),
      totalInterests: result.synced.length,
    });
  } catch (e) {
    console.error('Matchmaker quiz submit error:', e);
    if (e?.issues) return res.status(400).json({ message: 'Invalid input', errors: e.issues });
    if (e?.status === 400) return res.status(400).json({ message: e.message });
    next(e);
  }
});

export default router;
