// Golf PT Collaboration — R2 Storage Proxy Worker (+ Claude proxy + STT)
// Routes:
//   PUT    /{key}  → upload blob to R2
//   GET    /{key}  → download blob from R2
//   DELETE /{key}  → remove blob from R2
//   POST   /claude → Anthropic(Claude) 프록시 (키는 env.ANTHROPIC_API_KEY 시크릿)
//   POST   /stt    → 음성(오디오 바이너리) → 텍스트 (Groq Whisper, 한국어)
// Auth: X-API-Key header must match env.APP_API_KEY secret
//
// 시크릿(Settings → Variables and Secrets):
//   APP_API_KEY        (기존, R2 인증)
//   ANTHROPIC_API_KEY  (기존, sk-ant-... — AI 세션카드 정리용)
//   GROQ_API_KEY       (신규, gsk_...   — 수업 녹음 → 글 변환용)

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

    // ── 음성 → 텍스트 (/stt) — Groq Whisper, 한국어 ─────────
    if (url.pathname === '/stt') {
      if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
      const apiKey = request.headers.get('X-API-Key');
      if (!env.APP_API_KEY || apiKey !== env.APP_API_KEY) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (!env.GROQ_API_KEY) {
        return json({ error: 'stt-not-configured' }, 501);
      }
      const ct = request.headers.get('content-type') || 'audio/mp4';
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) return json({ error: 'empty audio' }, 400);
      if (buf.byteLength > 24 * 1024 * 1024) return json({ error: 'audio too large (24MB max)' }, 413);
      const ext = ct.indexOf('webm') !== -1 ? 'webm' : (ct.indexOf('mp4') !== -1 ? 'm4a' : 'audio');
      const fd = new FormData();
      fd.append('file', new File([buf], 'rec.' + ext, { type: ct }));
      fd.append('model', 'whisper-large-v3-turbo');
      fd.append('language', 'ko');
      fd.append('response_format', 'json');
      fd.append('temperature', '0');
      const up = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
        body: fd,
      });
      const txt = await up.text();
      if (!up.ok) return json({ error: 'groq ' + up.status, detail: txt.slice(0, 300) }, 502);
      let out = {}; try { out = JSON.parse(txt); } catch (e) {}
      return json({ text: (out.text || '').trim() }, 200);
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
