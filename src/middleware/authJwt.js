import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config.js';

const prisma = new PrismaClient();

export function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  if (!/^Bearer\s+/.test(hdr)) {
    return res.status(401).json({ message: 'No token' });
  }

  try {
    const token = hdr.replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, env.jwtSecret);

    // ✅ Expose BOTH ids, plus role
    // sub = university number (public id), uid = UUID (DB id)
     req.user = {
      id: payload.uid,                    // DB UUID (use for Prisma and existing routes)
      uid: payload.uid,                   // DB UUID (optional, same as id)
      universityNumber: payload.sub,      // public university number
      role: payload.role
    }

    // (Optional) temporary backward-compat if any existing code used req.user.id
    // req.user.id = payload.sub; // ← uncomment only if you need it

    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
  
}
export const isSocietyAdminOrUniversityAdmin = (req, res, next) => {
  const user = req.user; // assume requireAuth already ran
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  if (user.role === 'society_admin' || user.role === 'university_admin') {
    return next();
  }

  return res.status(403).json({ message: 'Forbidden: Admins only' });
};

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

// check if admin manages the society
export async function canManageSociety(req, res, next) {
  const user = req.user;
  const societyId = parseInt(req.params.societyId);

  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  // university_admin has full access
  if (user.role === 'university_admin') return next();

  if (user.role === 'society_admin') {
    const society = await prisma.society.findUnique({
      where: { society_id: societyId },
      select: { created_by: true }
    });

    if (!society) return res.status(404).json({ message: 'Society not found' });
    if (society.created_by === user.id) return next();
  }

  return res.status(403).json({ message: 'Forbidden: Not authorized for this society' });
}
