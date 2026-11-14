import { Router, Request, Response } from 'express';
import { metadataStore } from '../db/metadata.store';
import { hashPassword, comparePassword, signToken } from '../auth/jwt';
import { z } from 'zod';

const router = Router();

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parse = AuthSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
      return;
    }

    const { email, password } = parse.data;
    const existing = await metadataStore.findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await metadataStore.createUser(email, passwordHash);
    const token = signToken({ userId: user.id, email: user.email });

    res.status(201).json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parse = AuthSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }

    const { email, password } = parse.data;
    const user = await metadataStore.findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

export default router;
