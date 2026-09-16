// ============================================================
//  Golf PT — AI 전용 워커 (Claude 프록시만 담당)  · 이름: golf-pt-ai
// ------------------------------------------------------------
//  왜 따로 두나:
//   기존 R2 워커(/claude)는 사용자와 가장 가까운 Cloudflare 엣지에서 실행된다.
//   일부 통신사 경로에서는 그 엣지가 홍콩 등 Anthropic 미지원 지역이 되어
//   api.anthropic.com 이 403 "Request not allowed" 를 돌려준다
//   (2026-09-15 정우진 프로 기기에서 하루 종일 재현).
//   이 워커는 Anthropic 만 호출하므로 **스마트 배치(Smart Placement)** 를 켜면
//   Cloudflare 가 실행 위치를 Anthropic 쪽(미국)으로 옮겨 지역 차단이 사라진다.
//   R2 워커에 스마트 배치를 켜면 영상 재생까지 미국을 거쳐 느려지므로 분리한다.
//
//  라우트:  POST /claude  → api.anthropic.com/v1/messages (키 주입)
//  인증:    X-API-Key == env.APP_API_KEY  (앱의 R2_API_KEY 와 같은 값이면 됨)
//  시크릿:  APP_API_KEY, ANTHROPIC_API_KEY
//
//  배포 절차는 worker/AI-워커-분리-배포.md 참고.
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400',
};
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'content-type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    // 상태 확인 — 브라우저로 열어 배포·위치 확인 (colo = 이 요청을 처리한 엣지 코드)
    if (url.pathname === '/' || url.pathname === '/health') {
      const colo = (request.cf && request.cf.colo) || '?';
      return json({ ok: true, worker: 'golf-pt-ai', colo, anthropicKey: !!env.ANTHROPIC_API_KEY, appKey: !!env.APP_API_KEY });
    }

    if (url.pathname !== '/claude') return json({ error: 'not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
    if (!env.APP_API_KEY || request.headers.get('X-API-Key') !== env.APP_API_KEY) return json({ error: 'unauthorized' }, 401);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY secret not set' }, 500);

    const body = await request.text();
    const call = () => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body,
    });
    let upstream = await call();
    // 일시 오류(과부하·게이트웨이)는 한 번 더 — 지역 차단(403)은 재시도해도 같으므로 그대로 전달
    if (upstream.status === 529 || upstream.status === 502 || upstream.status === 503) {
      await new Promise(r => setTimeout(r, 1500));
      upstream = await call();
    }
    const text = await upstream.text();
    const colo = (request.cf && request.cf.colo) || '?';
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, 'content-type': 'application/json', 'x-golfpt-colo': colo },
    });
  },
};
