import 'dotenv/config';           // loads .env before anything else
import { env } from './config.js';
import app from './app.js';

const server = app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
  console.log(`Docs: http://localhost:${env.port}/docs`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down…');
  server.close(() => {
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
