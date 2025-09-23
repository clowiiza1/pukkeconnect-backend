import jwt from 'jsonwebtoken';
import { env } from '../config.js';

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
