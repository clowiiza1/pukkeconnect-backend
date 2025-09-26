import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';

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
      questionId: z.string(), // BigInt as string
      // one of optionId OR freeText
      optionIds: z.array(z.string()).optional(), // BigInt as strings (allow multi)
      freeText: z.string().optional(),
    })
  ).min(1),
});

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

    const byQ = new Map(
      quiz.quiz_question.map(q => [String(q.question_id), q])
    );

    // Validate answers fit question type
    for (const a of body.answers) {
      const qq = byQ.get(a.questionId);
      if (!qq) return res.status(400).json({ message: `Unknown question ${a.questionId}` });

      if (qq.kind === 'text') {
        if (!a.freeText || a.optionIds?.length) {
          return res.status(400).json({ message: `Question ${a.questionId} requires freeText only` });
        }
      } else {
        if (!a.optionIds?.length) {
          return res.status(400).json({ message: `Question ${a.questionId} requires optionIds` });
        }
        if (qq.kind === 'single' && a.optionIds.length !== 1) {
          return res.status(400).json({ message: `Question ${a.questionId} allows exactly one option` });
        }
        const validSet = new Set(qq.quiz_option.map(o => String(o.option_id)));
        for (const oid of a.optionIds) {
          if (!validSet.has(oid)) return res.status(400).json({ message: `Invalid option ${oid} for question ${a.questionId}` });
        }
      }
    }

    // Transactional write
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const response = await tx.quiz_response.create({
          data: { quiz_id: quizId, student_id: req.user.uid }
        });

        // Flatten answers
        for (const a of body.answers) {
          const qid = BigInt(a.questionId);
          if (a.freeText) {
            await tx.quiz_response_answer.create({
              data: {
                response_id: response.response_id,
                question_id: qid,
                free_text: a.freeText,
              }
            });
          }
          if (a.optionIds?.length) {
            for (const oid of a.optionIds) {
              await tx.quiz_response_answer.create({
                data: {
                  response_id: response.response_id,
                  question_id: qid,
                  option_id: BigInt(oid),
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

export default router;
