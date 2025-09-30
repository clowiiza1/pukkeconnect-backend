import { Router } from 'express';
import { requireAuth } from '../../middleware/authJwt.js';
import { validateParams, studentIdentifierParamSchema, studentMembershipStatusParamsSchema, societyIdParamSchema } from './memberships.validation.js';
import { listStudentSocieties, getStudentMembershipStatus, leaveSociety } from './memberships.controller.js';

const router = Router();

/**
 * @openapi
 * /api/memberships/students/{studentIdentifier}/societies:
 *   get:
 *     tags: [Memberships]
 *     summary: List societies a student belongs to
 *     description: Students can view their own memberships. Society or university admins can view any student's memberships.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentIdentifier
 *         required: true
 *         schema:
 *           type: string
 *         description: Student UUID or university number
 *     responses:
 *       200:
 *         description: Memberships retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 studentId:
 *                   type: string
 *                   format: uuid
 *                 universityNumber:
 *                   type: string
 *                 total:
 *                   type: integer
 *                 memberships:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       society:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           name: { type: string }
 *                           category: { type: string, nullable: true }
 *                           campus: { type: string, nullable: true }
 *                           description: { type: string, nullable: true }
 *                       status:
 *                         $ref: '#/components/schemas/MembershipStatus'
 *                       joinDate:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Student not found
 */
router.get(
  '/students/:studentIdentifier/societies',
  requireAuth,
  validateParams(studentIdentifierParamSchema),
  listStudentSocieties
);

/**
 * @openapi
 * /api/memberships/societies/{societyId}/leave:
 *   post:
 *     tags: [Memberships]
 *     summary: Leave a society
 *     description: Allows an authenticated student to leave a society they belong to. The membership status is set to "left" but the record is kept for history.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: societyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Society identifier
 *     responses:
 *       200:
 *         description: Membership updated to left
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 studentId:
 *                   type: string
 *                   format: uuid
 *                 societyId:
 *                   type: integer
 *                 status:
 *                   $ref: '#/components/schemas/MembershipStatus'
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Membership not found
 *       409:
 *         description: Membership already marked as left or cannot be left
 */
router.post(
  '/societies/:societyId/leave',
  requireAuth,
  validateParams(societyIdParamSchema),
  leaveSociety
);

/**
 * @openapi
 * /api/memberships/students/{studentIdentifier}/societies/{societyId}/status:
 *   get:
 *     tags: [Memberships]
 *     summary: Get the status of a student's society membership request
 *     description: Students can view their own membership status. Society or university admins can view any student's membership.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentIdentifier
 *         required: true
 *         schema:
 *           type: string
 *         description: Student UUID or university number
 *       - in: path
 *         name: societyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Society identifier
 *     responses:
 *       200:
 *         description: Membership status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 studentId:
 *                   type: string
 *                   format: uuid
 *                 universityNumber:
 *                   type: string
 *                 society:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     category: { type: string, nullable: true }
 *                     campus: { type: string, nullable: true }
 *                     description: { type: string, nullable: true }
 *                 status:
 *                   $ref: '#/components/schemas/MembershipStatus'
 *                 joinDate:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get(
  '/students/:studentIdentifier/societies/:societyId/status',
  requireAuth,
  validateParams(studentMembershipStatusParamsSchema),
  getStudentMembershipStatus
);

export default router;
