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
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); }
catch (e) { console.error('config.json 읽기 실패:', e.message); process.exit(1); }

var STATE_FILE = path.join(__dirname, '.agent-state.json');
var LOG_FILE = path.join(__dirname, 'agent.log');
var processed = {};
try { processed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
// 시작 컷오프: 기본 = 에이전트 켠 시각. backfillMinutes 만큼 과거 허용 가능.
var AGENT_CUTOFF_MS = Date.now() - ((CFG && CFG.backfillMinutes ? CFG.backfillMinutes : 0) * 60000);

function log(msg){
  var line = '[' + new Date().toISOString() + '] ' + msg;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
  if (CFG.verbose) console.log(line);
}
function say(msg){ // verbose 무관 항상 콘솔 + 로그
  var line = '[' + new Date().toISOString() + '] ' + msg;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
  console.log(line);
}
function saveState(){ try { fs.writeFileSync(STATE_FILE, JSON.stringify(processed)); } catch (e) {} }

// ---- HTTPS helper ----
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
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---- Supabase: shot_events insert ----
async function pushShot(shot){
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

// ---- R2: 영상 업로드 (워커 PUT /{key}) ----
async function uploadVideo(key, buf, contentType){
  if (!CFG.R2_WORKER_URL || !CFG.R2_API_KEY) return false;
  return new Promise(function(resolve){
    try{
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      var req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'PUT', port:443,
        headers:{ 'X-API-Key': CFG.R2_API_KEY, 'Content-Type': contentType||'application/octet-stream', 'Content-Length': buf.length } },
        function(res){ res.on('data',function(){}); res.on('end',function(){ resolve(res.statusCode>=200&&res.statusCode<300); }); });
      req.on('error', function(e){ log('  ! R2 업로드 오류 '+e.message); resolve(false); });
      req.write(buf); req.end();
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
  catch (e) { log('파싱 실패 ' + fname + ': ' + e.message); processed[fname] = { err: e.message, t: Date.now() }; saveState(); return; }

  var bayId = resolveBay(parsed.trackingUnit);
  if (!bayId) { log('베이 매핑 없음 (TrackingUnit=' + parsed.trackingUnit + '), 건너뜀'); processed[fname] = { skip:'no-bay', t:Date.now() }; saveState(); return; }

  var shotId = 'tm_' + (parsed.measurementId || (Date.now()+''+Math.random().toString(36).slice(2,6)));
  var videoKey = null;

  // 영상 업로드 (옵션) — ftmf 내부 scene.mkv
  if (CFG.uploadVideo && parsed.videos && parsed.videos.length){
    try{
      var outer = require('./ftmf-parser.js').readZipEntries(buf);
      var sceneName = require('./ftmf-parser.js').findEntry(outer, '_scene.mkv');
      if (sceneName){
        var vbuf = require('./ftmf-parser.js').extractEntry(buf, outer[sceneName]);
        var key = bayId + '/' + (parsed.measurementId || shotId) + '_scene.mkv';
        var ok = await uploadVideo(key, vbuf, 'video/x-matroska');
        if (ok){ videoKey = key; log('  영상 업로드 ' + (vbuf.length/1e6).toFixed(1) + 'MB → ' + key); }
      }
    }catch(e){ log('  영상 업로드 스킵: ' + e.message); }
  }

  // shot_events insert (member는 비워두고 서버/앱이 활성세션으로 귀속)
  // ts = "지금 처리한 시각"(UTC). 샷 친 직후 수 초 내 처리되므로 정확하고,
  // ftmf 내부 시각의 타임존 혼선을 피한다. 원본 시각은 data.measuredAt에 보존.
  var nowIso = new Date().toISOString();
  var shot = {
    id: shotId,
    bay_id: bayId,
    member_id: CFG.pendingMemberId || '00000000-0000-0000-0000-000000000000',
    member_name: '',
    author: '',
    ts: nowIso,
    data: Object.assign({ measurementId: parsed.measurementId, trackingUnit: parsed.trackingUnit, measuredAt: parsed.eventTime }, parsed.data),
    video_r2_key: videoKey,
    source: 'agent'
  };
  var ok = await pushShot(shot);
  if (ok){
    log('✓ 샷 전송 ' + fname + ' [' + (parsed.data.club||'?') + ' carry=' + parsed.data.carry + 'm] bay=' + bayId);
    processed[fname] = { id: shotId, mid: parsed.measurementId, t: Date.now() };
    saveState();
  } else {
    log('전송 실패(다음 주기 재시도): ' + fname);
  }
}

// ---- 폴더 스캔 ----
async function scan(){
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
checkClock().catch(function(e){ say('시계검증 오류: '+e.message); });
(function loop(){
  scan().catch(function(e){ log('scan 오류: ' + e.message); })
        .then(function(){ setTimeout(loop, (CFG.intervalSec || 5) * 1000); });
})();
