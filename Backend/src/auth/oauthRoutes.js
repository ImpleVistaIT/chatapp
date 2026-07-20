import express from 'express';
import fetch from 'node-fetch';
import { createSession, getSession, deleteSession } from './sessionStore.js';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.model.js';

const router = express.Router();

function getAuthority() {
  const tenant = process.env.ENTRA_TENANT_ID;
  return process.env.ENTRA_AUTHORITY || (tenant ? `https://login.microsoftonline.com/${tenant}` : null);
}

router.get('/auth/authorize', (req, res) => {
  const authority = getAuthority();
  if (!authority) return res.status(500).send('ENTRA_AUTHORITY or ENTRA_TENANT_ID not configured');

  const clientId = process.env.ENTRA_CLIENT_ID;
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
  const scope = process.env.ENTRA_API_SCOPE ? `${process.env.ENTRA_API_SCOPE} openid profile offline_access` : 'openid profile offline_access';
  const state = req.query.redirect || '/';

  const url = `${authority.replace(/\/$/, '')}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

  return res.redirect(url);
});

router.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state || '/';
  if (!code) return res.status(400).send('Missing code');

  const authority = getAuthority();
  const tokenUrl = `${authority.replace(/\/$/, '')}/oauth2/v2.0/token`;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;

  const body = new URLSearchParams();
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);
  body.append('grant_type', 'authorization_code');
  body.append('code', code);
  body.append('redirect_uri', redirectUri);

  try {
    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      console.error('token exchange failed', txt);
      return res.status(500).send('Token exchange failed');
    }

    const json = await tokenResp.json();
    const accessToken = json.access_token;
    const refreshToken = json.refresh_token;
    const expiresIn = json.expires_in || 3600;

    const claims = jwt.decode(accessToken) || {};
    const oid = claims.oid || claims.sub || null;
    const email = claims.preferred_username || claims.email || null;
    const name = claims.name || `${claims.given_name || ''} ${claims.family_name || ''}`.trim() || null;

    // Upsert user
    let user = null;
    if (oid) {
      user = await User.findOneAndUpdate({ oid }, { $set: { email, name, lastSeen: new Date() } }, { upsert: true, new: true });
    } else if (email) {
      user = await User.findOneAndUpdate({ email }, { $set: { name, lastSeen: new Date() } }, { upsert: true, new: true });
    }

    const userId = (user && String(user._id)) || null;

    const { sessionId } = await createSession({ accessToken, refreshToken, expiresIn, userId: userId || '' });

    const cookieName = process.env.SESSION_COOKIE_NAME || 'session_id';
    res.cookie(cookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiresIn * 1000,
    });

    return res.redirect(state);
  } catch (err) {
    console.error('callback error', err.message || err);
    return res.status(500).send('Auth callback error');
  }
});

// Revoke refresh tokens for the current session's user (server-side)
router.post('/auth/revoke', async (req, res) => {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'session_id';
  const sessionId = req.cookies?.[cookieName] || req.body?.sessionId;

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: 'No session id' });
  }

  try {
    const sess = await getSession(sessionId);
    if (!sess) {
      // session already gone
      res.clearCookie(cookieName, { path: '/' });
      return res.json({ ok: true, revoked: false, reason: 'no-session' });
    }

    const userId = sess.userId || null;
    let revokeResult = { ok: false };

    if (userId) {
      const user = await User.findById(userId);
      const oid = user?.oid || null;

      const tenant = process.env.ENTRA_TENANT_ID;
      const clientId = process.env.ENTRA_CLIENT_ID;
      const clientSecret = process.env.ENTRA_CLIENT_SECRET;

      if (oid && tenant && clientId && clientSecret) {
        // obtain app token via client credentials
        const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        const body = new URLSearchParams();
        body.append('client_id', clientId);
        body.append('client_secret', clientSecret);
        body.append('grant_type', 'client_credentials');
        body.append('scope', 'https://graph.microsoft.com/.default');

        const tResp = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (tResp.ok) {
          const tJson = await tResp.json();
          const appToken = tJson.access_token;
          try {
            // Call Graph to revoke user's refresh tokens / sessions
            const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oid)}/revokeSignInSessions`;
            const gResp = await fetch(graphUrl, { method: 'POST', headers: { Authorization: `Bearer ${appToken}` } });
            revokeResult = { ok: gResp.ok, status: gResp.status };
          } catch (e) {
            console.error('graph revoke error', e?.message || e);
            revokeResult = { ok: false, error: String(e) };
          }
        } else {
          const txt = await tResp.text().catch(() => '');
          console.error('app token fetch failed', txt);
          revokeResult = { ok: false, error: 'app_token_failed', status: tResp.status };
        }
      }
    }

    // always delete local session and clear cookie
    await deleteSession(sessionId);
    res.clearCookie(cookieName, { path: '/' });

    return res.json({ ok: true, revoked: revokeResult });
  } catch (err) {
    console.error('revoke error', err?.message || err);
    return res.status(500).json({ ok: false, error: 'revoke_failed' });
  }
});

export default router;

