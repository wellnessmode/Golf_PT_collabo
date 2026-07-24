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
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-STT-Prompt',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
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
      fd.append('response_format', 'verbose_json');   // 조각별 신뢰도(logprob·no_speech·압축비)를 받아 헛인식 걸러냄
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
      // ── 헛인식(hallucination) 필터 — 조각별 신뢰도로 잡음/무음 파편 제거 ──
      //   Whisper 는 무음·잡음 구간에서 그럴듯한 문장을 지어냄. verbose_json 의
      //   조각별 지표로 걸러냄: 무음확률 높음 / 평균 logprob 매우 낮음(불확실) /
      //   압축비 높음(같은 말 반복 = 전형적 환각). 걸러도 조각이 하나도 안 남으면
      //   원문 text 로 폴백(진짜 말인데 지표만 나쁠 수 있어 유실 방지).
      let cleaned = '';
      if (Array.isArray(out.segments) && out.segments.length) {
        const kept = out.segments.filter(function (s) {
          const ns = typeof s.no_speech_prob === 'number' ? s.no_speech_prob : 0;
          const lp = typeof s.avg_logprob === 'number' ? s.avg_logprob : 0;
          const cr = typeof s.compression_ratio === 'number' ? s.compression_ratio : 0;
          if (ns > 0.8 && lp < -0.6) return false;   // 거의 무음인데 불확실 → 버림
          if (lp < -1.0) return false;               // 인식 신뢰도 매우 낮음 → 버림
          if (cr > 2.6) return false;                // 같은 말 반복 = 환각 → 버림
          return true;
        });
        cleaned = kept.map(function (s) { return (s.text || '').trim(); }).filter(Boolean).join(' ').trim();
      }
      const text = cleaned || (out.text || '').trim();
      return json({ text: text }, 200);
    }
    // ────────────────────────────────────────────────────────

    // ── R2 객체 목록 (/__list) — 관리자 스토리지 진단·고아 파일 정리용. 인증 필수 ──
    // 응답: { objects:[{key,size}], truncated, cursor }
    if (url.pathname === '/__list') {
      if (request.method !== 'GET') return json({ error: 'use GET' }, 405);
      const apiKey = request.headers.get('X-API-Key');
      if (!env.APP_API_KEY || apiKey !== env.APP_API_KEY) return json({ error: 'unauthorized' }, 401);
      const cursor = url.searchParams.get('cursor') || undefined;
      const prefix = url.searchParams.get('prefix') || undefined;
      const listed = await env.BUCKET.list({ cursor, prefix, limit: 1000 });
      return json({
        objects: listed.objects.map(function (o) {
          return { key: o.key, size: o.size, uploaded: o.uploaded ? new Date(o.uploaded).getTime() : null };
        }),
        truncated: !!listed.truncated,
        cursor: listed.truncated ? listed.cursor : null,
      }, 200);
    }
    // ────────────────────────────────────────────────────────

    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key) {
      return json({ error: 'missing key' }, 400);
    }

    // Auth check (skip for GET/HEAD to allow <video src> direct playback + 존재확인)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
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

      if (request.method === 'GET' || request.method === 'HEAD') {
        // Range 요청 지원 — <video> 스트리밍/탐색에 필수.
        // 없으면 브라우저가 파일 전체를 받아야 재생돼 매우 느리고,
        // iOS Safari 는 206 응답이 아니면 영상 재생을 거부한다.
        const rangeHeader = request.headers.get('range');

        // ── 엣지 캐시 조회 (속도) ──────────────────────────────
        // Cloudflare Cache API 는 캐시된 전체(200) 응답에서 Range 를 잘라 206 으로 준다.
        // 워밍업된 영상은 R2 원본까지 안 가고 엣지에서 바로 재생 → 대기시간 대폭 감소.
        const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
        const cacheKey = new Request(url.toString(), { method: 'GET' });
        if (cache && request.method === 'GET') {
          try {
            const hit = await cache.match(request);
            // 안전장치: Range 요청인데 캐시가 206 으로 안 잘라주면(전체 200) iOS 재생 실패 우려 →
            // 그 경우엔 캐시를 무시하고 아래 R2 경로로 정상 206 스트리밍한다(재생 회귀 방지).
            if (hit && (!rangeHeader || hit.status === 206)) return hit;
          } catch (e) {}
        }

        let r2range;
        if (rangeHeader) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
          if (m) {
            const start = m[1] === '' ? undefined : parseInt(m[1], 10);
            const end   = m[2] === '' ? undefined : parseInt(m[2], 10);
            if (start !== undefined && end !== undefined) r2range = { offset: start, length: end - start + 1 };
            else if (start !== undefined) r2range = { offset: start };
            else if (end !== undefined) r2range = { suffix: end };
          }
        }
        const obj = r2range
          ? await env.BUCKET.get(key, { range: r2range })
          : await env.BUCKET.get(key);
        if (!obj) return json({ error: 'not found' }, 404);
        const headers = new Headers(CORS);
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('accept-ranges', 'bytes');
        // 공개 캐시 허용 — GET 은 이미 URL 만 알면 열리는 공개 경로라 노출 범위 변화 없음,
        // 대신 브라우저·엣지가 캐시해 반복/워밍업 재생이 빨라진다. 키별 콘텐츠는 불변(immutable).
        headers.set('cache-control', 'public, max-age=31536000, immutable');
        const total = obj.size;                       // 항상 전체 파일 크기
        const body = request.method === 'HEAD' ? null : obj.body;

        // 미스 시 백그라운드로 "전체 객체" 를 엣지에 적재 → 다음 요청부터 캐시 히트.
        // (지금 응답은 아래에서 Range 그대로 스트리밍하므로 사용자 대기엔 영향 없음)
        if (cache && request.method === 'GET' && ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil((async () => {
            try {
              const already = await cache.match(cacheKey);
              if (already) return;
              const full = await env.BUCKET.get(key);
              if (!full) return;
              const fh = new Headers(CORS);
              full.writeHttpMetadata(fh);
              fh.set('etag', full.httpEtag);
              fh.set('accept-ranges', 'bytes');
              fh.set('cache-control', 'public, max-age=31536000, immutable');
              fh.set('content-length', String(full.size));
              await cache.put(cacheKey, new Response(full.body, { status: 200, headers: fh }));
            } catch (e) {}
          })());
        }

        if (rangeHeader && obj.range) {
          let off, len;
          if (obj.range.suffix != null) { len = obj.range.suffix; off = total - len; }
          else { off = obj.range.offset || 0; len = (obj.range.length != null) ? obj.range.length : (total - off); }
          headers.set('content-range', 'bytes ' + off + '-' + (off + len - 1) + '/' + total);
          headers.set('content-length', String(len));
          return new Response(body, { status: 206, headers });
        }
        headers.set('content-length', String(total));
        return new Response(body, { status: 200, headers });
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
