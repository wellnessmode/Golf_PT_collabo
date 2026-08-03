// 고객 리포트 전용 도메인 프록시 — report.nationalgym.kr
// ---------------------------------------------------------------
// 언제 쓰나?
//   nationalgym.kr 도메인이 "리포트 워커(golf-pt-storage)와 다른 Cloudflare 계정"에
//   들어 있을 때. Cloudflare 는 워커에 커스텀 도메인을 붙일 때 워커와 도메인이 같은
//   계정에 있어야 하는데, 도메인을 옮기려면 네임서버를 바꿔야 하고 그러면 홈페이지와
//   회사 메일(구글 워크스페이스)까지 위험해진다.
//   → 도메인은 그대로 두고, 도메인이 있는 계정에 이 얇은 프록시 워커만 하나 올린다.
//     DNS 변경 0건, 홈페이지·메일 영향 0.
//
// 설치 (도메인이 있는 Cloudflare 계정에서):
//   1. Workers & Pages → Create → Worker → 이름 report-proxy → Deploy
//   2. Edit code → 이 파일 전체 붙여넣기 → Deploy
//   3. Settings → Domains & Routes → Add → Custom domain → report.nationalgym.kr
//
// 보안: GET/HEAD 만 통과시키고 관리자 경로(/claude /stt /db /__list)는 막는다.
//       업로드·삭제는 애초에 GET 이 아니라서 이 주소로는 불가능하다.

const ORIGIN = 'https://golf-pt-storage.ceo-fc9.workers.dev';
const HOMEPAGE = 'https://nationalgym.kr';
const BLOCKED = { '/claude': 1, '/stt': 1, '/db': 1, '/__list': 1 };

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 읽기(재생·조회)만 허용 — 업로드/삭제/관리 요청은 이 도메인으로 들어올 수 없다
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return notFound();
    }
    if (BLOCKED[url.pathname]) return notFound();

    // 루트로 들어오면 스튜디오 홈페이지로 안내
    if (url.pathname === '/' || url.pathname === '') {
      return Response.redirect(HOMEPAGE, 302);
    }

    // 그대로 전달 — Range 헤더까지 보존해야 영상 탐색(시크)이 동작한다
    return fetch(new Request(ORIGIN + url.pathname + url.search, request));
  },
};

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
