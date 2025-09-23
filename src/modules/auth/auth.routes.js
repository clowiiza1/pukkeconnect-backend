import { Router } from 'express';
import { register, login } from './auth.controller.js';
import { requireAuth } from '../../middleware/authJwt.js';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new student user
 *     description: 
 *       Signup requires student number, first name, last name, phone number, campus, major, and password. 
 *       The system derives the NWU email from the student number.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - universityNumber
 *               - phoneNumber
 *               - campus
 *               - major
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Chloe
 *               lastName:
 *                 type: string
 *                 example: Wilson
 *               universityNumber:
 *                 type: string
 *                 example: "12345678"
 *               phoneNumber:
 *                 type: string
 *                 example: "0823456789"
 *               campus:
 *                 type: string
 *                 example: "Potchefstroom"
 *               major:
 *                 type: string
 *                 example: "Computer Science"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Password123!"
 *     responses:
 *       201:
 *         description: User successfully registered
 *       400:
 *         description: Invalid input or mismatch in student number/email
 *       409:
 *         description: Email or university number already exists
 */
router.post('/register', register);


/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login with university number or email and password
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               universityNumber:
 *                 type: string
 *                 example: "12345678"
 *               email:
 *                 type: string
 *                 example: "12345678@mynwu.ac.za"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Password123!"
 *             description: |
 *               Supply either `universityNumber` (preferred) or `email`. If `email` is provided and contains
 *               an '@' it will be used as an email; otherwise it will be treated as a university number.
 *     responses:
 *       200:
 *         description: Login successful, returns JWT
 *       400:
 *         description: Missing username or password
 *       401:
 *         description: Invalid username or password
 */
router.post('/login', login);



/**
 * @openapi
 * /api/auth/profile:
 *   get:
 *     summary: Get authenticated user from JWT
 */
router.get('/profile', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
