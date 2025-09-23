import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config.js';

// Routes
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.route.js';
import studentRoutes from './modules/students/student.routes.js';

// Swagger (you already have this file)
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs.swagger.js';

const app = express();

// If you deploy behind a proxy (Render/Fly/NGINX), enable this via env.TRUST_PROXY
if (env.trustProxy) app.set('trust proxy', 1);

// Security & parsing middleware
app.use(helmet());
app.use(express.json());

// CORS (allow local dev + any additional origins from env)
app.use(
  cors({
    origin: (origin, cb) => {
      // allow non-browser tools (curl/postman with no origin) and allowlisted origins
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Logging
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Basic rate limit (tune as needed)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,                  // 300 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health & root
app.get('/', (_req, res) => res.send('PukkeConnect API is running'));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Mount feature routes (prefix with /api)
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/students', studentRoutes);

// API docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler (last)
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

export default app;
