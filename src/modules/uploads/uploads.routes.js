import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authJwt.js';
import {
  buildObjectKey,
  createPresignedGetUrl,
  createPresignedPutUrl,
  ensureS3Configured,
} from '../../lib/s3.js';
import { env } from '../../config.js';

const router = Router();
const prisma = new PrismaClient();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per object

const scopeToPrefix = {
  post: 'posts',
  event: 'events',
  society: 'societies',
  profile: 'profiles',
};

const presignUploadSchema = z.object({
  scope: z.enum(['post', 'event', 'society', 'profile']).default('post'),
  fileName: z.string().max(200).optional(),
  contentType: z.string().min(1).max(120),
  size: z.number().int().min(0).max(MAX_FILE_SIZE_BYTES).optional(),
  folder: z.string().max(200).optional(),
});

const presignDownloadSchema = z.object({
  key: z.string().min(1).max(512),
  expiresIn: z
    .coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .optional(),
});

const isPlatformAdmin = (role) => role === 'society_admin' || role === 'university_admin';

async function canViewPostMedia(user, mediaRecord) {
  if (!mediaRecord?.post) return false;
  if (isPlatformAdmin(user.role)) return true;
  if (mediaRecord.post.author_id === user.uid) return true;

  const membership = await prisma.membership.findUnique({
    where: {
      student_id_society_id: {
        student_id: user.uid,
        society_id: mediaRecord.post.society_id,
      },
    },
    select: { status: true },
  });

  return membership?.status === 'active';
}

router.post('/uploads/presign', requireAuth, async (req, res, next) => {
  try {
    ensureS3Configured();
    const body = presignUploadSchema.parse(req.body);

    const prefix = scopeToPrefix[body.scope];
    if (!prefix) {
      return res.status(400).json({ message: 'Invalid scope for upload' });
    }

    const scopeSegments = [prefix];
    if (body.folder) scopeSegments.push(body.folder);
    scopeSegments.push(req.user.uid);
    const scopePath = scopeSegments.filter(Boolean).join('/');

    const key = buildObjectKey({
      scope: scopePath,
      fileName: body.fileName,
      contentType: body.contentType,
    });

    const uploadUrl = await createPresignedPutUrl({
      key,
      contentType: body.contentType,
      expiresIn: env.aws.uploadUrlTtlSeconds,
    });

    // Provide a short-lived download URL for immediate preview after upload
    const downloadUrl = await createPresignedGetUrl({
      key,
      expiresIn: env.aws.downloadUrlTtlSeconds,
    });

    res.json({
      key,
      uploadUrl,
      uploadExpiresIn: env.aws.uploadUrlTtlSeconds,
      downloadUrl,
      downloadExpiresIn: env.aws.downloadUrlTtlSeconds,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid input', errors: err.issues });
    }
    next(err);
  }
});

router.get('/uploads/presign-download', requireAuth, async (req, res, next) => {
  try {
    ensureS3Configured();
    const params = presignDownloadSchema.parse(req.query);
    const { key, expiresIn } = params;
    const [scope] = key.split('/', 1);

    if (!scope) {
      return res.status(400).json({ message: 'Invalid key' });
    }

    if (!Object.values(scopeToPrefix).includes(scope)) {
      return res.status(400).json({ message: 'Unsupported key scope' });
    }

    switch (scope) {
      case 'posts': {
        const media = await prisma.post_media.findUnique({
          where: { storage_key: key },
          include: {
            post: {
              select: {
                society_id: true,
                author_id: true,
              },
            },
          },
        });

        if (!media) return res.status(404).json({ message: 'Media not found' });
        const allowed = await canViewPostMedia(req.user, media);
        if (!allowed) return res.status(403).json({ message: 'Forbidden' });
        break;
      }
      default:
        return res.status(400).json({ message: 'Unsupported key scope' });
    }

    const url = await createPresignedGetUrl({
      key,
      expiresIn: expiresIn ?? env.aws.downloadUrlTtlSeconds,
    });

    res.json({
      url,
      expiresIn: expiresIn ?? env.aws.downloadUrlTtlSeconds,
    });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ message: 'Invalid parameters', errors: err.issues });
    }
    next(err);
  }
});

export default router;
