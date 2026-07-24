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
// '컷오프 이전' 파일은 여기(별도·비영속)로만 표시하고 processed 에는 넣지 않는다.
// 이유: 고장 상태 폴더엔 파일이 수천~수만 개라, before-start 를 processed 에 넣으면
// 4000개 상한에 걸려 계속 축출·재삽입되면서 '이미 보낸 실제 샷' 기록까지 밀려나
// 같은 샷을 매 스캔 재전송하는 버그가 났다. before-start 는 재전송과 무관하니 분리.
var _beforeStart = {};
var _shotBest = {};        // shotId → 지금까지 보낸 측정 완성도 점수(더 완전한 값만 반영)
var _videoQueuedFor = {};  // shotId → 영상 작업 큐에 넣었는지(샷당 1회만)
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
// 시작 컷오프: 재시작 때마다 '지금'으로 리셋하면 단절/크래시/재부팅 동안의 샷이 유실된다.
// → 직전 실행이 마지막으로 처리한 시각을 이어받아, 그 사이 생성된 파일도 처리한다.
// 단, 소급을 30분으로 제한: 그보다 오래 꺼져 있었으면(또는 신버전 첫 실행) 옛
// 연습샷 수천 개가 한꺼번에 쏟아지는 걸 막는다. 30분 넘는 공백의 지난 샷은 어차피
// 지금 진행 중인 레슨과 무관하다. backfillMinutes 로 더 넓힐 수 있다.
var _now = Date.now();
var _resume = (_stateMeta && _stateMeta.lastSeenMtime) ? _stateMeta.lastSeenMtime : _now;
var _maxBack = _now - 30*60000;   // 최대 30분 소급 (기존 7일 → 대량 유입 방지)
var AGENT_CUTOFF_MS = Math.max(_maxBack, Math.min(_resume, _now)) - ((CFG && CFG.backfillMinutes ? CFG.backfillMinutes : 0) * 60000);

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
  if (!cur && !fallbackData) { log('  ! 영상 연결 보류: 서버 data 조회 실패 + 대체 data 없음 (' + shotId + ')'); return false; }
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

// 임의 영상 파일(.mkv/.mov 등) → 웹 재생용 mp4(H.264) 버퍼. 리먹스 우선, 실패 시 트랜스코드.
// (고장 상태에서 TPS가 Videos 폴더에 낱개로 저장하는 아이폰 .mov / 카메라 .mkv 를 붙이기 위함)
async function convertFileToMp4(inputPath, ffmpegPath){
  var os = require('os'); var path = require('path'); var fs = require('fs');
  var { spawn } = require('child_process');
  var tmpOut = path.join(os.tmpdir(), 'gptv_'+Date.now()+'_'+Math.floor(Math.random()*1e6)+'.mp4');
  function run(args){
    return new Promise(function(resolve){
      var p = spawn(ffmpegPath, args, { windowsHide:true });
      var err=''; var killed=false;
      var killTimer = setTimeout(function(){ killed=true; try{ p.kill(); }catch(_){} }, 180000);
      p.stderr.on('data', function(d){ err += d.toString(); });
      p.on('error', function(){ clearTimeout(killTimer); resolve({code:-1, err:err}); });
      p.on('close', function(code){ clearTimeout(killTimer); resolve({code: killed?-2:code, err: killed?'ffmpeg 타임아웃(180초)':err}); });
    });
  }
  try{
    // 1) 리먹스(재인코딩 X) — 이미 H.264 면 즉시. faststart 로 스트리밍 재생.
    var r = await run(['-y','-i', inputPath, '-c','copy','-movflags','+faststart', tmpOut]);
    if (r.code !== 0 || !fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 1024){
      // 2) 트랜스코드 — HEVC(아이폰) 등은 H.264 로. 오디오 없으면 -an 로도 시도.
      r = await run(['-y','-i', inputPath, '-c:v','libx264','-preset','veryfast','-crf','24','-c:a','aac','-b:a','128k','-movflags','+faststart', tmpOut]);
      if (r.code !== 0 || !fs.existsSync(tmpOut) || fs.statSync(tmpOut).size < 1024){
        r = await run(['-y','-i', inputPath, '-c:v','libx264','-preset','veryfast','-crf','24','-an','-movflags','+faststart', tmpOut]);
        if (r.code !== 0) throw new Error('ffmpeg 종료 '+r.code+': '+r.err.slice(0,200));
      }
    }
    return fs.readFileSync(tmpOut);
  } finally {
    try{ fs.unlinkSync(tmpOut); }catch(_){}
  }
}

// TPS Videos 폴더들(감시 Data 폴더의 형제 \Videos) — 자동 도출.
function videosDirs(){
  var out = [];
  var dirs = Array.isArray(CFG.watchDirs) ? CFG.watchDirs : (CFG.watchDir ? [CFG.watchDir] : []);
  dirs.forEach(function(d){
    if (/\\Data$/i.test(d)) { var v = d.replace(/\\Data$/i, '\\Videos'); if (out.indexOf(v)===-1) out.push(v); }
  });
  var std = 'C:\\ProgramData\\TrackMan\\TrackMan Performance Studio\\Videos';
  if (out.indexOf(std)===-1) out.push(std);
  return out;
}
// 샷(측정시각 evMs)에 해당하는 스윙 영상 파일을 Videos\<날짜>\ 에서 시각 기준으로 찾는다.
// 우선순위: DL iPhone(다운더라인) → FO iPhone(정면) → Club → Ball. 영상은 샷 직후 저장되므로
// [evMs-8초, evMs+90초] 창에서 가장 가까운 것을 고른다.
function findShotVideoFile(evMs){
  if (!evMs || isNaN(evMs)) return null;
  var dayLocal = new Date(evMs);
  // 파일은 로컬시각 폴더명(YYYY-MM-DD). evMs 는 UTC 이므로 로컬 날짜로 변환.
  function ymd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  var days = [ymd(dayLocal), ymd(new Date(evMs-3600000)), ymd(new Date(evMs+3600000))]; // 경계 보정
  function rank(name){
    if (/DL\s*iPhone/i.test(name)) return 4;
    if (/FO\s*iPhone/i.test(name)) return 3;
    if (/Club\.(mkv|mp4|mov)$/i.test(name)) return 2;
    if (/Ball\.(mkv|mp4|mov)$/i.test(name)) return 1;
    return 0;
  }
  var best = null;
  videosDirs().forEach(function(vroot){
    days.forEach(function(day){
      var dir = require('path').join(vroot, day);
      var ents; try { ents = fs.readdirSync(dir, { withFileTypes:true }); } catch(e){ return; }
      for (var i=0;i<ents.length;i++){
        var e = ents[i]; if (e.isDirectory()) continue;
        if (!/\.(mkv|mov|mp4)$/i.test(e.name)) continue;
        var r = rank(e.name); if (r===0) continue;
        var fp = require('path').join(dir, e.name);
        var mt; try { mt = fs.statSync(fp).mtimeMs; } catch(err){ continue; }
        var dt = mt - evMs;
        if (dt < -8000 || dt > 90000) continue;      // 창 밖
        var absdt = Math.abs(dt);
        // 우선순위(rank) 큰 것 우선, 같으면 시각 가까운 것
        if (!best || r > best.rank || (r === best.rank && absdt < best.absdt)) {
          best = { fp: fp, name: e.name, rank: r, absdt: absdt };
        }
      }
    });
  });
  return best;
}
// 측정 완성도 점수 — 같은 물리적 샷의 여러 stmf 중 '가장 완전한' 것을 고르기 위함.
function scoreMeasurement(data){
  if (!data) return 0;
  var keys = ['clubSpeed','ballSpeed','smash','carry','total','launch','spin','clubPath','faceAngle','attack','landAngle','spinAxis'];
  var n = 0; keys.forEach(function(k){ if (data[k] != null) n++; });
  return n;
}

async function uploadVideo(key, buf, contentType){
  if (!CFG.R2_WORKER_URL || !CFG.R2_API_KEY) return false;
  return new Promise(function(resolve){
    try{
      var u = new URL(CFG.R2_WORKER_URL.replace(/\/+$/,'') + '/' + encodeURIComponent(key));
      var req = https.request({ hostname:u.hostname, path:u.pathname+u.search, method:'PUT', port:443,
        headers:{ 'X-API-Key': CFG.R2_API_KEY, 'Content-Type': contentType||'application/octet-stream', 'Content-Length': buf.length } },
        function(res){ res.on('data',function(){}); res.on('end',function(){ resolve(res.statusCode>=200&&res.statusCode<300); }); });
      req.setTimeout(180000, function(){ req.destroy(new Error('R2 업로드 타임아웃')); });   // 대용량 영상 여유 3분
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
  // 같은 샷의 여러 측정 중 '가장 완전한' 값만 반영(덜 완전한 게 더 완전한 걸 덮지 않게).
  var score = scoreMeasurement(parsed.data);
  var betterOrNew = (_shotBest[shotId] == null) || (score > _shotBest[shotId]);

  if (!betterOrNew) {
    // 이미 더 완전한 값으로 이 샷을 보냄 → 데이터 재전송 스킵(중복·값 요동 방지).
    processed[fname] = { id: shotId, mid: parsed.measurementId, bay: bayId, t: Date.now() };
    if (CFG.uploadVideo && parsed.isDirectStmf && !_videoQueuedFor[shotId]) {
      _videoQueuedFor[shotId] = 1;
      _videoQueue.push({ videosFolder:true, shotId: shotId, bayId: bayId, evMs: evMs, fname: fname });
    }
    try{ var _mtS=fs.statSync(filePath).mtimeMs; if(_mtS>(_stateMeta.lastSeenMtime||0)) _stateMeta.lastSeenMtime=_mtS; }catch(e){}
    saveState();
    return;
  }

  // ── 1단계: 샷 "데이터"를 먼저 전송 (영상 없이) ─────────────────────────
  var nowIso = new Date().toISOString();
  var shot = {
    id: shotId,
    bay_id: bayId,
    member_id: CFG.pendingMemberId || '00000000-0000-0000-0000-000000000000',
    member_name: '',
    author: '',
    ts: nowIso,
    data: Object.assign({ measurementId: parsed.measurementId, trackingUnit: parsed.trackingUnit, measuredAt: parsed.eventTime,
      // 앱이 "영상 준비 중" 표시를 띄울 수 있게 예고 — 연결 완료/포기 시 해제됨
      _videoPending: (CFG.uploadVideo && ((parsed.videos && parsed.videos.length) || parsed.isDirectStmf)) ? 1 : undefined }, parsed.data),
    video_r2_key: null,
    source: 'agent'
  };
  var ok = await pushShot(shot);
  if (!ok){ log('전송 실패(다음 주기 재시도): ' + fname); return; }
  _shotBest[shotId] = score;

  log('✓ 샷 전송(데이터) ' + fname + ' [' + (parsed.data.club||'?') + ' carry=' + parsed.data.carry + 'm total=' + parsed.data.total + 'm] bay=' + bayId + ' id=' + shotId);
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
  if (CFG.uploadVideo){
    if (parsed.isDirectStmf){
      if (!_videoQueuedFor[shotId]){
        _videoQueuedFor[shotId] = 1;
        processed[fname].vp = filePath;
        _videoQueue.push({ videosFolder:true, shotId: shotId, bayId: bayId, evMs: evMs, fname: fname });
      }
    } else if (parsed.videos && parsed.videos.length){
      processed[fname].vp = filePath;
      _videoQueue.push({ fp: filePath, fname: fname, shotId: shotId, bayId: bayId });
    }
  }
  try{ var _mt=fs.statSync(filePath).mtimeMs; if(_mt> (_stateMeta.lastSeenMtime||0)) _stateMeta.lastSeenMtime=_mt; }catch(e){}
  saveState();
}

// ---- 영상 대기열 처리 (한 번에 1건, 백그라운드 — 새 샷 데이터가 항상 먼저) ----
var _videoQueue = [];
var _videoBusy = false;   // 영상 1건 처리 중이면 다음 건은 다음 주기로 (동시 실행 방지)
async function processVideoJob(job){
  // ── 단독 stmf(고장 상태): 파일 안에 영상이 없다 → Videos 폴더에서 시각 매칭해 붙인다 ──
  if (job.videosFolder){
    var vf = findShotVideoFile(job.evMs);
    if (!vf){
      // 영상은 샷 직후 몇 초~수십 초 뒤 저장될 수 있음 → 잠시 재시도 후 포기.
      job._tries = (job._tries||0)+1;
      if (job._tries < 16){ _videoQueue.push(job); return; }
      log('  영상 매칭 실패(파일 못 찾음) shot=' + job.shotId);
      try{ await attachShotVideo(job.shotId, null, null, null); }catch(e){}  // _videoPending 해제
      if (processed[job.fname]) { delete processed[job.fname].vp; saveState(); }
      return;
    }
    var vmp4=null;
    if (CFG.ffmpegPath){
      try{ vmp4 = await convertFileToMp4(vf.fp, CFG.ffmpegPath); }
      catch(e){ log('  영상 변환 실패(' + vf.name + '): ' + e.message); }
    }
    var vk=null, vmp4k=null, vbase = job.bayId + '/' + job.shotId;
    if (vmp4 && vmp4.length){
      var mk = vbase + '_scene.mp4';
      if (await uploadVideo(mk, vmp4, 'video/mp4')){ vmp4k = mk; log('  MP4 업로드 ' + (vmp4.length/1e6).toFixed(1) + 'MB ← ' + vf.name); }
    }
    if (!vmp4k){
      try{
        var raw = fs.readFileSync(vf.fp);
        var ext = ((vf.name.match(/\.(mkv|mov|mp4)$/i)||[])[1]||'mp4').toLowerCase();
        var ct = ext==='mov' ? 'video/quicktime' : (ext==='mkv' ? 'video/x-matroska' : 'video/mp4');
        var rk = vbase + '_scene.' + ext;
        if (await uploadVideo(rk, raw, ct)){ vk = rk; log('  원본 영상 업로드 ' + (raw.length/1e6).toFixed(1) + 'MB ← ' + vf.name); }
      }catch(e){ log('  원본 영상 업로드 스킵: ' + e.message); }
    }
    try{ var okv = await attachShotVideo(job.shotId, vk, vmp4k, null); if (okv && (vk||vmp4k)) log('  영상 연결 완료 → ' + (vmp4k||vk)); }
    catch(e){ log('  영상 연결 실패: ' + (e&&e.message||e)); }
    if (processed[job.fname]) { delete processed[job.fname].vp; saveState(); }
    return;
  }

  var buf, parsed;
  try { buf = fs.readFileSync(job.fp); parsed = parseFtmf(buf); }
  catch(e){ log('영상 단계: 파일 재읽기 실패 ' + job.fname + ': ' + e.message); parsed = null; }
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
  // 성공이든 실패든 행 갱신 — 영상 키 부착 + _videoPending 해제(앱 진행표시 종료)
  try{
    var okU = await attachShotVideo(job.shotId, videoKey, videoMp4Key, fallbackData);
    if (okU && (videoKey || videoMp4Key)) log('  영상 연결 완료 → ' + (videoMp4Key || videoKey));
  }catch(e){ log('  영상 연결 실패: ' + (e && e.message || e)); }
  if (processed[job.fname]) { delete processed[job.fname].vp; saveState(); }
}
// 재시작 시 미완료 영상 작업 복구 — 이전 실행이 데이터만 보내고 영상을 못 붙인 샷들
(function rebuildVideoQueue(){
  var names = Object.keys(processed);
  for (var i = 0; i < names.length; i++){
    var fn = names[i], p = processed[fn];
    if (!p || !p.id || typeof p.vp !== 'string') continue;
    if (fs.existsSync(p.vp)){
      _videoQueue.push({ fp: p.vp, fname: fn, shotId: p.id, bayId: p.bay || CFG.defaultBay || 'bay3' });
    } else { delete p.vp; }
  }
  if (_videoQueue.length) log('영상 대기열 복구: ' + _videoQueue.length + '건 (이전 실행에서 데이터만 전송됨)');
})();

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
setInterval(function(){
  if (Date.now() - _lastProgress > 12*60000){
    say('🚨 워치독: 12분 이상 진행 없음 — 프로세스 강제 재시작 (자동실행 루프가 4초 뒤 되살림)');
    process.exit(1);
  }
}, 60000);

var _lastBeat = 0;
async function scan(){
  rotateLogIfBig();
  _watchdogTick();
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
    _videoBusy = true;
    var vjob = _videoQueue.shift();
    processVideoJob(vjob)
      .catch(function(e){
        log('영상 처리 오류 ' + (vjob.fname||vjob.shotId) + ': ' + (e&&e.message||e));
        if (vjob.fname && processed[vjob.fname]) { delete processed[vjob.fname].vp; saveState(); }
      })
      .then(function(){ _videoBusy = false; _watchdogTick(); });
  }
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
    log(beat);
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
