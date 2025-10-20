const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || '11cee4cb0e347b5c407313499eaa7001',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  resetTokenTtlMinutes: parsePositiveNumber(process.env.RESET_TOKEN_TTL_MINUTES, 30),
  frontendResetUrl: process.env.FRONTEND_RESET_URL || 'http://localhost:5173/reset-password',
  mailjet: {
    apiKey: process.env.MAILJET_API_KEY || '',
    apiSecret: process.env.MAILJET_API_SECRET || '',
    from: process.env.MAILJET_FROM || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseNumber(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'eu-central-1',
    bucket: process.env.S3_BUCKET || '',
    uploadUrlTtlSeconds: parsePositiveNumber(process.env.UPLOAD_SIGN_URL_TTL_SECONDS, 900),
    downloadUrlTtlSeconds: parsePositiveNumber(process.env.DOWNLOAD_SIGN_URL_TTL_SECONDS, 120),
  },
};
