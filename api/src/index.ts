import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import connectionRoutes from './routes/connections.routes';
import snippetRoutes from './routes/snippets.routes';
import { poolManager } from './db/pool';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '5mb' }));

// Health Check
app.get('/api/health', async (req, res) => {
  const isMetadataConnected = poolManager.isMetadataDbAvailable();
  res.json({
    status: 'healthy',
    service: 'sqlpilot-api',
    version: '1.0.0',
    metadataDbConnected: isMetadataConnected,
    llmProvider: config.llm.provider,
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/snippets', snippetRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
});

const server = app.listen(config.port, () => {
  console.log(`===============================================`);
  console.log(`🚀 SQLPilot API running on port ${config.port}`);
  console.log(`🔒 Read-Only Safety Validator: ACTIVE`);
  console.log(`🛡️  Secrets Manager: ${config.secrets.storageType}`);
  console.log(`🧠 LLM Provider: ${config.llm.provider} (${config.llm.model})`);
  console.log(`===============================================`);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing resources...');
  server.close();
  await poolManager.closeAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing resources...');
  server.close();
  await poolManager.closeAll();
  process.exit(0);
});

export default app;
