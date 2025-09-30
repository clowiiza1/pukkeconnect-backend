import { z } from 'zod';

// Validate :societyId param
export const societyIdParamSchema = z.object({
  societyId: z
    .string()
    .regex(/^\d+$/, 'societyId must be a number')
    .transform(Number)
});

// Validate :studentId param
export const studentIdParamSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID')
});

export const studentIdentifierParamSchema = z.object({
  studentIdentifier: z.string().trim().min(1, 'studentIdentifier is required')
});

export const studentMembershipStatusParamsSchema = z.object({
  studentIdentifier: z.string().trim().min(1, 'studentIdentifier is required'),
  societyId: z
    .string()
    .regex(/^\d+$/, 'societyId must be a number')
    .transform(Number),
});

// Middleware to validate params
export function validateParams(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.params);
      req.params = parsed; // replace with parsed/validated values
      next();
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ message: 'Invalid parameters', errors: err.issues });
      }
      next(err);
    }
  };
}
