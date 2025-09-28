import { Router } from 'express';
import { requireAuth, canManageSociety } from '../../middleware/authJwt.js';
import * as membershipsController from './memberships.controller.js';
import { validateParams, societyIdParamSchema, studentIdParamSchema } from './memberships.validation.js';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MembershipStatus:
 *       type: string
 *       enum: [pending, active, rejected, suspended, left]
 *     Membership:
 *       type: object
 *       properties:
 *         studentId: { type: string, format: uuid }
 *         status: { $ref: '#/components/schemas/MembershipStatus' }
 *         joinDate: { type: string, format: date-time }
 *     UpdateMembershipInput:
 *       type: object
 *       properties:
 *         status: { $ref: '#/components/schemas/MembershipStatus' }
 */

/**
 * @openapi
 * /api/societies/{societyId}/memberships:
 *   post:
 *     tags: [Memberships]
 *     summary: Request to join a society
 *     description: Creates a membership with status "pending".
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: societyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Membership requested
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   $ref: '#/components/schemas/MembershipStatus'
 *       400:
 *         description: Already exists
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/:societyId/memberships',
  requireAuth,
  validateParams(societyIdParamSchema),
  membershipsController.requestMembership
);

/**
 * @openapi
 * /api/societies/{societyId}/memberships/{studentId}:
 *   put:
 *     tags: [Memberships]
 *     summary: Update a membership status
 *     description: Only society_admin or university_admin can update membership status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: societyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMembershipInput'
 *     responses:
 *       200:
 *         description: Membership updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   $ref: '#/components/schemas/MembershipStatus'
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.put(
  '/:societyId/memberships/:studentId',
  requireAuth,
  validateParams(societyIdParamSchema),
  validateParams(studentIdParamSchema),
  canManageSociety,
  membershipsController.updateMembershipStatus
);

/**
 * @openapi
 * /api/societies/{societyId}/members:
 *   get:
 *     tags: [Memberships]
 *     summary: List members of a society
 *     description: Only society_admin or university_admin can view full member list.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: societyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of members
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Membership'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/:societyId/members',
  requireAuth,
  validateParams(societyIdParamSchema),
  canManageSociety,
  membershipsController.listMembers
);

export default router;
