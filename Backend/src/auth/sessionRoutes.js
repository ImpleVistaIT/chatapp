import express from 'express';
import { createSession, deleteSession } from './sessionStore.js';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.model.js';

const router = express.Router();

// Dev-only helper to create a session from tokens
router.post('/auth/session', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ ok: false });

  const { accessToken, refreshToken, expiresIn, userId } = req.body || {};
  if (!accessToken) {
    return res.status(400).json({ ok: false, error: 'accessToken is required' });
  }

  try {
    // Decode access token to extract user claims (we do NOT verify here; token was obtained from front-end)
    const claims = jwt.decode(accessToken) || {};
    const oid = claims.oid || claims.sub || null;
    const email = claims.preferred_username || claims.email || (claims.emails && claims.emails[0]) || null;
    const name = claims.name || `${claims.given_name || ''} ${claims.family_name || ''}`.trim() || null;

    // Upsert user in MongoDB
    let user = null;
    if (oid) {
      user = await User.findOneAndUpdate(
        { oid },
        { $set: { email, name, lastSeen: new Date() } },
        { upsert: true, new: true }
      );
    } else if (email) {
      user = await User.findOneAndUpdate(
        { email },
        { $set: { name, lastSeen: new Date() } },
        { upsert: true, new: true }
      );
    }

    // Fallback to provided userId if upsert didn't produce a user
    const resolvedUserId = (user && user._id && String(user._id)) || userId || null;
    if (!resolvedUserId) {
      return res.status(400).json({ ok: false, error: 'Could not resolve user id from token or request' });
    }

    const ttl = Number(expiresIn) || 3600;
    const { sessionId } = await createSession({ accessToken, refreshToken, expiresIn: ttl, userId: resolvedUserId });

    const cookieName = process.env.SESSION_COOKIE_NAME || 'session_id';
    res.cookie(cookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ttl * 1000,
    });

    return res.json({ ok: true, sessionId, user: user ? { id: String(user._id), oid: user.oid, email: user.email, name: user.name } : null });
  } catch (err) {
    console.error('create session error', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Could not create session' });
  }
});

router.post('/auth/logout', async (req, res) => {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'session_id';
  const sessionId = req.cookies?.[cookieName];
  if (sessionId) {
    await deleteSession(sessionId);
    res.clearCookie(cookieName, { path: '/' });
  }
  return res.json({ ok: true });
});

export default router;
