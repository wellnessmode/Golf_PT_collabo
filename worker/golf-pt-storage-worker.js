// =====================================================================================
// Golf PT Collaboration — R2 Storage Proxy Worker  v2  (+ Claude 프록시 + STT + 고객 리포트)
// =====================================================================================
// Routes:
//   OPTIONS *        → CORS preflight
//   PUT    /{key}    → R2 업로드 (저장 경로·파일 형식 허용 목록 검사)
//   GET    /{key}    → R2 다운로드 (Range·엣지 캐시) · HEAD = 존재 확인
//   DELETE /{key}    → R2 삭제 + 엣지 캐시 사본도 삭제
//   POST   /claude   → Anthropic(Claude) 프록시 (모델 허용 목록·출력 ≤4096 토큰·본문 ≤256KB·하루 상한)
//   POST   /stt      → 음성(오디오 바이너리) → 텍스트 (Groq Whisper, 한국어, 하루 상한)
//   GET    /__list   → R2 객체 목록 (관리자 스토리지 진단)
//   POST   /db       → DB 쓰기 프록시 — 기본 꺼짐(410). DB_PROXY_ENABLED=1 일 때만, 직원 토큰 필수
//   GET    /r/{id}   → 고객용 성과 리포트 페이지 (서버에서 데이터 주입 — 페이지에 키 0개)
//
// ── 인증 (요청 헤더) ──────────────────────────────────────────────────────────────
//   X-API-Key     공용 열쇠(legacy) = env.APP_API_KEY. LEGACY_KEY_OFF=1 이면 무시.
//   X-Staff-Token 직원/타석PC 토큰 "gpt1.<payload>.<서명>" (worker/S1 스펙). 서명 비밀값은
//                 Supabase RPC gpt_worker_secret(서비스 키, 10분 캐시), 폐기 목록은
//                 gpt_worker_revocations(5분 캐시). RPC 가 없거나 실패하면 토큰 인증만 꺼지고
//                 공용 열쇠는 그대로 동작한다(그래서 SQL 실행 전에 v2 를 배포해도 안전).
//   X-Admin-Key   관리자 열쇠 = env.ADMIN_KEY (/__list 전용).
//   역할: staff 토큰 = r 이 admin·infodesk·staff, agent 토큰 = r 이 agent(+ b = 타석 id).
//
//   경로                    | 허용
//   ------------------------+-----------------------------------------------------------
//   PUT /{key}              | 공용 열쇠 | staff 토큰 | agent 토큰(자기 '<bay>/'·'orig/<bay>/'·'hb/<bay>.json' 만)
//   DELETE /{key}           | 공용 열쇠 | staff 토큰  (agent 토큰은 삭제 불가 — 에이전트는 지우지 않음)
//   POST /claude · /stt     | 공용 열쇠 | staff 토큰
//   GET /__list             | X-Admin-Key | admin 토큰 | (ADMIN_KEY 미설정일 때만) 공용 열쇠
//   POST /db                | DB_PROXY_ENABLED=1 일 때 staff 토큰만 (아니면 410). 예외: 옛 타석 PC(아래)
//   GET·HEAD rec/*          | REC_REQUIRE_AUTH=1 이면 공용 열쇠 | staff 토큰, 아니면 공개
//   GET·HEAD 그 외 객체     | 공개 (<video src> 직접 재생)
//   GET /r/{id}             | 공개 (리포트 id 가 곧 비밀)
//   토큰을 냈는데 확인 서버(Supabase)가 잠시 응답하지 않으면 401 대신 503 + Retry-After(다시 시도하라는 뜻).
//
// ── 설정값 (Cloudflare → Workers & Pages → golf-pt-storage → Settings → Variables and Secrets) ──
//   모두 선택 사항입니다. 새 값을 하나도 안 넣어도, 이 파일 배포만으로 지금 앱·타석 PC 는 그대로 동작합니다.
//   APP_API_KEY          (기존 Secret) 공용 열쇠
//   ADMIN_KEY            (새 Secret, 선택) 관리자 열쇠. 넣는 순간부터 /__list(스토리지 진단)는
//                        이 열쇠나 관리자 토큰으로만 열립니다(공용 열쇠로는 안 열림)
//   LEGACY_KEY_OFF       값 1 → 공용 열쇠 사용 중지 (S1c: DB 잠금 SQL 을 실행하고 며칠 뒤 — 아래 순서)
//   REC_REQUIRE_AUTH     값 1 → 녹음·전사 백업(rec/) 읽기에 열쇠·직원 토큰 필요 (S1c, LEGACY_KEY_OFF 와 함께)
//                        ⚠️ 지금 앱(js/app_live.js 녹음 복구)은 rec/ 를 열쇠 없이 읽습니다 — 녹음 복구에 토큰을 보내는
//                        새 앱이 모든 기기에 깔리기 전에 넣으면, 끊긴 수업의 녹음 원문 복구가 조용히 꺼집니다.
//   DB_PROXY_ENABLED     값 1 → /db 켜기 (직원 토큰 필수). 기본은 꺼짐
//   AI_DAILY_CAP         /claude 하루 최대 횟수 (기본 300. 0 = AI 정리 잠시 끄기)
//   STT_DAILY_CAP        /stt 하루 최대 횟수 (기본 4000. 0 = 음성 변환 잠시 끄기)
//   AI_MODELS            허용 모델, 쉼표로 구분 (기본 claude-haiku-4-5)
//   SUPABASE_URL · SUPABASE_SERVICE_KEY   (기존) 리포트(/r/) 조회 + 토큰 검증 RPC
//   ANTHROPIC_API_KEY    (기존 Secret, sk-ant-... — AI 세션카드 정리용)
//   GROQ_API_KEY         (기존 Secret, gsk_...   — 수업 녹음 → 글 변환용)
//   REPORT_TEMPLATE_URL  (선택) 리포트 템플릿 주소
//   BUCKET               (기존) R2 버킷 바인딩
//   ※ 하루 상한은 한국시간 날짜 기준이며, R2 의 '__meta/ai/<날짜>'·'__meta/stt/<날짜>' 에 횟수를 적습니다.
//     Anthropic·Groq 를 부르기 전에 횟수를 '조건부 쓰기'(그사이 다른 요청이 썼으면 다시 읽고 재시도)로 먼저 올리므로
//     동시에 몰려도 상한을 넘지 않습니다. 횟수를 읽거나 쓰지 못하면(4초 재시도 후) 그 요청은 503 {error:'cap-busy'}
//     로 거절(비용 보호 우선 — 앱 녹음 변환은 1번 다시 시도하고, 그래도 안 되면 녹음 원본을 보관).
//     이 경로는 API 로 읽기·쓰기·삭제 불가.
//
// ── 배포·단계 순서 (대표용) ───────────────────────────────────────────────────────
//   S0  이 파일 붙여넣기 → Deploy. 새 설정값은 넣지 않습니다. 배포 직후 수업 1번 동안 Logs 에서 "st":4xx·5xx 가
//       늘지 않는지 확인. 문제가 있으면 예전 코드(git 의 이전 버전)를 다시 붙여넣으면 바로 되돌아갑니다.
//       · 타석 PC: C:\golfpt-sync\config.json 에 "useDbProxy": true 가 있으면 그 PC 는 /db 로 샷을 저장합니다.
//         v2 는 그 2가지 샷 저장 모양만 DB 잠금 전까지 그대로 받아 줍니다(로그에 "e":"db-legacy").
//         이 줄이 보이면 그 PC 의 useDbProxy 를 false 로 바꾸세요(에이전트 재시작). DB 를 잠그면 이 길은 닫힙니다.
//   S1c DB 잠금 SQL(worker/supabase_lock.sql) 먼저 → 며칠 동안 Logs 에 "auth":"legacy" 줄이 없고 "tk":"ok" 줄이
//       있는지 확인 → LEGACY_KEY_OFF=1, REC_REQUIRE_AUTH=1 을 넣고 Deploy. 되돌릴 때는 이 두 값을 지우고 Deploy.
//
// ── 클라이언트 전수 목록 (2026-11-19 코드 기준 — 허용 목록은 아래 전부를 통과해야 함) ──────────
//  [앱 js/]
//   app_core.js:851-873  r2 객체 — url(key)=R2_WORKER_URL+'/'+encodeURIComponent(key)
//       upload  PUT  X-API-Key, Content-Type = blob.type || 'application/octet-stream' (3회 재시도, 4xx 는 429 외 중단)
//       download GET · head HEAD · remove DELETE(X-API-Key) · list GET /__list?cursor= (X-API-Key)
//   app_core.js:876-884  r2RemoveShotVideos → DELETE videoR2Key·videoMp4R2Key·videoFO·videoDL·videoClub·orig.*
//   app_core.js:1311-1346 syncLocalMediaToR2 → HEAD 후 PUT  m_<ms>_<rand>
//   app_core.js:633,641  cloud._w → POST /db  (config DB_PROXY_URL 이 있을 때만 — 현재 config.js 에 없음 = 미사용)
//   app_ai.js:355,378 · 419,431 · 458  PUT m_<Date.now()>_<base36 0~6자>  (회원 일지 첨부: image/*·video/*·
//                        빈 형식이면 application/octet-stream. 실제 값: video/quicktime, video/webm;codecs=vp9 …)
//   app_ai.js:469,535 · app_handlers.js:617  DELETE m_ 키
//   app_handlers.js:783  GET /__list (관리자 스토리지 진단) · :850 DELETE 목록에서 고른 *_scene 키
//   app_live.js:264,281  GET (Range: bytes=0-1) 영상 예열 · :349,392 <video crossorigin> GET
//   app_live.js:631      DELETE orig.* 키 · :1895 원본 다운로드 GET
//   app_live.js:1260-1281 PUT rec/tx_<bay>_<startedAt ms>.txt (text/plain, 8초마다·종료 시 덮어쓰기)
//                        + 같은 키 GET (복구, 인증 헤더 없음)
//   app_live.js:1312     PUT rec/<bay>_<Date.now()>_<segIdx>.(m4a|webm)  STT 실패 조각 원본
//                        (blob.type = audio/mp4 | audio/webm;codecs=opus | audio/webm | ''→octet-stream;
//                         bay 가 비면 'null'/'undefined' 가 들어갈 수 있음)
//   app_live.js:1425     POST /stt (X-API-Key, Content-Type blob.type||octet-stream, 35초 제한, 401·404·501 외 1회 재시도)
//   app_live.js:1447     POST /stt 빈 본문 = 준비 확인 (400 'empty audio' = 준비됨)
//   app_live.js:1489-1566 aiSummarizeWithClaude → POST /claude  (AI_WORKER_URL 먼저, 실패 시 R2_WORKER_URL)
//                        본문 {model: ANTHROPIC_MODEL||'claude-haiku-4-5', max_tokens 1100|1800|2600,
//                              system: 문자열, messages:[{role:'user', content: 문자열}]}  (텍스트만, 수십 KB)
//   app_live.js:1769-1777 testAiConnection(관리자 'AI 연결 테스트') → 같은 함수로 짧은 샘플 1회
//   app_dashboard.js:376  HEAD {REPORT_BASE}/r/__ping (응답만 오면 살아있음) · :396,684,720 링크 …/r/<id>
//   app_dashboard.js:767,798,859-860,930,1304,1386 · app_render.js:397  영상·사진 GET
//  [report.html] :228-230,354,632-646  GET /{key} (리포트 영상·다운로드; /r/ 페이지에선 같은 주소 상대경로)
//  [index.html] 직접 호출 없음 · [sw.js:79] workers.dev 요청은 서비스워커가 건드리지 않음
//  [타석 PC agent/agent.js — v10(3번룸 운영)·v11 동일 경로, 커밋 d2bef52→867f0b1 차이 없음]
//   :627-640 uploadVideo → PUT (X-API-Key, Content-Type, Content-Length, 180초)
//      :859,885     <bay>/<shotId>{_scene|_fo|_club}.mp4                 video/mp4
//      :891-894     <bay>/<shotId>{_scene|_fo|_club}.{mov|mkv|mp4} (변환 실패 원본)  video/quicktime|video/x-matroska|video/mp4
//                   shotId = 'tm_<bay>_<epoch초>'(:57) 또는 'tm_<measurementId GUID>'(:721,:735)
//      :957-972     <bay>/<measurementId|shotId>_scene.mp4 | _scene.mkv   video/mp4 | video/x-matroska
//      :316,334     orig/<bay>/<shotId>_{dl|fo|club|scene}.{mov|mkv|mp4}  (원본 요청)
//   :642-655 deleteVideo → DELETE (정의만 있고 호출 없음 → v2 는 agent 토큰 DELETE 를 받지 않음)
//   :163-169,233-240,256-261 POST /db (config useDbProxy=true 일 때만 — 샘플 설정은 false)
//                        {op:'upsert',table:'shot_events',rows:[샷 1개]} · {op:'update',table:'shot_events',
//                         values:{video_r2_key?,data},filters:[{col:'id',op:'eq',val:샷id}]}  ← v2 가 DB 잠금 전까지 받는 모양
//   (예정 v12) PUT hb/<bay>.json  application/json (하트비트) · X-Staff-Token(타석 PC 토큰)
//  [agent/*.ps1·*.bat·*.vbs] 이 워커 호출 없음 (gpt-admin.ps1 은 푸시 워커 /push/notify)
//  [worker/report-proxy-worker.js] report.nationalgym.kr → 이 워커로 GET/HEAD 전달(Range 포함),
//                        /claude /stt /db /__list 는 차단, '/' 는 홈페이지로
//  [R2 실제 키 모양 — 2026-11-19 스냅샷 17,531개, 전부 아래 규칙에 맞음]
//      bayN/tm_bayN_<초>_{club,fo,scene}.mp4 16,035 · bayN/tm_bayN_<초>_{fo,scene}.mov 15 · …_club.mkv 1
//      bayN/<GUID>_scene.mp4 374 · bayN/<GUID>_scene.mkv 2 · bayN/tm_<GUID>_{club,fo,scene}.mp4 804
//      rec/tx_bayN_<ms>.txt 237 · rec/bayN_<ms>_<seg>.m4a 33 · rec/bayN_<ms>.m4a(옛 앱) 2 · m_<ms>_<6자> 28
//  ⇒ PUT 허용 키 (KEY_RULES):
//      <bay>/<id>_{scene|fo|club}.{mp4|mov|mkv}            video/* | application/octet-stream
//      orig/<bay>/<id>_{dl|fo|club|scene}.{mp4|mov|mkv}    video/* | application/octet-stream
//      m_<숫자10~16>_<영숫자 0~12>                           image/*(SVG 제외)·video/*·audio/*·application/octet-stream
//      rec/tx_<bay>_<숫자>.txt                               text/plain
//      rec/<bay|null|undefined>_<숫자>[_<숫자>].{m4a|webm}   audio/*·video/webm·video/mp4·application/octet-stream
//      hb/<bay>.json                                        application/json
//      (<bay> = 'bay'+영숫자·_·- 1~29자, <id> = 영숫자로 시작하는 영숫자·_·- 1~128자. 그 밖의 경로·'..'·
//       text/html·SVG·XML·JavaScript 형식은 거부. DELETE 는 '__meta/'·이상한 문자만 거부)
// =====================================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-STT-Prompt, X-Staff-Token, X-Admin-Key, Range',
  'Access-Control-Max-Age': '86400',
};
const NOSNIFF = { 'X-Content-Type-Options': 'nosniff' };

const AI_BODY_MAX = 256 * 1024;          // /claude 요청 본문 상한
const AI_MAX_TOKENS = 4096;              // /claude 출력 토큰 상한(넘으면 깎음)
const STT_BODY_MAX = 24 * 1024 * 1024;   // /stt 오디오 상한 (기존과 동일)
const DB_BODY_MAX = 4 * 1024 * 1024;     // /db 요청 본문 상한
const TOKEN_MAX_LEN = 2048;
const TOKEN_ROLES = ['admin', 'infodesk', 'staff', 'agent'];
const STAFF_ROLES = ['admin', 'infodesk', 'staff'];
const SECRET_TTL_MS = 10 * 60 * 1000;    // 토큰 서명 비밀값 캐시
const REV_TTL_MS = 5 * 60 * 1000;        // 폐기 목록 캐시
const MODE_TTL_MS = 60 * 1000;           // DB 잠금 상태(gpt_whoami mode) 캐시 — 옛 타석 PC /db 호환 길에만 사용
const RPC_RETRY_MS = 60 * 1000;          // RPC 실패 뒤 다시 묻기까지 (직전 값으로 버티는 동안)
const RPC_RETRY_EMPTY_MS = 5 * 1000;     // 가진 값이 없을 때(토큰 확인 불가)는 5초 뒤 다시 물음 — 잠깐 끊김이 1분씩 가지 않게
const RPC_STALE_MAX_MS = 60 * 60 * 1000; // RPC 가 잠깐 실패하면 직전 값(최대 1시간 묵은 것)을 계속 사용
const RPC_TIMEOUT_MS = 5000;
const CAP_TRY_MS = 4000;                 // 하루 상한 카운터 경합·R2 쓰기 제한(같은 키 초당 1회)을 기다리는 최대 시간

const BAY_SRC = 'bay[A-Za-z0-9_-]{1,29}';
const ID_SRC = '[A-Za-z0-9][A-Za-z0-9_-]{0,127}';
const BAY_RE = new RegExp('^' + BAY_SRC + '$');

const ctVideo = function (e) { return e.indexOf('video/') === 0 || e === 'application/octet-stream'; };
const ctMedia = function (e) { return /^(image|video|audio)\//.test(e) || e === 'application/octet-stream'; };
const ctText = function (e) { return e === 'text/plain'; };
const ctAudio = function (e) { return e.indexOf('audio/') === 0 || e === 'video/webm' || e === 'video/mp4' || e === 'application/octet-stream'; };
const ctJson = function (e) { return e === 'application/json'; };

// PUT 허용 키 — 위 "클라이언트 전수 목록" 의 모든 키 모양. warm = 업로드 직후 엣지 캐시 예열 대상
const KEY_RULES = [
  { id: 'shot', re: new RegExp('^' + BAY_SRC + '/' + ID_SRC + '_(?:scene|fo|club)\\.(?:mp4|mov|mkv)$'), ct: ctVideo, warm: true },
  { id: 'orig', re: new RegExp('^orig/' + BAY_SRC + '/' + ID_SRC + '_(?:dl|fo|club|scene)\\.(?:mp4|mov|mkv)$'), ct: ctVideo, warm: true },
  { id: 'media', re: /^m_\d{10,16}_[0-9a-z]{0,12}$/, ct: ctMedia, warm: true },
  { id: 'rec-tx', re: new RegExp('^rec/tx_' + BAY_SRC + '_\\d{1,16}\\.txt$'), ct: ctText, warm: false },
  { id: 'rec-audio', re: new RegExp('^rec/(?:' + BAY_SRC + '|null|undefined)_\\d{1,16}(?:_\\d{1,6})?\\.(?:m4a|webm)$'), ct: ctAudio, warm: false },
  { id: 'hb', re: new RegExp('^hb/' + BAY_SRC + '\\.json$'), ct: ctJson, warm: false },
];

export default {
  async fetch(request, env, ctx) {
    const t0 = Date.now();
    // L = 이 요청의 구조화 로그 (키·토큰·열쇠 값은 절대 넣지 않음)
    const L = { route: 'object', auth: 'none', u: '', k: '', e: '', tk: '', force: false, _auth: null };
    let res;
    try {
      res = await handle(request, env || {}, ctx, L);
    } catch (e) {
      if (!L.e) L.e = 'exception';
      res = json({ error: String((e && e.message) || e) }, 500);
    }
    if (request.method !== 'GET' || L.force) {
      try { logLine(request, L, res.status, Date.now() - t0); } catch (_) {}
    }
    return res;
  },
};

async function handle(request, env, ctx, L) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    L.route = 'options';
    return new Response(null, { headers: CORS });
  }
  const url = new URL(request.url);
  const p = url.pathname;
  if (p === '/claude') { L.route = 'claude'; return handleClaude(request, env, ctx, L); }
  if (p === '/db') { L.route = 'db'; return handleDb(request, env, L); }
  if (p === '/stt') { L.route = 'stt'; return handleStt(request, env, ctx, L); }
  if (p === '/__list') { L.route = '__list'; L.force = true; return handleList(request, env, url, L); }
  if (p.startsWith('/r/')) { L.route = 'report'; return handleReport(request, env, url); }
  L.route = 'object';
  return handleObject(request, env, ctx, url, L);
}

// ── Claude 프록시 (/claude) ─────────────────────────────────────────────
// 정상 사용처는 앱의 aiSummarizeWithClaude(텍스트 정리)뿐 → 그 모양만 통과시킨다.
async function handleClaude(request, env, ctx, L) {
  if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
  const A = await authFor(request, env, L);
  const how = (A.tok && isStaff(A.tok)) ? 'token' : (A.legacy ? 'legacy' : '');
  if (!how) return authFail(L);
  setAuth(L, A, how);
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY secret not set' }, 500);
  }
  const raw = await readBodyLimited(request, AI_BODY_MAX);
  if (raw === null) { L.e = 'too-large'; return json({ error: 'body too large (256KB max)' }, 413); }
  let b;
  try { b = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { return json({ error: 'bad json' }, 400); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'bad json' }, 400);
  const models = allowedModels(env);
  if (typeof b.model !== 'string' || models.indexOf(b.model) === -1) {
    L.e = 'model';
    return json({ error: 'model not allowed', detail: '허용 모델: ' + models.join(', ') }, 400);
  }
  if (!validMessages(b.messages) || (b.system != null && !textOnly(b.system))) {
    L.e = 'content';
    return json({ error: 'unsupported content', detail: '텍스트 메시지만 보낼 수 있습니다' }, 400);
  }
  // 허용 필드만 다시 조립 (tools·thinking·stream·문서/이미지 URL 등은 버림)
  const out = {
    model: b.model,
    max_tokens: clampMaxTokens(b.max_tokens),
    messages: b.messages.map(function (m) { return { role: m.role, content: m.content }; }),
  };
  if (b.system != null) out.system = b.system;
  if (typeof b.temperature === 'number' && b.temperature >= 0 && b.temperature <= 1) out.temperature = b.temperature;
  if (Array.isArray(b.stop_sequences) && b.stop_sequences.length <= 8 && b.stop_sequences.every(function (s) { return typeof s === 'string' && s.length <= 200; })) out.stop_sequences = b.stop_sequences;
  const cap = capOf(env.AI_DAILY_CAP, 300);
  const c = await takeDaily(env, ctx, 'ai', cap);
  if (!c.ok && c.busy) return capBusy(L);
  if (!c.ok) {
    L.e = 'daily-cap';
    return json({ error: 'daily-cap', detail: '오늘 AI 정리 한도(' + cap + '회)를 다 썼습니다. 한국시간 자정에 자동으로 풀립니다.' }, 429, { 'Retry-After': String(secondsToKstMidnight()) });
  }
  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(out),
    });
  } catch (e) {
    L.e = 'upstream';
    return json({ error: 'anthropic fetch failed' }, 502);
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...CORS, ...NOSNIFF, 'content-type': 'application/json' },
  });
}

function allowedModels(env) {
  const list = String(env.AI_MODELS == null ? '' : env.AI_MODELS).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return list.length ? list : ['claude-haiku-4-5'];
}
function clampMaxTokens(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return AI_MAX_TOKENS;
  return Math.max(1, Math.min(n, AI_MAX_TOKENS));
}
function textOnly(c) {
  if (typeof c === 'string') return true;
  if (!Array.isArray(c) || !c.length) return false;
  return c.every(function (blk) {
    return blk && typeof blk === 'object' && !Array.isArray(blk) && blk.type === 'text' && typeof blk.text === 'string'
      && Object.keys(blk).every(function (k) { return k === 'type' || k === 'text' || k === 'cache_control'; });
  });
}
function validMessages(ms) {
  return Array.isArray(ms) && ms.length > 0 && ms.length <= 100 && ms.every(function (m) {
    return m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && textOnly(m.content);
  });
}
// ────────────────────────────────────────────────────────

// ── DB 쓰기 프록시 (/db) — Supabase 서비스 키로 실행(RLS 우회) ─────────
// v2: 기본 꺼짐(410). DB_PROXY_ENABLED=1 일 때만, 직원 토큰 필수, 'neq' 금지,
//     update/delete 는 eq 또는 in 조건이 반드시 있어야 함(표 전체 수정·삭제 차단).
//     예외(옛 타석 PC 호환 — 배포만으로 샷 저장이 멈추지 않게): config.json 이 useDbProxy=true 인 에이전트 v10/v11 의
//     샷 저장 2가지 모양(shot_events 1행 upsert · id 1개로 data/video_r2_key 수정)만, 공용 열쇠로, DB 가 잠기기 전
//     (gpt_whoami 의 mode 가 locked 아님)까지만 통과 → 그 PC 가 anon 키로 직접 쓸 수 있던 것과 같은 범위. 로그 e:'db-legacy'.
// body: { op:'upsert'|'delete'|'update', table, rows?, values?, filters?:[{col,op,val}] }
async function handleDb(request, env, L) {
  const enabled = flag(env, 'DB_PROXY_ENABLED');
  // 옛 타석 PC 호환 길 (DB_PROXY_ENABLED 와 상관없이): 직원 토큰 없이 공용 열쇠로 온 요청만 확인
  if (request.method === 'POST' && request.headers.get('X-API-Key')) {
    const A0 = await authFor(request, env, L);
    if (A0.legacy && !(A0.tok && isStaff(A0.tok))) {
      const lr = await legacyAgentDb(request, env, L, A0);
      if (lr) return lr;
      if (enabled) return authFail(L);                 // 켜진 /db 는 직원 토큰 필수 (본문은 이미 읽었음)
    }
  }
  if (!enabled) {
    if (!L.e) L.e = 'db-disabled';
    return json({ error: 'db-proxy-disabled', detail: 'DB 프록시가 꺼져 있습니다 (DB_PROXY_ENABLED=1 일 때만 동작)' }, 410);
  }
  if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
  const A = await authFor(request, env, L);
  if (!(A.tok && isStaff(A.tok))) return authFail(L);
  setAuth(L, A, 'token');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'db-proxy-not-configured' }, 501);
  const raw = await readBodyLimited(request, DB_BODY_MAX);
  if (raw === null) return json({ error: 'body too large' }, 413);
  let b;
  try { b = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { return json({ error: 'bad json' }, 400); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'bad json' }, 400);
  const ALLOWED = { members: 1, assessments: 1, sessions: 1, shot_events: 1, active_sessions: 1, bays: 1, reports: 1 };
  if (!ALLOWED[b.table]) return json({ error: 'table not allowed' }, 403);
  const OPS = { eq: 'eq', in: 'in', lt: 'lt', gt: 'gt' };
  const filters = b.filters == null ? [] : b.filters;
  if (!Array.isArray(filters)) return json({ error: 'bad filters' }, 400);
  let narrowing = false;
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    if (!f || typeof f !== 'object' || typeof f.col !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(f.col)) return json({ error: 'bad filter' }, 400);
    const op = f.op == null ? 'eq' : f.op;
    if (op === 'neq') return json({ error: 'neq not allowed' }, 400);
    if (!OPS[op]) return json({ error: 'filter op not allowed' }, 400);
    if (f.val === undefined || f.val === null) return json({ error: 'bad filter' }, 400);
    if (op === 'eq' || op === 'in') narrowing = true;
  }
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + b.table;
  const H = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const stok = request.headers.get('X-Staff-Token');
  if (stok) H['x-staff-token'] = stok;   // DB 감사 기록(gpt_claims)이 작업자를 알 수 있게 그대로 전달
  function qs(fs) {
    if (!fs || !fs.length) return '';
    return '?' + fs.map(function (f) {
      const op = OPS[f.op == null ? 'eq' : f.op];
      if (op === 'in') return encodeURIComponent(f.col) + '=in.(' + (Array.isArray(f.val) ? f.val : [f.val]).map(function (v) { return encodeURIComponent(v); }).join(',') + ')';
      return encodeURIComponent(f.col) + '=' + op + '.' + encodeURIComponent(f.val);
    }).join('&');
  }
  try {
    let up;
    if (b.op === 'upsert') {
      up = await fetch(base, { method: 'POST', headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(b.rows || []) });
    } else if (b.op === 'update') {
      if (!filters.length) return json({ error: 'update requires filters' }, 400);
      if (!narrowing) return json({ error: 'update requires an eq or in filter' }, 400);
      up = await fetch(base + qs(filters), { method: 'PATCH', headers: { ...H, 'Prefer': 'return=minimal' }, body: JSON.stringify(b.values || {}) });
    } else if (b.op === 'delete') {
      if (!filters.length) return json({ error: 'delete requires filters' }, 400);
      if (!narrowing) return json({ error: 'delete requires an eq or in filter' }, 400);
      up = await fetch(base + qs(filters), { method: 'DELETE', headers: { ...H, 'Prefer': 'return=minimal' } });
    } else {
      return json({ error: 'unknown op' }, 400);
    }
    const txt = await up.text();
    if (!up.ok) return json({ error: 'supabase ' + up.status, detail: txt.slice(0, 300) }, 502);
    return json({ ok: true }, 200);
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}

// 옛 타석 PC(에이전트 v10/v11, useDbProxy=true)의 샷 저장 모양인지 — 아니면 null
//   pushShot        {op:'upsert', table:'shot_events', rows:[샷 1개]}  (source 'agent', 정상 타석 이름)
//   attachShotVideo {op:'update', table:'shot_events', values:{video_r2_key, data}, filters:[{col:'id',op:'eq',val}]}
//   patchShotData   {op:'update', table:'shot_events', values:{data}, filters:[{col:'id',op:'eq',val}]}
const AGENT_SHOT_COLS = { id: 1, bay_id: 1, member_id: 1, member_name: 1, author: 1, ts: 1, data: 1, video_r2_key: 1, source: 1 };
const SHOT_ID_RE = new RegExp('^' + ID_SRC + '$');
function agentDbShape(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || b.table !== 'shot_events') return null;
  if (b.op === 'upsert') {
    const rows = b.rows;
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const r = rows[0];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    if (!Object.keys(r).every(function (k) { return AGENT_SHOT_COLS[k] === 1; })) return null;
    if (typeof r.id !== 'string' || !SHOT_ID_RE.test(r.id)) return null;
    if (typeof r.bay_id !== 'string' || !BAY_RE.test(r.bay_id) || r.source !== 'agent') return null;
    return { kind: 'upsert', rows: [r] };
  }
  if (b.op === 'update') {
    const f = b.filters, v = b.values;
    if (!Array.isArray(f) || f.length !== 1 || !f[0] || typeof f[0] !== 'object' || f[0].col !== 'id') return null;
    if (!(f[0].op == null || f[0].op === 'eq') || typeof f[0].val !== 'string' || !SHOT_ID_RE.test(f[0].val)) return null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const ks = Object.keys(v);
    if (!ks.length || !ks.every(function (k) { return k === 'data' || k === 'video_r2_key'; })) return null;
    return { kind: 'update', id: f[0].val, values: v };
  }
  return null;
}
// 공용 열쇠로 온 옛 에이전트 샷 저장 → DB 가 잠기기 전이면 v1 과 똑같이 실행. 해당 없으면 null(→ 410)
async function legacyAgentDb(request, env, L, A) {
  const raw = await readBodyLimited(request, DB_BODY_MAX);
  if (raw === null) return null;
  let b;
  try { b = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { return null; }
  const s = agentDbShape(b);
  if (!s || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;
  const mode = await getDbMode(env);
  if (mode === 'locked') { L.e = 'db-legacy-locked'; return null; }   // 잠근 뒤에는 RLS 를 비켜 가는 길을 열지 않음
  if (mode !== 'open') {
    L.e = 'db-legacy-unavailable';
    return json({ error: 'db-mode-unavailable', detail: 'DB 상태 확인이 잠시 안 됩니다 — 잠시 후 다시 시도' }, 503, { 'Retry-After': '30' });
  }
  setAuth(L, A, 'legacy');
  L.e = 'db-legacy';
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/shot_events';
  const H = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  const stok = request.headers.get('X-Staff-Token');
  if (stok) H['x-staff-token'] = stok;
  try {
    const up = s.kind === 'upsert'
      ? await fetch(base, { method: 'POST', headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(s.rows) })
      : await fetch(base + '?id=eq.' + encodeURIComponent(s.id), { method: 'PATCH', headers: { ...H, 'Prefer': 'return=minimal' }, body: JSON.stringify(s.values) });
    const txt = await up.text();
    if (!up.ok) return json({ error: 'supabase ' + up.status, detail: txt.slice(0, 300) }, 502);
    return json({ ok: true }, 200);
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}
// ────────────────────────────────────────────────────────

// ── 음성 → 텍스트 (/stt) — Groq Whisper, 한국어 ─────────
async function handleStt(request, env, ctx, L) {
  if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
  const A = await authFor(request, env, L);
  const how = (A.tok && isStaff(A.tok)) ? 'token' : (A.legacy ? 'legacy' : '');
  if (!how) return authFail(L);
  setAuth(L, A, how);
  if (!env.GROQ_API_KEY) {
    return json({ error: 'stt-not-configured' }, 501);
  }
  const ct = request.headers.get('content-type') || 'audio/mp4';
  const buf = await readBodyLimited(request, STT_BODY_MAX);
  if (buf === null) { L.e = 'too-large'; return json({ error: 'audio too large (24MB max)' }, 413); }
  // 빈 본문 = 앱의 "준비 확인"(checkSttReady) → 하루 상한과 무관하게 400 (횟수에도 안 셈)
  if (!buf.byteLength) return json({ error: 'empty audio' }, 400);
  const cap = capOf(env.STT_DAILY_CAP, 4000);
  const c = await takeDaily(env, ctx, 'stt', cap);
  if (!c.ok && c.busy) return capBusy(L);
  if (!c.ok) {
    L.e = 'daily-cap';
    return json({ error: 'daily-cap', detail: '오늘 음성 변환 한도(' + cap + '회)를 다 썼습니다. 녹음 원본은 보관됩니다.' }, 429, { 'Retry-After': String(secondsToKstMidnight()) });
  }
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
  try { const rawP = request.headers.get('X-STT-Prompt'); if (rawP) bodyPrompt = decodeURIComponent(rawP); } catch (e) {}
  fd.append('prompt', bodyPrompt || '골프 레슨입니다. 그립, 어드레스, 셋업, 정렬, 백스윙, 탑, 전환, 다운스윙, 임팩트, 릴리스, 팔로우스루, 피니시, 템포, 리듬, 스윙 플레인, 온플레인, 샬로잉, 코킹, 힌징, 라그, 캐스팅, 오버더탑, 인아웃, 아웃인, 스웨이, 슬라이드, 히프턴, 체중이동, 로테이션, 클럽페이스, 페이스앵글, 어택앵글, 로프트, 다이나믹로프트, 스매시팩터, 볼스피드, 클럽스피드, 캐리, 토탈, 스핀, 런치앵글, 드로우, 페이드, 훅, 슬라이스, 뒤땅, 탑볼, 생크, 드라이버, 우드, 유틸리티, 아이언, 웨지, 퍼터, 어프로치, 치핑, 피칭, 벙커샷, 퍼팅.');
  let up, txt;
  try {
    up = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
      body: fd,
    });
    txt = await up.text();
    // verbose_json 을 Groq 이 거부하면(400) 기본 json 으로 1회 재시도 — 신뢰도 필터 없이라도 변환은 되게
    if (!up.ok && up.status === 400 && /response_format|verbose/i.test(txt)) {
      fd.set('response_format', 'json');
      up = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
        body: fd,
      });
      txt = await up.text();
    }
  } catch (e) {
    L.e = 'upstream';
    return json({ error: 'groq fetch failed' }, 502);
  }
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

// ── R2 객체 목록 (/__list) — 관리자 스토리지 진단·고아 파일 정리용. 관리자 인증 필수 ──
// 응답: { objects:[{key,size,uploaded}], truncated, cursor }
async function handleList(request, env, url, L) {
  if (request.method !== 'GET') return json({ error: 'use GET' }, 405);
  const A = await authFor(request, env, L);
  let how = '';
  if (A.admin) how = 'admin';
  else if (A.tok && A.tok.r === 'admin') how = 'token';
  else if (!env.ADMIN_KEY && A.legacy) how = 'legacy';   // ADMIN_KEY 를 넣기 전까지만 공용 열쇠 허용
  if (!how) return authFail(L);
  setAuth(L, A, how);
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

// ── 고객용 성과 리포트 (/r/{id}) — 자체 주소로 서빙 (v1 과 동일) ─────────
// 페이지 템플릿(report.html)을 가져와 리포트 데이터를 "서버에서" 주입해 내려준다.
// 고객 브라우저에는 Supabase 주소·키·설정 파일이 일절 전달되지 않고,
// 영상도 같은 주소(이 워커)에서 스트리밍되므로 소스를 열어봐도 얻을 것이 없다.
// 커스텀 도메인(예: report.nationalgym.kr)을 이 워커에 연결하면 그 주소 그대로 동작.
async function handleReport(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'use GET' }, 405);
  const rid = decodeURIComponent(url.pathname.slice(3));
  if (!/^rpt_[A-Za-z0-9_-]{4,80}$/.test(rid)) return reportErrPage('리포트 주소가 올바르지 않습니다', 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return reportErrPage('리포트 서버가 아직 설정되지 않았습니다', 501);
  // 리포트 데이터 — 서비스 키로 서버에서만 조회 (키는 시크릿, 브라우저 노출 0)
  let row = null;
  try {
    const rr = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/reports?id=eq.' + encodeURIComponent(rid) + '&limit=1', {
      headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY },
    });
    if (rr.ok) { const arr = await rr.json(); row = (arr && arr[0]) || null; }
  } catch (e) {}
  if (!row) return reportErrPage('리포트를 찾을 수 없습니다', 404);
  // 페이지 템플릿 — 엣지 캐시 10분 (배포처가 죽어도 캐시로 버팀)
  const tplUrl = env.REPORT_TEMPLATE_URL || 'https://wellnessmode.github.io/Golf_PT_collabo/report.html';
  const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
  const tplKey = new Request(tplUrl, { method: 'GET' });
  let tpl = null;
  if (cache) { try { const hit = await cache.match(tplKey); if (hit) tpl = await hit.text(); } catch (e) {} }
  if (tpl == null) {
    try {
      const tr = await fetch(tplUrl, { headers: { 'accept': 'text/html' } });
      if (tr.ok) {
        tpl = await tr.text();
        if (cache) { try { await cache.put(tplKey, new Response(tpl, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } })); } catch (e) {} }
      }
    } catch (e) {}
  }
  if (tpl == null || tpl.indexOf('renderReport') === -1) return reportErrPage('리포트 페이지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요', 502);
  // 데이터 주입 + 외부 스크립트(설정·supabase) 제거 → 완전 자급자족 페이지
  const inj = '<script>window.__REPORT__=' + JSON.stringify(row).replace(/</g, '\\u003c') + '</scr' + 'ipt>';
  let page = tpl
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]*"><\/script>\s*/, '')
    .replace(/<script src="config\.js"><\/script>/, inj);
  if (page.indexOf('window.__REPORT__') === -1) page = page.replace('</head>', inj + '\n</head>');
  return new Response(request.method === 'HEAD' ? null : page, {
    status: 200,
    headers: { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
// ────────────────────────────────────────────────────────

// ── R2 객체 (/{key}) ─────────────────────────────────────
async function handleObject(request, env, ctx, url, L) {
  let key;
  try { key = decodeURIComponent(url.pathname.slice(1)); } catch (e) { L.e = 'bad-key'; return json({ error: 'bad key' }, 400); }
  if (!key) {
    return json({ error: 'missing key' }, 400);
  }
  L.k = keyClass(key);
  const m = request.method;
  // GET/HEAD 는 인증 없음 (<video src> 직접 재생 + 존재확인). 단 rec/ 는 REC_REQUIRE_AUTH 로 잠글 수 있음
  if (m === 'GET' || m === 'HEAD') return getObject(request, env, ctx, url, key, L);
  // 쓰기 계열 — v1 과 같이 인증부터 (실패하면 401 — 토큰 확인 서버가 잠시 안 되면 503, 타석 PC 토큰이 남의 경로·삭제면 403)
  const A = await authFor(request, env, L);
  const d = writeDecision(A, key, m);
  if (!d.ok) {
    if (d.forbidden) {
      L.e = 'agent-scope';
      return json({ error: 'forbidden', detail: '타석 PC 토큰은 자기 타석 경로(<bay>/, orig/<bay>/, hb/<bay>.json)에 올리기와, 방금 올린 자기 타석 영상 지우기만 할 수 있습니다' }, 403);
    }
    return authFail(L);
  }
  setAuth(L, A, d.how);
  if (m === 'PUT') return putObject(request, env, ctx, url, key, L);
  if (m === 'DELETE') return deleteObject(env, url, key, L, !!d.agentDel);
  return json({ error: 'method not allowed' }, 405);
}

async function putObject(request, env, ctx, url, key, L) {
  const rule = keyRule(key);
  if (!rule) {
    L.e = 'key-not-allowed';
    return json({ error: 'key not allowed', detail: '허용되지 않은 저장 경로입니다' }, 400);
  }
  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  const ess = mediaEssence(contentType);
  if (!ess || isDangerousType(ess) || !rule.ct(ess)) {
    L.e = 'type-not-allowed';
    return json({ error: 'content-type not allowed', detail: '이 경로에 허용되지 않은 파일 형식입니다' }, 415);
  }
  try {
    await env.BUCKET.put(key, request.body, {
      httpMetadata: { contentType },
    });
    // 같은 키를 다시 올린 경우 엣지에 남은 옛 사본을 먼저 지운다 (덮어쓴 내용이 가려지지 않게)
    await purgeEdgeCache(url.origin, key);
    // 영상은 업로드 직후 엣지 캐시에 미리 적재(워밍) — 라이브에서 "첫 재생"이
    // R2 원본까지 가는 느린 경로 대신 엣지 캐시 히트가 되어 즉시 시작된다.
    // (에이전트 PC 와 스튜디오 폰은 같은 지역 엣지(콜로)를 쓰므로 효과가 그대로 미침)
    // rec/·hb/ 는 절대 캐시하지 않는다.
    if (rule.warm && /\.(mp4|mov|webm|mkv)$/i.test(key) && ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(warmVideoCache(env, url.origin, key));
    }
    return json({ ok: true, key }, 200);
  } catch (e) {
    L.e = 'r2-put';
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

async function deleteObject(env, url, key, L, agentRecentOnly) {
  if (key.indexOf('__meta/') === 0 || !keySane(key)) {
    L.e = 'key-not-allowed';
    return json({ error: 'key not allowed', detail: '허용되지 않은 저장 경로입니다' }, 400);
  }
  try {
    if (agentRecentOnly) {
      // 타석 PC 토큰의 삭제: 올린 지 6시간 안 된 파일만 (없는 파일은 그대로 성공 처리)
      const h = await env.BUCKET.head(key);
      const up = h && h.uploaded ? new Date(h.uploaded).getTime() : NaN;
      if (h && !(up > Date.now() - AGENT_DELETE_MAX_AGE_MS)) {
        L.e = 'agent-delete-old';
        return json({ error: 'forbidden', detail: '타석 PC 토큰은 올린 지 6시간이 지난 영상을 지울 수 없습니다' }, 403);
      }
    }
    await env.BUCKET.delete(key);
    await purgeEdgeCache(url.origin, key);   // 지운 파일이 엣지 캐시에서 계속 나가지 않게
    return json({ ok: true }, 200);
  } catch (e) {
    L.e = 'r2-delete';
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

async function getObject(request, env, ctx, url, key, L) {
  if (key.indexOf('__meta/') === 0) return json({ error: 'not found' }, 404);   // 워커 내부 카운터
  const isRec = key.indexOf('rec/') === 0;
  // rec/(녹음·전사)·hb/(하트비트) = 수시로 바뀌는 파일 → 엣지 캐시 금지 + no-store
  const noStore = isRec || key.indexOf('hb/') === 0;
  if (isRec) {
    L.force = true;   // 전사 원문 열람은 GET 이어도 기록
    if (flag(env, 'REC_REQUIRE_AUTH')) {
      const A = await authFor(request, env, L);
      const how = (A.tok && isStaff(A.tok)) ? 'token' : (A.legacy ? 'legacy' : '');
      if (!how) return authFail(L);
      setAuth(L, A, how);
    }
  }
  try {
    // Range 요청 지원 — <video> 스트리밍/탐색에 필수.
    // 없으면 브라우저가 파일 전체를 받아야 재생돼 매우 느리고,
    // iOS Safari 는 206 응답이 아니면 영상 재생을 거부한다.
    const rangeHeader = request.headers.get('range');

    // ── 엣지 캐시 조회 (속도) ──────────────────────────────
    // Cloudflare Cache API 는 캐시된 전체(200) 응답에서 Range 를 잘라 206 으로 준다.
    // 워밍업된 영상은 R2 원본까지 안 가고 엣지에서 바로 재생 → 대기시간 대폭 감소.
    const cache = (!noStore && typeof caches !== 'undefined' && caches.default) ? caches.default : null;
    // 캐시 키는 항상 "정규형"(origin + encodeURIComponent(key)) — PUT 워밍·GET 적재·조회가
    // 클라이언트별 URL 인코딩 차이와 무관하게 같은 항목을 가리키게 한다.
    const cacheKey = new Request(url.origin + '/' + encodeURIComponent(key), { method: 'GET' });
    if (cache && request.method === 'GET') {
      try {
        // 조회 요청엔 원래의 Range 헤더를 실어야 Cloudflare 가 캐시된 200 에서 206 으로 잘라준다.
        const matchReq = rangeHeader
          ? new Request(cacheKey.url, { method: 'GET', headers: { range: rangeHeader } })
          : cacheKey;
        const hit = await cache.match(matchReq);
        // 안전장치: Range 요청인데 캐시가 206 으로 안 잘라주면(전체 200) iOS 재생 실패 우려 →
        // 그 경우엔 캐시를 무시하고 아래 R2 경로로 정상 206 스트리밍한다(재생 회귀 방지).
        if (hit && (!rangeHeader || hit.status === 206)) return hardenResponse(hit);
      } catch (e) {}
    }

    let r2range;
    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (m) {
        const start = m[1] === '' ? undefined : parseInt(m[1], 10);
        const end = m[2] === '' ? undefined : parseInt(m[2], 10);
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
    // 단 rec/·hb/ 는 덮어쓰는 파일이라 no-store.
    headers.set('cache-control', noStore ? 'no-store' : 'public, max-age=31536000, immutable');
    hardenObjectHeaders(headers);
    const total = obj.size;                       // 항상 전체 파일 크기
    const body = request.method === 'HEAD' ? null : obj.body;

    // 미스 시 백그라운드로 "전체 객체" 를 엣지에 적재 → 다음 요청부터 캐시 히트.
    // (지금 응답은 아래에서 Range 그대로 스트리밍하므로 사용자 대기엔 영향 없음)
    if (cache && request.method === 'GET' && ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(warmVideoCache(env, url.origin, key));
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
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

function keyRule(key) {
  if (typeof key !== 'string' || key.length > 512) return null;
  for (let i = 0; i < KEY_RULES.length; i++) { if (KEY_RULES[i].re.test(key)) return KEY_RULES[i]; }
  return null;
}
// DELETE 용 최소 검사 — 관리자 정리 도구가 목록에 보이는 어떤 키든 지울 수 있게 넓게 둔다
function keySane(key) {
  if (new TextEncoder().encode(key).length > 1024) return false;
  if (/[\u0000-\u001f\u007f\\]/.test(key)) return false;
  return key.split('/').every(function (seg) { return seg !== '' && seg !== '.' && seg !== '..'; });
}
// 로그용 키 분류 — 전체 키(회원 첨부 id 등)는 절대 남기지 않는다
function keyClass(key) {
  if (key.indexOf('orig/') === 0) return 'orig/';
  if (key.indexOf('rec/') === 0) return 'rec/';
  if (key.indexOf('hb/') === 0) return 'hb/';
  if (key.indexOf('__meta/') === 0) return '__meta/';
  if (key.indexOf('m_') === 0) return 'm_';
  const b = /^(bay[A-Za-z0-9_-]{1,29})\//.exec(key);
  if (b) return b[1] + '/';
  return 'other';
}
// Content-Type 의 본체(파라미터 제외, 소문자). 형식이 이상하면 ''
function mediaEssence(ct) {
  const s = String(ct || '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/.test(s) ? s : '';
}
// 브라우저가 문서·스크립트로 실행할 수 있는 형식 (HTML·SVG·XML·JavaScript …)
function isDangerousType(e) {
  return e === 'text/html' || e.indexOf('xml') !== -1 || /(java|ecma|j|live)script/.test(e)
    || e === 'application/x-shockwave-flash' || e === 'text/x-component';
}
// 객체 응답 공통 보강 — nosniff, 그리고 (v1 시절에 올라왔을 수 있는) 위험 형식은 내려받기로만
function hardenObjectHeaders(h) {
  h.set('X-Content-Type-Options', 'nosniff');
  const ct = h.get('content-type');
  if (!ct) { h.set('content-type', 'application/octet-stream'); return; }
  const e = mediaEssence(ct);
  if (!e || isDangerousType(e)) {
    h.set('content-type', 'application/octet-stream');
    h.set('content-disposition', 'attachment');
    h.set('content-security-policy', 'sandbox');
  }
}
function hardenResponse(res) {
  try {
    const h = new Headers(res.headers);
    hardenObjectHeaders(h);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) { return res; }
}
async function purgeEdgeCache(origin, key) {
  try {
    const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
    if (!cache) return;
    await cache.delete(new Request(origin + '/' + encodeURIComponent(key), { method: 'GET' }));
  } catch (e) {}
}
// ────────────────────────────────────────────────────────

// ── 인증 ─────────────────────────────────────────────────
// 요청당 1번만 계산. 토큰 검증(RPC)은 X-Staff-Token 헤더가 있을 때만 → 지금 클라이언트는 지연 0.
async function authFor(request, env, L) {
  if (L._auth) return L._auth;
  const A = { legacy: false, admin: false, tok: null };
  const apiKey = request.headers.get('X-API-Key');
  A.legacy = !!(env.APP_API_KEY && apiKey && !flag(env, 'LEGACY_KEY_OFF') && safeEqual(apiKey, String(env.APP_API_KEY)));
  const ak = request.headers.get('X-Admin-Key');
  A.admin = !!(env.ADMIN_KEY && ak && safeEqual(ak, String(env.ADMIN_KEY)));
  const t = request.headers.get('X-Staff-Token');
  if (t) {
    const v = await verifyToken(env, t);
    L.tk = v.state;
    A.tok = v.claims || null;
  }
  L._auth = A;
  return A;
}
function isStaff(tok) { return !!(tok && STAFF_ROLES.indexOf(tok.r) !== -1); }
// 타석 PC 토큰: 자기 타석의 샷 영상 '<bay>/' · 원본 'orig/<bay>/' · 하트비트 'hb/<bay>.json' 에 올리기(PUT).
// 삭제(DELETE)는 자기 타석 샷 영상 '<bay>/' 만, 그것도 올린 지 AGENT_DELETE_MAX_AGE_MS(6시간) 안 된 파일만 —
// 에이전트 v12 가 같은 샷의 더 나은 영상으로 바꿀 때 방금 올린 옛 파일을 지우는 용도. 토큰이 새도 저장된(오래된) 영상은 못 지움.
const AGENT_DELETE_MAX_AGE_MS = 6 * 3600 * 1000;
function agentKeyAllowed(b, key, method) {
  if (method === 'DELETE') return key.indexOf(b + '/') === 0;
  if (method !== 'PUT') return false;
  return key.indexOf(b + '/') === 0 || key.indexOf('orig/' + b + '/') === 0 || key === 'hb/' + b + '.json';
}
function writeDecision(A, key, method) {
  if (A.tok && isStaff(A.tok)) return { ok: true, how: 'token' };
  if (A.tok && A.tok.r === 'agent' && agentKeyAllowed(A.tok.b, key, method)) return { ok: true, how: 'token', agentDel: method === 'DELETE' && !A.legacy };
  if (A.legacy) return { ok: true, how: 'legacy' };
  if (A.tok && A.tok.r === 'agent') return { ok: false, forbidden: true };
  return { ok: false };
}
// 인증 실패 응답. 토큰을 냈는데 확인 서버(Supabase RPC)가 잠시 응답하지 않은 경우(tk 'unavailable')는
// 401(영구 실패로 처리됨) 대신 503 + Retry-After → 앱·타석 PC 가 잠시 뒤 다시 시도
function authFail(L) {
  if (L.tk === 'unavailable') {
    L.e = 'auth-unavailable';
    return json({ error: 'auth-unavailable', detail: '로그인 확인 서버가 잠시 응답하지 않습니다 — 잠시 후 다시 시도해 주세요' }, 503, { 'Retry-After': '5' });
  }
  L.e = 'unauthorized';
  return json({ error: 'unauthorized' }, 401);
}
// 하루 상한 카운터를 읽거나 쓰지 못함(재시도 후) → 비용 보호를 위해 이번 요청은 거절, 잠시 뒤 다시
function capBusy(L) {
  L.e = 'cap-busy';
  return json({ error: 'cap-busy', detail: '사용량 확인이 잠시 안 됩니다 — 잠시 후 다시 시도해 주세요' }, 503, { 'Retry-After': '5' });
}
function setAuth(L, A, how) {
  if (how === 'token' && A.tok) { L.auth = 'token:' + A.tok.r; L.u = A.tok.u; return; }
  if (how === 'admin') L.auth = 'admin';
  else if (how === 'legacy') L.auth = 'legacy';
  L.u = A.tok ? A.tok.u : '';
}
function flag(env, name) {
  const v = env[name];
  return v != null && String(v).trim() === '1';
}
// 길이와 무관하게 끝까지 비교 (열쇠 추측 시간차 공격 방지)
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  try {
    if (x.length === y.length && typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.timingSafeEqual === 'function') {
      return crypto.subtle.timingSafeEqual(x, y);
    }
  } catch (e) {}
  let diff = x.length ^ y.length;
  for (let i = 0; i < y.length; i++) diff |= (i < x.length ? x[i] : 0) ^ y[i];
  return diff === 0;
}

// gpt1 토큰 검증 — 결과 {state, claims}. state: ok|format|role|expired|sig|revoked|unavailable
async function verifyToken(env, tok) {
  if (typeof tok !== 'string' || !tok || tok.length > TOKEN_MAX_LEN) return { state: 'format' };
  const parts = tok.split('.');
  if (parts.length !== 3 || parts[0] !== 'gpt1') return { state: 'format' };
  if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return { state: 'format' };
  const sig = b64ToBytes(parts[2]);
  if (!sig || sig.length !== 32 || bytesToB64url(sig) !== parts[2]) return { state: 'format' };
  let p;
  try {
    const pb = b64ToBytes(parts[1]);
    if (!pb) return { state: 'format' };
    p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pb));
  } catch (e) { return { state: 'format' }; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { state: 'format' };
  if (typeof p.u !== 'string' || !p.u || p.u.length > 200) return { state: 'format' };
  if (typeof p.iat !== 'number' || !Number.isFinite(p.iat) || typeof p.exp !== 'number' || !Number.isFinite(p.exp)) return { state: 'format' };
  if (TOKEN_ROLES.indexOf(p.r) === -1) return { state: 'role' };
  if (!(p.exp > Date.now() / 1000)) return { state: 'expired' };
  if (p.r === 'agent' && (typeof p.b !== 'string' || !BAY_RE.test(p.b))) return { state: 'format' };
  const key = await getTokenKey(env);
  if (!key) return { state: 'unavailable' };
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(parts[0] + '.' + parts[1])); } catch (e) { ok = false; }
  if (!ok) return { state: 'sig' };
  const rev = await getRevocations(env);
  if (!rev) return { state: 'unavailable' };
  if ((rev.has(p.u) && p.iat < rev.get(p.u)) || (rev.has('*') && p.iat < rev.get('*'))) return { state: 'revoked' };
  return { state: 'ok', claims: { u: p.u, r: p.r, b: p.r === 'agent' ? p.b : '', iat: p.iat, exp: p.exp } };
}

// RPC 결과 캐시 (모듈 범위 = 같은 워커 인스턴스 안에서 공유).
// 캐시에는 "결과 값"(CryptoKey·Map)만 둔다. 진행 중인 Promise 는 요청끼리 공유하지 않는다 —
// Workers 는 I/O·Promise 후속 처리를 시작한 요청에 묶기 때문(다른 요청의 fetch 를 기다리면 위험).
const _rpcCache = {
  secret: { v: null, at: 0, failAt: 0 },
  rev: { v: null, at: 0, failAt: 0 },
  mode: { v: null, at: 0, failAt: 0 },
};
async function cachedRpc(slot, ttl, env, load) {
  const now = Date.now();
  if (slot.v && now - slot.at < ttl) return slot.v;
  const stale = (slot.v && now - slot.at < ttl + RPC_STALE_MAX_MS) ? slot.v : null;
  if (slot.failAt && now - slot.failAt < (stale ? RPC_RETRY_MS : RPC_RETRY_EMPTY_MS)) return stale;
  try {
    const v = await load(env);
    slot.v = v; slot.at = Date.now(); slot.failAt = 0;
    return v;
  } catch (e) {
    slot.failAt = Date.now();
    return stale;
  }
}
function getTokenKey(env) { return cachedRpc(_rpcCache.secret, SECRET_TTL_MS, env, loadTokenKey); }
function getRevocations(env) { return cachedRpc(_rpcCache.rev, REV_TTL_MS, env, loadRevocations); }
// DB 잠금 상태 → 'open' | 'locked' | null(확인 불가). 토큰 SQL 전(gpt_whoami 없음 → 404)은 잠글 수 없는 단계 = 'open'
function getDbMode(env) { return cachedRpc(_rpcCache.mode, MODE_TTL_MS, env, loadDbMode); }
async function loadDbMode(env) {
  let j;
  try { j = await supabaseRpc(env, 'gpt_whoami'); }
  catch (e) { if (e && e.status === 404) return 'open'; throw e; }
  if (Array.isArray(j)) j = j[0];
  if (j && typeof j === 'object' && j.gpt_whoami && typeof j.gpt_whoami === 'object') j = j.gpt_whoami;
  if (!j || typeof j !== 'object' || typeof j.mode !== 'string') throw new Error('whoami shape');
  return j.mode === 'locked' ? 'locked' : 'open';
}
async function supabaseRpc(env, fn) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('supabase not configured');
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ac ? setTimeout(function () { try { ac.abort(); } catch (_) {} }, RPC_TIMEOUT_MS) : null;
  try {
    const r = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: '{}',
      signal: ac ? ac.signal : undefined,
    });
    if (!r.ok) { const err = new Error('rpc ' + fn + ' ' + r.status); err.status = r.status; throw err; }
    return await r.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function loadTokenKey(env) {
  let s = await supabaseRpc(env, 'gpt_worker_secret');
  if (Array.isArray(s)) s = s[0];
  if (s && typeof s === 'object') s = s.gpt_worker_secret;
  if (typeof s !== 'string') throw new Error('secret shape');
  const raw = b64ToBytes(s.replace(/\s+/g, ''));
  if (!raw || raw.length < 16) throw new Error('secret length');
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
}
async function loadRevocations(env) {
  const j = await supabaseRpc(env, 'gpt_worker_revocations');
  const arr = j == null ? [] : j;
  if (!Array.isArray(arr)) throw new Error('revocations shape');
  const m = new Map();
  arr.forEach(function (it) {
    if (!it || typeof it.u !== 'string') return;
    const b = Number(it.before_epoch);
    if (!Number.isFinite(b)) return;
    if (!m.has(it.u) || m.get(it.u) < b) m.set(it.u, b);
  });
  return m;
}
// base64 / base64url → bytes (실패하면 null)
function b64ToBytes(s) {
  try {
    let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}
function bytesToB64url(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// ────────────────────────────────────────────────────────

// ── 하루 상한 (한국시간 날짜별, R2 카운터 '__meta/<종류>/<YYYY-MM-DD>') ──
// ① 이 인스턴스 안: 확인된 횟수(seen) + 진행 중인 호출(inflight)을 await 없이 바로 보고 예약 → 한꺼번에 몰려도 못 넘김
// ② 모든 인스턴스: Anthropic·Groq 를 부르기 전에 R2 카운터를 '조건부 쓰기'(etag 가 그대로일 때만, 처음이면 없을 때만)로 +1.
//    다른 요청이 먼저 썼으면(null) 다시 읽고 재시도. 읽기·쓰기 실패(R2 오류·같은 키 초당 1회 쓰기 제한)도 잠시 기다려 재시도,
//    CAP_TRY_MS 안에 못 하면 거절({busy:true} → 503) — 횟수를 못 셀 때는 열어 주지 않음(비용 보호 우선)
const _capMem = {};
function kstDay(ms) { return new Date((ms == null ? Date.now() : ms) + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function secondsToKstMidnight() {
  const s = Math.floor(Date.now() / 1000) + 9 * 3600;
  return 86400 - (s % 86400);
}
function capOf(v, dflt) {
  const n = parseInt(String(v == null ? '' : v).trim(), 10);
  return (Number.isFinite(n) && n >= 0) ? n : dflt;
}
async function takeDaily(env, ctx, kind, cap) {
  const day = kstDay();
  const key = '__meta/' + kind + '/' + day;
  let m = _capMem[kind];
  if (!m || m.day !== day) m = _capMem[kind] = { day: day, seen: 0, inflight: 0 };
  if (m.seen + m.inflight >= cap) return { ok: false, n: m.seen };   // ① 동기 예약 (이 줄 앞에 await 없음)
  m.inflight++;
  try {
    const until = Date.now() + CAP_TRY_MS;
    const meta = { contentType: 'application/json' };
    let wait = 15, createErr = 0;
    for (let tries = 0; tries < 40; tries++) {
      let o = null, n = 0, readOk = true;
      try { o = await env.BUCKET.get(key); } catch (e) { readOk = false; }
      if (readOk) {
        if (o) {
          try { const j = JSON.parse(await o.text()); n = Math.max(0, Math.floor(Number(j && j.n) || 0)); } catch (e) { n = 0; }
        }
        if (n > m.seen) m.seen = n;
        if (n >= cap) return { ok: false, n: n };
        let put = null;
        try {
          put = await env.BUCKET.put(key, JSON.stringify({ n: n + 1, day: day, cap: cap, at: new Date().toISOString() }), {
            httpMetadata: meta,
            onlyIf: o ? { etagMatches: o.etag } : new Headers({ 'If-None-Match': '*' }),
          });
        } catch (e) {
          put = null;
          // 오늘 카운터가 아직 없는데 '없을 때만 만들기'가 두 번 연속 오류 → 그 조건을 못 쓰는 경우에 대비해
          // 0 으로 먼저 만들어 두고(올리지는 않음) 다음 바퀴에서 etag 조건으로 +1
          if (!o && ++createErr >= 2) {
            try { await env.BUCKET.put(key, JSON.stringify({ n: 0, day: day, cap: cap, at: new Date().toISOString() }), { httpMetadata: meta }); } catch (e2) {}
          }
        }
        if (put) { if (n + 1 > m.seen) m.seen = n + 1; return { ok: true, n: n + 1 }; }
      }
      if (Date.now() + wait > until) break;
      await new Promise(function (r) { setTimeout(r, wait + Math.floor(Math.random() * wait)); });
      wait = Math.min(wait * 2, 500);
    }
    return { ok: false, busy: true, n: m.seen };
  } finally { m.inflight--; }
}
// ────────────────────────────────────────────────────────

// 본문을 최대 max 바이트까지만 읽는다 (넘으면 null). 거대한 본문으로 메모리를 채우는 공격 방지
async function readBodyLimited(request, max) {
  const cl = request.headers.get('content-length');
  if (cl && Number(cl) > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    const v = r.value;
    total += v.byteLength;
    if (total > max) { try { await reader.cancel(); } catch (_) {} return null; }
    chunks.push(v);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (let i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].byteLength; }
  return out;
}

// 구조화 로그 한 줄 — Cloudflare 대시보드 Logs(Observability)에 남음. 키·토큰·열쇠 값은 넣지 않는다.
function logLine(request, L, st, ms) {
  const rec = { t: new Date().toISOString(), m: request.method, route: L.route, auth: L.auth, u: L.u || '', st: st, k: L.k || '', ms: ms };
  if (L.e) rec.e = L.e;
  if (L.tk) rec.tk = L.tk;
  const cf = request.cf || null;
  if (cf && cf.country) rec.cc = cf.country;
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) rec.ip = ip;
  console.log(JSON.stringify(rec));
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...NOSNIFF, 'content-type': 'application/json', ...(extra || {}) },
  });
}

// 고객용 리포트 오류 페이지 — JSON 대신 사람이 읽는 안내 화면
function reportErrPage(msg, status) {
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>성과 리포트</title></head>'
    + '<body style="margin:0;font-family:-apple-system,\'Noto Sans KR\',sans-serif;background:#f2f4f6;display:flex;min-height:100vh;align-items:center;justify-content:center">'
    + '<div style="text-align:center;padding:40px 24px;color:#454c55">'
    + '<div style="font-size:44px;margin-bottom:14px">📄</div>'
    + '<div style="font-size:16px;font-weight:800;margin-bottom:8px">' + msg + '</div>'
    + '<div style="font-size:13px;color:#8b93a0">담당 지도자에게 새 링크를 요청해주세요</div>'
    + '</div></body></html>';
  return new Response(html, { status, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// R2 객체 전체를 엣지 캐시에 적재(워밍) — PUT 직후·GET 미스 시 공용.
// 캐시 키는 정규형(origin + encodeURIComponent(key)) 로 통일해, 업로더(에이전트)와
// 시청자(앱)의 URL 인코딩이 달라도 같은 캐시 항목을 쓰게 한다. rec/·hb/·__meta/ 는 절대 적재 안 함.
async function warmVideoCache(env, origin, key) {
  try {
    if (/^(rec|hb|__meta)\//.test(key)) return;
    const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
    if (!cache) return;
    const cacheKey = new Request(origin + '/' + encodeURIComponent(key), { method: 'GET' });
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
    hardenObjectHeaders(fh);
    await cache.put(cacheKey, new Response(full.body, { status: 200, headers: fh }));
  } catch (e) {}
}
