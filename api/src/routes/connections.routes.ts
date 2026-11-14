import { Router, Response } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../auth/middleware';
import { connectionService } from '../services/connection.service';
import { introspectService } from '../services/introspect.service';
import { queryRunnerService } from '../services/runner.service';
import { nl2SqlService } from '../llm/nl2sql.service';
import { dmvService } from '../services/dmv.service';
import { metadataStore } from '../db/metadata.store';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

const CreateConnSchema = z.object({
  name: z.string().min(1),
  server_host: z.string().min(1),
  port: z.number().default(1433),
  database_name: z.string().min(1),
  login_username: z.string().min(1),
  password: z.string().min(1),
  is_read_only: z.boolean().default(true)
});

// GET /api/connections -> List connections
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const list = await connectionService.listConnections(req.user!.userId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connections/test -> Test credentials without creating
router.post('/test', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await connectionService.testConnectionCredentials(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connections -> Store connection + secret ref
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parse = CreateConnSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Validation failed', details: parse.error.format() });
      return;
    }

    const conn = await connectionService.createConnection(req.user!.userId, parse.data);
    res.status(201).json(conn);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connections/:id -> Get single connection
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const conn = await connectionService.getConnection(req.user!.userId, connId);
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json(conn);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/connections/:id -> Delete connection
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const deleted = await connectionService.deleteConnection(req.user!.userId, connId);
    if (!deleted) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connections/:id/introspect -> Schema JSON (cached or refreshed)
router.post('/:id/introspect', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const force = req.query.refresh === 'true';
    const schema = await introspectService.introspectDatabase(req.user!.userId, connId, force);
    res.json(schema);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connections/:id/ask -> NL question -> schema grounded prompt -> T-SQL + explanation
router.post('/:id/ask', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const result = await nl2SqlService.generateQuery(req.user!.userId, connId, prompt);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/connections/:id/run -> Validated read-only query execution
router.post('/:id/run', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const { sql, maxRows, timeoutMs, nlPrompt } = req.body;
    if (!sql) {
      res.status(400).json({ error: 'SQL query is required' });
      return;
    }

    const result = await queryRunnerService.executeReadOnlyQuery(req.user!.userId, connId, sql, {
      maxRows,
      timeoutMs,
      nlPrompt
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/connections/:id/performance -> Missing indexes + slow queries from DMVs (+ AI rationale)
router.get('/:id/performance', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const report = await dmvService.analyzePerformance(req.user!.userId, connId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/connections/:id/history -> Query history for this connection
router.get('/:id/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = parseInt(req.params.id, 10);
    const history = await metadataStore.listQueryHistory(req.user!.userId, connId);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
