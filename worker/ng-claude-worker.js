// ============================================================
//  ng-claude — Claude 프록시 워커 (Cloudflare Workers)
// ------------------------------------------------------------
//  이 파일 "전체"를 Cloudflare 워커 편집기에 통째로 붙여넣으세요.
//  (기존 코드 전부 지우고 이거로 교체)
//
//  배포 후 Settings → Variables and Secrets 에 시크릿 등록:
//    ANTHROPIC_API_KEY = sk-ant-...        (필수)
//    PROXY_KEY         = 임의의 비밀문구    (선택, 보안 게이트)
//
//  앱은 {AI_WORKER_URL}/claude 로 POST 합니다. 이 워커는 어떤 POST든 받아
//  Anthropic으로 그대로 전달하고, 키는 서버(env)에만 둡니다.
// ============================================================
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    // 헬스체크(GET)
    if (request.method !== 'POST') {
      return new Response('ng-claude proxy OK', { status: 200, headers: CORS });
    }
    // (선택) 게이트 키 검증 — PROXY_KEY 시크릿이 있으면만 적용
    if (env.PROXY_KEY && request.headers.get('X-API-Key') !== env.PROXY_KEY) {
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
        'anthropic-version': '2023-06-01'
      },
      body
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
