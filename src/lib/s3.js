import { randomUUID } from 'crypto';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config.js';

let cachedClient = null;
const CONTENT_TYPE_EXTENSION = new Map([
  ['image/jpeg', '.jpg'],
  ['image/pjpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
  ['image/svg+xml', '.svg'],
  ['image/avif', '.avif'],
]);

const sanitizeSegment = (value) =>
  value
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/|\/$/g, '');

export const getS3Client = () => {
  if (!cachedClient) {
    const config = { region: env.aws.region };

    if (env.aws.accessKeyId && env.aws.secretAccessKey) {
      config.credentials = {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
      };
    }

    cachedClient = new S3Client(config);
  }

  return cachedClient;
};

export const ensureS3Configured = () => {
  if (!env.aws.bucket) {
    throw new Error('S3 bucket not configured (S3_BUCKET missing)');
  }
};

export const createPresignedPutUrl = async ({ key, contentType, expiresIn }) => {
  ensureS3Configured();
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.aws.bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, {
    expiresIn: expiresIn ?? env.aws.uploadUrlTtlSeconds,
  });
};

export const createPresignedGetUrl = async ({ key, expiresIn }) => {
  ensureS3Configured();
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.aws.bucket,
    Key: key,
  });

  return getSignedUrl(client, command, {
    expiresIn: expiresIn ?? env.aws.downloadUrlTtlSeconds,
  });
};

const extensionFromContentType = (contentType) => {
  if (!contentType) return '';
  const normalized = contentType.toLowerCase();
  return CONTENT_TYPE_EXTENSION.get(normalized) || '';
};

export const buildObjectKey = ({ scope, fileName, contentType }) => {
  const prefix = scope ? sanitizeSegment(scope) : '';
  const extFromName = fileName ? path.extname(fileName).toLowerCase() : '';
  const extFromType = extensionFromContentType(contentType);
  const fallbackExtFromType = contentType ? `.${contentType.split('/').pop()}` : '';
  const extension = extFromName || extFromType || fallbackExtFromType || '';
  const key = `${prefix ? `${prefix}/` : ''}${randomUUID()}${extension}`;
  return key;
};
