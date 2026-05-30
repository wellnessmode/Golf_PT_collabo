// Golf PT Collaboration — R2 Storage Proxy Worker (+ Claude proxy)
// Routes:
//   PUT    /{key}  → upload blob to R2
//   GET    /{key}  → download blob from R2
//   DELETE /{key}  → remove blob from R2
//   POST   /claude → Anthropic(Claude) 프록시 (키는 env.ANTHROPIC_API_KEY 시크릿)
// Auth: X-API-Key header must match env.APP_API_KEY secret
//
// 시크릿(Settings → Variables and Secrets):
//   APP_API_KEY        (기존, R2 인증)
//   ANTHROPIC_API_KEY  (신규, sk-ant-... — AI 세션카드 정리용)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ── Claude 프록시 (/claude) ─────────────────────────────
    if (url.pathname === '/claude') {
      if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
      const apiKey = request.headers.get('X-API-Key');
      if (!env.APP_API_KEY || apiKey !== env.APP_API_KEY) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: 'ANTHROPIC_API_KEY secret not set' }, 500);
      }
      const body = await request.text();
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body,
      });
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }
    // ────────────────────────────────────────────────────────

    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key) {
      return json({ error: 'missing key' }, 400);
    }

    // Auth check (skip only for GET to allow <video src> direct playback)
    if (request.method !== 'GET') {
      const apiKey = request.headers.get('X-API-Key');
      if (!env.APP_API_KEY || apiKey !== env.APP_API_KEY) {
        return json({ error: 'unauthorized' }, 401);
      }
    }

    try {
      if (request.method === 'PUT') {
        const contentType = request.headers.get('content-type') || 'application/octet-stream';
        await env.BUCKET.put(key, request.body, {
          httpMetadata: { contentType },
        });
        return json({ ok: true, key }, 200);
      }

      if (request.method === 'GET') {
        const obj = await env.BUCKET.get(key);
        if (!obj) return json({ error: 'not found' }, 404);
        const headers = new Headers(CORS);
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('cache-control', 'private, max-age=31536000');
        return new Response(obj.body, { headers });
      }

      if (request.method === 'DELETE') {
        await env.BUCKET.delete(key);
        return json({ ok: true }, 200);
      }

      return json({ error: 'method not allowed' }, 405);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  }
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
