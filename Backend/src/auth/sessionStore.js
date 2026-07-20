import { createClient } from 'redis';
import crypto from 'crypto';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const client = createClient({ url: redisUrl });

client.connect().catch((err) => {
  console.error('Redis connect error:', err.message || err);
});

function key(sessionId) {
  return `sess:${sessionId}`;
}

export async function createSession({ accessToken, refreshToken, expiresIn = 3600, userId }) {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + expiresIn * 1000;
  const data = { accessToken, refreshToken, expiresAt, userId };
  try {
    await client.set(key(sessionId), JSON.stringify(data), { EX: Math.ceil((expiresIn + 3600) / 1) });
    return { sessionId, data };
  } catch (err) {
    console.error('createSession error', err.message || err);
    throw err;
  }
}

export async function getSession(sessionId) {
  if (!sessionId) return null;
  try {
    const raw = await client.get(key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('getSession error', err.message || err);
    return null;
  }
}

export async function deleteSession(sessionId) {
  try {
    await client.del(key(sessionId));
  } catch (err) {
    console.error('deleteSession error', err.message || err);
  }
}

export async function refreshSession(sessionId) {
  const sess = await getSession(sessionId);
  if (!sess || !sess.refreshToken) return null;

  const tenant = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) return null;

  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);
  body.append('grant_type', 'refresh_token');
  body.append('refresh_token', sess.refreshToken);

  try {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!resp.ok) {
      console.error('refreshSession token endpoint failed', resp.status);
      await deleteSession(sessionId);
      return null;
    }

    const json = await resp.json();
    const newAccess = json.access_token;
    const newRefresh = json.refresh_token || sess.refreshToken;
    const expiresIn = json.expires_in || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    const newData = { accessToken: newAccess, refreshToken: newRefresh, expiresAt, userId: sess.userId };
    await client.set(key(sessionId), JSON.stringify(newData), { EX: Math.ceil((expiresIn + 3600) / 1) });
    return newData;
  } catch (err) {
    console.error('refreshSession error', err.message || err);
    await deleteSession(sessionId);
    return null;
  }
}
