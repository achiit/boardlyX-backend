import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config';
import { initDb } from './db';
import authRouter from './auth';
import taskRoutes from './routes/tasks';
import teamRoutes from './routes/teams';
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';
import chatRoutes from './routes/chat';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { initSocket } from './socket';
import { backfillTeamGroupChats } from './repositories/chatRepository';

async function main() {
  await initDb();
  await backfillTeamGroupChats();

  const app = express();
  const httpServer = createServer(app);

  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/auth', authLimiter, authRouter);
  app.use('/api/tasks', apiLimiter, taskRoutes);
  app.use('/api/teams', apiLimiter, teamRoutes);
  app.use('/api/notifications', apiLimiter, notificationRoutes);
  app.use('/api/users', apiLimiter, userRoutes);
  app.use('/api/chat', apiLimiter, chatRoutes);

  app.use(errorHandler);

  // Initialize Socket.io
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`boardlyX backend listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend', err);
  process.exit(1);
});

