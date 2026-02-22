import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verifyMessage, type Address } from 'viem';
import { config } from './config';
import { pool } from './db';

const router = express.Router();

const UsernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

const EmailAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  username: z.string().regex(UsernameRegex, 'Username must be 3-30 chars (letters, numbers, underscore)').optional(),
});

function signAppJwt(payload: { userId: string; email?: string | null; walletAddress?: string | null }) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

router.post('/email/signup', async (req, res) => {
  const parse = EmailAuthSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.flatten() });
  }
  const { email, password, name, username } = parse.data;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const existing = await pool.query('select id from users where email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const usernameTaken = await pool.query('select id from users where lower(username) = lower($1)', [username]);
    if (usernameTaken.rows[0]) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      `insert into users (email, password_hash, name, username) values ($1, $2, $3, $4) returning id`,
      [email, passwordHash, name ?? null, username],
    );

    const userId = insert.rows[0].id as string;
    const token = signAppJwt({ userId, email });
    return res.status(201).json({ token, user: { id: userId, email, name: name ?? null, username } });
  } catch (err: any) {
    console.error('[email/signup]', err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Database connection issue. Please try again.' });
    }
    if (err.code === '23505') {
      const detail = (err.detail || '') as string;
      if (detail.includes('username')) return res.status(409).json({ error: 'Username is already taken' });
      return res.status(409).json({ error: 'Email already registered' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/email/login', async (req, res) => {
  const parse = EmailAuthSchema.omit({ name: true }).safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.flatten() });
  }
  const { email, password } = parse.data;

  try {
    const result = await pool.query(
      'select id, password_hash, name, username from users where email = $1',
      [email],
    );
    const user = result.rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash as string);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signAppJwt({ userId: user.id, email });
    return res.json({ token, user: { id: user.id, email, name: user.name, username: user.username } });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[email/login]', err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Database connection issue. Please try again.' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Wallet (Web3) auth using RainbowKit on the frontend ---

const WalletNonceSchema = z.object({
  address: z.string().min(1),
});

router.get('/wallet/nonce', async (req, res) => {
  const parse = WalletNonceSchema.safeParse({ address: req.query.address });
  if (!parse.success) {
    return res.status(400).json({ error: 'address is required' });
  }
  const { address } = parse.data;

  const nonce = crypto.randomUUID();
  try {
    await pool.query(
      `
      insert into wallet_nonces (wallet_address, nonce)
      values ($1, $2)
      on conflict (wallet_address) do update
      set nonce = excluded.nonce,
          created_at = now()
      `,
      [address.toLowerCase(), nonce],
    );
    return res.json({ nonce });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[wallet/nonce]', err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Database connection issue. Please try again.' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const WalletLoginSchema = z.object({
  address: z.string().min(1),
  signature: z.string().min(1),
});

router.post('/wallet/login', async (req, res) => {
  const parse = WalletLoginSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parse.error.flatten() });
  }
  const { address, signature } = parse.data;

  try {
    const { rows } = await pool.query(
      'select nonce from wallet_nonces where wallet_address = $1',
      [address.toLowerCase()],
    );
    if (!rows[0]) {
      return res.status(400).json({ error: 'No nonce for address' });
    }
    const nonce = rows[0].nonce as string;

    const message = `Sign in to boardlyX\n\nNonce: ${nonce}`;

    const valid = await verifyMessage({
      address: address.toLowerCase() as Address,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const upsert = await pool.query(
      `insert into users (wallet_address)
       values ($1)
       on conflict (wallet_address) do update set updated_at = now()
       returning id, email, name, username`,
      [address.toLowerCase()],
    );

    const user = upsert.rows[0];
    const token = signAppJwt({
      userId: user.id,
      email: user.email,
      walletAddress: address.toLowerCase(),
    });

    await pool.query('delete from wallet_nonces where wallet_address = $1', [address.toLowerCase()]);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        walletAddress: address.toLowerCase(),
      },
      needsUsername: !user.username,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[wallet/login]', err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Database connection issue. Please try again.' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Check username availability
router.get('/check-username', async (req, res) => {
  const username = (req.query.username as string || '').trim();
  if (!username || !UsernameRegex.test(username)) {
    return res.json({ available: false, reason: 'Invalid format' });
  }
  try {
    const { rows } = await pool.query('select id from users where lower(username) = lower($1)', [username]);
    return res.json({ available: rows.length === 0 });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Set username (for wallet users or users who don't have one yet)
const SetUsernameSchema = z.object({
  username: z.string().regex(UsernameRegex, 'Username must be 3-30 chars (letters, numbers, underscore)'),
  name: z.string().min(1).optional(),
});

router.post('/set-username', async (req, res) => {
  const authHeader = req.headers.authorization;
  const tokenStr = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!tokenStr) return res.status(401).json({ error: 'Authorization required' });

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(tokenStr, config.jwtSecret) as { userId: string };
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const parse = SetUsernameSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid payload', details: parse.error.flatten() });

  const { username, name } = parse.data;

  try {
    const taken = await pool.query('select id from users where lower(username) = lower($1) and id != $2', [username, decoded.userId]);
    if (taken.rows[0]) return res.status(409).json({ error: 'Username is already taken' });

    const { rows } = await pool.query(
      `update users set username = $1, name = coalesce($2, name), updated_at = now() where id = $3 returning id, email, name, username, wallet_address`,
      [username, name ?? null, decoded.userId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    return res.json({
      user: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].name,
        username: rows[0].username,
        walletAddress: rows[0].wallet_address,
      },
    });
  } catch (err: any) {
    console.error('[set-username]', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Username is already taken' });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

