// ============================================================
//  Golf PT — TrackMan Bay Agent (베이 PC 백그라운드 동기화)
// ------------------------------------------------------------
//  역할 (TPS 무간섭·무흔적·조용함):
//   1) C:\ProgramData\TrackMan\...\Data\*.ftmf 폴더를 읽기 전용으로 감시
//   2) 새 ftmf 발견 → 내부 Fusion JSON 파싱(샷 메트릭)
//   3) 내부 영상(scene.mkv) 추출 → R2 업로드 (선택)
//   4) Supabase shot_events 에 insert (활성세션 회원 자동 귀속은 서버/앱 로직)
//   5) 처리한 ftmf의 MeasurementId 기록 → 중복 방지
//
//  - TPS 파일을 삭제/이동/수정하지 않음 (복사·읽기만)
//  - 콘솔/트레이/창 없음. 로그는 자기 폴더에만.
//  - 의존성 0 (Node 내장 모듈만)
//
//  실행: node agent.js   (config.json 같은 폴더)
//  설정: config.json 참조
// ============================================================
// 에이전트 버전 — 샷 행에 함께 실려 앱이 "이 타석 PC 가 구버전인지"를 알 수 있게 한다.
// 영상 변환 로직을 고쳐도 타석 PC 에서 update.ps1 을 안 돌리면 반영되지 않는데,
// 예전엔 그걸 확인할 방법이 없어 "고쳤는데 왜 그대로냐" 혼선이 반복됐다.
// ⚠️ 변환·업로드 로직을 고칠 때마다 이 숫자를 올릴 것.
//
// v12 변경 (2026-11, 서버 점검 A2·A3·A4·A8·A9·B5 반영):
//  · 같은 스윙 중복 업로드 정리 — 정상 ftmf(내장 영상)와 같은 스윙의 단독 stmf 가 지문 병합되면 예전엔 내장 영상과
//    Videos 폴더 영상을 둘 다 올려, 먼저 올린 <측정ID>_scene 이 곧바로 고아가 됐다(1·2번 타석). 이제 Videos 폴더 영상
//    (측면·정면·클럽 — 앱이 실제로 보여 주는 것)을 먼저 붙이고, 내장 영상은 Videos 폴더에서 아무것도 못 찾았을 때만
//    올린다(대비용). 작업은 종류마다 샷당 1개(Videos 폴더 1 · 내장 1).
//    영상 키가 다른 키로 바뀌면 새 업로드·행 갱신이 성공한 뒤 옛 R2 파일을 지운다(이 샷 이름의 파일만).
//    대표 영상은 측면(DL, 없으면 볼 카메라)이 오면 바뀌고, 클럽은 대표가 비어 있을 때만 대표가 된다(측면 슬롯 영상 보존).
//    다른 샷에 이미 붙은 Videos 폴더 파일은 재사용하지 않는다(남의 스윙 → 영상 없음 + 로그).
//    더 완전한 측정의 재전송은 data 만 병합 — 이미 붙은 영상 키·보관 표시·회원 배정을 지우지 않는다.
//  · 활성 세션 4시간 상한 — started_at 을 함께 읽어 4시간 넘게 켜진 세션은 꺼진 것으로 본다(타석당 1회 로그).
//  · 서버 요청이 응답 도중 끊겨도(연결 리셋·종료) 멈추지 않게 모든 요청에 최종 시한 — 백그라운드 영상 연결이
//    멈춰도 샷 수집(스캔)은 같은 샷의 잠금을 몇 초 이상 기다리지 않는다.
//  · 재시작 복구 — Videos 폴더(단독 stmf) 영상 작업을 종류·측정시각·올린 앵글과 함께 상태 파일에 기록해
//    재시작 후에도 그대로 이어서 처리(예전엔 내장 영상 작업으로 잘못 되살려 '영상 없음'으로 끝남).
//  · 하트비트 — 시작 시·5분마다 저장소 워커에 hb/<bay>.json (버전·최근 신호·대기열·시계 오차, 회원 정보 없음).
//  · 새 샷 파일이 왔는데 레슨 꺼짐으로 보이면 그 자리에서 1회 재확인(타석당 3초 1회). 2시간 한가하면 확인 주기 완화.
//  · 정면(FO) 영상이 5MB 를 넘으면 기존 저우선 설정으로 1280 재인코딩 + 크기 경고 로그.
//  · config.json AGENT_TOKEN(선택) → Supabase 'x-staff-token' · 워커 'X-Staff-Token' 헤더. 없으면 예전과 동일.
const AGENT_VERSION = 12;

const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseFtmf } = require('./ftmf-parser.js');

// ---- 설정 로드 ----
var CFG;
try {
  // BOM(﻿) 제거 후 파싱 — 메모장/PowerShell 이 UTF-8 BOM 을 붙여도 안전하게.
  var _cfgRaw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, '');
  CFG = JSON.parse(_cfgRaw);
}
catch (e) { console.error('config.json 읽기 실패:', e.message); process.exit(1); }

var STATE_FILE = path.join(__dirname, '.agent-state.json');
var LOG_FILE = path.join(__dirname, 'agent.log');
var processed = {};
// '컷오프 이전' 파일은 여기(별도·비영속)로만 표시하고 processed 에는 넣지 않는다.
// 이유: 고장 상태 폴더엔 파일이 수천~수만 개라, before-start 를 processed 에 넣으면
// 4000개 상한에 걸려 계속 축출·재삽입되면서 '이미 보낸 실제 샷' 기록까지 밀려나
// 같은 샷을 매 스캔 재전송하는 버그가 났다. before-start 는 재전송과 무관하니 분리.
var _beforeStart = {};
var _shotBest = {};        // shotId → 지금까지 보낸 측정 완성도 점수(더 완전한 값만 반영)
// shotId → 이 샷의 영상 작업 종류: 'vf'(Videos 폴더) · 'emb'(ftmf 내장) · 'both'(같은 스윙의 정상 ftmf + 단독 stmf) ·
// 'gone'(앱에서 행 삭제 → 새 작업 안 만듦). 종류마다 샷당 1개만.
// v12: 같은 스윙에 둘 다 있으면 Videos 폴더 작업(측면·정면·클럽 — 앱이 실제로 보여 주는 영상)이 우선이고,
// 내장 영상 작업은 '대비용'(_fallback) — Videos 폴더 작업이 끝날 때까지 기다렸다가 그쪽이 아무것도 못 붙였을 때만 올린다.
// (예전 v11 은 둘 다 올려 내장 영상이 곧바로 고아가 됐고, v12 초안은 Videos 폴더 작업을 막아 정면·클럽이 사라졌다)
var _videoQueuedFor = {};
function _hasJob(id, kind){ var v = _videoQueuedFor[id]; return v === kind || v === 'both'; }
function _markJob(id, kind){ var v = _videoQueuedFor[id]; _videoQueuedFor[id] = (!v || v === kind) ? kind : (v === 'gone' ? 'gone' : 'both'); }
var EMB_DEFER_MAX_MS = 10 * 60000;   // 대비용 내장 영상이 Videos 폴더 작업을 기다리는 최대 시간
var _fpShot = {};          // 측정값 지문 → {id,t} — 다른 측정ID로 온 같은 스윙 병합용(3분 창)
var _recentShots = {};     // bay → [{evMs,id}] 최근 샷(같은 물리적 샷의 여러 stmf 를 시각 근접으로 병합)
// 같은 물리적 샷의 여러 stmf 를 하나의 shotId 로 — 측정시각 ±1.5초 이내면 같은 샷으로 본다.
// (초 단위 반올림 버킷은 경계에서 갈라지므로, 근접 비교로 견고하게)
function dedupShotId(bayId, evMs){
  if(!_recentShots[bayId]) _recentShots[bayId]=[];
  var arr=_recentShots[bayId], cut=evMs-180000;
  for(var i=arr.length-1;i>=0;i--){ if(arr[i].evMs<cut) arr.splice(i,1); }
  for(var j=0;j<arr.length;j++){ if(Math.abs(arr[j].evMs-evMs)<=1500) return arr[j].id; }
  var id='tm_'+bayId+'_'+Math.round(evMs/1000);
  arr.push({evMs:evMs,id:id});
  return id;
}
var _stateMeta = {};
try {
  var _raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  // 신형: {__meta:{lastCutoff}, ...processed}. 구형: 그냥 processed 맵.
  if (_raw && _raw.__meta){ _stateMeta = _raw.__meta; delete _raw.__meta; }
  processed = _raw || {};
  // 구버전이 남긴 before-start 항목은 걷어낸다(상한 오염 방지). 실제 처리분만 유지.
  Object.keys(processed).forEach(function(k){
    if (processed[k] && processed[k].skip === 'before-start') { _beforeStart[k] = 1; delete processed[k]; }
  });
} catch (e) {}
var _parseFail = {};   // 부분 파일 파싱 재시도 카운터 (영속 아님)
var _busyLogged = {};  // (v12) fname → '영상 연결 진행 중이라 보강 재전송 미룸' 로그를 남겼음 (파일당 1번)
// 시작 컷오프: 재시작 때마다 '지금'으로 리셋하면 단절/크래시/재부팅 동안의 샷이 유실된다.
// → 직전 실행이 마지막으로 처리한 시각을 이어받아, 그 사이 생성된 파일도 처리한다.
// 단, 소급을 30분으로 제한: 그보다 오래 꺼져 있었으면(또는 신버전 첫 실행) 옛
// 연습샷 수천 개가 한꺼번에 쏟아지는 걸 막는다. 30분 넘는 공백의 지난 샷은 어차피
// 지금 진행 중인 레슨과 무관하다. backfillMinutes 로 더 넓힐 수 있다.
var _now = Date.now();
var _resume = (_stateMeta && _stateMeta.lastSeenMtime) ? _stateMeta.lastSeenMtime : _now;
var _maxBack = _now - 30*60000;   // 최대 30분 소급 (기존 7일 → 대량 유입 방지)
var AGENT_CUTOFF_MS = Math.max(_maxBack, Math.min(_resume, _now)) - ((CFG && CFG.backfillMinutes ? CFG.backfillMinutes : 0) * 60000);

// ── (v12) 설정값 — 전부 선택 항목. config.json 에 없으면 아래 기본값 ─────────────
function _cfgNum(v, d){ return (v != null && v !== '' && !isNaN(+v)) ? +v : d; }
// 활성 세션 상한(시간). 앱은 녹음 중이면 2시간 자동 종료를 미룬다. 실제 녹음 레슨(10-07 3번룸)은 세션을 켠 뒤
// 181~185분에도 샷을 쳤다 — 3시간이면 그 샷들이 '연습 샷'으로 버려지므로 여유를 두고 4시간. 0 이하 = 상한 없음
var SESSION_MAX_MS = _cfgNum(CFG && CFG.sessionMaxHours, 4) * 3600000;
// 정면(FO) 영상 크기 상한(MB). 넘으면 1280 재인코딩. 0 = 재인코딩 안 함(경고만)
var FO_MAX_BYTES = _cfgNum(CFG && CFG.foMaxMB, 5) * 1e6;
var FO_WARN_BYTES = FO_MAX_BYTES > 0 ? FO_MAX_BYTES : 5e6;
var IDLE_MS = 2 * 3600000;          // 이만큼 레슨·샷이 없으면 '한가함' → 서버 확인 주기 완화
var ACTIVE_FRESH_MS = 45000;        // 레슨 상태가 이보다 오래됐으면(조회 실패 중) '레슨 꺼짐' 판정을 미룬다
var NO_SESSION_WAIT_MAX_MS = 15 * 60000;   // 단, 그렇게 미루는 것도 파일당 최대 15분까지
var HB_INTERVAL_MS = 5 * 60000;     // 하트비트 주기

// ── (v12) 타석 PC 토큰 (S1 보안 단계, 선택) ── 있으면 Supabase 에 'x-staff-token', 워커에 'X-Staff-Token'.
// 없거나 샘플 자리표시자(<...>)면 예전과 완전히 같다. 형식이 이상하면(공백·한글 등) 요청 자체가 깨지므로 무시.
var AGENT_TOKEN = '';
var _tokenNote = '';
(function(){
  try{
    var t = (CFG && CFG.AGENT_TOKEN != null) ? String(CFG.AGENT_TOKEN).trim() : '';
    if (!t || t.charAt(0) === '<') return;
    if (/^[\x21-\x7e]{8,2048}$/.test(t)) AGENT_TOKEN = t;
    else _tokenNote = 'config.json AGENT_TOKEN 형식이 이상해 무시합니다(공백·한글·길이 확인) — 토큰 없이 예전처럼 동작';
  }catch(e){}
})();
// 키가 샘플 자리표시자("<...>")면 없는 것으로 본다 — 한글 자리표시자를 헤더에 넣으면 요청 자체가 예외로 깨진다
function _keyOrEmpty(v){ return (v && !/^\s*</.test(String(v))) ? String(v) : ''; }
function sbHeaders(extra){   // Supabase REST 공통 헤더
  var k = _keyOrEmpty(CFG.SUPABASE_ANON_KEY);
  var h = { 'apikey': k, 'Authorization': 'Bearer ' + k };
  if (AGENT_TOKEN) h['x-staff-token'] = AGENT_TOKEN;
  if (extra) Object.keys(extra).forEach(function(k){ h[k] = extra[k]; });
  return h;
}
function workerHeaders(extra){   // 저장소 워커 공통 헤더 (공용 열쇠는 있을 때만)
  var h = {};
  var k = _keyOrEmpty(CFG.R2_API_KEY);
  if (k) h['X-API-Key'] = k;
  if (AGENT_TOKEN) h['X-Staff-Token'] = AGENT_TOKEN;
  if (extra) Object.keys(extra).forEach(function(k){ h[k] = extra[k]; });
  return h;
}
// 워커에 쓸 수 있는가 — 토큰이 없으면 예전 조건(URL + R2_API_KEY) 그대로
function workerAuthOk(){ return !!(CFG.R2_WORKER_URL && (_keyOrEmpty(CFG.R2_API_KEY) || AGENT_TOKEN)); }

// ── (v12) 상태 메타 확장 — 전부 선택 필드라 v11 로 되돌려도 무시될 뿐 안전 ──
//  va: Videos 폴더 파일 경로 → [붙인 샷, 시각] (재시작 뒤에도 남의 샷 파일 재사용 방지)
//  hb: 하트비트용 최근 신호 {shot:{bay:ms}, up:{bay:ms}} · restarts · recoveredTotal · newestTmMt(트랙맨 최신 파일)
var _hbMeta = (_stateMeta.hb && typeof _stateMeta.hb === 'object') ? _stateMeta.hb : {};
if (!_hbMeta.shot || typeof _hbMeta.shot !== 'object') _hbMeta.shot = {};
if (!_hbMeta.up || typeof _hbMeta.up !== 'object') _hbMeta.up = {};
_stateMeta.hb = _hbMeta;
var _newestTmMt = Math.max(+_stateMeta.newestTmMt || 0, +_stateMeta.lastSeenMtime || 0);
var _startedAt = Date.now();
var _lastScanAt = 0;
var _recoveredJobs = 0;
var _lastActivityAt = Date.now();   // 마지막으로 레슨 ON·샷 파일·원본 요청을 본 시각 (시작 직후 2시간은 한가함 아님)
function _isIdle(){ return CFG.idleBackoff !== false && Date.now() - _lastActivityAt > IDLE_MS; }

// ── TrackMan iO "timed_out" stmf 폴더 자동 감시 ────────────────────────────
// 2026-07-21 카메라 설치 후 TPS가 vision 메시지를 기다리다 시간초과로 측정 stmf를
// 이 폴더에 버리기 시작 → Data 폴더에 ftmf가 안 생기는 고장. 그 버려진 stmf 안에
// 측정값·선택클럽(SessionState)이 그대로 있어, 이 폴더도 감시해 샷을 살려낸다.
// (TrackMan 정상화 시 Data 폴더 ftmf가 부활하면 자동으로 그쪽도 함께 처리된다)
(function autoAddTmfsWatch(){
  try {
    var candidates = [
      'C:\\ProgramData\\TrackMan\\TrackMan iO\\data\\tracking\\tmfs',
      process.env.ProgramData ? path.join(process.env.ProgramData, 'TrackMan', 'TrackMan iO', 'data', 'tracking', 'tmfs') : null
    ].filter(Boolean);
    if (!Array.isArray(CFG.watchDirs)) CFG.watchDirs = CFG.watchDir ? [CFG.watchDir] : [];
    candidates.forEach(function(dir){
      try {
        if (fs.existsSync(dir) && CFG.watchDirs.indexOf(dir) === -1) CFG.watchDirs.push(dir);
      } catch (e) {}
    });
  } catch (e) {}
})();

// 로그 시각 — 한국시간(KST) 표기. (기존 UTC 'Z' 표기가 "시간이 안 맞다"는 혼란을 유발)
function kstNow(){
  try { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }) + ' KST'; }
  catch (e) { return new Date(Date.now() + 9*3600*1000).toISOString().replace('T',' ').slice(0,19) + ' KST'; }
}
function log(msg){
  var line = '[' + kstNow() + '] ' + msg;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
  if (CFG.verbose) console.log(line);
}
function say(msg){ // verbose 무관 항상 콘솔 + 로그
  var line = '[' + kstNow() + '] ' + msg;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
  console.log(line);
}
function saveState(){
  try {
    // 처리이력 무한 증가 방지 — 최근 20000건만 유지(오래된 것부터 정리). 원자적 저장.
    // (before-start 는 processed 에 안 들어오므로 여기 쌓이는 건 실제 전송/잡음 스킵뿐.
    //  상한을 크게 둬서 최근 샷 기록이 축출돼 재전송되는 일이 없게 한다)
    var keys = Object.keys(processed);
    if (keys.length > 20000){
      var arr = keys.map(function(k){ return [k, (processed[k] && processed[k].t) || 0]; });
      arr.sort(function(a,b){ return a[1]-b[1]; });
      for (var i=0;i<arr.length-20000;i++){ delete processed[arr[i][0]]; }
    }
    var tmp = STATE_FILE + '.tmp';
    var out = Object.assign({ __meta: _stateMeta }, processed);
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, STATE_FILE);   // 원자적 교체 — 재부팅 중 손상 방지
  } catch (e) {}
}
// agent.log 회전 — 5MB 넘으면 .1 로 밀고 새로 시작(디스크 가득참 방지)
function rotateLogIfBig(){
  try{ var st=fs.statSync(LOG_FILE); if(st.size > 5*1024*1024){ try{fs.renameSync(LOG_FILE, LOG_FILE+'.1');}catch(e){ fs.writeFileSync(LOG_FILE,''); } } }catch(e){}
}

// ---- (v12) PC 시계 오차 추정 — 서버(Supabase·워커) 응답의 Date 헤더로 ----
// 양수 = PC 가 앞섬. Date 헤더는 초 단위 내림이라 +0.5초 보정, 왕복 5초 넘는 느린 응답은 버림.
// 하트비트(clockSkewSec)와 세션 3시간 판정(PC 시계가 크게 틀려도 서버 시각 기준)에 쓴다.
var _skew = { ms: null, at: 0, n: 0 };
function _noteServerDate(hdr, t0, t1){
  try{
    if (!hdr) return;
    var s = Date.parse(hdr); if (isNaN(s)) return;
    var rtt = t1 - t0; if (!(rtt >= 0 && rtt <= 5000)) return;
    var est = (t0 + t1) / 2 - (s + 500);
    if (_skew.ms == null || Math.abs(est - _skew.ms) > 30000) _skew.ms = est;   // 첫 표본·시계 동기화로 크게 바뀜 → 새 값
    else _skew.ms = _skew.ms * 0.8 + est * 0.2;                                 // 평소엔 완만하게(초 단위 오차 평균)
    _skew.at = Date.now(); _skew.n++;
  }catch(e){}
}

// ---- HTTPS helper (타임아웃 포함 — 네트워크 단절 시 무한 정지 방지) ----
// (v12) 응답 헤더를 받은 뒤 본문 도중 연결이 끊기면(리셋·종료) Node 는 res 에 'aborted'/'close' 만 내고 'end' 도
// req 'error' 도 내지 않는다 — 예전엔 그대로 영원히 기다렸다(소켓 유휴 타임아웃도 더는 안 걸림). 이제 'aborted'·
// 'error'·완료 전 'close' 는 실패로 끝내고, 무엇이 와도 (제한시간+5초) 안에는 반드시 끝나는 최종 시한을 둔다.
// 정상 응답(end)은 예전과 똑같이 처리한다.
var HTTP_HARD_EXTRA_MS = 5000;
function httpRequest(urlStr, opts, body){
  return new Promise(function(resolve, reject){
    var done = false, hard = null, req = null;
    var TIMEOUT = (opts.timeoutMs || 30000);
    function fin(err, val){
      if (done) return;
      done = true;
      if (hard) clearTimeout(hard);
      if (err){ try{ if (req) req.destroy(); }catch(_){} reject(err); }
      else resolve(val);
    }
    try{
      var u = new URL(urlStr);
      var t0 = Date.now();
      req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET',
        headers: opts.headers || {}, port: 443
      }, function(res){
        try{ _noteServerDate(res.headers && res.headers.date, t0, Date.now()); }catch(_){}
        var chunks = [];
        res.on('data', function(c){ chunks.push(c); });
        res.on('end', function(){ fin(null, { status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers || {} }); });
        res.on('aborted', function(){ fin(new Error('응답 도중 연결 끊김')); });
        res.on('error', function(e){ fin(e || new Error('응답 오류')); });
        res.on('close', function(){ if (!res.complete) fin(new Error('응답이 끝나기 전에 연결 닫힘')); });
      });
      req.setTimeout(TIMEOUT, function(){ req.destroy(new Error('timeout '+TIMEOUT+'ms')); });
      req.on('error', function(e){ fin(e || new Error('요청 오류')); });
      hard = setTimeout(function(){ fin(new Error('최종 시한 초과 ' + (TIMEOUT + HTTP_HARD_EXTRA_MS) + 'ms')); }, TIMEOUT + HTTP_HARD_EXTRA_MS);
      if (hard.unref) hard.unref();
      if (body) req.write(body);
      req.end();
    }catch(e){ fin(e); }
  });
}

// ---- Supabase: shot_events insert ----
// useDbProxy=true 면 워커 /db 경유(RLS 읽기전용 전환 후). 아니면 anon 직접(하위호환).
async function pushShot(shot){
  if (CFG.useDbProxy && workerAuthOk()){
    var purl = CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/db';
    var pres = await httpRequest(purl, { method:'POST', headers: workerHeaders({ 'Content-Type':'application/json' }) },
      JSON.stringify({ op:'upsert', table:'shot_events', rows:[shot] }));
    if (pres.status >= 200 && pres.status < 300) return true;
    log('  ! DB프록시 insert 실패 ' + pres.status + ' ' + pres.body.toString().slice(0,200));
    return false;
  }
  var url = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events';
  var res = await httpRequest(url, {
    method: 'POST',
    headers: sbHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    })
  }, JSON.stringify(shot));
  if (res.status >= 200 && res.status < 300) return true;
  log('  ! Supabase insert 실패 ' + res.status + ' ' + res.body.toString().slice(0,200));
  return false;
}

// ---- 샷 행에 영상 키를 나중에 붙이기 (데이터 먼저 전송 구조) ----
// 현재 행 data 를 읽어와 병합 — 그 사이 앱이 저장한 보관 플래그(_kept) 등을 덮어쓰지 않게.
// (v12) 조회 실패({ok:false})와 '행이 없음'(앱에서 삭제됨, {ok:true,row:null})을 구분한다.
async function fetchShotRow(shotId, timeoutMs){
  try{
    var url = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events?id=eq.' + encodeURIComponent(shotId) + '&select=data,video_r2_key';
    var res = await httpRequest(url, { method:'GET', headers: sbHeaders(), timeoutMs: timeoutMs });
    if (res.status >= 200 && res.status < 300){
      var j = JSON.parse(res.body.toString());
      if (Array.isArray(j)) return { ok:true, row: j[0] || null };
    }
  }catch(e){}
  return { ok:false, row:null };
}
// (v12) 같은 샷에 대한 행 읽고-고쳐-쓰기(영상 연결·재전송 병합·원본 요청 기록)를 이 프로세스 안에서 한 줄로 세운다.
// 영상 작업(백그라운드)과 스캔(재전송)이 동시에 같은 행을 고치면 한쪽이 다른 쪽 변경을 덮어써 키가 사라질 수 있다.
var _shotLocks = {};
var LOCK_WAIT_GAVE_UP = { lockWaitGaveUp: true };
// waitMs(선택): 앞선 작업이 그만큼 안에 잠금을 놓지 않으면 기다리지 않고 LOCK_WAIT_GAVE_UP 을 돌려준다.
// 포기한 작업은 나중에 차례가 와도 실행하지 않는다(다음 재시도와 겹치지 않게). 이미 시작한 작업은 끝까지 기다린다.
function withShotLock(id, fn, waitMs){
  var prev = _shotLocks[id] || Promise.resolve();
  var st = { started:false, gaveUp:false };
  var p = prev.then(function(){ if (st.gaveUp) return LOCK_WAIT_GAVE_UP; st.started = true; return fn(); });
  var tail = p.then(function(){}, function(){});
  _shotLocks[id] = tail;
  tail.then(function(){ if (_shotLocks[id] === tail) delete _shotLocks[id]; });
  if (!(waitMs > 0)) return p;
  return new Promise(function(resolve, reject){
    var t = setTimeout(function(){ if (!st.started){ st.gaveUp = true; resolve(LOCK_WAIT_GAVE_UP); } }, waitMs);
    p.then(function(v){ clearTimeout(t); resolve(v); }, function(e){ clearTimeout(t); reject(e); });
  });
}
// (v12) 스캔(샷 수집)이 같은 샷의 잠금을 기다리는 최대 시간 — 영상 연결은 보통 1초 안에 끝난다.
// 그보다 오래 잡혀 있으면(서버 응답 멈춤) 보강 재전송은 다음 주기로 미루고 새 샷 수집을 계속한다.
var REPUSH_LOCK_WAIT_MS = 5000;
// 행 값 갱신(PATCH 또는 워커 /db update) — 실패 시 failMsg 가 있으면 예전과 같은 문구로 로그
async function _patchShotValues(shotId, values, failMsg){
  if (CFG.useDbProxy && workerAuthOk()){
    var purl = CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/db';
    var pres = await httpRequest(purl, { method:'POST', headers: workerHeaders({ 'Content-Type':'application/json' }) },
      JSON.stringify({ op:'update', table:'shot_events', values:values, filters:[{col:'id',op:'eq',val:shotId}] }));
    if (pres.status >= 200 && pres.status < 300) return true;
    if (failMsg) log('  ! ' + failMsg + ' ' + pres.status + ' ' + pres.body.toString().slice(0,150));
    return false;
  }
  var url2 = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events?id=eq.' + encodeURIComponent(shotId);
  var res2 = await httpRequest(url2, { method:'PATCH', headers: sbHeaders({
    'Content-Type':'application/json', 'Prefer':'return=minimal' }) }, JSON.stringify(values));
  if (res2.status >= 200 && res2.status < 300) return true;
  if (failMsg) log('  ! ' + failMsg + '(직접) ' + res2.status);
  return false;
}
// ---- 활성(타석 레슨) 세션이 있는 베이 목록 캐시 ----
// "타석 레슨"을 켜면 앱이 active_sessions 에 행을 만든다. 레슨이 켜진 베이의 샷만
// 저장 → 연습 샷은 아예 안 들어옴(과금·클러터 방지). anon GET(읽기전용)으로 주기적 갱신.
// (v12) started_at 도 읽어 SESSION_MAX_MS(기본 4시간) 넘게 켜진 세션은 '꺼짐'으로 본다 — 레슨 뒤 [종료]를
// 안 누르면 그 타석의 연습 타구가 하루 종일 저장·업로드되던 문제. 경과 시간은 서버 시각(Date 헤더) 기준.
var _activeBays = {};       // bay_id → true (활성 세션 있는 베이 — v12: 시작 후 상한 이내만)
var _activeBaysAt = 0;      // 마지막 갱신 시각
var _noSession = {};        // fname → 세션 없어 대기한 횟수(세션이 곧 생길 수 있어 잠시 재확인)
var _noSessionFirst = {};   // (v12) fname → 처음 '레슨 꺼짐'으로 본 시각
var _expiredBays = {};      // (v12) bay_id → true (세션 행은 있지만 상한 초과 → 꺼짐 취급)
var _expiredLogged = {};    // (v12) bay_id → 로그를 남긴 세션의 started_at (세션마다 1번만)
var _sessSelectFallback = false;   // (v12) started_at 조회가 거부되면(스키마 차이) 예전처럼 bay_id 만
var _refreshP = null;       // (v12) 진행 중인 조회를 함께 기다림(중복 요청 방지)
var _forceRefreshAt = {};   // (v12) bay_id → 마지막 즉시 재확인 시각 (타석당 3초에 1번)
var _refreshFailAt = 0;     // (v12) 마지막 조회 실패 시각 — 막 실패했으면 즉시 재확인을 건너뜀(스캔 지연 방지)
function refreshActiveBays(timeoutMs){
  if (_refreshP) return _refreshP;
  _refreshP = _refreshActiveBays(timeoutMs || 12000).then(
    function(v){ _refreshP = null; if (!v) _refreshFailAt = Date.now(); return v; },
    function(){ _refreshP = null; _refreshFailAt = Date.now(); return false; });
  return _refreshP;
}
async function _refreshActiveBays(timeoutMs){
  try{
    var base = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/active_sessions?select=';
    var res = await httpRequest(base + (_sessSelectFallback ? 'bay_id' : 'bay_id,started_at'), { method:'GET', headers: sbHeaders(), timeoutMs: timeoutMs });
    if (res.status === 400 && !_sessSelectFallback){
      // started_at 열을 못 읽는 DB(스키마 차이) → 상한 없이 예전 조회로 (샷 수집이 멈추는 것보다 낫다).
      // 오류가 started_at 때문일 때만 계속 그렇게 하고, 그 밖의 400 은 이번 한 번만 예전 조회로 대신한다.
      var why = ''; try{ why = res.body.toString().slice(0, 300); }catch(_){}
      if (/started_at|42703/.test(why)){
        _sessSelectFallback = true;
        log('  ! active_sessions started_at 조회 거부(' + res.status + ') — 세션 시간 상한 없이 예전 방식으로 확인');
      }
      res = await httpRequest(base + 'bay_id', { method:'GET', headers: sbHeaders(), timeoutMs: timeoutMs });
    }
    if (res.status >= 200 && res.status < 300){
      var rows = JSON.parse(res.body.toString()); var m = {}, ex = {};
      var nowSrv = Date.now() - (_skew.ms || 0);   // 서버 시각 추정 (PC 시계가 틀려도 경과 시간이 맞게)
      (Array.isArray(rows) ? rows : []).forEach(function(r){
        if (!r || !r.bay_id) return;
        var st = Date.parse(r.started_at || '');
        if (SESSION_MAX_MS > 0 && !isNaN(st) && nowSrv - st > SESSION_MAX_MS){
          ex[r.bay_id] = true;
          if (_expiredLogged[r.bay_id] !== r.started_at){
            _expiredLogged[r.bay_id] = r.started_at;
            log('⏱ 타석 레슨 ' + r.bay_id + ' — 세션이 켜진 지 ' + Math.round((nowSrv - st)/60000) + '분(상한 ' + (SESSION_MAX_MS/3600000) + '시간) → 꺼진 것으로 보고 샷·영상 저장 중지. 앱에서 [종료] 후 다시 시작하면 재개');
          }
          return;
        }
        m[r.bay_id] = true;
      });
      _activeBays = m; _expiredBays = ex; _activeBaysAt = Date.now();
      if (myBays().some(function(b){ return m[b]; })) _lastActivityAt = Date.now();
      return true;
    }
  }catch(e){}
  return false;
}
// (v12/B5) 새 샷 파일이 왔는데 그 타석이 '레슨 꺼짐'으로 보이면 그 자리에서 1번 더 확인 — 타석당 3초에 1번까지.
// (예전엔 주기 갱신만 믿어서, 서버 확인이 밀리면 막 시작한 레슨의 첫 샷이 60초 뒤 '연습 샷'으로 버려질 수 있었다)
// 서버 확인이 30초 안에 실패했으면 기다리지 않는다 — 장애 중 밀린 파일마다 시간초과를 기다려 스캔이 멈추지 않게
// (그동안은 '꺼짐' 횟수도 세지 않으므로 샷이 버려지지 않는다). 즉시 확인은 5초 제한.
async function refreshActiveBaysNow(bayId){
  if (Date.now() - (_forceRefreshAt[bayId] || 0) < 3000) return false;
  if (Date.now() - _refreshFailAt < 30000) return false;
  _forceRefreshAt[bayId] = Date.now();
  return await refreshActiveBays(5000);
}
// (v12/A2) 행이 참조하는 영상 키들 / 이 샷 이름으로 된 타석 영상 키인지 (안전장치: 남의 샷 파일은 절대 안 지움)
function _rowVideoKeys(row){
  var out = [];
  if (!row) return out;
  var d = row.data || {};
  [row.video_r2_key, d.videoMp4R2Key, d.videoDL, d.videoFO, d.videoClub].forEach(function(k){
    if (typeof k === 'string' && k && out.indexOf(k) === -1) out.push(k);
  });
  return out;
}
function _ownedVideoKey(key, shotId, mids){
  var m = /^bay[A-Za-z0-9_-]{1,29}\/([^\/]+)$/.exec(key || '');
  if (!m) return false;
  var pre = [String(shotId || ''), String(shotId || '').replace(/^tm_/, '')].concat(mids || [])
    .filter(function(p){ return p && String(p).length >= 4; });
  return pre.some(function(p){ return m[1].indexOf(String(p) + '_') === 0; });
}
// (v12) videoKey === undefined 이면 video_r2_key 는 건드리지 않는다(Videos 폴더 작업 — 같은 행의 내장 영상 원본 mkv 키를
//       지워 고아·삭제 대상으로 만들지 않게). mainIfNone: mp4Key 가 없을 때, 행에 대표 영상이 아직 없을 때만 대표로 쓸 키
//       (클럽 — 이미 있는 측면 슬롯 대표(볼 카메라·내장 영상)를 밀어내 '대체됨'으로 지우지 않게).
async function attachShotVideo(shotId, videoKey, mp4Key, fallbackData, extra, mainIfNone){
  var res = await withShotLock(shotId, async function(){
    var rr = await fetchShotRow(shotId);
    if (rr.ok && !rr.row){ log('  ! 영상 연결 건너뜀: 샷 행이 없음(앱에서 삭제됨) (' + shotId + ')'); return { ok:false }; }
    var cur = (rr.row && rr.row.data) || null;
    if (!cur && !fallbackData) { log('  ! 영상 연결 보류: 서버 data 조회 실패 + 대체 data 없음 (' + shotId + ')'); return { ok:false }; }
    var data = Object.assign({}, fallbackData, cur || {});   // 서버 최신 data 우선(그 사이 앱 변경 보존)
    delete data._videoPending;                               // 업로드 종료(성공/실패) → 진행 표시 해제
    var rawNow = (videoKey === undefined) ? ((rr.row && rr.row.video_r2_key) || null) : videoKey;
    if (mp4Key) data.videoMp4R2Key = mp4Key;
    else if (mainIfNone && !data.videoMp4R2Key && !rawNow) data.videoMp4R2Key = mainIfNone;
    if (extra && typeof extra === 'object'){
      Object.keys(extra).forEach(function(k){
        if (extra[k]==null) return;
        // 앵글별 진단은 병합 — 보충 패스(정면이 늦게 도착)가 앞서 기록한 측면 진단을 지우지 않게
        if (k === '_vidMeta' && data._vidMeta && typeof data._vidMeta === 'object'){ data._vidMeta = Object.assign({}, data._vidMeta, extra[k]); return; }
        data[k]=extra[k];
      });
    }
    var values = (videoKey === undefined) ? { data: data } : { video_r2_key: videoKey, data: data };
    if (!(await _patchShotValues(shotId, values, '영상키 업데이트 실패'))) return { ok:false };
    // (v12/A2) 이번 갱신으로 행이 더는 참조하지 않게 된 옛 영상 키 = 대체된 파일 → 아래에서 R2 에서 지운다
    var gone = [];
    if (rr.row){
      var now = _rowVideoKeys({ video_r2_key: rawNow, data: data });
      var mids = [(rr.row.data || {}).measurementId, data.measurementId];
      _rowVideoKeys(rr.row).forEach(function(k){ if (now.indexOf(k) === -1 && _ownedVideoKey(k, shotId, mids)) gone.push(k); });
    }
    return { ok:true, gone: gone };
  });
  // 새 업로드·행 갱신이 성공한 뒤에만 지운다 (실패해도 샷·영상 연결엔 영향 없음 — 파일만 남음)
  if (res && res.ok && res.gone && res.gone.length){
    for (var i = 0; i < res.gone.length; i++){
      var dok = false; try{ dok = await deleteVideo(res.gone[i]); }catch(e){}
      log(dok ? ('  🗑 대체된 옛 영상 삭제 ← ' + res.gone[i]) : ('  ! 대체된 옛 영상 삭제 실패(파일만 남음) ' + res.gone[i]));
    }
  }
  return !!(res && res.ok);
}

// ---- 행 data 부분 갱신 (video_r2_key 는 건드리지 않음) — 원본 영상 요청 결과 기록용 ----
// (v12) 현재 data 조회에 실패하면 쓰지 않는다 — 예전엔 빈 data 에 요청 결과만 넣어 덮어써
// 측정값·영상 키가 통째로 사라질 수 있었다. (실패 → 10분 뒤 원본 요청 재처리)
async function patchShotData(shotId, extra){
  return withShotLock(shotId, async function(){
    var rr = await fetchShotRow(shotId);
    if (!rr.ok || !rr.row) return false;
    var data = Object.assign({}, rr.row.data || {});
    Object.keys(extra||{}).forEach(function(k){ if (extra[k] === null) delete data[k]; else data[k] = extra[k]; });
    return await _patchShotValues(shotId, { data: data }, null);
  });
}
// (v12/A2) 같은 샷의 '더 완전한 측정' 재전송 — 예전엔 행 전체를 upsert 로 다시 써서 그 사이 붙은 영상 키·
// _kept(보관)·회원 배정을 지울 수 있었다(영상은 R2 에 고아로 남음). 이제 서버의 현재 data 에 새 측정값만 덮어쓴다.
// 반환: 'ok' | 'fail'(네트워크 → 다음 주기 재시도) | 'gone'(앱에서 행 삭제 → 되살리지 않음)
//       | 'busy'(같은 샷의 영상 연결이 REPUSH_LOCK_WAIT_MS 넘게 잠금을 잡고 있음 → 다음 주기 재시도, 스캔은 계속)
async function repushShotData(shotId, newData, setPending){
  var r = await withShotLock(shotId, async function(){
    var rr = await fetchShotRow(shotId);
    if (!rr.ok) return 'fail';
    if (!rr.row) return 'gone';
    var curData = rr.row.data || {};
    var data = Object.assign({}, curData, newData);
    delete data._videoPending;
    if (curData._videoPending != null) data._videoPending = curData._videoPending;   // 진행 표시는 영상 작업이 관리
    else if (setPending) data._videoPending = 1;                                     // 이번에 영상 작업을 새로 만든 경우만
    return (await _patchShotValues(shotId, { data: data }, 'Supabase 재전송(병합) 실패')) ? 'ok' : 'fail';
  }, REPUSH_LOCK_WAIT_MS);
  return (r === LOCK_WAIT_GAVE_UP) ? 'busy' : r;
}

// ============ 원본 영상 요청 처리 (앱의 [원본 요청] → 이 PC 의 고화질 원본을 그대로 업로드) ============
// 앱(담당자·관리자 전용 패널)이 행에 data._origReq=1 을 남기면, 이 타석 PC 가 20초마다 찾아
// 트랙맨이 남긴 원본(아이폰 측면/정면 .mov, 클럽 딜리버리, ftmf 내장캠 scene.mkv)을 변환 없이
// R2 의 orig/<bay>/<shotId>_<앵글>.<확장자> 로 올리고, data.orig={dl,fo,club,scene,at,bytes} 를 기록한다.
// 원본은 앱이 7일 뒤 자동 삭제. 한 파일 상한 95MB — 워커 경유 업로드는 Cloudflare 요청 본문 한도(100MB)에
// 걸리므로 그보다 큰 파일은 건너뛰고 사유를 기록한다 (아이폰 슬로모션 장초 클립 등).
var ORIG_MAX_BYTES = 95 * 1024 * 1024;
var _origLastPoll = 0, _origBusy = false, _origDone = {};
function myBays(){
  var out = [];
  var bm = (CFG.bayMap && typeof CFG.bayMap === 'object') ? CFG.bayMap : {};
  Object.keys(bm).forEach(function(k){ if (bm[k] && out.indexOf(bm[k])===-1) out.push(bm[k]); });
  var d = CFG.defaultBay || 'bay3'; if (out.indexOf(d)===-1) out.push(d);
  return out;
}
// ftmf 원본 경로: processed 에 shotId 로 기록된 파일명을 감시 폴더에서 다시 찾는다
function findFtmfForShot(shotId){
  var names = Object.keys(processed);
  for (var i = 0; i < names.length; i++){
    var p = processed[names[i]];
    if (!p || p.id !== shotId) continue;
    var dirs = Array.isArray(CFG.watchDirs) ? CFG.watchDirs : [CFG.watchDir];
    for (var d = 0; d < dirs.length; d++){
      if (!dirs[d]) continue;
      var files = listFtmfFiles(dirs[d], 2);
      for (var f = 0; f < files.length; f++){ if (path.basename(files[f]) === names[i]) return files[f]; }
    }
  }
  return null;
}
async function processOrigRequest(row){
  var shotId = row.id, bayId = row.bay_id || CFG.defaultBay || 'bay3';
  var data = row.data || {};
  var evMs = Date.parse(data.measuredAt || row.ts) || 0;
  var found = {}, bytes = {}, skipped = [];
  // 1) Videos 폴더 원본 (아이폰 측면/정면, 클럽 딜리버리, 볼 카메라)
  var vids = findShotVideos(evMs, shotId);
  var cats = [['dl','dl'],['fo','fo'],['club','club']];
  if (!vids.dl && vids.ball) cats.push(['ball','scene']);   // 측면이 없으면 볼 카메라를 내장캠 슬롯에
  for (var i = 0; i < cats.length; i++){
    var src = vids[cats[i][0]], angle = cats[i][1];
    if (!src || src._taken) continue;
    try{
      var st = fs.statSync(src.fp);
      if (st.size > ORIG_MAX_BYTES){ skipped.push(angle + ' ' + (st.size/1e6).toFixed(0) + 'MB(상한 초과)'); continue; }
      var ext = ((src.name.match(/\.(mkv|mov|mp4)$/i)||[])[1]||'mp4').toLowerCase();
      var ct = ext==='mov' ? 'video/quicktime' : (ext==='mkv' ? 'video/x-matroska' : 'video/mp4');
      var key = 'orig/' + bayId + '/' + shotId + '_' + angle + '.' + ext;
      var buf = fs.readFileSync(src.fp);
      if (await uploadVideo(key, buf, ct)){ found[angle] = key; bytes[angle] = buf.length; log('  원본 업로드 ' + angle + ' ' + (buf.length/1e6).toFixed(1) + 'MB ← ' + src.name); }
      else skipped.push(angle + ' 업로드 실패');
    }catch(e){ skipped.push(angle + ' ' + (e.message||e)); }
  }
  // 2) ftmf 내장캠 원본(scene.mkv) — 아직 내장캠 슬롯이 비었을 때
  if (!found.scene){
    var fp = findFtmfForShot(shotId);
    if (fp){
      try{
        var fbuf = fs.readFileSync(fp);
        var outer = require('./ftmf-parser.js').readZipEntries(fbuf);
        var sceneName = require('./ftmf-parser.js').findEntry(outer, '_scene.mkv');
        if (sceneName){
          var vbuf = require('./ftmf-parser.js').extractEntry(fbuf, outer[sceneName]);
          if (vbuf.length > ORIG_MAX_BYTES) skipped.push('내장캠 ' + (vbuf.length/1e6).toFixed(0) + 'MB(상한 초과)');
          else {
            var skey = 'orig/' + bayId + '/' + shotId + '_scene.mkv';
            if (await uploadVideo(skey, vbuf, 'video/x-matroska')){ found.scene = skey; bytes.scene = vbuf.length; log('  원본 업로드 내장캠 ' + (vbuf.length/1e6).toFixed(1) + 'MB ← ' + path.basename(fp)); }
            else skipped.push('내장캠 업로드 실패');
          }
        }
      }catch(e){ skipped.push('내장캠 ' + (e.message||e)); }
    }
  }
  var any = Object.keys(found).length > 0;
  var extra = { _origReq: 0, _agentVer: AGENT_VERSION };
  if (any) { extra.orig = Object.assign({ at: new Date().toISOString(), bytes: bytes }, found); extra._origErr = null; }
  else extra._origErr = 'PC 에서 원본 파일을 찾지 못함' + (skipped.length ? ' (' + skipped.join(', ') + ')' : '') ;
  if (any && skipped.length) extra._origNote = skipped.join(', ');
  var ok = await patchShotData(shotId, extra);
  log((any ? '✓ 원본 요청 처리 ' : '! 원본 요청 실패 ') + shotId + ' → ' + Object.keys(found).join(',') + (skipped.length ? ' / 건너뜀: ' + skipped.join(', ') : '') + (ok ? '' : ' (행 갱신 실패)'));
  _origDone[shotId] = Date.now();
}
async function origRequestTick(){
  // (v12/B5) 2시간 동안 레슨·샷이 없으면(한가함) 2분 간격으로 — 앱 안내 '보통 1~3분' 안. 평소엔 20초.
  if (_origBusy || Date.now() - _origLastPoll < (_isIdle() ? 120000 : 20000)) return;
  _origLastPoll = Date.now();
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return;
  var bays = myBays().map(encodeURIComponent).join(',');
  var url = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events?select=id,bay_id,ts,data&bay_id=in.(' + bays + ')&data-%3E%3E_origReq=eq.1&order=ts.desc&limit=5';
  var res;
  try{ res = await httpRequest(url, { method:'GET', headers: sbHeaders(), timeoutMs:12000 }); }
  catch(e){ return; }
  if (!res || res.status !== 200) return;
  var rows; try{ rows = JSON.parse(res.body.toString()); }catch(e){ return; }
  if (!Array.isArray(rows) || !rows.length) return;
  var row = null;
  for (var i = 0; i < rows.length; i++){ var r = rows[i]; if (!_origDone[r.id] || Date.now() - _origDone[r.id] > 10*60000){ row = r; break; } }
  if (!row) return;
  _lastActivityAt = Date.now();
  _origBusy = true;
  log('🎞 원본 요청 수신 ' + row.id + ' (' + row.bay_id + ')');
  processOrigRequest(row)
    .catch(function(e){ log('원본 요청 처리 오류 ' + row.id + ': ' + (e&&e.message||e)); _origDone[row.id] = Date.now(); })
    .then(function(){ _origBusy = false; _watchdogTick(); });
}

// ---- R2: 영상 업로드 (워커 PUT /{key}) ----
// MKV → MP4 변환 (옵션, ffmpegPath 가 설정됐을 때만).
// 빠른 컨테이너 리먹스 시도 → 실패하면 트랜스코드. PC 부하 최소화 위해 백그라운드 우선순위 가능.
async function convertMkvToMp4(mkvBuf, ffmpegPath){
  var os = require('os'); var path = require('path'); var fs = require('fs');
  var { spawn } = require('child_process');
  var tmpIn  = path.join(os.tmpdir(), 'gpt_'+Date.now()+'_'+Math.floor(Math.random()*1e6)+'.mkv');
  var tmpOut = tmpIn.replace(/\.mkv$/,'.mp4');
  fs.writeFileSync(tmpIn, mkvBuf);
  function run(args){
    return new Promise(function(resolve){
      var p = spawn(ffmpegPath, args, { windowsHide:true });
      // TPS 에 항상 양보 — 보통보다 낮음(10). 재인코딩이 측정 기록을 잘리게 하지 않게.
      try{ require('os').setPriority(p.pid, 10); }catch(_){}
      var err='';
      // 하드 타임아웃 — ffmpeg 이 멈추면 죽인다. 시간제한이 없으면 에이전트 전체가
      // 살아있는 채로 영원히 정지(자동재시작 루프도 프로세스가 죽어야만 작동).
      var killed = false;
      var killTimer = setTimeout(function(){ killed = true; try{ p.kill(); }catch(_){} }, 150000);
      p.stderr.on('data', function(d){ err += d.toString(); });
      p.on('error', function(){ clearTimeout(killTimer); resolve({code:-1, err:err}); });
      p.on('close', function(code){ clearTimeout(killTimer); resolve({code: killed ? -2 : code, err: killed ? 'ffmpeg 타임아웃(150초) — 강제 종료' : err}); });
    });
  }
  try{
    // ⚠️ 리먹스(-c copy) 금지 — 트랙맨 내장 카메라 mkv 는 H.264 가 아닌 코덱이 흔한데,
    // mp4 컨테이너가 그런 코덱도 받아줘서 리먹스가 "성공"해 버리면 아이폰에서 재생
    // 불가한 _scene.mp4 가 올라간다 (2026-08 bay2 "파일은 있는데 재생 안 됨" 사고).
    // 항상 H.264(yuv420p) 재인코딩 + 해상도 캡(폰 시청용 1280) — v9.60/63 낱개 파일
    // 경로와 동일 규칙을 ftmf 내장 scene.mkv 경로에도 적용.
    var r = await run(['-y','-threads','4','-i', tmpIn,
      '-vf',"scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      '-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-threads','4',
      '-c:a','aac','-b:a','128k','-movflags','+faststart', tmpOut]);
    if (r.code !== 0 || !fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 1024){
      // 폴백: 오디오 스트림이 없거나 이상한 파일 — 영상만 재인코딩
      r = await run(['-y','-threads','4','-i', tmpIn,
        '-vf',"scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        '-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-threads','4','-an','-movflags','+faststart', tmpOut]);
      if (r.code !== 0) throw new Error('ffmpeg 종료 '+r.code+': '+r.err.slice(0,200));
    }
    var out = fs.readFileSync(tmpOut);
    return out;
  } finally {
    try{ fs.unlinkSync(tmpIn); }catch(_){}
    try{ fs.unlinkSync(tmpOut); }catch(_){}
  }
}

// ffmpeg -i 출력(stderr)에서 길이·프레임레이트·오디오·코덱을 뽑는다 — 속도 보정 판단·진단 기록용
function probeVideo(pr){
  var err = (pr && pr.err) || '';
  var dm = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  var dur = dm ? ((+dm[1])*3600 + (+dm[2])*60 + parseFloat(dm[3])) : 0;
  var vs = /Stream #\d+:\d+.*Video:\s*([a-zA-Z0-9_]+)[^\n]*/.exec(err);
  var vline = vs ? vs[0] : '';
  var fm = /(\d+(?:\.\d+)?)\s*fps/.exec(vline);
  var tm = /(\d+(?:\.\d+)?)\s*tbr/.exec(vline);
  return {
    dur: Math.round(dur*10)/10,
    fps: fm ? parseFloat(fm[1]) : 0,
    tbr: tm ? parseFloat(tm[1]) : 0,
    audio: /Stream #\d+:\d+.*Audio:/.test(err),
    vcodec: vs ? vs[1].toLowerCase() : '',
    pix420: /yuvj?420p/.test(vline)
  };
}
// 파일별 최근 변환 진단 (inputPath → {dur,fps,sp,...}) — up() 이 행 data._vidMeta 로 남긴다
var _convMeta = {};
// ffmpeg -i 만 실행해 stderr(정보 출력)를 돌려준다 — 변환 없이 길이·fps 확인용 (짝 배율 유도)
function runProbe(fp){
  return new Promise(function(resolve){
    try{
      var p = require('child_process').spawn(CFG.ffmpegPath, ['-i', fp], { windowsHide:true });
      var err = ''; var t = setTimeout(function(){ try{ p.kill(); }catch(_){} }, 20000);
      p.stderr.on('data', function(d){ err += d.toString(); });
      p.on('error', function(){ clearTimeout(t); resolve({ code:-1, err:err }); });
      p.on('close', function(code){ clearTimeout(t); resolve({ code:code, err:err }); });
    }catch(e){ resolve({ code:-1, err:'' }); }
  });
}
// 두 아이폰(측면·정면)이 같은 샷을 찍었으면 실시간 구간이 같다 → 파일 길이 비율이 곧 늘어짐 배율 비율.
// 측면의 "실제 적용" 배율(게이트에 걸려 보정 안 하면 1)을 기준으로 정면 배율을 유도해
// 아이폰이 실제로 만들 수 있는 {1,2,4,8} 중 가장 가까운 값으로 맞춘다.
// 비율이 어느 값에도 ±25% 안에 안 들면(두 폰이 다른 구간을 찍었거나 파일이 잘림) null → 설정값 사용.
// (2026-09 3번룸: 측면은 정상인데 정면만 느림 — 두 폰의 슬로모션 fps 가 달랐던 사고)
var PAIR_CANDIDATES = [1,2,4,8];
var PAIR_TOLERANCE = Math.log(1.25);
function pairSpeedup(baseSp, baseDur, otherDur){
  if (!baseSp || !baseDur || !otherDur) return null;
  var raw = baseSp * otherDur / baseDur;
  var best = 1, bestD = Infinity;
  PAIR_CANDIDATES.forEach(function(c){ var d = Math.abs(Math.log(raw/c)); if (d < bestD){ bestD = d; best = c; } });
  return bestD <= PAIR_TOLERANCE ? best : null;
}

// 임의 영상 파일(.mkv/.mov 등) → 웹 재생용 mp4(H.264) 버퍼. 리먹스 우선, 실패 시 트랜스코드.
// (고장 상태에서 TPS가 Videos 폴더에 낱개로 저장하는 아이폰 .mov / 카메라 .mkv 를 붙이기 위함)
// forceEncode=true 면 리먹스(-c copy)를 건너뛰고 무조건 재인코딩한다.
// 클럽 딜리버리(초고속 카메라) 영상은 픽셀 형식이 4:2:2 등이라 리먹스한 mp4 를
// 아이폰이 재생 못 한다 — 컨테이너만 바꾸면 "파일은 있는데 재생 불가" 상태가 됨.
// 모든 재인코딩에 -pix_fmt yuv420p 강제: 이것이 브라우저/아이폰 호환의 핵심.
// (v12/A8) capBytes>0 이면: 리먹스(원본 그대로 통과) 결과가 그보다 클 때 아래 '2) 트랜스코드'와 같은
// 설정(1280 캡·veryfast·crf24·우선순위 10)으로 다시 줄인다. 9~10월 정면 영상이 원본 그대로(평균 10MB) 올라가
// 저장소의 절반을 차지한 원인. 재인코딩이 실패하거나 더 작아지지 않으면 리먹스본을 그대로 쓴다.
async function convertFileToMp4(inputPath, ffmpegPath, forceEncode, speedup, capBytes){
  var os = require('os'); var path = require('path'); var fs = require('fs');
  var { spawn } = require('child_process');
  var tmpOut = path.join(os.tmpdir(), 'gptv_'+Date.now()+'_'+Math.floor(Math.random()*1e6)+'.mp4');
  function run(args){
    return new Promise(function(resolve){
      var p = spawn(ffmpegPath, args, { windowsHide:true });
      // ⚠️ 핵심: ffmpeg 을 TPS 보다 낮은 우선순위로 — TPS 는 실시간 측정 시스템이라
      // 재인코딩이 CPU 를 독차지하면 샷 측정 결과(Fusion 출력)가 파일에 기록되다
      // 잘리는 사고가 난다 (1번타석에서 실제 발생). '보통보다 낮음(10)'은 TPS 가
      // CPU 를 원하면 항상 양보하면서도, 최저(19)처럼 굶어서 변환이 수 분씩
      // 걸리는 문제는 없다.
      try{ require('os').setPriority(p.pid, 10); }catch(_){}
      var err=''; var killed=false;
      var killTimer = setTimeout(function(){ killed=true; try{ p.kill(); }catch(_){} }, 180000);
      p.stderr.on('data', function(d){ err += d.toString(); });
      p.on('error', function(){ clearTimeout(killTimer); resolve({code:-1, err:err}); });
      p.on('close', function(code){ clearTimeout(killTimer); resolve({code: killed?-2:code, err: killed?'ffmpeg 타임아웃(180초)':err}); });
    });
  }
  function bad(r){ return r.code !== 0 || !fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 1024; }
  var remuxBuf = null;   // (v12/A8) 상한 초과로 다시 줄이기 전의 리먹스본
  try{
    var r = { code: 1, err: '' };
    // ── 슬로모션 속도 보정 — 아이폰이 "슬로 모션" 모드로 찍으면 파일 자체가
    // 4배(120fps)·8배(240fps) 늘어져 저장돼 리포트에서 1배속인데도 느리게 보인다.
    // 업로드 전에 실제 속도로 되돌린다. speedup 은 호출측(up)이 앵글·짝 영상 길이로 정한 배율.
    // 안전장치: (1) 파일이 실시간 타임스탬프의 고프레임(fps≥100)이면 이미 실속도 → 보정 안 함
    //          (2) slowmoMinSec(기본 10초) 미만의 짧은 클립은 실속도 촬영으로 보고 보정 안 함
    var sp = (speedup && speedup > 1.01) ? speedup : 0;
    var meta = probeVideo(await run(['-i', inputPath]));   // ffmpeg -i 는 변환 없이 정보만 출력(비정상 종료가 정상)
    meta.sp = 1;
    _convMeta[inputPath] = meta;
    if (sp){
      var durSec = meta.dur, hasAudio = meta.audio;
      var minSec = (CFG.slowmoMinSec != null ? CFG.slowmoMinSec : 10);
      if (meta.fps >= 100){ sp = 0; try{ log('  속도 보정 생략(실시간 ' + meta.fps + 'fps) ' + path.basename(inputPath)); }catch(_){} }
      else if (!durSec || durSec < minSec){ sp = 0; try{ log('  속도 보정 생략(' + (durSec||0).toFixed(1) + 's < ' + minSec + 's) ' + path.basename(inputPath)); }catch(_){} }
      else {
        // 해상도 캡 — 폰 시청용은 긴 변 1280 이면 충분. 인코딩량이 절반 이하로 줄어
        // 변환·업로드가 크게 빨라진다 (작은 영상은 그대로 — 업스케일 없음).
        var SCALE_VF = "scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2";
        var af = []; var rem = sp;
        while (rem > 2.0001){ af.push('atempo=2'); rem /= 2; }
        if (rem > 1.0001) af.push('atempo=' + (Math.round(rem*100)/100));
        var args = ['-y','-threads','4','-i', inputPath, '-vf','setpts=PTS/'+sp+','+SCALE_VF, '-r','30',
                    '-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-threads','4'];
        if (hasAudio) args = args.concat(['-af', af.join(','), '-c:a','aac','-b:a','128k']);
        else args.push('-an');
        args = args.concat(['-movflags','+faststart', tmpOut]);
        r = await run(args);
        if (!bad(r)){
          meta.sp = sp;
          try{ log('  속도 보정 ×' + sp + ' (' + durSec.toFixed(1) + 's → ' + (durSec/sp).toFixed(1) + 's, ' + (meta.fps||'?') + 'fps) ' + path.basename(inputPath)); }catch(_){}
          return fs.readFileSync(tmpOut);
        }
        try{ log('  속도 보정 실패 → 원래 속도로 변환: ' + (r.err||'').slice(0,120)); }catch(_){}
      }
    }
    if (!forceEncode){
      // ⚠️ 리먹스 전에 반드시 코덱을 확인한다. 확장자(.mov/.mp4)는 코덱을 보장하지 않는다 —
      // HEVC·4:2:2·10bit 원본을 리먹스하면 mp4 가 그것도 받아줘서 "성공"해 버리고,
      // 결과적으로 아이폰에서 재생 불가한 파일이 올라간다 (2026-08 타석 영상 사고와 동종).
      // H.264 + yuv420p 인 것만 리먹스로 빠르게 통과시키고, 나머지는 재인코딩한다.
      var pi = await run(['-i', inputPath]);          // 변환 없이 정보만 (비정상 종료가 정상)
      var vs = /Stream #\d+:\d+.*Video:\s*([a-zA-Z0-9_]+)[^\n]*/.exec(pi.err || '');
      var vcodec = vs ? vs[1].toLowerCase() : '';
      var vline  = vs ? vs[0] : '';
      var safe = (vcodec === 'h264') && /yuvj?420p/.test(vline);
      if (safe){
        // 1) 리먹스(재인코딩 X) — 이미 아이폰 호환 H.264 면 즉시. faststart 로 스트리밍 재생.
        r = await run(['-y','-i', inputPath, '-c','copy','-movflags','+faststart', tmpOut]);
        // (v12/A8) 상한 초과 리먹스본 → 리먹스본을 보관해 두고 아래 트랜스코드로 줄여 본다
        if (capBytes > 0 && !bad(r)){
          var remSize = fs.statSync(tmpOut).size;
          if (remSize > capBytes){
            remuxBuf = fs.readFileSync(tmpOut);
            try{ log('  ⚠️ 큰 영상 ' + (remSize/1e6).toFixed(1) + 'MB (상한 ' + (capBytes/1e6).toFixed(0) + 'MB) — 1280 저우선 재인코딩으로 축소 시도 ' + path.basename(inputPath)); }catch(_){}
            forceEncode = true;
          }
        }
      } else {
        try{ log('  재생호환 재인코딩(' + (vcodec||'코덱불명') + ') ' + path.basename(inputPath)); }catch(_){}
        forceEncode = true;
      }
    }
    if (forceEncode || bad(r)){
      // 2) 트랜스코드 — HEVC·4:2:2·10bit 등 전부 아이폰 호환 H.264(yuv420p) 로.
      try{
        r = await run(['-y','-threads','4','-i', inputPath, '-vf',"scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-threads','4','-c:a','aac','-b:a','128k','-movflags','+faststart', tmpOut]);
        if (bad(r)){
          r = await run(['-y','-threads','4','-i', inputPath, '-vf',"scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-threads','4','-an','-movflags','+faststart', tmpOut]);
          if (r.code !== 0) throw new Error('ffmpeg 종료 '+r.code+': '+r.err.slice(0,200));
        }
      }catch(e){
        if (remuxBuf){ try{ log('  축소 재인코딩 실패 → 리먹스본 그대로 사용: ' + (e.message||e)); }catch(_){} return remuxBuf; }
        throw e;
      }
      if (remuxBuf){
        var outSize = bad(r) ? 0 : fs.statSync(tmpOut).size;
        if (!outSize || outSize >= remuxBuf.length){ try{ log('  축소 재인코딩 결과가 더 작지 않음 → 리먹스본 그대로 사용'); }catch(_){} return remuxBuf; }
        meta.reenc = 1;
        try{ log('  축소 재인코딩 ' + (remuxBuf.length/1e6).toFixed(1) + 'MB → ' + (outSize/1e6).toFixed(1) + 'MB ' + path.basename(inputPath)); }catch(_){}
      }
    }
    return fs.readFileSync(tmpOut);
  } finally {
    try{ fs.unlinkSync(tmpOut); }catch(_){}
  }
}

// TPS Videos 폴더들(감시 Data 폴더의 형제 Videos) — 자동 도출. 슬래시(/) · 역슬래시(\) 모두 지원.
function videosDirs(){
  var out = [];
  var dirs = Array.isArray(CFG.watchDirs) ? CFG.watchDirs : (CFG.watchDir ? [CFG.watchDir] : []);
  dirs.forEach(function(d){
    var m = /^(.*)[\\\/]Data$/i.exec(d);
    if (m) { var v = m[1] + path.sep + 'Videos'; if (out.indexOf(v)===-1) out.push(v); }
  });
  var std = 'C:\\ProgramData\\TrackMan\\TrackMan Performance Studio\\Videos';
  if (out.indexOf(std)===-1) out.push(std);
  return out;
}
// 샷(측정시각 evMs)에 해당하는 스윙 영상들을 Videos\<날짜>\ 에서 시각 기준으로 찾는다.
// 각 카테고리(DL=측면·다운더라인, FO=정면, Club, Ball)별로 시각 가장 가까운 것을 하나씩.
// 영상은 샷 직후 저장되므로 [evMs-8초, evMs+90초] 창에서 고른다.
// 한 영상 파일이 두 샷에 중복 배정되는 것을 방지 — fp → shotId (업로드 성공 시 기록)
// (v12) 상태 파일(__meta.va)에도 남겨 재시작 뒤 복구된 작업도 남의 파일을 못 가져가게 한다 (24시간·600개까지)
var _videoAssigned = {};
var _videoAssignedAt = {};
(function loadAssigned(){
  try{
    var va = _stateMeta.va;
    if (!va || typeof va !== 'object') return;
    var cut = Date.now() - 24*3600000;
    Object.keys(va).forEach(function(fp){
      var e = va[fp];
      if (Array.isArray(e) && typeof e[0] === 'string' && +e[1] > cut){ _videoAssigned[fp] = e[0]; _videoAssignedAt[fp] = +e[1]; }
    });
  }catch(e){}
})();
function _noteAssigned(fp, shotId){
  _videoAssigned[fp] = shotId; _videoAssignedAt[fp] = Date.now();
  try{
    var cut = Date.now() - 24*3600000;
    var ks = Object.keys(_videoAssignedAt).filter(function(k){
      if (_videoAssignedAt[k] < cut){ delete _videoAssigned[k]; delete _videoAssignedAt[k]; return false; }
      return true;
    });
    if (ks.length > 600){
      ks.sort(function(a,b){ return _videoAssignedAt[a] - _videoAssignedAt[b]; });
      ks.slice(0, ks.length - 600).forEach(function(k){ delete _videoAssigned[k]; delete _videoAssignedAt[k]; });
    }
    var va = {};
    Object.keys(_videoAssigned).forEach(function(k){ va[k] = [_videoAssigned[k], _videoAssignedAt[k]]; });
    _stateMeta.va = va;
  }catch(e){}
}
function findShotVideos(evMs, shotId){
  var out = { dl:null, fo:null, club:null, ball:null };
  var skippedTaken = {};   // (v12) 앵글 → 다른 샷에 이미 붙어 있어 건너뛴 후보 수 (로그용)
  Object.defineProperty(out, '_skippedTaken', { value: skippedTaken, enumerable: false });
  if (!evMs || isNaN(evMs)) return out;
  function ymd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  var days = [ymd(new Date(evMs)), ymd(new Date(evMs-3600000)), ymd(new Date(evMs+3600000))]; // 경계 보정
  function cat(name){
    if (/DL\s*iPhone/i.test(name)) return 'dl';
    if (/FO\s*iPhone/i.test(name)) return 'fo';
    if (/Club\.(mkv|mp4|mov)$/i.test(name)) return 'club';
    if (/Ball\.(mkv|mp4|mov)$/i.test(name)) return 'ball';
    return null;
  }
  videosDirs().forEach(function(vroot){
    days.forEach(function(day){
      var dir = require('path').join(vroot, day);
      var ents; try { ents = fs.readdirSync(dir, { withFileTypes:true }); } catch(e){ return; }
      for (var i=0;i<ents.length;i++){
        var e = ents[i]; if (e.isDirectory()) continue;
        if (!/\.(mkv|mov|mp4)$/i.test(e.name)) continue;
        var c = cat(e.name); if (!c) continue;
        var fp = require('path').join(dir, e.name);
        var mt; try { mt = fs.statSync(fp).mtimeMs; } catch(err){ continue; }
        // 아이폰(DL/FO) 영상은 저장 완료가 늦을 수 있어 창을 더 넓게 잡는다
        var maxDt = (c==='dl'||c==='fo') ? 150000 : 90000;
        var dt = mt - evMs; if (dt < -8000 || dt > maxDt) continue;   // 창 밖
        var absdt = Math.abs(dt);
        var taken = (_videoAssigned[fp] && _videoAssigned[fp] !== shotId);
        // (v12) 다른 샷에 이미 붙은 영상은 절대 재사용하지 않는다. 예전엔 후보가 그것뿐이면 재사용했는데,
        // 그건 그 샷의 스윙이 아니다(이웃 샷 영상이 같은 파일로 두 번 올라감 — 3번룸 618건). → 영상 없음 + 로그
        if (taken){ skippedTaken[c] = (skippedTaken[c] || 0) + 1; continue; }
        var cur = out[c];
        var better = !cur || absdt < cur.absdt;
        if (better) out[c] = { fp: fp, name: e.name, absdt: absdt, _taken: false };
      }
    });
  });
  return out;
}
// 측정 완성도 점수 — 같은 물리적 샷의 여러 stmf 중 '가장 완전한' 것을 고르기 위함.
function scoreMeasurement(data){
  if (!data) return 0;
  var keys = ['clubSpeed','ballSpeed','smash','carry','total','launch','spin','clubPath','faceAngle','attack','landAngle','spinAxis'];
  var n = 0; keys.forEach(function(k){ if (data[k] != null) n++; });
  return n;
}

// (v12) 업로드·삭제도 httpRequest 와 같은 이유로 응답 도중 끊김('aborted'·완료 전 'close')·응답 오류를 실패로 끝내고
// 최종 시한을 둔다 — 예전엔 끝나지 않는 요청 하나가 영상 대기열 전체를 멈춰 세울 수 있었다.
function _settleOnce(resolve, getReq, hardMs, onHard){
  var st = { done:false, hard:null };
  st.fin = function(v, completed){   // completed = 응답을 끝까지 받음(상태 코드로 판정) → 연결은 그대로 둔다
    if (st.done) return;
    st.done = true;
    if (st.hard) clearTimeout(st.hard);
    if (!v && !completed){ try{ var r = getReq(); if (r) r.destroy(); }catch(_){} }
    resolve(v);
  };
  st.hard = setTimeout(function(){ try{ if (onHard) onHard(); }catch(_){} st.fin(false); }, hardMs);
  if (st.hard.unref) st.hard.unref();
  return st;
}
function _watchRes(res, st, onFail){
  res.on('aborted', function(){ if (!st.done && onFail) onFail('응답 도중 연결 끊김'); st.fin(false); });
  res.on('error', function(e){ if (!st.done && onFail) onFail((e && e.message) || '응답 오류'); st.fin(false); });
  res.on('close', function(){ if (!res.complete){ if (!st.done && onFail) onFail('응답이 끝나기 전에 연결 닫힘'); st.fin(false); } });
}
async function uploadVideo(key, buf, contentType){
  if (!workerAuthOk()) return false;
  return new Promise(function(resolve){
    var req = null;
    // 최종 시한 — 느린 회선의 정상 업로드는 끝나도록 크기에 비례해 넉넉히(3분 + 1MB당 20초). 유휴 3분 제한은 그대로.
    var hardMs = 180000 + Math.ceil(((buf && buf.length) || 0) / 1e6) * 20000;
    var st = _settleOnce(resolve, function(){ return req; }, hardMs, function(){ log('  ! R2 업로드 오류 최종 시한 초과(' + Math.round(hardMs/1000) + '초)'); });
    try{
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      var t0 = Date.now();
      req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'PUT', port:443,
        headers: workerHeaders({ 'Content-Type': contentType||'application/octet-stream', 'Content-Length': buf.length }) },
        function(res){ try{ _noteServerDate(res.headers && res.headers.date, t0, Date.now()); }catch(_){}
          _watchRes(res, st, function(why){ log('  ! R2 업로드 오류 ' + why); });
          res.on('data',function(){}); res.on('end',function(){ st.fin(res.statusCode>=200&&res.statusCode<300, true); }); });
      req.setTimeout(180000, function(){ req.destroy(new Error('R2 업로드 타임아웃')); });   // 대용량 영상 여유 3분
      req.on('error', function(e){ if (!st.done) log('  ! R2 업로드 오류 '+e.message); st.fin(false); });
      req.write(buf); req.end();
    }catch(e){ st.fin(false); }
  });
}
// R2 객체 삭제 — (v12) 샷의 영상 키가 다른 키로 바뀌었을 때 대체된 옛 파일을 지운다(attachShotVideo).
// 저장소 워커가 타석 PC 의 삭제를 거절하면(401/403 — 워커 v2 는 공용 열쇠를 끈 뒤 타석 PC 토큰의 DELETE 를 받지 않음)
// 이번 실행 동안은 더 시도하지 않는다(요청·로그 낭비 방지). 남은 파일은 서버 쪽 고아 정리 작업 몫. 샷·업로드와 무관.
var _deleteRefused = 0;
async function deleteVideo(key){
  if (!workerAuthOk()) return false;
  if (_deleteRefused) return false;
  return new Promise(function(resolve){
    var req = null;
    var st = _settleOnce(resolve, function(){ return req; }, 35000, function(){ log('  ! R2 삭제 오류 최종 시한 초과(35초)'); });
    try{
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'DELETE', port:443,
        headers: workerHeaders() },
        function(res){
          _watchRes(res, st, function(why){ log('  ! R2 삭제 오류 ' + why); });
          res.on('data',function(){});
          res.on('end',function(){
            var sc = res.statusCode;
            if ((sc === 401 || sc === 403) && !_deleteRefused){
              _deleteRefused = sc;
              log('  ! 저장소가 이 타석 PC 의 옛 영상 삭제를 거절함(' + sc + ') — 이번 실행 동안 삭제 시도 중단(남은 파일은 서버 정리 작업 몫, 샷·영상 업로드는 영향 없음)');
            }
            st.fin(sc>=200&&sc<300, true);
          }); });
      req.setTimeout(30000, function(){ req.destroy(new Error('R2 삭제 타임아웃')); });
      req.on('error', function(e){ if (!st.done) log('  ! R2 삭제 오류 '+e.message); st.fin(false); });
      req.end();
    }catch(e){ st.fin(false); }
  });
}

// ============ (v12/A3) 하트비트 — 저장소 워커에 hb/<bay>.json ============
// 예전 5분 하트비트는 이 PC 의 agent.log 에만 남아, 타석 PC 가 살아 있는지 원격으로 알 방법이 없었다.
// 시작 시 1번 + 5분마다 작은 JSON 을 올린다(앱 관리자 화면에 'PC 신호 n분 전 · vX · 트랙맨 파일 n분 전'을 보여 줄 용도 —
// 그 화면은 앱 쪽 작업이 따로 필요하다. 지금은 agent.log '감시 중' 줄의 '하트비트 ✓ n분 전'으로만 확인).
// 회원 이름·ID·샷 ID·파일명은 넣지 않는다(이 파일은 키 없이 읽힘). 실패해도 샷 수집과 무관 —
// 기다리지 않고(fire-and-forget) 10초 제한, 동시에 1건만.
var _hb = { inFlight:false, flightAt:0, lastAttempt:0, lastOkAt:0, fails:0, sent:0 };
var _videoCurrent = null;   // 지금 처리 중인 영상 작업 (대기 건수 계산용)
function _iso(ms){ return ms ? new Date(ms).toISOString() : null; }
function buildHeartbeat(bayId){
  var now = Date.now();
  var mine = function(j){ return j && (j.bayId || CFG.defaultBay || 'bay3') === bayId; };
  var q = _videoQueue.filter(mine);
  var pend = {};
  q.forEach(function(j){ if (j.shotId) pend[j.shotId] = 1; });
  if (_videoCurrent && mine(_videoCurrent) && _videoCurrent.shotId) pend[_videoCurrent.shotId] = 1;
  var newest = Math.max(_newestTmMt || 0, +_stateMeta.lastSeenMtime || 0);
  return {
    bay: bayId,
    ver: AGENT_VERSION,
    at: _iso(now),                                   // PC 시계 기준 (서버 시각 ≈ at − clockSkewSec)
    startedAt: _iso(_startedAt),
    lastScanAt: _iso(_lastScanAt),
    lastShotAt: _iso(_hbMeta.shot[bayId]),
    lastUploadAt: _iso(_hbMeta.up[bayId]),
    queueLen: q.length,                              // 대기 중인 영상 작업 수(보충 재시도 포함)
    pendingVideos: Object.keys(pend).length,         // 영상이 아직 다 안 붙은 샷 수(처리 중 포함)
    trackmanNewestFileAgeSec: newest ? Math.max(0, Math.round((now - newest)/1000)) : null,
    activeSession: !!_activeBays[bayId],            // 에이전트가 보는 '타석 레슨 켜짐' (회원 정보 없음)
    sessionExpired: !!_expiredBays[bayId],          // 세션 행은 있지만 상한(기본 4시간) 초과로 꺼짐 취급
    gate: CFG.requireActiveSession !== false,
    clockSkewSec: _skew.ms == null ? null : Math.round(_skew.ms / 100) / 10,   // 양수 = PC 가 빠름
    restarts: +_stateMeta.restarts || 0,
    recoveredJobs: _recoveredJobs,                   // 이번 시작 때 복구한 영상 작업 수
    recoveredJobsTotal: +_stateMeta.recoveredTotal || 0,
    uptimeSec: Math.round((now - _startedAt)/1000)
  };
}
function _putJson(key, obj, timeoutMs){
  return new Promise(function(resolve){
    var done = false, hard = null, req = null;
    function fin(v){ if (done) return; done = true; if (hard) clearTimeout(hard); resolve(v); }
    try{
      var body = Buffer.from(JSON.stringify(obj), 'utf8');
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      var t0 = Date.now();
      req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'PUT', port:443,
        headers: workerHeaders({ 'Content-Type':'application/json', 'Content-Length': body.length }) },
        function(res){
          try{ _noteServerDate(res.headers && res.headers.date, t0, Date.now()); }catch(_){}
          res.on('data', function(){}); res.on('error', function(){ fin(false); });
          res.on('end', function(){ fin(res.statusCode >= 200 && res.statusCode < 300); });
        });
      req.setTimeout(timeoutMs, function(){ try{ req.destroy(new Error('timeout')); }catch(_){} fin(false); });
      req.on('error', function(){ fin(false); });
      hard = setTimeout(function(){ try{ req.destroy(new Error('timeout')); }catch(_){} fin(false); }, timeoutMs + 2000);
      if (hard.unref) hard.unref();
      req.end(body);
    }catch(e){ fin(false); }
  });
}
async function sendHeartbeats(){
  var bays = myBays(), allOk = true;
  for (var i = 0; i < bays.length; i++){
    var ok = false;
    try{ ok = await _putJson('hb/' + bays[i] + '.json', buildHeartbeat(bays[i]), 10000); }catch(e){ ok = false; }
    if (!ok) allOk = false;
  }
  if (allOk){
    if (_hb.fails) log('하트비트 복구 (' + _hb.fails + '회 실패 후)');
    _hb.fails = 0; _hb.lastOkAt = Date.now(); _hb.sent++;
  } else {
    _hb.fails++;
    if (_hb.fails === 1 || _hb.fails % 12 === 0) log('  ! 하트비트 전송 실패(' + _hb.fails + '회 연속) — 샷 수집에는 영향 없음');
  }
  return allOk;
}
function maybeSendHeartbeat(force){
  try{
    if (CFG.heartbeat === false || !workerAuthOk()) return false;
    if (_hb.inFlight && Date.now() - _hb.flightAt < 60000) return false;     // 동시에 1건만
    if (!force && _hb.lastAttempt && Date.now() - _hb.lastAttempt < HB_INTERVAL_MS) return false;
    _hb.lastAttempt = Date.now(); _hb.inFlight = true; _hb.flightAt = Date.now();
    sendHeartbeats().catch(function(){}).then(function(){ _hb.inFlight = false; });
    return true;
  }catch(e){ _hb.inFlight = false; return false; }
}

// ---- 베이 매핑: TrackingUnit → bay_id ----
function resolveBay(trackingUnit){
  var map = CFG.bayMap || {};
  return map[trackingUnit] || CFG.defaultBay || null;
}

// ---- ftmf 1개 처리 ----
async function handleFtmf(filePath){
  var fname = path.basename(filePath);
  if (processed[fname]) return;

  // 파일이 아직 쓰이는 중일 수 있어 — 최근(30초 이내) 수정된 파일만 크기 안정 대기.
  // 오래된 백로그 파일까지 1.5초씩 기다리면 수천 개일 때 수십 분이 걸린다.
  var _mtNow = 0; try { _mtNow = fs.statSync(filePath).mtimeMs; } catch(e){ return; }
  if (Date.now() - _mtNow < 30000) {
    var size1 = fs.statSync(filePath).size;
    await new Promise(function(r){ setTimeout(r, 1500); });
    var size2 = fs.statSync(filePath).size;
    if (size1 !== size2) { log('아직 쓰는 중, 다음 주기에: ' + fname); return; }
  }

  var buf = fs.readFileSync(filePath);
  var parsed;
  try { parsed = parseFtmf(buf); }
  catch (e) {
    // 'stmf-final' = 고장 상태 timed_out 폴더의 완성된 잡음 파일(측정값 없음).
    // 재시도해도 영영 안 채워지므로 즉시·영구 스킵 (수천 개 잡음 파일이 20분씩 재시도하는 것 방지).
    if (/stmf-final/.test(e.message || '')) {
      processed[fname] = { skip:'no-measurement', t: Date.now() }; saveState(); delete _parseFail[fname]; return;
    }
    // 그 외 파싱 실패 = TPS가 파일을 점진적으로 채우는 중일 수 있음(측정 JSON이 나중에 들어옴).
    // 영구 마킹하지 말고 최대 240회(스캔 5초 간격 ≈ 20분)까지 재시도 — 늦게 완성되는 샷 유실 방지.
    var pf = _parseFail[fname] = (_parseFail[fname] || 0) + 1;
    if (pf < 240) {
      if (pf <= 3 || pf % 12 === 0) log('파싱 대기(재시도 '+pf+'/240) ' + fname + ': ' + e.message);
      return;
    }
    log('파싱 실패(확정·20분 초과) ' + fname + ': ' + e.message);
    processed[fname] = { err: e.message, t: Date.now() }; saveState(); delete _parseFail[fname]; return;
  }
  delete _parseFail[fname];

  var bayId = resolveBay(parsed.trackingUnit);
  if (!bayId) { log('베이 매핑 없음 (TrackingUnit=' + parsed.trackingUnit + '), 건너뜀'); processed[fname] = { skip:'no-bay', t:Date.now() }; saveState(); return; }

  _lastActivityAt = Date.now();   // (v12) 측정 샷 파일이 왔다 = 타석 사용 중 (한가함 해제)

  // ── 타석 레슨 게이트 ── "타석 레슨"을 켠 베이(활성 세션 있음)의 샷만 저장한다.
  // 레슨 안 켜고 친 연습 샷은 아예 저장 안 함(과금·클러터 방지). requireActiveSession=false 면 해제.
  // (v12) 상한(기본 4시간) 넘게 켜진 세션은 _activeBays 에서 빠져 여기서 '꺼짐'으로 걸린다(A4).
  if (CFG.requireActiveSession !== false && !_activeBays[bayId] && _noSession[fname] == null) {
    // (v12/B5) 처음 보는 샷 파일인데 꺼짐으로 보이면 — 그 자리에서 서버에 1번 더 확인(타석당 3초 1회)
    try{ await refreshActiveBaysNow(bayId); }catch(e){}
  }
  if (CFG.requireActiveSession !== false && !_activeBays[bayId]) {
    if (!_noSessionFirst[fname]) _noSessionFirst[fname] = Date.now();
    // (v12/B5) 레슨 상태 조회가 계속 실패해 정보가 묵었으면(45초 초과) '꺼짐' 횟수를 세지 않는다 —
    // 예전엔 서버 확인이 막힌 동안에도 60초면 레슨 샷을 연습 샷으로 영구히 버렸다. 단 파일당 최대 15분.
    var fresh = (Date.now() - _activeBaysAt) <= ACTIVE_FRESH_MS;
    var ns = _noSession[fname] = (_noSession[fname] || 0) + (fresh ? 1 : 0);
    var waitedMax = (Date.now() - _noSessionFirst[fname]) > NO_SESSION_WAIT_MAX_MS;
    // 세션이 방금 시작됐을 수 있음(앱 기록 지연) → 최대 12회(≈60초) 재확인 후 영구 스킵.
    if (ns < 12 && !waitedMax) { return; }
    log('타석 레슨 꺼짐 — 연습 샷 저장 안 함: ' + fname + ' bay=' + bayId + (_expiredBays[bayId] ? ' (세션 ' + (SESSION_MAX_MS/3600000) + '시간 초과)' : '') + (waitedMax && ns < 12 ? ' (레슨 상태 확인 실패 15분)' : ''));
    processed[fname] = { skip:'no-session', t:Date.now() }; saveState(); delete _noSession[fname]; delete _noSessionFirst[fname]; return;
  }
  delete _noSession[fname]; delete _noSessionFirst[fname];

  // 물리적 샷 1개당 여러 stmf(예비·부분 측정)가 쏟아진다. 단독 stmf 는
  // 측정시각(초)+베이 로 shotId 를 만들어 upsert 로 자연 병합 → 앱엔 샷 1개만 뜬다.
  // 정상 ftmf 는 measurementId 기반(1파일=1샷).
  var evMs = Date.parse(parsed.eventTime);
  var shotId;
  if (parsed.isDirectStmf && evMs && !isNaN(evMs)) {
    shotId = dedupShotId(bayId, evMs);
  } else {
    shotId = 'tm_' + (parsed.measurementId || (Date.now()+''+Math.random().toString(36).slice(2,6)));
  }
  // ── 2차 중복 병합(측정값 지문) — TPS 가 한 스윙을 "서로 다른 측정 ID" 의 파일
  // 두 개로 내보내면 위 ID 기준으로는 딴 샷이 돼 앱에 두 장씩 뜬다 (1번타석에서
  // 실제 발생: 캐리·스핀까지 완전히 동일한 카드 2장). 클럽+캐리+볼스피드+스핀이
  // 소수점까지 같은 샷이 3분 안에 또 오면 같은 스윙으로 보고 같은 shotId 로 병합.
  try {
    var ddfp = parsed.data || {};
    if (ddfp.carry != null && ddfp.ballSpeed != null && ddfp.spin != null) {
      var fp = bayId + '|' + (ddfp.club || '') + '|' + Number(ddfp.carry).toFixed(1)
             + '|' + Number(ddfp.ballSpeed).toFixed(1) + '|' + Math.round(Number(ddfp.spin));
      var seen = _fpShot[fp];
      if (seen && (Date.now() - seen.t) < 180000 && seen.id !== shotId) {
        log('중복 측정 파일 병합: ' + fname + ' → ' + seen.id + ' (동일 측정값)');
        shotId = seen.id;
      }
      _fpShot[fp] = { id: shotId, t: Date.now() };
      if (Object.keys(_fpShot).length > 300) {
        var cut = Date.now() - 600000;
        Object.keys(_fpShot).forEach(function(k){ if (_fpShot[k].t < cut) delete _fpShot[k]; });
      }
    }
  } catch (e) {}
  // 같은 샷의 여러 측정 중 '가장 완전한' 값만 반영(덜 완전한 게 더 완전한 걸 덮지 않게).
  var score = scoreMeasurement(parsed.data);
  var betterOrNew = (_shotBest[shotId] == null) || (score > _shotBest[shotId]);

  if (!betterOrNew) {
    // 이미 더 완전한 값으로 이 샷을 보냄 → 데이터 재전송 스킵(중복·값 요동 방지).
    processed[fname] = { id: shotId, mid: parsed.measurementId, bay: bayId, t: Date.now() };
    // (v12/A2) 같은 스윙의 단독 stmf → Videos 폴더 작업(샷당 1개). 정상 ftmf 의 내장 영상 작업이 먼저 있어도 만든다 —
    // 앱이 보여 주는 측면·정면·클럽은 이쪽이고, 내장 영상은 이쪽이 아무것도 못 붙였을 때만 올린다(_addVfJob).
    // 같은 스윙의 ftmf 가 늦게 왔으면(Videos 폴더 작업이 이미 있음) 그 내장 영상은 대비용으로만 대기열에 둔다.
    if (CFG.uploadVideo && _videoQueuedFor[shotId] !== 'gone') {
      if (parsed.isDirectStmf && !_hasJob(shotId, 'vf')) _addVfJob(fname, shotId, bayId, evMs);
      else if (!parsed.isDirectStmf && parsed.videos && parsed.videos.length && _hasJob(shotId, 'vf') && !_hasJob(shotId, 'emb'))
        _addEmbJob(filePath, fname, shotId, bayId);
    }
    try{ var _mtS=fs.statSync(filePath).mtimeMs; if(_mtS>(_stateMeta.lastSeenMtime||0)) _stateMeta.lastSeenMtime=_mtS; }catch(e){}
    saveState();
    return;
  }

  // ── 1단계: 샷 "데이터"를 먼저 전송 (영상 없이) ─────────────────────────
  // (v12) 이 프로세스가 이미 보낸 샷의 '더 완전한 측정'이면 행 전체 upsert 대신 data 병합 갱신(repushShotData)
  var isRepush = (_shotBest[shotId] != null);
  // 이번에 '영상 준비 중' 표시를 새로 걸 영상 작업이 생기는가 — 대비용 내장 영상(Videos 폴더 작업이 이미 있음)은 제외
  var willQueueVideo = !!(CFG.uploadVideo && _videoQueuedFor[shotId] !== 'gone' && (parsed.isDirectStmf
    ? !_hasJob(shotId, 'vf')
    : (parsed.videos && parsed.videos.length && !_hasJob(shotId, 'emb') && !_hasJob(shotId, 'vf'))));
  var nowIso = new Date().toISOString();
  var shot = {
    id: shotId,
    bay_id: bayId,
    member_id: CFG.pendingMemberId || '00000000-0000-0000-0000-000000000000',
    member_name: '',
    author: '',
    ts: nowIso,
    data: Object.assign({ measurementId: parsed.measurementId, trackingUnit: parsed.trackingUnit, measuredAt: parsed.eventTime,
      _agentVer: AGENT_VERSION,   // 앱이 타석 PC 에이전트 구버전을 감지하는 데 사용
      // 앱이 "영상 준비 중" 표시를 띄울 수 있게 예고 — 연결 완료/포기 시 해제됨
      _videoPending: (CFG.uploadVideo && ((parsed.videos && parsed.videos.length) || parsed.isDirectStmf)) ? 1 : undefined }, parsed.data),
    video_r2_key: null,
    source: 'agent'
  };
  if (!isRepush){
    var ok = await pushShot(shot);
    if (!ok){ log('전송 실패(다음 주기 재시도): ' + fname); return; }
  } else {
    var nd = Object.assign({}, shot.data); delete nd._videoPending;
    var rp = await repushShotData(shotId, nd, willQueueVideo);
    if (rp === 'fail'){ log('전송 실패(다음 주기 재시도): ' + fname); return; }
    if (rp === 'busy'){
      // (v12) 같은 샷의 영상 연결(백그라운드)이 서버 응답을 오래 기다리는 중 — 기다리지 않고 다음 주기에 다시(스캔은 계속)
      if (!_busyLogged[fname]){ _busyLogged[fname] = 1; log('같은 샷의 영상 연결이 진행 중이라 보강 재전송은 다음 주기에: ' + fname + ' → ' + shotId); }
      return;
    }
    delete _busyLogged[fname];
    if (rp === 'gone'){
      // 앱에서 이미 지운 샷 — 되살리지 않고, 영상도 새로 만들지 않는다
      log('샷 행이 앱에서 삭제됨 — 재전송·영상 생략: ' + fname + ' id=' + shotId);
      _shotBest[shotId] = score;
      _videoQueuedFor[shotId] = 'gone';   // 같은 스윙의 다른 파일이 와도 새 영상 작업을 만들지 않음(진행 중 작업은 스스로 행 삭제를 확인)
      processed[fname] = { id: shotId, mid: parsed.measurementId, bay: bayId, t: Date.now() };
      try{ var _mtG=fs.statSync(filePath).mtimeMs; if(_mtG>(_stateMeta.lastSeenMtime||0)) _stateMeta.lastSeenMtime=_mtG; }catch(e){}
      saveState();
      return;
    }
  }
  _shotBest[shotId] = score;
  if (!isRepush) _hbMeta.shot[bayId] = Date.now();

  log('✓ 샷 전송(데이터) ' + fname + ' [' + (parsed.data.club||'?') + ' carry=' + parsed.data.carry + 'm total=' + parsed.data.total + 'm] bay=' + bayId + ' id=' + shotId + (isRepush ? ' (더 완전한 측정으로 보강·병합)' : ''));
  // 지연 진단 — 샷 측정시각/파일 수정시각 대비 전송이 얼마나 늦었는지.
  // (에이전트가 꺼져 있던 백로그면 '파일수정 지연'도 크게 나옴 → TPS 지연과 구분 가능)
  try{
    var _ms = Date.parse(parsed.eventTime);
    var _mtDiag = fs.statSync(filePath).mtimeMs;
    var parts = [];
    if(!isNaN(_ms)) parts.push('샷측정후 ' + Math.round((Date.now()-_ms)/1000) + '초');
    if(_mtDiag) parts.push('파일수정후 ' + Math.round((Date.now()-_mtDiag)/1000) + '초');
    if(parts.length) log('  전송 지연: ' + parts.join(' · '));
  }catch(e){}
  // 클럽 진단 — 선택 클럽 vs 레이더 감지 클럽. TPS에서 고른 클럽과 비교용.
  var cc = parsed.clubCandidates || {};
  var ccs = Object.keys(cc).filter(function(k){ return cc[k]; }).map(function(k){ return k+'='+cc[k]; });
  if (ccs.length) log('  클럽 후보 → ' + ccs.join(', ') + ' | 채택=' + (parsed.data.club||'?'));
  // 토탈 키 진단 — TPS 화면 값과 비교용. 비어있지 않은 후보만 출력.
  var tc = parsed.data._totalCandidates || {};
  var nonNull = Object.keys(tc).filter(function(k){ return tc[k] != null; }).map(function(k){ return k+'='+tc[k]; });
  if (nonNull.length) log('  토탈 후보값들 → ' + nonNull.join(', '));
  processed[fname] = { id: shotId, mid: parsed.measurementId, bay: bayId, t: Date.now() };
  // ── 2단계: 영상은 "대기열"로 — 데이터 전송을 절대 막지 않는다 ─────────────
  // 정상 ftmf: 파일 내부 embedded 영상 추출. 단독 stmf(고장 상태): 영상이 파일 안에
  // 없고 TPS Videos 폴더에 낱개로 저장되므로, 측정시각으로 매칭해 붙인다(샷당 1회).
  // (v12) 종류마다 샷당 1개 — Videos 폴더 작업이 우선, 같은 스윙의 내장 영상은 대비용(_addVfJob/_addEmbJob).
  if (CFG.uploadVideo && _videoQueuedFor[shotId] !== 'gone'){
    if (parsed.isDirectStmf){
      if (!_hasJob(shotId, 'vf')) _addVfJob(fname, shotId, bayId, evMs);   // (v12/A9) 종류·측정시각을 상태에 기록(vp 아님)
    } else if (parsed.videos && parsed.videos.length){
      if (!_hasJob(shotId, 'emb')) _addEmbJob(filePath, fname, shotId, bayId);
      else log('  이 샷은 내장 영상 작업이 이미 있어(샷당 1개) 이 파일의 내장 영상은 올리지 않음 ' + fname + ' → ' + shotId);
    }
  }
  try{ var _mt=fs.statSync(filePath).mtimeMs; if(_mt> (_stateMeta.lastSeenMtime||0)) _stateMeta.lastSeenMtime=_mt; }catch(e){}
  saveState();
}

// ---- 영상 대기열 처리 (한 번에 1건, 백그라운드 — 새 샷 데이터가 항상 먼저) ----
var _videoQueue = [];
var _videoBusy = false;   // 영상 1건 처리 중이면 다음 건은 다음 주기로 (동시 실행 방지)
// (v12/A9) Videos 폴더(단독 stmf) 작업은 상태 파일 processed[fname].vj = {k:'vf', ev:측정시각, keys:{올린 앵글}} 로
// 남긴다. 예전엔 vp(파일 경로)만 남겨 재시작 때 '내장 영상 작업'으로 잘못 되살렸고(영상 없음으로 종료),
// 대기·보충 작업은 아예 기록이 없어 재시작하면 사라졌다.
function _queueVideosFolderJob(fname, shotId, bayId, evMs){
  _videoQueue.push({ videosFolder:true, shotId: shotId, bayId: bayId, evMs: evMs, fname: fname });
  if (processed[fname]){ delete processed[fname].vp; processed[fname].vj = { k:'vf', ev: evMs }; }
}
// 대기 중인 이 샷의 내장 영상 작업을 '대비용'으로 표시(상태 파일 vj.fb 에도 — 재시작해도 유지)
function _markEmbFallback(shotId){
  for (var i = 0; i < _videoQueue.length; i++){
    var j = _videoQueue[i];
    if (j && !j.videosFolder && j.shotId === shotId){
      j._fallback = true;
      var p = processed[j.fname];
      if (p && typeof p.vp === 'string') p.vj = { k:'emb', fb:1 };
    }
  }
}
// (v12/A2) Videos 폴더 작업 추가(샷당 1개). 같은 스윙의 내장 영상 작업이 있으면 그건 대비용으로 돌린다.
function _addVfJob(fname, shotId, bayId, evMs){
  var hadEmb = _hasJob(shotId, 'emb');
  _markJob(shotId, 'vf');
  _queueVideosFolderJob(fname, shotId, bayId, evMs);
  if (hadEmb){
    _markEmbFallback(shotId);
    log('  같은 스윙의 정상 ftmf 도 있음 — Videos 폴더 영상(측면·정면·클럽)을 붙이고, 내장 영상은 그쪽이 아무것도 못 찾을 때만 올림 ' + fname + ' → ' + shotId);
  }
}
// (v12/A2) 내장 영상 작업 추가(샷당 1개). 같은 스윙의 Videos 폴더 작업이 이미 있으면 대비용으로.
function _addEmbJob(filePath, fname, shotId, bayId){
  var fb = _hasJob(shotId, 'vf');
  _markJob(shotId, 'emb');
  var j = { fp: filePath, fname: fname, shotId: shotId, bayId: bayId };
  if (fb) j._fallback = true;
  if (processed[fname]){ processed[fname].vp = filePath; processed[fname].vj = fb ? { k:'emb', fb:1 } : { k:'emb' }; }
  _videoQueue.push(j);
  if (fb) log('  같은 스윙의 Videos 폴더 영상 작업이 있음 — 이 파일의 내장 영상은 그쪽이 아무것도 못 찾을 때만 올림 ' + fname + ' → ' + shotId);
}
function _persistVfKeys(job, keys){
  var p = processed[job.fname];
  if (!p) return;
  var k = {};
  ['dl','fo','club','ball'].forEach(function(a){ if (keys && typeof keys[a] === 'string' && keys[a]) k[a] = keys[a]; });
  p.vj = { k:'vf', ev: job.evMs, keys: k };
  saveState();
}
function _clearVideoJobState(fname){
  if (fname && processed[fname]){ delete processed[fname].vp; delete processed[fname].vj; saveState(); }
}
// (v12/A2) 대비용 내장 영상 작업이 같은 스윙의 Videos 폴더 작업을 아직 기다려야 하나 — 그 작업이 대기열에 있는 동안
// (최대 EMB_DEFER_MAX_MS). 기다리기 시작할 때 1번만 로그. scan() 은 기다리는 작업을 건너뛰고 다음 작업을 바로 처리한다.
function _embWaitForVf(job){
  try{
    if (!job || job.videosFolder) return false;
    if (!(job._fallback || _hasJob(job.shotId, 'vf'))) return false;
    job._fallback = true;
    if (!job._deferSince) job._deferSince = Date.now();
    if (Date.now() - job._deferSince >= EMB_DEFER_MAX_MS) return false;
    var vfQueued = _videoQueue.some(function(j){ return j && j.videosFolder && j.shotId === job.shotId; });
    if (!vfQueued) return false;
    if (!job._deferLogged){ job._deferLogged = 1; log('  내장 영상은 같은 스윙의 Videos 폴더 영상 작업 뒤로 미룸(그쪽이 영상을 붙이면 올리지 않음) shot=' + job.shotId); }
    return true;
  }catch(e){ return false; }
}
async function processVideoJob(job){
  // ── 단독 stmf(고장 상태): 파일 안에 영상이 없다 → Videos 폴더에서 시각 매칭해 붙인다 ──
  // 측면(DL)·정면(FO) 둘 다 각각 올린다. 앱은 [측면]/[정면] 전환으로 재생.
  if (job.videosFolder){
    // job._have: 이미 업로드한 앵글(보충 모드). 클럽 카메라는 즉시 저장되지만
    // 아이폰(DL/FO) 영상은 30~90초 늦게 저장된다 — 첫 패스에서 클럽만 붙이고 끝내면
    // 늦게 온 측면/정면이 영영 누락된다(비포 샷 클럽만 나오던 원인). 그래서
    // 찾은 것부터 즉시 붙이고, 측면·정면이 빠졌으면 3분까지 보충 수집을 계속한다.
    // (v12) job._keys: 이미 올린 앵글의 R2 키(재시작 뒤에도 상태 파일 vj.keys 로 이어짐). 매 연결 때 전부 다시
    // 실어 보내 — 그 사이 행이 덮어써져 키가 지워졌어도 다음 패스가 되살린다.
    var keys = Object.assign({}, job._keys || {});
    var have = Object.assign({}, job._have || {});
    ['dl','fo','club','ball'].forEach(function(a){ if (keys[a]) have[a] = true; });
    var vids = findShotVideos(job.evMs, job.shotId);
    // 정직한 앵글 매핑 — 아이폰 DL만 "측면", 클럽 카메라는 항상 "클럽" 탭으로.
    var dlSrc  = have.dl   ? null : vids.dl;         // 측면 = DL 아이폰만
    var foSrc  = have.fo   ? null : vids.fo;         // 정면 = FO 아이폰
    var clubSrc= have.club ? null : vids.club;       // 클럽 딜리버리(임팩트) = 항상 별도
    var ballSrc= (!dlSrc && !clubSrc && !have.dl && !have.club && !have.ball) ? vids.ball : null;  // 최후 폴백
    var anyHave = have.dl||have.fo||have.club||have.ball;
    // (v12/A2) 후보가 전부 다른 샷에 이미 붙은 파일이라 건너뛴 앵글 — 작업당 앵글별 1번만 로그
    try{
      var sk = vids._skippedTaken || {};
      job._takenLogged = job._takenLogged || {};
      ['dl','fo','club'].forEach(function(a){
        if (sk[a] && !have[a] && !vids[a] && !job._takenLogged[a]){
          job._takenLogged[a] = 1;
          log('  ⚠️ ' + ({dl:'측면',fo:'정면',club:'클럽'})[a] + ' 후보 영상이 이미 다른 샷에 붙어 있어 이 샷엔 붙이지 않음(남의 스윙) shot=' + job.shotId);
        }
      });
    }catch(e){}
    // 정면이 측면보다 먼저 저장된 경우 — 지금 올리면 짝 배율을 못 구하고 설정값으로 굳는다(다시 유도 안 됨).
    // 샷 후 2.5분까지는 측면이 오길 기다렸다가 함께 처리하고, 그 뒤에도 안 오면 설정값으로 올린다.
    var foDeferred = false;
    if (foSrc && !dlSrc && !have.dl && CFG.ffmpegPath && CFG.pairSpeedup !== false && Date.now() - job.evMs < 150000){
      foSrc = null; foDeferred = true;
    }
    if (!dlSrc && !foSrc && !clubSrc && !ballSrc){
      if (anyHave || foDeferred){
        // 보충 모드 — 새로 나타난 게 없음. 아이폰 영상이 아직 저장 중일 수 있어 3분까지 대기.
        if (Date.now() - job.evMs < 180000){ _videoQueue.push(job); return; }
        _clearVideoJobState(job.fname);
        return;
      }
      // 영상은 샷 직후 몇 초~수십 초 뒤 저장될 수 있음 → 잠시 재시도 후 포기.
      job._tries = (job._tries||0)+1;
      if (job._tries < 16){ _videoQueue.push(job); return; }
      var skAll = vids._skippedTaken || {};
      // (v12) 같은 스윙의 대비용 내장 영상 작업이 기다리고 있으면 그쪽이 올리고 '영상 준비 중'도 해제한다
      var embWaiting = _videoQueue.some(function(j){ return j && !j.videosFolder && j.shotId === job.shotId; });
      log('  영상 매칭 실패(' + ((skAll.dl||skAll.fo||skAll.club||skAll.ball) ? '후보가 모두 다른 샷에 이미 붙은 파일 — 영상 없음으로 둠' : '파일 못 찾음') + ') shot=' + job.shotId + (embWaiting ? ' → 같은 스윙의 내장 영상으로 대신함' : ''));
      if (!embWaiting){ try{ await attachShotVideo(job.shotId, undefined, null, null); }catch(e){} }  // _videoPending 해제 (video_r2_key 는 그대로)
      _clearVideoJobState(job.fname);
      return;
    }
    // (v12/A2) 올리기 전에 행이 아직 있는지 확인 — 앱에서 이미 지운 샷이면 영상을 올리지 않는다
    // (지운 뒤에 올리면 어디에도 안 쓰이는 고아 파일이 된다). 조회 실패면 예전처럼 진행.
    try{
      var pre = await fetchShotRow(job.shotId, 8000);
      if (pre.ok && !pre.row){
        log('  샷 행이 앱에서 삭제됨 — 영상 업로드 중단 shot=' + job.shotId);
        _clearVideoJobState(job.fname);
        return;
      }
    }catch(e){}
    var vbase = job.bayId + '/' + job.shotId;
    // 앵글별 슬로모션 보정 배율 — 아이폰(측면·정면)은 슬로모션 촬영분을 실속도로 복원.
    // 기본 ×8 (아이폰 슬로모션 240fps = 8배 늘어짐. ×4 로는 여전히 0.5배로 보였음).
    // 클럽 딜리버리는 원래 느리게 보는 영상이라 보정하지 않음. 아이폰이 120fps 슬로모션이면
    // config.json 에 videoSpeedup: {"dl":4,"fo":4} 로 낮추면 됨.
    function speedupFor(cat){
      var d = { dl:8, fo:8, club:1, ball:1 };
      var c = (CFG.videoSpeedup && typeof CFG.videoSpeedup === 'object') ? CFG.videoSpeedup : {};
      var v = (c[cat] != null ? c[cat] : d[cat]);
      return (typeof v === 'number' && v > 0) ? v : 1;
    }
    // 한 소스를 mp4 로 변환/업로드하고 R2 키를 돌려주는 헬퍼 (spOverride: 짝 영상으로 유도한 배율)
    async function up(src, suffix, cat, spOverride){
      if (!src) return null;
      var buf = null;
      // 재인코딩 대상: ① 클럽 딜리버리(초고속 카메라) ② 모든 .mkv (트랙맨 내장 카메라 —
      // 코덱/픽셀포맷이 아이폰 비호환 + 원본이 커서, 리먹스하면 "재생 불가 + 업로드 수 분"이
      // 된다. H.264(yuv420p) 재인코딩으로 재생 호환 + 파일 대폭 축소 = 업로드도 빨라짐).
      // 아이폰 영상(.mov/.mp4, 이미 H.264)만 리먹스로 빠르게 통과.
      var forceEnc = (suffix === '_club') || /\.mkv$/i.test(src.name || '');
      var spUse = (spOverride != null) ? spOverride : speedupFor(cat);
      // (v12/A8) 정면은 크기 상한(기본 5MB) — 원본 그대로 통과(리먹스)한 결과가 크면 1280 재인코딩으로 줄인다
      var cap = (cat === 'fo') ? FO_MAX_BYTES : 0;
      if (CFG.ffmpegPath){ try{ buf = await convertFileToMp4(src.fp, CFG.ffmpegPath, forceEnc, spUse, cap); }catch(e){ log('  영상 변환 실패(' + src.name + '): ' + e.message); } }
      var cm = null; try{ cm = _convMeta[src.fp] || null; delete _convMeta[src.fp]; }catch(_){}
      // 진단은 업로드가 실제로 된 앵글만 기록 (실패한 시도가 다음 보충 패스의 기록을 덮지 않게)
      function done(key, bytes){
        if (key && cm) vidMeta[cat] = { dur: cm.dur, fps: cm.fps, sp: cm.sp, cfg: spUse, mb: Math.round((bytes||0)/1e5)/10 };
        if (key){
          _hbMeta.up[job.bayId] = Date.now();
          if (cat === 'fo' && bytes > FO_WARN_BYTES) log('  ⚠️ 정면 영상이 큼 ' + (bytes/1e6).toFixed(1) + 'MB (기준 ' + (FO_WARN_BYTES/1e6).toFixed(0) + 'MB) ← ' + src.name + ' — 아이폰 녹화 설정(해상도·fps) 확인');
        }
        return key;
      }
      if (buf && buf.length){
        var mk = vbase + suffix + '.mp4';
        if (await uploadVideo(mk, buf, 'video/mp4')){ log('  MP4 업로드 ' + (buf.length/1e6).toFixed(1) + 'MB ← ' + src.name); return done(mk, buf.length); }
      }
      // 변환 실패 → 원본 업로드(확장자 유지)
      try{
        var raw = fs.readFileSync(src.fp);
        var ext = ((src.name.match(/\.(mkv|mov|mp4)$/i)||[])[1]||'mp4').toLowerCase();
        var ct = ext==='mov' ? 'video/quicktime' : (ext==='mkv' ? 'video/x-matroska' : 'video/mp4');
        var rk = vbase + suffix + '.' + ext;
        if (await uploadVideo(rk, raw, ct)){ log('  원본 영상 업로드 ' + (raw.length/1e6).toFixed(1) + 'MB ← ' + src.name); if (cm) cm.sp = 1; return done(rk, raw.length); }
      }catch(e){ log('  원본 영상 업로드 스킵(' + src.name + '): ' + e.message); }
      return null;
    }
    // 앵글별 진단(길이·fps·적용 배율) — 행 data._vidMeta 로 남겨 앱(관리자)에서 확인 가능
    var vidMeta = {};
    // 측면·정면 짝 보정 — 두 아이폰의 슬로모션 설정이 달라도(120 vs 240fps) 정면이 느리게 남지 않게.
    // 같은 샷의 두 파일은 실시간 구간이 같으므로 길이 비율로 정면 배율을 유도한다.
    var spDl = speedupFor('dl'), spFo = speedupFor('fo');
    // 보충 패스(정면이 늦게 도착, 측면은 이미 업로드)에서도 짝을 맞출 수 있게 측면 파일은 다시 찾아 길이만 잰다
    var dlProbe = dlSrc || (have.dl ? vids.dl : null);
    if (dlProbe && foSrc && CFG.ffmpegPath && CFG.pairSpeedup !== false){
      try{
        var mDl = probeVideo(await runProbe(dlProbe.fp)), mFo = probeVideo(await runProbe(foSrc.fp));
        // 기준은 측면에 "실제로 적용될" 배율 — convertFileToMp4 의 게이트(실시간 고프레임·짧은 클립)에
        // 걸려 측면을 보정하지 않으면 측면 파일은 이미 실속도이므로 기준 배율은 1 이다.
        var minSec = (CFG.slowmoMinSec != null ? CFG.slowmoMinSec : 10);
        var baseDl = (mDl.fps >= 100 || !mDl.dur || mDl.dur < minSec) ? 1 : spDl;
        var derived = pairSpeedup(baseDl, mDl.dur, mFo.dur);
        if (derived && derived !== spFo){ log('  정면 배율 유도 ×' + derived + ' (측면 ' + mDl.dur + 's ×' + baseDl + ' / 정면 ' + mFo.dur + 's, 설정 ×' + spFo + ')'); spFo = derived; }
        else if (!derived && mDl.dur && mFo.dur) log('  정면 배율 유도 불가 → 설정 ×' + spFo + ' 사용 (측면 ' + mDl.dur + 's ×' + baseDl + ' / 정면 ' + mFo.dur + 's — 길이 비율이 1·2·4·8 어디에도 안 맞음)');
      }catch(e){ log('  짝 배율 유도 실패: ' + (e&&e.message||e)); }
    }
    var dlKey   = await up(dlSrc, '_scene', 'dl', spDl);   // 측면(DL 아이폰)
    var foKey   = await up(foSrc, '_fo', 'fo', spFo);      // 정면(FO 아이폰)
    var clubKey = await up(clubSrc, '_club', 'club');// 클럽 딜리버리
    var ballKey = await up(ballSrc, '_scene', 'ball'); // 최후 폴백(측면·클럽 다 없을 때만)
    // 업로드 성공한 원본 파일을 이 샷에 배정 기록 — 다른 샷이 같은 영상을 못 가져가게 (v12: 상태 파일에도)
    [[dlSrc,dlKey],[foSrc,foKey],[clubSrc,clubKey],[ballSrc,ballKey]].forEach(function(p){
      if (p[0] && p[1]) _noteAssigned(p[0].fp, job.shotId);
    });
    if (dlKey) keys.dl = dlKey; if (foKey) keys.fo = foKey; if (clubKey) keys.club = clubKey; if (ballKey) keys.ball = ballKey;
    // 주(대표) 영상 — 칩·리포트 대표 재생용. 측면(DL) > 볼 카메라(측면이 없을 때 '_scene' 으로 올린 것).
    // 클럽은 행에 대표가 아직 없을 때만 대표가 된다(clubMain). 보충 패스에서 DL 이 늦게 오면 대표를 DL 로 업그레이드.
    // (v12: 지금까지 올린 키 전체 기준으로 매번 다시 보낸다. 단, 예전 v11 처럼 클럽이 이미 있는 대표 — 볼 카메라·내장 영상 —
    //  를 밀어내지 않는다. 밀어내면 옛 대표가 '대체됨'으로 지워져 측면 슬롯 영상이 사라졌다)
    var mainKey = keys.dl || keys.ball || null;
    var clubMain = mainKey ? null : (keys.club || null);
    try{
      var extraKeys = { videoFO: keys.fo || null, videoDL: keys.dl || null, videoClub: keys.club || null, _agentVer: AGENT_VERSION };
      if (Object.keys(vidMeta).length) extraKeys._vidMeta = vidMeta;   // attachShotVideo 가 기존 진단과 병합
      // video_r2_key 는 건드리지 않는다(undefined) — 같은 행의 내장 영상 원본 mkv 키를 지우지 않게
      var okv = await attachShotVideo(job.shotId, undefined, mainKey, null, extraKeys, clubMain);
      if (okv) log('  영상 연결' + (anyHave?'(보충)':'') + ' → 측면:' + (dlKey||(have.dl?'유지':'없음')) + ' 정면:' + (foKey||(have.fo?'유지':'없음')) + ' 클럽:' + (clubKey||(have.club?'유지':'없음')) + (ballKey?' (대표=볼카메라)':''));
    }catch(e){ log('  영상 연결 실패: ' + (e&&e.message||e)); }
    // 측면 또는 정면이 아직 없으면 보충 수집 계속 (샷 후 3분까지) — 아이폰 영상 지연 대비
    var haveNow = { dl: !!(have.dl||dlKey), fo: !!(have.fo||foKey), club: !!(have.club||clubKey), ball: !!(have.ball||ballKey) };
    if ((!haveNow.dl || !haveNow.fo) && Date.now() - job.evMs < 180000){
      var nj = { videosFolder:true, shotId:job.shotId, bayId:job.bayId, evMs:job.evMs, fname:job.fname, _have:haveNow, _keys:keys, _takenLogged: job._takenLogged };
      _videoQueue.push(nj);
      _persistVfKeys(nj, keys);   // (v12/A9) 재시작해도 이미 올린 앵글은 다시 올리지 않고 보충만 이어간다
      return;
    }
    _clearVideoJobState(job.fname);
    return;
  }

  // ── ftmf 내장 영상 ──
  // (v12/A2) 같은 스윙의 Videos 폴더 작업이 있으면(대비용) 그 작업이 대기열에서 빠질 때까지 뒤로 미루고(최대 10분),
  // 그 뒤 행에 Videos 폴더 영상이 붙어 있으면 올리지 않는다 — 같은 스윙을 두 번 올려 내장 영상이 곧바로 고아가 되던 문제.
  // Videos 폴더에서 아무것도 못 찾았으면 이 내장 영상을 그대로 올린다(그 샷이 영상 없이 끝나지 않게).
  var embFallback = !!(job._fallback || _hasJob(job.shotId, 'vf'));
  if (_embWaitForVf(job)){ _videoQueue.push(job); return; }
  // (v12/A2) 행이 이미 지워졌으면(앱에서 삭제) 내장 영상을 변환·업로드하지 않는다 — 조회 실패면 예전처럼 진행
  var pre0 = { ok:false, row:null };
  try{ pre0 = await fetchShotRow(job.shotId, 8000); }catch(e){}
  if (pre0.ok && !pre0.row){ log('  샷 행이 앱에서 삭제됨 — 내장 영상 업로드 중단 shot=' + job.shotId); _clearVideoJobState(job.fname); return; }
  if (embFallback && !pre0.ok){
    // 대비용은 행을 읽어야 Videos 폴더 영상이 붙었는지 안다 — 모르면 올리지 않고 잠시 뒤 다시(최대 6번)
    job._readTries = (job._readTries || 0) + 1;
    if (job._readTries < 6){ _videoQueue.push(job); return; }
    log('  내장 영상(대비용) 건너뜀 — 샷 행 조회가 계속 실패해 Videos 폴더 영상이 붙었는지 확인 못 함 shot=' + job.shotId);
    _clearVideoJobState(job.fname);
    return;
  }
  var buf, parsed;
  try { buf = fs.readFileSync(job.fp); parsed = parseFtmf(buf); }
  catch(e){ log('영상 단계: 파일 재읽기 실패 ' + job.fname + ': ' + e.message); parsed = null; }
  if (embFallback && pre0.row){
    // Videos 폴더 작업이 '측면' 영상(DL 아이폰, 없으면 볼 카메라 대표)을 붙였으면 내장 영상은 올리지 않는다.
    // 정면·클럽만 붙었으면 측면 자리가 비어 있으므로 내장 영상을 측면(대표)으로 올린다(클럽 대표 → 내장 영상, 클럽 탭은 그대로).
    var ownBase = job.bayId + '/' + ((parsed && parsed.measurementId) || job.shotId);
    var own = [ownBase + '_scene.mp4', ownBase + '_scene.mkv'];
    var d0 = pre0.row.data || {};
    var mk0 = d0.videoMp4R2Key || null;
    var vfSide = !!(d0.videoDL || (mk0 && own.indexOf(mk0) === -1 && mk0 !== d0.videoClub && mk0 !== d0.videoFO));
    if (vfSide){
      log('  같은 스윙의 Videos 폴더 측면 영상이 이미 붙어 있어 내장 영상은 올리지 않음(중복 업로드 방지) shot=' + job.shotId);
      _clearVideoJobState(job.fname);
      return;
    }
    var embAsSide = !!(d0.videoFO || d0.videoClub);   // 정면·클럽만 있음 → 내장 영상이 측면(대표) 자리를 채운다
  }
  var fallbackData = null;
  if (parsed) fallbackData = Object.assign({ measurementId: parsed.measurementId, trackingUnit: parsed.trackingUnit, measuredAt: parsed.eventTime }, parsed.data);
  var videoKey = null, videoMp4Key = null;
  if (buf){
    try{
      var outer = require('./ftmf-parser.js').readZipEntries(buf);
      var sceneName = require('./ftmf-parser.js').findEntry(outer, '_scene.mkv');
      if (sceneName){
        var vbuf = require('./ftmf-parser.js').extractEntry(buf, outer[sceneName]);
        var base = job.bayId + '/' + ((parsed && parsed.measurementId) || job.shotId);
        var mp4buf = null;
        if (CFG.ffmpegPath){
          try{ mp4buf = await convertMkvToMp4(vbuf, CFG.ffmpegPath); }
          catch(e){ log('  MP4 변환 실패: ' + e.message); }
        }
        if (mp4buf && mp4buf.length){
          var mp4key = base + '_scene.mp4';
          if (await uploadVideo(mp4key, mp4buf, 'video/mp4')){
            videoMp4Key = mp4key; log('  MP4 업로드 ' + (mp4buf.length/1e6).toFixed(1) + 'MB → ' + mp4key);
          }
        }
        if (!videoMp4Key){
          var key = base + '_scene.mkv';
          if (await uploadVideo(key, vbuf, 'video/x-matroska')){
            videoKey = key; log('  영상 업로드(원본 mkv) ' + (vbuf.length/1e6).toFixed(1) + 'MB → ' + key);
          }
        }
      }
    }catch(e){ log('  영상 업로드 스킵: ' + e.message); }
  }
  if (videoKey || videoMp4Key) _hbMeta.up[job.bayId] = Date.now();
  // 성공이든 실패든 행 갱신 — 영상 키 부착 + _videoPending 해제(앱 진행표시 종료)
  // (v12) 대비용은 행을 못 읽으면 data 를 파싱값으로 통째로 덮어쓰지 않는다(이미 붙은 Videos 폴더 정면·클럽 키 보존)
  try{
    var okU = await attachShotVideo(job.shotId, videoKey, videoMp4Key, embFallback ? null : fallbackData);
    if (okU && (videoKey || videoMp4Key)) log('  영상 연결 완료 → ' + (videoMp4Key || videoKey) + (embAsSide ? ' (Videos 폴더 영상에 측면이 없어 내장 영상을 측면으로)' : ''));
    else if (!okU && embFallback && (videoKey || videoMp4Key)) log('  ! 내장 영상(대비용) 행 연결 실패 — 올린 파일은 참조 없이 남을 수 있음(서버 정리 대상) ' + (videoMp4Key || videoKey));
  }catch(e){ log('  영상 연결 실패: ' + (e && e.message || e)); }
  _clearVideoJobState(job.fname);
}
// 재시작 시 미완료 영상 작업 복구 — 이전 실행이 데이터만 보내고 영상을 못 붙인 샷들
// (v12/A9) Videos 폴더 작업(vj.k='vf')은 Videos 폴더 작업으로, ftmf 내장 영상(vp)은 내장 영상 작업으로 되살린다.
// v10·v11 이 남긴 상태(vp 만 있음)도 처리: vp 가 .stmf(단독 stmf)면 Videos 폴더 작업 — 측정시각은 파일에서 다시
// 읽고, 파일이 없으면 샷 ID(tm_<bay>_<초>)에서 계산. 예전처럼 내장 영상 작업으로 돌려 '영상 없음'으로 끝내지 않는다.
function _evFromFile(fp){
  try{ if (fp && fs.existsSync(fp)){ var ev = Date.parse(parseFtmf(fs.readFileSync(fp)).eventTime); if (ev && !isNaN(ev)) return ev; } }catch(e){}
  return 0;
}
function _evFromShotId(id){
  var m = /^tm_.+_(\d{9,11})$/.exec(id || '');
  return m ? (+m[1]) * 1000 : 0;
}
function rebuildVideoQueue(){
  var names = Object.keys(processed), nVf = 0, nEmb = 0;
  for (var i = 0; i < names.length; i++){
    var fn = names[i], p = processed[fn];
    if (!p || !p.id) continue;
    var vj = (p.vj && typeof p.vj === 'object') ? p.vj : null;
    var hasVp = typeof p.vp === 'string';
    if (!vj && !hasVp) continue;
    var bay = p.bay || CFG.defaultBay || 'bay3';
    var kind = vj && vj.k;
    if (!kind) kind = (hasVp && /\.stmf$/i.test(p.vp)) ? 'vf' : 'emb';
    if (_hasJob(p.id, kind)){ delete p.vp; delete p.vj; continue; }   // 종류마다 샷당 작업 1개
    if (kind === 'vf'){
      var ev = vj ? +vj.ev : 0;
      if (!ev || isNaN(ev)) ev = _evFromFile(p.vp) || _evFromShotId(p.id);
      if (!ev){ delete p.vp; delete p.vj; continue; }
      var keys = {};
      if (vj && vj.keys && typeof vj.keys === 'object')
        ['dl','fo','club','ball'].forEach(function(a){ if (typeof vj.keys[a] === 'string' && vj.keys[a]) keys[a] = vj.keys[a]; });
      var job = { videosFolder:true, shotId:p.id, bayId:bay, evMs:ev, fname:fn, _restored:true };
      if (Object.keys(keys).length){ job._keys = keys; job._have = { dl:!!keys.dl, fo:!!keys.fo, club:!!keys.club, ball:!!keys.ball }; }
      _videoQueue.push(job);
      delete p.vp; p.vj = { k:'vf', ev: ev, keys: keys };
      if (_hasJob(p.id, 'emb')) _markEmbFallback(p.id);   // 먼저 복구한 같은 스윙의 내장 영상 작업 → 대비용
      _markJob(p.id, 'vf'); nVf++;
    } else if (hasVp && fs.existsSync(p.vp)){
      var ejob = { fp: p.vp, fname: fn, shotId: p.id, bayId: bay, _restored:true };
      if ((vj && vj.fb) || _hasJob(p.id, 'vf')){ ejob._fallback = true; p.vj = { k:'emb', fb:1 }; }
      _videoQueue.push(ejob);
      _markJob(p.id, 'emb'); nEmb++;
    } else { delete p.vp; delete p.vj; }
  }
  _recoveredJobs = nVf + nEmb;
  if (_recoveredJobs) log('영상 대기열 복구: ' + _recoveredJobs + '건 (이전 실행에서 데이터만 전송됨 — Videos 폴더 ' + nVf + ' · 내장 영상 ' + nEmb + ')');
  return _recoveredJobs;
}

// ---- 폴더 스캔 (하위 폴더 2단계까지 재귀 — TPS 세션/날짜별 하위 폴더 + tmfs/timed_out_<날짜>) ----
// .ftmf(정상 Data 폴더) 와 .stmf(고장 상태의 timed_out 폴더) 둘 다 수집한다.
function listFtmfFiles(dir, depth){
  var out = [];
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (var i = 0; i < entries.length; i++){
    var ent = entries[i];
    var fp = path.join(dir, ent.name);
    try{
      if (ent.isDirectory()){ if (depth > 0) out = out.concat(listFtmfFiles(fp, depth - 1)); continue; }
      if (/\.(ftmf|stmf)$/i.test(ent.name)) out.push(fp);
    }catch(e){}
  }
  return out;
}
// ---- 워치독: 12분 이상 아무 진행이 없으면 프로세스를 강제 재시작 ----
// 오늘(7/20 낮) 증상의 재발 방지 최후 안전망. 각 단계에 개별 타임아웃을 넣었지만,
// 예상 못 한 지점에서 또 걸리더라도 — 살아있는 채 멈춘 프로세스는 자동재시작 루프가
// 못 살린다(죽어야 되살림) — 여기서 스스로 죽어서 start-hidden.vbs 가 4초 뒤 되살린다.
var _lastProgress = Date.now();
function _watchdogTick(){ _lastProgress = Date.now(); }
// (v12) 워치독 타이머는 start() 에서 건다 (테스트가 모듈만 불러올 때 프로세스를 붙잡거나 죽이지 않게)
function _startWatchdog(){
  setInterval(function(){
    if (Date.now() - _lastProgress > 12*60000){
      say('🚨 워치독: 12분 이상 진행 없음 — 프로세스 강제 재시작 (자동실행 루프가 4초 뒤 되살림)');
      process.exit(1);
    }
  }, 60000);
}

var _lastBeat = 0;
async function scan(){
  rotateLogIfBig();
  _watchdogTick();
  // 활성(타석 레슨) 세션 목록 갱신 — 8초마다. 게이트 판정에 사용.
  // (v12/B5) 2시간 레슨·샷이 없으면(한가함) 60초마다 — 새 샷 파일이 오면 그 자리에서 재확인하므로 안전.
  if (CFG.requireActiveSession !== false && Date.now() - _activeBaysAt > (_isIdle() ? 60000 : 8000)){
    await refreshActiveBays();
  }
  var dirs = Array.isArray(CFG.watchDirs) ? CFG.watchDirs : [CFG.watchDir];
  // 시작 시점 컷오프 — 에이전트 켠 이후 생성된 ftmf만 처리(과거 연습기록 무시)
  // CFG.processExisting=true 면 과거 것도 처리. backfillMinutes 면 그만큼 과거까지 허용.
  var cutoff = AGENT_CUTOFF_MS;
  var totalCount = 0, newestFp = null, newestMt = 0;
  for (var d = 0; d < dirs.length; d++){
    var dir = dirs[d];
    if (!dir) continue;
    var files = listFtmfFiles(dir, 2);   // 하위 폴더 2단계까지
    files.sort();
    totalCount += files.length;
    for (var i = 0; i < files.length; i++){
      var fp = files[i];
      var fname = path.basename(fp);
      // 이미 처리 끝난 파일(성공·잡음·에러) 또는 컷오프 이전 파일은 stat 없이 스킵.
      if (processed[fname] || _beforeStart[fname]) continue;
      var mt = 0;
      try { mt = fs.statSync(fp).mtimeMs; } catch(e){}
      if (mt > newestMt){ newestMt = mt; newestFp = fp; }
      if (mt > _newestTmMt) _newestTmMt = mt;   // (v12) 하트비트 '트랙맨 최신 파일' (처음 볼 때 한 번씩 stat 됨)
      if (!CFG.processExisting && mt && mt < cutoff){
        _beforeStart[fname] = 1;   // processed 아님 — 상한 오염 없이 영구 스킵
        continue;
      }
      try { await handleFtmf(fp); }
      catch (e) { log('처리 오류 ' + fname + ': ' + e.message); }
      _watchdogTick();
    }
  }
  // 영상 대기열 — 한 번에 1건, 그리고 "await 하지 않는다"(백그라운드 실행).
  // 아이폰 .mov 트랜스코드가 수십 초 걸려도 데이터 전송(다음 스캔)은 5초마다 계속 돈다.
  // → "방금 친 샷의 데이터"가 영상 변환 때문에 밀리는 일이 없다.
  if (_videoQueue.length && !_videoBusy){
    // (v12) 같은 스윙의 Videos 폴더 작업을 기다리는 대비용 내장 영상 작업은 차례를 쓰지 않고 뒤로 — 다음 작업을 바로 처리
    var vjob = null;
    for (var vi = _videoQueue.length; vi > 0 && !vjob; vi--){
      var vcand = _videoQueue.shift();
      if (_embWaitForVf(vcand)) _videoQueue.push(vcand); else vjob = vcand;
    }
    if (vjob){
      _videoBusy = true;
      _videoCurrent = vjob;
      processVideoJob(vjob)
        .catch(function(e){
          log('영상 처리 오류 ' + (vjob.fname||vjob.shotId) + ': ' + (e&&e.message||e));
          _clearVideoJobState(vjob.fname);
        })
        .then(function(){ _videoBusy = false; _videoCurrent = null; _watchdogTick(); });
    }
  }
  // 원본 영상 요청 — 20초마다 앱이 남긴 요청을 확인해 백그라운드로 처리 (변환 큐와 별개)
  try{ await origRequestTick(); }catch(e){}
  // 하트비트 (5분마다) — 감시가 살아있는지 + 에이전트 눈에 보이는 "최신 파일"이 뭔지.
  // 샷을 쳤는데 앱에 안 뜰 때: 이 줄의 최신 파일 시각이 안 올라가면 TPS가 파일을
  // 안 쓰고 있는 것(트랙맨 설정/활동 저장 문제), 올라가는데 처리가 없으면 에이전트 문제.
  if (Date.now() - _lastBeat > 5*60000){
    _lastBeat = Date.now();
    var beat = '감시 중 — 파일 ' + totalCount + '개';
    // 최근 처리한 샷 시각(lastSeenMtime)으로 "살아있고 최근까지 샷을 먹었는지" 표시.
    var lm = _stateMeta.lastSeenMtime || 0;
    if (lm) beat += ', 최근 처리 ' + Math.round((Date.now()-lm)/1000) + '초 전';
    if (newestFp){
      var rel = newestFp; try{ rel = path.relative(dirs[0]||'', newestFp) || path.basename(newestFp); }catch(e){}
      beat += ', 미처리 최신 ' + Math.round((Date.now()-newestMt)/1000) + '초 전';
    }
    if (_videoQueue.length) beat += ', 영상 대기 ' + _videoQueue.length + '건';
    if (CFG.requireActiveSession !== false){
      var ab = Object.keys(_activeBays);
      beat += ', 타석 레슨 ' + (ab.length ? 'ON('+ab.join(',')+')' : 'OFF — 연습샷 저장 안 함');
      var exb = Object.keys(_expiredBays);
      if (exb.length) beat += ', 세션 ' + (SESSION_MAX_MS/3600000) + '시간 초과(꺼짐 취급): ' + exb.join(',');
    }
    // (v12) 원격 하트비트 상태 — 실패해도 수집은 계속됨
    if (CFG.heartbeat !== false){
      beat += ', 하트비트 ' + (_hb.lastOkAt ? ('✓ ' + Math.round((Date.now()-_hb.lastOkAt)/60000) + '분 전') : '아직 없음') + (_hb.fails ? (' · 실패 ' + _hb.fails + '회 연속') : '');
    }
    if (_isIdle()) beat += ', 한가함(확인 주기 완화)';
    log(beat);
  }
  _lastScanAt = Date.now();
  _stateMeta.newestTmMt = _newestTmMt || undefined;
  saveState();
  maybeSendHeartbeat();   // (v12) 시작 후 첫 스캔 끝 + 5분마다 — 기다리지 않음(수집에 영향 없음)
}

// ---- PC 시계 검증 (외부 NTP-급 시각과 교차검증) ----
// Google + Cloudflare HTTPS 응답의 Date 헤더(서버 시각)와 로컬 비교.
// 두 곳 모두 신뢰가능 + 서로 교차검증 → 한쪽 장애에도 robust.
function _httpDate(host){
  return new Promise(function(resolve){
    var t0 = Date.now();
    var req = https.request({hostname:host, port:443, method:'HEAD', path:'/', timeout:5000}, function(res){
      var t1 = Date.now();
      var hdr = res.headers && res.headers.date;
      res.resume();
      if(!hdr) return resolve(null);
      var serverMs = Date.parse(hdr);
      if(isNaN(serverMs)) return resolve(null);
      // RTT 절반 보정 (응답 받은 시점 ≈ 서버시각 + RTT/2)
      var localMid = (t0 + t1)/2;
      resolve(localMid - serverMs); // 양수 = PC가 앞섬, 음수 = 뒤짐
    });
    req.on('error', function(){ resolve(null); });
    req.on('timeout', function(){ try{req.destroy();}catch(e){} resolve(null); });
    req.end();
  });
}
async function checkClock(){
  say('PC 시계 검증 중... (Google + Cloudflare 교차검증)');
  var results = await Promise.all([_httpDate('www.google.com'), _httpDate('www.cloudflare.com')]);
  var skews = results.filter(function(x){ return x!==null; });
  if(skews.length===0){
    say('⚠️ 시계 검증 실패 (네트워크) — 건너뜀');
    return;
  }
  var avg = Math.round(skews.reduce(function(a,b){return a+b;},0) / skews.length);
  var avgSec = Math.round(avg/1000);
  var sign = avg>=0 ? '+' : '';
  var sources = ['google','cloudflare'].filter(function(_,i){return results[i]!==null;}).join('/');
  say('  → 출처('+sources+') 평균 차이: '+sign+avgSec+'초 ('+sign+avg+'ms)');
  if(Math.abs(avg) < 5000){
    say('  ✓ PC 시계 정확 (5초 이내) — 샷 시각 신뢰 OK');
  } else if(Math.abs(avg) < 60000){
    say('  ⚠️ PC 시계가 '+sign+avgSec+'초 어긋남 — 동기화 권장');
  } else {
    var min = Math.round(avg/60000);
    say('  🚨 PC 시계가 '+(min>=0?'+':'')+min+'분 어긋남! Windows 시간 동기화 필요:');
    say('     설정 > 시간 및 언어 > 날짜 및 시간 > "지금 동기화" 클릭');
    say('     또는 관리자 cmd: w32tm /resync');
  }
}

// ---- 메인 루프 ----
function _looksUnset(v){ return !v || /^\s*</.test(String(v)); }
function start(){
  _startedAt = Date.now();
  _stateMeta.restarts = (+_stateMeta.restarts || 0) + 1;   // (v12) 하트비트 '재시작 횟수'
  rebuildVideoQueue();                                     // 재시작 시 미완료 영상 작업 복구
  _stateMeta.recoveredTotal = (+_stateMeta.recoveredTotal || 0) + _recoveredJobs;
  saveState();
  _startWatchdog();
  say('=== Golf PT Bay Agent 시작 === v' + AGENT_VERSION + ' bayMap=' + JSON.stringify(CFG.bayMap||{}) + ' interval=' + (CFG.intervalSec||5) + 's');
  say('PC 로컬시각: ' + new Date().toString());
  say('영상 변환(MP4): ' + (CFG.ffmpegPath ? ('ON → ' + CFG.ffmpegPath) : 'OFF (ffmpegPath 미설정)'));
  say('타석 레슨 게이트: ' + (CFG.requireActiveSession !== false ? 'ON (앱에서 타석 레슨 켠 베이의 샷만 저장 — 연습샷 제외' + (SESSION_MAX_MS > 0 ? ', 세션 ' + (SESSION_MAX_MS/3600000) + '시간 넘으면 꺼짐 취급' : '') + ')' : 'OFF (모든 샷 저장)'));
  if (AGENT_TOKEN) say('타석 PC 토큰: 사용 (서버 요청에 함께 보냄)');
  else if (_tokenNote) say('⚠️ ' + _tokenNote);
  // ⚠️ 이 문구에 '샷 전송' 을 넣지 말 것 — gpt-admin.ps1 diag 가 그 글자가 든 줄을 '업로드 1건'으로 세어 정상으로 잘못 판정한다
  if (_looksUnset(CFG.SUPABASE_ANON_KEY)) say('🚨 config.json 의 SUPABASE_ANON_KEY 가 비어 있음(샘플 자리표시자) — 샷을 서버에 보낼 수 없음. 관리자에게 키를 받아 넣으세요');
  if (CFG.uploadVideo && _looksUnset(CFG.R2_API_KEY) && !AGENT_TOKEN) say('⚠️ config.json 의 R2_API_KEY 가 비어 있음(샘플 자리표시자) — 영상 업로드·하트비트 불가');
  checkClock().catch(function(e){ say('시계검증 오류: '+e.message); });
  if (CFG.requireActiveSession !== false) refreshActiveBays().catch(function(){});   // 시작 시 1회 선갱신
  // (v12) 시작 하트비트 — 보통 첫 스캔 끝에 나가지만, 첫 스캔이 밀린 백로그로 오래 걸려도 20초 안에 한 번은 보낸다
  setTimeout(function(){ try{ if (!_hb.lastAttempt) maybeSendHeartbeat(); }catch(e){} }, 20000);
  (function loop(){
    scan().catch(function(e){ log('scan 오류: ' + e.message); })
          .then(function(){ setTimeout(loop, (CFG.intervalSec || 5) * 1000); });
  })();
}

// (v12) 테스트용 내부 공개 — 'node agent.js' 동작에는 영향 없음
module.exports = {
  AGENT_VERSION: AGENT_VERSION,
  start: start,
  __test: {
    handleFtmf: handleFtmf, processVideoJob: processVideoJob, scan: scan, rebuildVideoQueue: rebuildVideoQueue,
    refreshActiveBays: refreshActiveBays, refreshActiveBaysNow: refreshActiveBaysNow, findShotVideos: findShotVideos,
    attachShotVideo: attachShotVideo, patchShotData: patchShotData, repushShotData: repushShotData,
    buildHeartbeat: buildHeartbeat, maybeSendHeartbeat: maybeSendHeartbeat, sendHeartbeats: sendHeartbeats,
    convertFileToMp4: convertFileToMp4, origRequestTick: origRequestTick, saveState: saveState, uploadVideo: uploadVideo,
    deleteVideo: deleteVideo, pushShot: pushShot, sbHeaders: sbHeaders, workerHeaders: workerHeaders,
    get CFG(){ return CFG; }, get processed(){ return processed; }, get videoQueue(){ return _videoQueue; },
    get videoBusy(){ return _videoBusy; }, get activeBays(){ return _activeBays; }, get expiredBays(){ return _expiredBays; },
    get activeBaysAt(){ return _activeBaysAt; }, set activeBaysAt(v){ _activeBaysAt = v; },
    get videoQueuedFor(){ return _videoQueuedFor; }, get videoAssigned(){ return _videoAssigned; },
    get stateMeta(){ return _stateMeta; }, get skew(){ return _skew; }, get hb(){ return _hb; },
    get recoveredJobs(){ return _recoveredJobs; }, get agentToken(){ return AGENT_TOKEN; },
    get lastActivityAt(){ return _lastActivityAt; }, set lastActivityAt(v){ _lastActivityAt = v; },
    get origLastPoll(){ return _origLastPoll; }, set origLastPoll(v){ _origLastPoll = v; },
    get noSession(){ return _noSession; }, get noSessionFirst(){ return _noSessionFirst; }, isIdle: _isIdle,
    get forceRefreshAt(){ return _forceRefreshAt; },
    get SESSION_MAX_MS(){ return SESSION_MAX_MS; }, get FO_MAX_BYTES(){ return FO_MAX_BYTES; },
    fetchShotRow: fetchShotRow, httpRequest: httpRequest, withShotLock: withShotLock,
    get deleteRefused(){ return _deleteRefused; }, REPUSH_LOCK_WAIT_MS: REPUSH_LOCK_WAIT_MS, EMB_DEFER_MAX_MS: EMB_DEFER_MAX_MS
  }
};
// 'node agent.js' 로 실행하면 예전과 똑같이 바로 시작한다. (테스트가 GPT_AGENT_NO_AUTOSTART=1 로 모듈만 부를 때만 시작 안 함)
if (require.main === module || !process.env.GPT_AGENT_NO_AUTOSTART) start();
