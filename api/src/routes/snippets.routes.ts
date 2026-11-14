import { Router, Response } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../auth/middleware';
import { metadataStore } from '../db/metadata.store';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

const CreateSnippetSchema = z.object({
  connection_id: z.number(),
  title: z.string().min(1),
  sql_text: z.string().min(1),
  notes: z.string().optional()
});

router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parse = CreateSnippetSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Validation failed', details: parse.error.format() });
      return;
    }

    const { connection_id, title, sql_text, notes } = parse.data;
    const snippet = await metadataStore.saveSnippet(req.user!.userId, connection_id, {
      title,
      sql_text,
      notes
    });

    res.status(201).json(snippet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const connId = req.query.connection_id ? parseInt(req.query.connection_id as string, 10) : undefined;
    const snippets = await metadataStore.listSnippets(req.user!.userId, connId);
    res.json(snippets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
