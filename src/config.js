export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || '11cee4cb0e347b5c407313499eaa7001',
  // allowlist your frontend origins (add prod URL when deployed)
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true', // set true on Render/Fly/NGINX
  resetTokenTtlMinutes: Number(process.env.RESET_TOKEN_TTL_MINUTES || 30),
  frontendResetUrl: process.env.FRONTEND_RESET_URL || 'http://localhost:5173/reset-password',
  smtp: {
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
  },
};
