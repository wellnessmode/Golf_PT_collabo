// ============================================================
//  Claude 프록시 — R2 워커에 추가하는 /claude 엔드포인트
// ------------------------------------------------------------
//  목적: Anthropic API 키를 브라우저/깃에 노출하지 않고
//        Cloudflare 워커 시크릿(env.ANTHROPIC_API_KEY)으로만 보관.
//  앱 → {R2_WORKER_URL}/claude (X-API-Key: 기존 R2 키)
//       → 워커가 Anthropic 키 주입해서 api.anthropic.com 으로 전달
// ============================================================
//
//  [붙이는 법]
//  기존 R2 워커가 module worker(`export default { async fetch(request, env) {...} }`)
//  형태라면, fetch 핸들러 "맨 위"에 아래 A) 블록을 그대로 붙여넣으세요.
//  그리고 파일 어딘가에 B) corsHeaders 헬퍼가 없으면 추가하세요.
//  (이미 CORS 처리가 있으면 기존 것을 써도 됩니다.)
//
//  ※ env.R2_API_KEY 는 기존 R2 인증에 쓰는 변수명으로 바꿔주세요.
//    (워커에서 X-API-Key 를 검증할 때 쓰는 그 변수)
//
// ------------------------------------------------------------

// A) ── fetch(request, env) 핸들러 맨 위에 추가 ───────────────
//
//   const url = new URL(request.url);
//
//   if (url.pathname === '/claude') {
//     // CORS preflight
//     if (request.method === 'OPTIONS') {
//       return new Response(null, { headers: corsHeaders() });
//     }
//     if (request.method !== 'POST') {
//       return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
//     }
//     // 인증: 기존 R2와 동일한 X-API-Key 재사용 (외부 무단 사용 차단)
//     if (request.headers.get('X-API-Key') !== env.R2_API_KEY) {
//       return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
//     }
//     if (!env.ANTHROPIC_API_KEY) {
//       return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set' }),
//         { status: 500, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
//     }
//     // 앱이 보낸 Anthropic messages payload 를 그대로 전달 + 키 주입
//     const body = await request.text();
//     const upstream = await fetch('https://api.anthropic.com/v1/messages', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-api-key': env.ANTHROPIC_API_KEY,
//         'anthropic-version': '2023-06-01'
//       },
//       body
//     });
//     const text = await upstream.text();
//     return new Response(text, {
//       status: upstream.status,
//       headers: corsHeaders({ 'Content-Type': 'application/json' })
//     });
//   }
//
// ─────────────────────────────────────────────────────────────

// B) ── CORS 헬퍼 (없으면 추가) ───────────────────────────────
function corsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
  }, extra || {});
}

// ============================================================
//  [전체 예시] 워커가 통째로 필요하면 아래를 worker.js로 사용
//  (R2 부분은 기존 로직으로 교체하세요 — 여기선 /claude만 핵심)
// ============================================================
//
// export default {
//   async fetch(request, env) {
//     const url = new URL(request.url);
//
//     // ── Claude 프록시 ──
//     if (url.pathname === '/claude') {
//       if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
//       if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
//       if (request.headers.get('X-API-Key') !== env.R2_API_KEY)
//         return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
//       if (!env.ANTHROPIC_API_KEY)
//         return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set' }),
//           { status: 500, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
//       const body = await request.text();
//       const upstream = await fetch('https://api.anthropic.com/v1/messages', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
//         body
//       });
//       return new Response(await upstream.text(), { status: upstream.status, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
//     }
//
//     // ── 기존 R2 업로드/다운로드/삭제 로직은 여기에 그대로 ──
//     // if (request.method === 'PUT')   { ... }
//     // if (request.method === 'GET')   { ... }
//     // if (request.method === 'DELETE'){ ... }
//
//     return new Response('Not Found', { status: 404, headers: corsHeaders() });
//   }
// };
