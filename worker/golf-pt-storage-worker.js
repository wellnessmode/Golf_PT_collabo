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

    // ── DB 쓰기 프록시 (/db) — Supabase 서비스 키로 실행(RLS 우회) ─────────
    // anon 은 읽기전용으로 조이고, 모든 쓰기는 이 프록시 경유(APP_API_KEY 인증).
    // body: { op:'upsert'|'delete'|'update', table, rows?, values?, filters?:[{col,op,val}] }
    if (url.pathname === '/db') {
      if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
      const apiKey = request.headers.get('X-API-Key');
      if (!env.APP_API_KEY || apiKey !== env.APP_API_KEY) return json({ error: 'unauthorized' }, 401);
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'db-proxy-not-configured' }, 501);
      let b;
      try { b = JSON.parse(await request.text()); } catch (e) { return json({ error: 'bad json' }, 400); }
      const ALLOWED = { members:1, assessments:1, sessions:1, shot_events:1, active_sessions:1, bays:1, reports:1 };
      if (!ALLOWED[b.table]) return json({ error: 'table not allowed' }, 403);
      const base = env.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/' + b.table;
      const H = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
      const OPS = { eq:'eq', neq:'neq', in:'in', lt:'lt', gt:'gt' };
      function qs(filters){
        if (!filters || !filters.length) return '';
        return '?' + filters.map(f => {
          const op = OPS[f.op] || 'eq';
          if (op === 'in') return encodeURIComponent(f.col) + '=in.(' + (Array.isArray(f.val)?f.val:[f.val]).map(v=>encodeURIComponent(v)).join(',') + ')';
          return encodeURIComponent(f.col) + '=' + op + '.' + encodeURIComponent(f.val);
        }).join('&');
      }
      try {
        let up;
        if (b.op === 'upsert') {
          up = await fetch(base, { method:'POST', headers:{...H, 'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(b.rows||[]) });
        } else if (b.op === 'update') {
          up = await fetch(base + qs(b.filters), { method:'PATCH', headers:{...H, 'Prefer':'return=minimal'}, body: JSON.stringify(b.values||{}) });
        } else if (b.op === 'delete') {
          if (!b.filters || !b.filters.length) return json({ error: 'delete requires filters' }, 400);
          up = await fetch(base + qs(b.filters), { method:'DELETE', headers:{...H, 'Prefer':'return=minimal'} });
        } else {
          return json({ error: 'unknown op' }, 400);
        }
        const txt = await up.text();
        if (!up.ok) return json({ error: 'supabase ' + up.status, detail: txt.slice(0,300) }, 502);
        return json({ ok: true }, 200);
      } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
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
      // 골프 레슨 도메인 힌트 — Whisper 가 골프 용어를 정확히 받아쓰도록 유도.
      // (헤더 prompt 는 URL 인코딩되어 옴 → 디코드. 없으면 기본 골프 사전)
      let bodyPrompt = '';
      try { const raw = request.headers.get('X-STT-Prompt'); if (raw) bodyPrompt = decodeURIComponent(raw); } catch (e) {}
      fd.append('prompt', bodyPrompt || '골프 레슨입니다. 그립, 어드레스, 셋업, 정렬, 백스윙, 탑, 전환, 다운스윙, 임팩트, 릴리스, 팔로우스루, 피니시, 템포, 리듬, 스윙 플레인, 온플레인, 샬로잉, 코킹, 힌징, 라그, 캐스팅, 오버더탑, 인아웃, 아웃인, 스웨이, 슬라이드, 히프턴, 체중이동, 로테이션, 클럽페이스, 페이스앵글, 어택앵글, 로프트, 다이나믹로프트, 스매시팩터, 볼스피드, 클럽스피드, 캐리, 토탈, 스핀, 런치앵글, 드로우, 페이드, 훅, 슬라이스, 뒤땅, 탑볼, 생크, 드라이버, 우드, 유틸리티, 아이언, 웨지, 퍼터, 어프로치, 치핑, 피칭, 벙커샷, 퍼팅.');
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
