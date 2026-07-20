import { getSession, refreshSession } from './sessionStore.js';

export async function sessionAuth(req, res, next) {
  try {
    const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'session_id';
    const sessionId = req.cookies?.[sessionCookieName];
    if (!sessionId) return res.status(401).json({ ok: false, error: 'Missing session' });

    const sess = await getSession(sessionId);
    if (!sess) return res.status(401).json({ ok: false, error: 'Invalid session' });

    if (sess.expiresAt && Number(sess.expiresAt) > Date.now()) {
      req.user = { id: String(sess.userId || sess.userId), claims: null, accessToken: sess.accessToken };
      return next();
    }

    // attempt refresh
    const refreshed = await refreshSession(sessionId);
    if (refreshed) {
      req.user = { id: String(refreshed.userId || refreshed.userId), claims: null, accessToken: refreshed.accessToken };
      return next();
    }

    return res.status(401).json({ ok: false, error: 'Session expired' });
  } catch (err) {
    console.error('sessionAuth error', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Session error' });
  }
}
