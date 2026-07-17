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
var _stateMeta = {};
try {
  var _raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  // 신형: {__meta:{lastCutoff}, ...processed}. 구형: 그냥 processed 맵.
  if (_raw && _raw.__meta){ _stateMeta = _raw.__meta; delete _raw.__meta; }
  processed = _raw || {};
} catch (e) {}
var _parseFail = {};   // 부분 파일 파싱 재시도 카운터 (영속 아님)
// 시작 컷오프: 재시작 때마다 '지금'으로 리셋하면 단절/크래시/재부팅 동안의 샷이 유실된다.
// → 직전 실행이 마지막으로 처리한 시각을 이어받아, 그 사이 생성된 ftmf 도 처리한다.
// (단 과도한 소급 방지: 최대 7일 전까지만. backfillMinutes 는 추가 여유.)
var _now = Date.now();
var _resume = (_stateMeta && _stateMeta.lastSeenMtime) ? _stateMeta.lastSeenMtime : _now;
var _maxBack = _now - 7*24*3600*1000;
var AGENT_CUTOFF_MS = Math.max(_maxBack, Math.min(_resume, _now)) - ((CFG && CFG.backfillMinutes ? CFG.backfillMinutes : 0) * 60000);

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
    // 처리이력 무한 증가 방지 — 최근 4000건만 유지(오래된 것부터 정리). 원자적 저장.
    var keys = Object.keys(processed);
    if (keys.length > 4000){
      var arr = keys.map(function(k){ return [k, (processed[k] && processed[k].t) || 0]; });
      arr.sort(function(a,b){ return a[1]-b[1]; });
      for (var i=0;i<arr.length-4000;i++){ delete processed[arr[i][0]]; }
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

// ---- HTTPS helper (타임아웃 포함 — 네트워크 단절 시 무한 정지 방지) ----
function httpRequest(urlStr, opts, body){
  return new Promise(function(resolve, reject){
    var u = new URL(urlStr);
    var req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET',
      headers: opts.headers || {}, port: 443
    }, function(res){
      var chunks = [];
      res.on('data', function(c){ chunks.push(c); });
      res.on('end', function(){ resolve({ status: res.statusCode, body: Buffer.concat(chunks) }); });
    });
    var TIMEOUT = (opts.timeoutMs || 30000);
    req.setTimeout(TIMEOUT, function(){ req.destroy(new Error('timeout '+TIMEOUT+'ms')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---- Supabase: shot_events insert ----
// useDbProxy=true 면 워커 /db 경유(RLS 읽기전용 전환 후). 아니면 anon 직접(하위호환).
async function pushShot(shot){
  if (CFG.useDbProxy && CFG.R2_WORKER_URL && CFG.R2_API_KEY){
    var purl = CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/db';
    var pres = await httpRequest(purl, { method:'POST', headers:{ 'X-API-Key':CFG.R2_API_KEY, 'Content-Type':'application/json' } },
      JSON.stringify({ op:'upsert', table:'shot_events', rows:[shot] }));
    if (pres.status >= 200 && pres.status < 300) return true;
    log('  ! DB프록시 insert 실패 ' + pres.status + ' ' + pres.body.toString().slice(0,200));
    return false;
  }
  var url = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events';
  var res = await httpRequest(url, {
    method: 'POST',
    headers: {
      'apikey': CFG.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + CFG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    }
  }, JSON.stringify(shot));
  if (res.status >= 200 && res.status < 300) return true;
  log('  ! Supabase insert 실패 ' + res.status + ' ' + res.body.toString().slice(0,200));
  return false;
}

// ---- 샷 행에 영상 키를 나중에 붙이기 (데이터 먼저 전송 구조) ----
// 현재 행 data 를 읽어와 병합 — 그 사이 앱이 저장한 보관 플래그(_kept) 등을 덮어쓰지 않게.
async function fetchShotData(shotId){
  try{
    var url = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events?id=eq.' + encodeURIComponent(shotId) + '&select=data';
    var res = await httpRequest(url, { method:'GET', headers:{ 'apikey':CFG.SUPABASE_ANON_KEY, 'Authorization':'Bearer '+CFG.SUPABASE_ANON_KEY } });
    if (res.status >= 200 && res.status < 300){
      var j = JSON.parse(res.body.toString());
      return (j && j[0] && j[0].data) || null;
    }
  }catch(e){}
  return null;
}
async function attachShotVideo(shotId, videoKey, mp4Key, fallbackData){
  var cur = await fetchShotData(shotId);
  var data = Object.assign({}, fallbackData, cur || {});   // 서버 최신 data 우선(그 사이 앱 변경 보존)
  delete data._videoPending;                               // 업로드 종료(성공/실패) → 진행 표시 해제
  if (mp4Key) data.videoMp4R2Key = mp4Key;
  var values = { video_r2_key: videoKey, data: data };
  if (CFG.useDbProxy && CFG.R2_WORKER_URL && CFG.R2_API_KEY){
    var purl = CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/db';
    var pres = await httpRequest(purl, { method:'POST', headers:{ 'X-API-Key':CFG.R2_API_KEY, 'Content-Type':'application/json' } },
      JSON.stringify({ op:'update', table:'shot_events', values:values, filters:[{col:'id',op:'eq',val:shotId}] }));
    if (pres.status >= 200 && pres.status < 300) return true;
    log('  ! 영상키 업데이트 실패 ' + pres.status + ' ' + pres.body.toString().slice(0,150));
    return false;
  }
  var url2 = CFG.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/shot_events?id=eq.' + encodeURIComponent(shotId);
  var res2 = await httpRequest(url2, { method:'PATCH', headers:{
    'apikey':CFG.SUPABASE_ANON_KEY, 'Authorization':'Bearer '+CFG.SUPABASE_ANON_KEY,
    'Content-Type':'application/json', 'Prefer':'return=minimal' } }, JSON.stringify(values));
  if (res2.status >= 200 && res2.status < 300) return true;
  log('  ! 영상키 업데이트 실패(직접) ' + res2.status);
  return false;
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
      var err='';
      p.stderr.on('data', function(d){ err += d.toString(); });
      p.on('error', function(){ resolve({code:-1, err:err}); });
      p.on('close', function(code){ resolve({code:code, err:err}); });
    });
  }
  try{
    // 1) 빠른 리먹스 (재인코딩 X) — 코덱이 H.264/AAC 면 즉시 끝
    var r = await run(['-y','-i', tmpIn, '-c','copy','-movflags','+faststart', tmpOut]);
    if (r.code !== 0 || !fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 1024){
      // 2) 폴백: 트랜스코드 (H.264 + AAC)
      r = await run(['-y','-i', tmpIn, '-c:v','libx264','-preset','veryfast','-crf','24','-c:a','aac','-b:a','128k','-movflags','+faststart', tmpOut]);
      if (r.code !== 0) throw new Error('ffmpeg 종료 '+r.code+': '+r.err.slice(0,200));
    }
    var out = fs.readFileSync(tmpOut);
    return out;
  } finally {
    try{ fs.unlinkSync(tmpIn); }catch(_){}
    try{ fs.unlinkSync(tmpOut); }catch(_){}
  }
}

async function uploadVideo(key, buf, contentType){
  if (!CFG.R2_WORKER_URL || !CFG.R2_API_KEY) return false;
  return new Promise(function(resolve){
    try{
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      var req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'PUT', port:443,
        headers:{ 'X-API-Key': CFG.R2_API_KEY, 'Content-Type': contentType||'application/octet-stream', 'Content-Length': buf.length } },
        function(res){ res.on('data',function(){}); res.on('end',function(){ resolve(res.statusCode>=200&&res.statusCode<300); }); });
      req.setTimeout(120000, function(){ req.destroy(new Error('R2 업로드 타임아웃')); });   // 대용량 영상 여유 2분
      req.on('error', function(e){ log('  ! R2 업로드 오류 '+e.message); resolve(false); });
      req.write(buf); req.end();
    }catch(e){ resolve(false); }
  });
}
// R2 객체 삭제 — mp4 변환본 확보 후 용량 2배인 mkv 원본을 지워 저장비를 절반으로.
async function deleteVideo(key){
  if (!CFG.R2_WORKER_URL || !CFG.R2_API_KEY) return false;
  return new Promise(function(resolve){
    try{
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      var req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'DELETE', port:443,
        headers:{ 'X-API-Key': CFG.R2_API_KEY } },
        function(res){ res.on('data',function(){}); res.on('end',function(){ resolve(res.statusCode>=200&&res.statusCode<300); }); });
      req.setTimeout(30000, function(){ req.destroy(new Error('R2 삭제 타임아웃')); });
      req.on('error', function(e){ log('  ! R2 삭제 오류 '+e.message); resolve(false); });
      req.end();
    }catch(e){ resolve(false); }
  });
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

  // 파일이 아직 쓰이는 중일 수 있어 — 크기 안정될 때까지 대기
  var size1 = fs.statSync(filePath).size;
  await new Promise(function(r){ setTimeout(r, 1500); });
  var size2 = fs.statSync(filePath).size;
  if (size1 !== size2) { log('아직 쓰는 중, 다음 주기에: ' + fname); return; }

  var buf = fs.readFileSync(filePath);
  var parsed;
  try { parsed = parseFtmf(buf); }
  catch (e) {
    // 파싱 실패 = TPS가 파일을 점진적으로 채우는 중일 수 있음(측정 JSON이 나중에 들어옴).
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

  var shotId = 'tm_' + (parsed.measurementId || (Date.now()+''+Math.random().toString(36).slice(2,6)));

  // ── 1단계: 샷 "데이터"를 먼저 전송 (영상 없이) ─────────────────────────
  // 기존엔 영상 업로드(20MB+)·MP4 변환이 끝나야 전송해 샷당 20~30초 지연 →
  // "다음 샷을 쳐야 이전 샷이 뜬다"는 체감의 원인. 데이터를 수 초 내 먼저 보내고
  // 영상은 준비되는 대로 행에 붙인다(attachShotVideo).
  var nowIso = new Date().toISOString();
  var shot = {
    id: shotId,
    bay_id: bayId,
    member_id: CFG.pendingMemberId || '00000000-0000-0000-0000-000000000000',
    member_name: '',
    author: '',
    ts: nowIso,
    data: Object.assign({ measurementId: parsed.measurementId, trackingUnit: parsed.trackingUnit, measuredAt: parsed.eventTime,
      // 앱이 "영상 업로드 중" 진행 표시를 띄울 수 있게 예고 — 업로드 완료/실패 시 해제됨
      _videoPending: (CFG.uploadVideo && parsed.videos && parsed.videos.length) ? 1 : undefined }, parsed.data),
    video_r2_key: null,
    source: 'agent'
  };
  var ok = await pushShot(shot);
  if (!ok){ log('전송 실패(다음 주기 재시도): ' + fname); return; }

  log('✓ 샷 전송(데이터) ' + fname + ' [' + (parsed.data.club||'?') + ' carry=' + parsed.data.carry + 'm total=' + parsed.data.total + 'm] bay=' + bayId);
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
  processed[fname] = { id: shotId, mid: parsed.measurementId, t: Date.now() };
  try{ var _mt=fs.statSync(filePath).mtimeMs; if(_mt> (_stateMeta.lastSeenMtime||0)) _stateMeta.lastSeenMtime=_mt; }catch(e){}
  saveState();

  // ── 2단계: 영상 업로드 → 행에 영상 키 붙이기 (데이터 표시와 무관하게 진행) ──
  // mp4 우선: 변환 성공 시 mp4 만 업로드. (기존 "mkv 23MB 업로드→변환→mp4 업로드→mkv 삭제"
  // 구조는 업로드량 2.5배 + 준비시간 2배 — 제거. mkv 는 변환 불가 시에만 원본 보존용으로 업로드)
  if (CFG.uploadVideo && parsed.videos && parsed.videos.length){
    var videoKey = null, videoMp4Key = null;
    try{
      var outer = require('./ftmf-parser.js').readZipEntries(buf);
      var sceneName = require('./ftmf-parser.js').findEntry(outer, '_scene.mkv');
      if (sceneName){
        var vbuf = require('./ftmf-parser.js').extractEntry(buf, outer[sceneName]);
        var base = bayId + '/' + (parsed.measurementId || shotId);
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
    // 성공이든 실패든 행 갱신 — 영상 키 부착 + _videoPending 해제(앱 진행표시 종료)
    try{
      var okU = await attachShotVideo(shotId, videoKey, videoMp4Key, shot.data);
      if (okU && (videoKey || videoMp4Key)) log('  영상 연결 완료 → ' + (videoMp4Key || videoKey));
    }catch(e){ log('  영상 연결 실패: ' + (e && e.message || e)); }
  }
}

// ---- 폴더 스캔 ----
async function scan(){
  rotateLogIfBig();
  var dirs = Array.isArray(CFG.watchDirs) ? CFG.watchDirs : [CFG.watchDir];
  // 시작 시점 컷오프 — 에이전트 켠 이후 생성된 ftmf만 처리(과거 연습기록 무시)
  // CFG.processExisting=true 면 과거 것도 처리. backfillMinutes 면 그만큼 과거까지 허용.
  var cutoff = AGENT_CUTOFF_MS;
  for (var d = 0; d < dirs.length; d++){
    var dir = dirs[d];
    if (!dir) continue;
    var files;
    try { files = fs.readdirSync(dir); } catch (e) { continue; }
    files = files.filter(function(f){ return /\.ftmf$/i.test(f); });
    files.sort();
    for (var i = 0; i < files.length; i++){
      var fp = path.join(dir, files[i]);
      // 파일 생성/수정 시각이 컷오프보다 이전이면 스킵 (단, 이미 처리표시는 남김)
      if (!CFG.processExisting){
        try {
          var mt = fs.statSync(fp).mtimeMs;
          if (mt < cutoff){
            if (!processed[files[i]]) { processed[files[i]] = { skip:'before-start', t:Date.now() }; }
            continue;
          }
        } catch(e){}
      }
      try { await handleFtmf(fp); }
      catch (e) { log('처리 오류 ' + files[i] + ': ' + e.message); }
    }
  }
  saveState();
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
say('=== Golf PT Bay Agent 시작 === bayMap=' + JSON.stringify(CFG.bayMap||{}) + ' interval=' + (CFG.intervalSec||5) + 's');
say('PC 로컬시각: ' + new Date().toString());
say('영상 변환(MP4): ' + (CFG.ffmpegPath ? ('ON → ' + CFG.ffmpegPath) : 'OFF (ffmpegPath 미설정)'));
checkClock().catch(function(e){ say('시계검증 오류: '+e.message); });
(function loop(){
  scan().catch(function(e){ log('scan 오류: ' + e.message); })
        .then(function(){ setTimeout(loop, (CFG.intervalSec || 5) * 1000); });
})();
