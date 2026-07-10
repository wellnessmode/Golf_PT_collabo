// Golf PT Collaboration — 라이브 세션 (트랙맨 i/O 연동 기반)
// ---------------------------------------------------------------
// Phase 1: 앱 구조 (Supabase 스키마 + 활성세션 화면 + 굿샷 버튼[목] + 관리자 재할당)
//
// 운영 안전 최상위 원칙 (코드에 강제):
//  1. TPS 무간섭   — 이 앱/에이전트는 TPS로 어떤 명령도 보내지 않는다 (수신/북마크만).
//  2. Fail-safe    — 활성세션이 없는 베이의 샷은 저장하지 않는다. 굿샷은 활성세션 안에서만 가능.
//  3. bay_id 고정  — 모든 매칭은 bay_id 기준. "최근 누른 사람" 같은 추측 매칭 금지.
//  4. 수동 종료    — 세션은 자동 종료하지 않는다. 다만 어제 시작된(stale) 세션은 굿샷을 차단한다.
//  5. 명시 컨펌    — 세션 시작 시 "베이가 비어있는지 직접 확인" 컨펌을 반드시 거친다.
//  6. 베이당 1명   — 한 베이엔 한 세션, 한 회원은 동시에 한 베이만 (활성세션 시작 시 이중 체크).
//
// TrackMan iO 실시간 연동. 에이전트가 ftmf 파싱→실측 샷 전송. (데모샷 source=mock 은 관리자 정리 가능)
// ---------------------------------------------------------------

// ============ 헬퍼 ============
function getBay(id){
  return (S.bays && S.bays.length ? S.bays : BAYS_DEFAULT).find(function(b){return b.id===id;})
    || {id:id, name:id, color:'bay-blue', type:'practice'};
}
function memberColor(id){
  var m=S.members.find(function(x){return x.id===id;});
  return m ? m.color : 'av-green';
}
// 어제(또는 그 이전) 시작된 세션 = stale → 굿샷 차단 (수동종료 정책 사각지대 방어)
function isStaleSession(act){
  if(!act || !act.startedAt) return false;
  return String(act.startedAt).slice(0,10) < today();
}
function formatElapsed(startedAt){
  var ms = Date.now() - new Date(startedAt).getTime();
  if(!(ms>0)) ms = 0;
  var min = Math.floor(ms/60000);
  var h = Math.floor(min/60), m = min%60;
  return h>0 ? (h+'시간 '+m+'분') : (m+'분');
}
// 해당 베이의 "이번 활성세션 중" 굿샷만 (세션 시작 이후 ts)
function liveBayShots(bayId, act){
  return S.shotEvents.filter(function(s){
    return s.bayId===bayId && (!act || s.ts >= act.startedAt);
  });
}
function shotSilenceMin(shots){
  if(!shots.length) return null;
  var last = shots[shots.length-1].ts;
  return Math.floor((Date.now() - new Date(last).getTime())/60000);
}
// 트랙맨 연동 전 모의 샷 데이터 (연동 시 에이전트가 TPS에서 읽은 실측값으로 대체)
// 모든 값은 숫자 — 성과 리포트 차트/평균에 바로 집계됨. 거리=yd, 속도=mph 기준.
function mockShotData(){
  var clubs=[
    {n:'드라이버', cs:103, bs:150, ca:235, la:13, sp:2800, lo:38},
    {n:'5번 우드', cs:96,  bs:141, ca:212, la:15, sp:3400, lo:43},
    {n:'7번 아이언',cs:83,  bs:110, ca:160, la:18, sp:6100, lo:47},
    {n:'피칭웨지', cs:74,  bs:92,  ca:112, la:26, sp:8500, lo:50}
  ];
  var c=clubs[Math.floor(Math.random()*clubs.length)];
  var rnd=function(base,spread){return base + (Math.random()*spread - spread/2);};
  var clubSpeed=+rnd(c.cs,5).toFixed(1);
  var ballSpeed=+rnd(c.bs,6).toFixed(1);
  var smash=+(ballSpeed/clubSpeed).toFixed(2);
  var carry=Math.round(rnd(c.ca,16));
  var total=carry + Math.round(carry*0.06 + Math.random()*8);
  var side=+rnd(0,10).toFixed(1);
  return {
    club:c.n,
    clubSpeed:clubSpeed, ballSpeed:ballSpeed, smash:smash,
    carry:carry, total:total,
    launch:+rnd(c.la,3).toFixed(1), spin:Math.round(rnd(c.sp,700)),
    clubPath:+rnd(0,6).toFixed(1), faceAngle:+rnd(0,4).toFixed(1), attack:+rnd(0,6).toFixed(1),
    side:side, sideTotal:+(side+rnd(0,4)).toFixed(1), landAngle:Math.round(rnd(c.lo,6)),
    _mock:true
  };
}
function liveToast(msg, kind){
  S.liveToast = {msg:msg, kind:kind||'ok'};
  render();
  clearTimeout(window._liveToastT);
  window._liveToastT = setTimeout(function(){ S.liveToast=null; render(); }, 2200);
}

// ============ 진입 / 종료 ============
function openLiveSession(){
  S.showLiveSession=true; S.showDashboard=false; S.selectedMember=null; S.sidebarOpen=false;
  startLivePolling(); render();
}
function closeLiveSession(){ S.showLiveSession=false; stopLivePolling(); render(); }

// 라이브 세션 활성 중 자동 폴링 (4초마다) — 새로고침 안 눌러도 새 샷 자동 표시.
// 폴링 시점에 이전 샷ID 들을 기억해 '새로 들어온 것' 만 _isNew 마킹 → 카드에 강조.
var _livePollTimer = null, _liveLastIds = null;
function startLivePolling(){
  if(_livePollTimer) return;
  // 첫 회는 즉시
  _livePollTick();
  _livePollTimer = setInterval(_livePollTick, 4000);
  // 폰 백그라운드 갔다 오면 즉시 한 번 더
  if(!window._liveVisHook){
    window._liveVisHook = true;
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden && S.showLiveSession) _livePollTick();
    });
  }
}
function stopLivePolling(){
  if(_livePollTimer){ clearInterval(_livePollTimer); _livePollTimer=null; }
  _liveLastIds = null;
}
// 베이카드 '방금 친 샷' HTML 생성 (renderBayCard 와 _patchLivePartials 공용)
function _buildPendingShotsHTML(bayId){
  var pend = (typeof pendingShotsForBay==='function') ? pendingShotsForBay(bayId) : [];
  if(!pend.length) return '';
  var html = '<div class="pending-shots big" data-bay-pending="'+bayId+'"><div class="ps-title">⛳ 방금 친 샷 — 저장할 것만 선택<span class="ps-count">'+pend.length+'</span></div>';
  pend.slice(0,5).forEach(function(s){
    var d=s.data||{}; var m=(d._units&&d._units.dist==='m')||d._src==='trackman_io';
    // 거리=미터(트랙맨 원본 그대로). 야드 데이터(옛것)는 미터로 환산.
    var carry=d.carry!=null?Math.round((m?d.carry:d.carry*0.9144)*10)/10:null;
    var total=d.total!=null?Math.round((m?d.total:d.total*0.9144)*10)/10:null;
    var ball =d.ballSpeed!=null?Math.round((m?d.ballSpeed:d.ballSpeed*0.44704)*10)/10:null;  // m/s
    var spin =d.spin!=null?Math.round(d.spin):null;
    var club=(typeof _clubKo==='function'?_clubKo(d.club):d.club)||'샷';
    var when=(typeof _shotTimeLabel==='function')?_shotTimeLabel(s):'';
    var fresh=s._isNew && (Date.now()-s._isNew < 30000) ? ' new' : '';
    var bits=[];
    if(carry!=null) bits.push('<span class="psb-main">'+carry+'<small>m 캐리</small></span>');
    if(total!=null && total!==carry) bits.push('<span class="psb">토탈 '+total+'m</span>');
    if(ball!=null) bits.push('<span class="psb">볼 '+ball+'m/s</span>');
    if(spin!=null) bits.push('<span class="psb">스핀 '+spin+'</span>');
    html += '<div class="ps-card'+fresh+'" data-shot="'+s.id+'">'
          + '<div class="psc-hd"><span class="psc-club">'+club+'</span><span class="psc-time">'+when+'</span></div>'
          + '<div class="psc-metrics">'+bits.join('')+'</div>'
          + '<div class="psc-actions">'
          + '<button class="ps-save big" onclick="saveLessonShot(\''+s.id+'\',\''+bayId+'\')">＋ 저장</button>'
          + '<button class="ps-drop" onclick="dropLessonShot(\''+s.id+'\')">버림</button>'
          + '</div></div>';
  });
  html += '</div>';
  return html;
}

// 부분 DOM 패치 — render() 전체 호출 없이 두 영역만 교체.
// 화면 스크롤/포커스/사용자 동작 전혀 안 건드림 (사장님이 샷 삭제하려고
// 내려가 있어도 위치 그대로 — 새 샷 카드는 베이카드 상단에 추가됨).
// 새 샷이 베이/모드/세션 종료 등 '구조적' 변경을 동반하면 false 반환 → 호출자가 full render.
function _patchLivePartials(){
  try{
    // 1) 베이카드별 .pending-shots 영역 갱신 (레슨모드만 의미 있음)
    var bayCards = document.querySelectorAll('.bay-card.active[data-bay]');
    for(var i=0;i<bayCards.length;i++){
      var card = bayCards[i];
      var bayId = card.getAttribute('data-bay');
      var act = S.activeSessions[bayId];
      if(!act) return false;
      if(bayMode(bayId, act) !== 'lesson') continue;
      var existing = card.querySelector('.pending-shots');
      var newHTML = _buildPendingShotsHTML(bayId);
      if(newHTML){
        if(existing){ existing.outerHTML = newHTML; }
        else {
          // 첫 샷 — '🎯 공을 치면...' 안내 자리에 삽입. 없으면 bay-shots 다음에
          var hint = card.querySelector('.bay-auto');
          if(hint){ hint.outerHTML = newHTML; }
          else { var anchor = card.querySelector('.bay-shots'); if(anchor) anchor.insertAdjacentHTML('afterend', newHTML); }
        }
      } else if(existing){
        // 비었으면 안내 문구로 교체 (사용자가 모두 저장/버림 한 후)
        existing.outerHTML = '<div class="bay-auto">🎯 공을 치면 여기에 <strong>최근 샷</strong>이 떠요 — 좋은 것만 저장</div>';
      }
      // '저장된 샷 N개' 카운트도 갱신
      var shotsEl = card.querySelector('.bay-shots');
      if(shotsEl){
        var shotsCnt = (typeof liveBayShots==='function') ? liveBayShots(bayId, act).length : 0;
        shotsEl.innerHTML = shotsCnt>0 ? ('저장된 샷 <strong>'+shotsCnt+'</strong>개') : '아직 저장된 샷 없음';
      }
    }
    // 2) 페이지 하단 .shot-log 갱신 (선택 모드 중이면 보호 — render 트리거)
    if(S._shotSelMode) return false;
    var logEl = document.querySelector('.shot-log');
    if(logEl && typeof renderShotLog==='function'){
      var isAdmin = S.currentRole==='admin';
      logEl.outerHTML = renderShotLog(isAdmin);
    }
    return true;
  }catch(e){ console.warn('[live] partial patch fail:', e); return false; }
}

// 어제(또는 그 이전) 시작된 채 방치된 활성세션 자동 종료 — 로컬 + 서버.
// 세션을 안 끄고 퇴근하면 다음날 연습 샷이 그 회원에게/미배정으로 계속 쌓이던 문제의 뿌리.
function autoEndStaleSessions(remoteActive){
  var src = remoteActive || S.activeSessions || {};
  Object.keys(src).forEach(function(bayId){
    var act = src[bayId];
    if(act && isStaleSession(act)){
      delete src[bayId];
      if(S.activeSessions) delete S.activeSessions[bayId];
      try{ cloud.endActiveSession(bayId); }catch(e){}
      try{ logAudit('session','방치 세션 자동종료', act.memberName||'', {bay:bayId, startedAt:act.startedAt}); }catch(e){}
      console.warn('[live] 방치 세션 자동종료:', bayId, act.memberName, act.startedAt);
    }
  });
}

// 오래된 미배정 샷 자동 정리 (관리자 기기, 24시간 경과분) — 에이전트는 그대로 두고
// 앱이 노이즈를 스스로 청소. 회원에게 귀속된 샷은 절대 건드리지 않음. PC 원본 무관.
var _stalePurgeDone = false;
function purgeStaleUnassigned(){
  if(_stalePurgeDone) return;                       // 세션당 1회
  if(S.currentRole!=='admin') return;               // 관리자 기기에서만 (다기기 경합 방지)
  var cutoff = Date.now() - 24*3600*1000;
  var stale = (S.shotEvents||[]).filter(function(s){
    if(s.memberName) return false;                  // 귀속된 샷 보호
    if(s._pendingBay && S.activeSessions[s._pendingBay]) return false;  // 진행 중 레슨 대기샷 보호
    var t = Date.parse(s.ts);
    return !isNaN(t) && t < cutoff;
  });
  _stalePurgeDone = true;
  if(!stale.length) return;
  var ids = stale.map(function(s){return s.id;});
  S.shotEvents = (S.shotEvents||[]).filter(function(s){ return ids.indexOf(s.id)===-1; });
  try{ save(); }catch(e){}
  Promise.resolve(cloud.deleteShotsBulk(ids)).then(function(){
    stale.forEach(function(s){ if(s.videoR2Key){ try{ r2.remove(s.videoR2Key); }catch(e){} } });
    console.warn('[live] 오래된 미배정 '+ids.length+'건 자동 정리');
    try{ liveToastSafe('🧹 오래된 미배정 '+ids.length+'개 자동 정리됨'); }catch(e){}
  });
}

async function _livePollTick(){
  if(!S.showLiveSession) { stopLivePolling(); return; }
  if(!cloud || !cloud.enabled) return;
  if(typeof shotPauseOn==='function' && shotPauseOn()) return;
  if(window._shotsDeleting) return;   // 일괄 삭제 진행 중 — 서버 정리 전 재로드 금지
  try{
    var live = await cloud.loadLive();
    if(!live) return;
    if(!S.showLiveSession) return;  // 폴링 중 닫혔으면 무시
    if(window._shotsDeleting) return; // 폴링 요청이 삭제 시작 '전'에 나갔어도, 응답 적용은 차단
    autoEndStaleSessions(live.activeSessions);  // 어제 켜두고 잊은 세션 자동 종료(서버 포함)
    // 변경 감지를 위해 ID 집합 / 활성세션 키 비교
    var prev = _liveLastIds;
    var curIds = (live.shotEvents||[]).map(function(s){return s.id;});
    var hasNew = false;
    if(prev){
      var prevSet = {}; prev.forEach(function(id){prevSet[id]=true;});
      (live.shotEvents||[]).forEach(function(s){ if(!prevSet[s.id]){ s._isNew = Date.now(); hasNew = true; } });
    }
    var actBefore = JSON.stringify(Object.keys(S.activeSessions||{}).sort());
    var actAfter  = JSON.stringify(Object.keys(live.activeSessions||{}).sort());
    var countChanged = !prev || curIds.length !== prev.length;
    var changed = hasNew || (actBefore!==actAfter) || countChanged;
    _liveLastIds = curIds;
    if(typeof applyRemoteActive==='function') applyRemoteActive(live.activeSessions); else S.activeSessions=live.activeSessions;
    // _isNew/_rcvAt 보존하며 머지
    var oldMap={}; (S.shotEvents||[]).forEach(function(s){oldMap[s.id]=s;});
    S.shotEvents = (live.shotEvents||[]).map(function(s){
      var o=oldMap[s.id];
      if(o){ if(o._rcvAt) s._rcvAt=o._rcvAt; if(o._isNew) s._isNew=o._isNew; }
      return s;
    });
    if(typeof reconcileAgentShots==='function') reconcileAgentShots();
    purgeStaleUnassigned();   // 첫 폴링에서 24h+ 미배정 노이즈 자동 청소(관리자)
    // 변경 없으면 render 스킵 — 스크롤이 4초마다 위로 튀는 문제 해결
    if(!changed) return;
    try{save();}catch(e){}
    // 1) 부분 DOM 패치 — render 자체를 안 부르고 두 영역만 교체 (가장 매끈)
    var patched = (typeof _patchLivePartials==='function') && _patchLivePartials();
    if(patched) return;
    // 2) 구조적 변경일 때 전체 render — render() 함수 자체가 스크롤 자동 보존
    render();
  }catch(e){ /* 네트워크 일시 오류 무시 — 다음 4초에 재시도 */ }
}

// 회원 카드에서 바로 라이브 시작 (회원 → 베이 선택)
function openLiveForMember(memberId){
  var m=S.members.find(function(x){return x.id===memberId;}); if(!m) return;
  S.showLiveSession=true; S.showDashboard=false; S.sidebarOpen=false;
  startLivePolling();
  var existing=Object.keys(S.activeSessions).find(function(b){return S.activeSessions[b].memberId===memberId;});
  S.liveBayPickFor = existing ? null : memberId;   // 이미 진행중이면 라이브뷰로, 아니면 베이 선택
  render();
}
function pickBayForMember(bayId){
  var memberId=S.liveBayPickFor; if(!memberId) return;
  if(S.activeSessions[bayId]){ liveToast(getBay(bayId).name+'은(는) 사용 중입니다','err'); return; }
  var dup=Object.keys(S.activeSessions).find(function(b){return S.activeSessions[b].memberId===memberId;});
  if(dup){ liveToast(getBay(dup).name+'에서 이미 진행 중입니다','err'); S.liveBayPickFor=null; render(); return; }
  var m=S.members.find(function(x){return x.id===memberId;}); if(!m){ S.liveBayPickFor=null; render(); return; }
  S.liveConfirm={bayId:bayId, memberId:memberId, memberName:m.name};  // 기존 명시 컨펌 모달 재사용
  S.liveBayPickFor=null;
  render();
}
function cancelBayPick(){ S.liveBayPickFor=null; render(); }

// 데모(가짜) 샷 일괄 삭제 — 관리자 전용. source==='mock' 전부 제거.
function purgeDemoShots(){
  var mocks=(S.shotEvents||[]).filter(function(s){return s.source==='mock';});
  if(!mocks.length){ liveToast('데모 샷이 없습니다','ok'); return; }
  if(!confirm('데모(가짜) 샷 '+mocks.length+'개를 모두 삭제할까요?\n(트랙맨 실측 샷은 그대로 유지됩니다)')) return;
  S.shotEvents=(S.shotEvents||[]).filter(function(s){return s.source!=='mock';});
  save();
  mocks.forEach(function(s){ try{ cloud.deleteShot(s.id); }catch(e){} });
  logActivity('데모샷 정리', '', mocks.length+'개');
  logAudit('session','데모샷 일괄삭제','',{count:mocks.length});
  render();
  liveToast('🗑 데모 샷 '+mocks.length+'개 삭제됨','ok');
}

// 저장된 샷 전체 삭제 — 관리자 전용.
// ⚠️ 앱/DB의 샷 기록만 지움. 트랙맨 PC의 영상·데이터 원본은 절대 건드리지 않음(접근도 안 함).
async function purgeAllShots(){
  var n=(S.shotEvents||[]).length;
  if(n===0){ liveToast('저장된 샷이 없습니다','ok'); return; }
  if(!confirm('샷 '+n+'개 전체 삭제합니다.\n(트랙맨 PC 영상은 그대로)\n계속할까요?')) return;
  // 1) 즉시 화면 비움 (사용자는 빠릿빠릿하게 결과를 본다)
  var snapshot = (S.shotEvents||[]).slice();
  S.shotEvents=[];
  try{save();}catch(e){}
  if(typeof _patchShotLogOnly==='function') _patchShotLogOnly(); else render();
  liveToast('🗑 '+n+'개 삭제 중...','ok');
  logActivity('샷 전체 삭제', '', n+'개');
  // 2) 폴링 정지(서버 정리 끝나기 전에 옛 샷이 다시 부활하지 않도록)
  var hadPoll = !!_livePollTimer;
  if(typeof stopLivePolling==='function') stopLivePolling();
  _liveLastIds = null;
  window._shotsDeleting = true;
  // 3) Supabase 한방 + R2 영상 백그라운드 병렬 — await 안 함, 사용자 안 기다림
  Promise.resolve(cloud.deleteAllShots()).then(function(ok){
    snapshot.forEach(function(s){ if(s.videoR2Key){ try{ r2.remove(s.videoR2Key); }catch(e){} } });
    logAudit('session','샷 전체삭제','',{count:n, cloud:ok});
    window._shotsDeleting = false;
    if(hadPoll && typeof startLivePolling==='function') setTimeout(startLivePolling, 1200);
  });
}

// 베이 모드 전환 (레슨 선별저장 ↔ 연습 자동저장)
function setBayMode(bayId, mode){
  var act=S.activeSessions[bayId]; if(!act) return;
  act.mode=mode;
  save();
  if(mode==='practice'){ reconcileAgentShots(); } // 연습 전환 시 대기 샷 자동 저장
  try{ cloud.startActiveSession(bayId, act); }catch(e){}
  render();
  liveToast(mode==='lesson'?'레슨 모드 — 좋은 샷만 선별 저장':'연습 모드 — 모든 샷 자동 저장','ok');
}
// 레슨 모드: 이 샷을 회원에게 저장
function saveLessonShot(shotId, bayId){
  var act=S.activeSessions[bayId]; if(!act){ liveToast('활성 세션이 없습니다','err'); return; }
  var s=(S.shotEvents||[]).find(function(x){return x.id===shotId;}); if(!s) return;
  s.memberId=act.memberId; s.memberName=act.memberName; s.author=act.author; delete s._pendingBay;
  save();
  try{ cloud.reassignShot(s.id, act.memberId, act.memberName); }catch(e){}
  logActivity('레슨 샷 저장', act.memberId, getBay(bayId).name+' · '+((s.data&&s.data.club)||''));
  render();
  liveToast('✓ '+act.memberName+'님에게 저장','ok');
  if(navigator.vibrate){ try{ navigator.vibrate(30); }catch(e){} }
}
// 레슨 모드: 이 샷 버림 (화면+서버에서 제거)
function dropLessonShot(shotId){
  S.shotEvents=(S.shotEvents||[]).filter(function(x){return x.id!==shotId;});
  save();
  try{ cloud.deleteShot(shotId); }catch(e){}
  render();
}
function renderBayPickModal(){
  if(!S.liveBayPickFor) return '';
  var m=S.members.find(function(x){return x.id===S.liveBayPickFor;});
  if(!m) return '';
  var bays=(S.bays&&S.bays.length)?S.bays:BAYS_DEFAULT;
  return '<div class="modal-overlay" onclick="if(event.target===this)cancelBayPick()"><div class="modal">'
    + '<div class="modal-title">'+m.name+'님 — 어느 타석?</div>'
    + '<div class="baypick-grid">'
    + bays.map(function(b){
        var occ=S.activeSessions[b.id];
        return '<button class="baypick '+b.color+(occ?' occ':'')+'"'+(occ?' disabled':' onclick="pickBayForMember(\''+b.id+'\')"')+'>'
          + '<span class="bp-name">'+b.name+'</span><span class="bp-sub">'+(occ?occ.memberName+' 진행중':'여기서 시작')+'</span></button>';
      }).join('')
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="cancelBayPick()">취소</button></div>'
    + '</div></div>';
}

// ============ 세션 시작 (회원 배정 → 명시 컨펌) ============
function openLiveStart(bayId){
  if(S.activeSessions[bayId]){ liveToast('이미 진행 중인 세션이 있습니다','err'); return; }
  S.liveStartBay=bayId; S.liveStartQuery=''; render();
  setTimeout(function(){var i=document.querySelector('.live-search-input');if(i) i.focus();},50);
}
function closeLiveStart(){ S.liveStartBay=null; S.liveStartQuery=''; render(); }

// 회원 선택 → (이중 체크) → 명시 컨펌 모달
function pickLiveMember(memberId){
  var dupBay = Object.keys(S.activeSessions).find(function(b){ return S.activeSessions[b].memberId===memberId; });
  if(dupBay){ liveToast(getBay(dupBay).name+'에서 이미 진행 중입니다','err'); return; }
  var m = S.members.find(function(x){ return x.id===memberId; });
  if(!m) return;
  S.liveConfirm = {bayId:S.liveStartBay, memberId:memberId, memberName:m.name};
  S.liveStartBay=null; S.liveStartQuery='';
  render();
}
function cancelLiveConfirm(){ S.liveConfirm=null; render(); }

function confirmLiveStart(){
  var c = S.liveConfirm; if(!c) return;
  var bay = getBay(c.bayId);
  // 이중 안전 체크 (컨펌 사이에 상태가 바뀌었을 수 있음)
  if(S.activeSessions[c.bayId]){ liveToast(bay.name+'에 이미 진행 중인 세션이 있습니다','err'); S.liveConfirm=null; render(); return; }
  var dupBay = Object.keys(S.activeSessions).find(function(b){ return S.activeSessions[b].memberId===c.memberId; });
  if(dupBay){ liveToast('해당 회원이 이미 '+getBay(dupBay).name+'에서 진행 중입니다','err'); S.liveConfirm=null; render(); return; }
  var author = S.currentUser || '관리자';
  // 레슨 전용 베이(3번룸)는 기본 '레슨'(선별저장), 연습 겸용은 '연습'(자동저장)
  var mode = c.mode || (bay.type==='lesson_only' ? 'lesson' : 'practice');
  var sess = {memberId:c.memberId, memberName:c.memberName, author:author, startedAt:new Date().toISOString(), note:'', mode:mode};
  S.activeSessions[c.bayId] = sess;
  save();
  logActivity('라이브 세션 시작', c.memberId, bay.name);
  logAudit('session','라이브 세션 시작', c.memberName, {bay:bay.name, author:author});
  cloud.startActiveSession(c.bayId, sess);
  S.liveConfirm=null; render();
  liveToast('▶ '+c.memberName+'님 · '+bay.name+' 세션 시작','ok');
}

// ============ 세션 종료 (수동만) ============
function endLiveSession(bayId){
  var act = S.activeSessions[bayId]; if(!act) return;
  if(typeof _rec!=='undefined' && _rec.bayId===bayId){ liveToast('🎙 녹음 [종료·글변환]을 먼저 눌러주세요','err'); return; }
  if(act._sttBusy){ liveToast('음성 변환 중 — 잠시 후 종료해주세요','err'); return; }
  var bay = getBay(bayId);
  var hasVoice = (act._transcript||'').trim().length>0;
  var msg = bay.name+' · '+act.memberName+'님 세션을 종료할까요?\n'
    + (hasVoice ? '(받아쓴 내용을 AI가 세션카드로 정리합니다)' : '(세션 기록 카드가 열립니다 — 메모를 추가하고 저장하세요)');
  if(!confirm(msg)) return;
  var transcript = act._transcript||'', memberId = act.memberId, author = act.author;
  if(S.voiceBay===bayId) stopVoice(bayId);
  delete S.activeSessions[bayId];
  save();
  logActivity('라이브 세션 종료', memberId, bay.name);
  logAudit('session','라이브 세션 종료', act.memberName, {bay:bay.name, voice:hasVoice});
  cloud.endActiveSession(bayId);
  // 라이브 세션 종료 = 세션 기록 생성 (일원화). 음성 있으면 AI 정리, 없으면 빈 카드.
  if(transcript.trim()){
    openVoiceDraft(memberId, author, transcript);
    liveToast('🤖 AI가 세션카드를 정리했어요 — 확인 후 저장','ok');
  } else {
    // 음성 없음 → 회원 선택 후 빈 세션카드 모달 (수기 입력)
    S.selectedMember = memberId;
    S.newSession = {date:today(), author:author||S.currentUser||'', content:'', media:[], mediaUrls:['','']};
    S.showAddSession = true;
    liveToast('⏹ '+bay.name+' 세션 종료 — 세션 카드를 작성하세요','ok');
  }
  render();
}

// ============ 굿샷 (현재 데모/목) ============
// 실제 연동 시: 베이 PC 에이전트가 TPS SDK Output + 영상 폴더에서 최근 샷을 잡아 push.
// 지금은 버튼이 그 흐름을 모사 — 활성세션의 회원에게만 귀속(Fail-safe).
function triggerGoodShot(bayId){
  var act = S.activeSessions[bayId];
  if(!act){ liveToast('활성 세션이 없어 저장할 수 없습니다','err'); return; }   // Fail-safe
  if(isStaleSession(act)){ liveToast('어제 시작된 세션입니다 — 종료 후 다시 시작하세요','err'); render(); return; }
  var bay = getBay(bayId);
  var data = mockShotData();
  var shot = {
    id: 'shot'+Date.now()+Math.random().toString(36).slice(2,5),
    bayId: bayId,
    memberId: act.memberId,
    memberName: act.memberName,
    author: act.author,
    ts: new Date().toISOString(),
    data: data,
    videoR2Key: null,
    source: 'mock'
  };
  S.shotEvents.push(shot);
  if(S.shotEvents.length>500) S.shotEvents = S.shotEvents.slice(-500);
  save();
  logActivity('굿샷 저장(데모)', act.memberId, bay.name+' · '+data.club);
  logAudit('session','굿샷 저장(데모)', act.memberName, {bay:bay.name, club:data.club, carry:data.carry});
  cloud.insertShot(shot);
  render();
  liveToast('✓ '+act.memberName+'님 · '+bay.name+'에 저장됨','ok');
  if(navigator.vibrate){ try{ navigator.vibrate(40); }catch(e){} }
}

// ============ 관리자: 굿샷 재할당 (오귀속 사후 보정) ============
function openReassign(shotId){ S.liveReassignShot=shotId; S.liveStartQuery=''; render();
  setTimeout(function(){var i=document.querySelector('.live-search-input');if(i) i.focus();},50); }
function closeReassign(){ S.liveReassignShot=null; S.liveStartQuery=''; render(); }
function applyReassign(memberId){
  var shot = S.shotEvents.find(function(s){ return s.id===S.liveReassignShot; });
  if(!shot){ S.liveReassignShot=null; render(); return; }
  var m = S.members.find(function(x){ return x.id===memberId; });
  if(!m){ return; }
  var prev = shot.memberName;
  shot.memberId = m.id; shot.memberName = m.name;
  save();
  logActivity('굿샷 재할당', m.id, prev+' → '+m.name);
  logAudit('session','굿샷 재할당', m.name, {from:prev, to:m.name, shotId:shot.id});
  cloud.reassignShot(shot.id, m.id, m.name);
  S.liveReassignShot=null; render();
  liveToast('↔ '+prev+' → '+m.name+' 재할당 완료','ok');
}

// ============ 저장된 샷 삭제 (잘못 저장/연습샷 정리) ============
function deleteShot(shotId){
  var shot = S.shotEvents.find(function(s){ return s.id===shotId; });
  if(!shot) return;
  if(!confirm(shot.memberName+'님의 저장된 샷을 삭제할까요?\n(영상·데이터가 함께 삭제됩니다)')) return;
  S.shotEvents = S.shotEvents.filter(function(s){ return s.id!==shotId; });
  if(S.liveReassignShot===shotId) S.liveReassignShot=null;
  save();
  logActivity('저장된 샷 삭제', shot.memberId, getBay(shot.bayId).name);
  logAudit('session','저장된 샷 삭제', shot.memberName, {shotId:shotId, bay:shot.bayId});
  cloud.deleteShot(shotId);
  render();
  liveToast('🗑 샷 삭제됨','ok');
}

// ============ 음성 받아쓰기 → AI 세션카드 ============
// 진행 중 음성을 받아쓰고(브라우저 STT), 종료 시 AI가 세션카드로 구조화.
// 하이브리드:
//  - 안드로이드/PC 크롬 → Web Speech API 실시간 받아쓰기
//  - iOS 사파리(아이폰/아이패드) → 텍스트 입력 + 시스템 키보드 받아쓰기 (안정)
//  - 둘 다 안 되면 종료 후 직접 입력
var _voiceRec = null;
function isIOS(){
  try{
    var ua=navigator.userAgent||'';
    if(/iPad|iPhone|iPod/.test(ua)) return true;
    // 아이패드 OS 13+: MacIntel + 터치 지원으로 위장
    if(navigator.platform==='MacIntel' && (navigator.maxTouchPoints||0)>1) return true;
    return false;
  }catch(e){ return false; }
}
function voiceSupported(){
  try{
    if(typeof window==='undefined') return false;
    if(isIOS()) return false; // iOS Web Speech는 한국어 실시간 불안정 → 시스템 받아쓰기 모드 사용
    return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
  }catch(e){ return false; }
}
function voiceMode(){
  // 'web' = 실시간 자동 받아쓰기, 'ios' = 시스템 받아쓰기(텍스트), 'none' = 미지원
  if(voiceSupported()) return 'web';
  if(isIOS()) return 'ios';
  return 'none';
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function startVoice(bayId){
  var act = S.activeSessions[bayId]; if(!act) return;
  if(!voiceSupported()){ liveToast('이 기기는 실시간 받아쓰기를 지원하지 않습니다 — 종료 후 직접 입력하세요','err'); return; }
  try{
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(_voiceRec){ try{ _voiceRec.onend=null; _voiceRec.stop(); }catch(e){} _voiceRec=null; }
    var rec = new SR();
    rec.lang='ko-KR'; rec.continuous=true; rec.interimResults=true;
    rec.onresult=function(ev){
      var finalT='', interim='';
      for(var i=ev.resultIndex; i<ev.results.length; i++){
        var t=ev.results[i][0].transcript;
        if(ev.results[i].isFinal) finalT+=t; else interim+=t;
      }
      var a=S.activeSessions[bayId]; if(!a) return;
      if(finalT){ a._transcript=((a._transcript||'')+' '+finalT).replace(/\s+/g,' ').trim(); save(); }
      if(S.voiceBay===bayId) updateVoicePreview(bayId, interim);
    };
    rec.onerror=function(e){ console.warn('[voice] error:', e&&e.error); };
    // 브라우저가 주기적으로 종료 → 의도적 중지가 아니면 자동 재시작
    rec.onend=function(){ if(S.voiceBay===bayId && _voiceRec===rec){ try{ rec.start(); }catch(e){ S.voiceBay=null; render(); } } };
    rec.start();
    _voiceRec = rec; S.voiceBay = bayId;
    render();
  }catch(e){ console.warn('[voice] start fail:', e); liveToast('받아쓰기 시작 실패','err'); S.voiceBay=null; render(); }
}
function stopVoice(bayId){
  S.voiceBay = null;
  if(_voiceRec){ try{ _voiceRec.onend=null; _voiceRec.stop(); }catch(e){} _voiceRec=null; }
  save(); render();
}
function updateVoicePreview(bayId, interim){
  var a=S.activeSessions[bayId]; if(!a) return;
  var el=document.querySelector('.bay-card[data-bay="'+bayId+'"] .vr-text');
  if(el){ var base=(a._transcript||'').slice(-90); el.textContent=(base+(interim?(' '+interim):'')).trim()||'듣는 중...'; }
}
// iOS 모드: textarea 입력을 활성세션 transcript에 누적 저장
function updateVoiceText(bayId, val){
  var a=S.activeSessions[bayId]; if(!a) return;
  a._transcript=val||'';
  // 자주 저장하지 않도록 디바운스
  clearTimeout(window._voiceSaveT);
  window._voiceSaveT=setTimeout(function(){ try{ save(); }catch(e){} }, 800);
}

// ============ 수업 녹음 (앱 내장 — 외부 앱 설치 불필요) ============
// 🎙 시작 → MediaRecorder 녹음(화면 자동꺼짐 방지) → ⏹ 종료
// → R2 에 원본 백업 + /stt(Whisper) 로 한국어 텍스트 변환 → 받아쓰기 칸에 합류
// → 세션 종료 시 기존 AI 일지 정리 파이프라인 그대로 사용
var _rec = { bayId:null, stream:null, mr:null, chunks:[], startedAt:0, uiTimer:null, segTimer:null, wakeLock:null, stopping:false, segIdx:0, pendingStt:0 };
var REC_SEG_MS = 15000;   // 15초마다 잘라 변환 → 실시간처럼 아래에 글이 계속 붙음
function recSupported(){
  try{ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder!=='undefined'); }catch(e){ return false; }
}
function _recMime(){
  var cands=['audio/mp4','audio/webm;codecs=opus','audio/webm'];
  for(var i=0;i<cands.length;i++){ try{ if(MediaRecorder.isTypeSupported(cands[i])) return cands[i]; }catch(e){} }
  return '';
}
function _recElapsed(){
  if(!_rec.startedAt) return '';
  var s=Math.floor((Date.now()-_rec.startedAt)/1000);
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
// 녹음 UI를 render 없이 직접 갱신 (경과시간·실시간 텍스트) — 화면 안 튀게.
// 표시는 _rec 자체 버퍼 기준 — 폴링이 세션 객체를 갈아끼워도 화면 텍스트는 유지.
function _recUpdateUI(){
  try{
    var t=document.getElementById('rec-elapsed'); if(t) t.textContent=_recElapsed();
    var live=document.getElementById('rec-live-text');
    if(live){
      var txt=(typeof _recFullText==='function')?_recFullText():'';
      if(!txt){ var act=_rec.bayId && S.activeSessions[_rec.bayId]; txt=((act&&act._transcript)||'').trim(); }
      live.textContent = txt ? txt.slice(-300) : (window._sttUnavailable ? '(변환 서버 미설정 — 녹음은 저장됩니다)' : '듣는 중... 말하면 15초 안에 글로 나타나요');
    }
  }catch(e){}
}
// 한 세그먼트(15초) 녹음 시작 — 끝나면 즉시 다음 세그먼트로 이어지고, 이전 조각은 병렬 변환
function _startSegment(){
  var mime=_recMime();
  var opts={audioBitsPerSecond:32000}; if(mime) opts.mimeType=mime;
  var mr=new MediaRecorder(_rec.stream, opts);
  var segChunks=[];
  mr.ondataavailable=function(e){ if(e.data&&e.data.size) segChunks.push(e.data); };
  mr.onstop=function(){
    var isFinal=_rec.stopping;
    if(!isFinal && _rec.bayId){ _startSegment(); }   // 공백 최소화 — 먼저 다음 조각 시작
    var blob=new Blob(segChunks,{type:(segChunks[0]&&segChunks[0].type)||'audio/mp4'});
    if(blob.size>2000){ _handleSegment(blob, isFinal); }
    else if(isFinal){ _finishRec(); }
  };
  _rec.mr=mr; _rec.segIdx++;
  mr.start();
  clearTimeout(_rec.segTimer);
  _rec.segTimer=setTimeout(function(){ try{ if(_rec.mr===mr && !_rec.stopping) mr.stop(); }catch(e){} }, REC_SEG_MS);
}
// 세그먼트 변환 → _rec.tx(녹음기 자체 버퍼)에 누적 → act._transcript 를 전체로 덮어씀.
// '이어붙이기'가 아니라 '전체 덮어쓰기'라서, 폴링 등 무엇이 act 를 갈아끼워도
// 다음 세그먼트가 지금까지의 전문을 다시 써 넣는다 — 텍스트 유실 원천 차단.
function _recFullText(){ return ((_rec.txBase||'')+' '+(_rec.tx||'')).trim(); }
async function _handleSegment(blob, isFinal){
  var bayId=_rec.bayId || _rec._lastBay;
  _rec.pendingStt++;
  var text='';
  try{ text=await sttTranscribe(blob); }
  catch(e){
    console.warn('[stt] segment fail:', e&&e.message);
    if(!window._sttUnavailable){
      window._sttUnavailable=true;
      liveToast('⚠️ 음성변환 서버 미설정 — 워커에 GROQ 키 등록 필요 (녹음은 저장됨)','err');
    }
    // 변환 실패 조각은 원본을 R2에 백업 (아무것도 잃지 않게)
    try{ r2.upload('rec/'+bayId+'_'+Date.now()+'_'+_rec.segIdx+(String(blob.type).indexOf('mp4')!==-1?'.m4a':'.webm'), blob); }catch(_){}
  }
  _rec.pendingStt--;
  if(text){
    _rec.tx=((_rec.tx||'')+' '+text).trim();     // 녹음기 버퍼 — 폴링과 무관하게 절대 안 사라짐
    var act=S.activeSessions[bayId];
    if(act){ act._transcript=_recFullText(); try{save();}catch(e){} }
    _recUpdateUI();   // render 없이 실시간 텍스트만 갱신
  }
  if(isFinal){ _finishRec(); }
}
// 최종 마무리 — 모든 변환 완료 후 전문을 세션에 확정 기록
function _finishRec(){
  if(_rec.pendingStt>0){ setTimeout(_finishRec, 400); return; }   // 남은 변환 대기
  var bayId=_rec._lastBay;
  var act=bayId && S.activeSessions[bayId];
  var full=_recFullText();
  if(act){
    if(full) act._transcript=full;   // 최종 전문 덮어쓰기 (중간에 뭐가 지웠어도 복원)
    delete act._sttBusy;
    try{save();}catch(e){}
  }
  _rec._lastBay=null;
  liveToast(full ? '🎙 녹음 저장 완료 — 세션 종료 시 AI가 일지로 정리해요' : '🎙 녹음 종료 — 인식된 내용이 없습니다', full?'ok':'err');
  render();
}
async function startBayRec(bayId){
  if(!recSupported()){ liveToast('이 기기는 녹음을 지원하지 않습니다','err'); return; }
  if(_rec.bayId){ liveToast('이미 '+getBay(_rec.bayId).name+'에서 녹음 중입니다','err'); return; }
  var act=S.activeSessions[bayId]; if(!act){ liveToast('먼저 회원을 배정하세요','err'); return; }
  try{
    var stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}});
    // txBase = 녹음 시작 전 이미 있던 메모, tx = 이번 녹음으로 쌓이는 텍스트(자체 버퍼)
    _rec={bayId:bayId, stream:stream, mr:null, chunks:[], startedAt:Date.now(), uiTimer:null, segTimer:null, wakeLock:null, stopping:false, segIdx:0, pendingStt:0, txBase:(act._transcript||'').trim(), tx:''};
    try{ if(navigator.wakeLock) _rec.wakeLock=await navigator.wakeLock.request('screen'); }catch(e){}
    _startSegment();
    _rec.uiTimer=setInterval(_recUpdateUI, 1000);   // 초시계·텍스트만 갱신(render X)
    _rec.autoStop=setTimeout(function(){ try{ stopBayRec(bayId); }catch(e){} }, 90*60000);
    render();
  }catch(e){
    console.warn('[rec] start fail:', e);
    liveToast(e&&e.name==='NotAllowedError'?'마이크 권한을 허용해주세요 (iOS: 설정>이 앱>마이크)':'녹음 시작 실패','err');
  }
}
async function stopBayRec(bayId){
  if(_rec.bayId!==bayId || !_rec.mr) return;
  _rec.stopping=true;
  _rec._lastBay=bayId;
  clearInterval(_rec.uiTimer); clearTimeout(_rec.segTimer); clearTimeout(_rec.autoStop);
  try{ if(_rec.wakeLock) _rec.wakeLock.release(); }catch(e){}
  var act=S.activeSessions[bayId];
  if(act) act._sttBusy=true;   // 마지막 조각 변환 중 표시
  try{ _rec.mr.stop(); }catch(e){ _finishRec(); }
  try{ _rec.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
  _rec.bayId=null; _rec.mr=null; _rec.stream=null;
  render();
}
async function sttTranscribe(blob){
  if(!r2.enabled) throw new Error('worker 미설정');
  // 직전 세그먼트 끝부분을 힌트로 넘겨 문맥 연결 + 골프 용어 정확도↑
  var hint=(_rec&&_rec.tx)?String(_rec.tx).slice(-180):'';
  var res=await fetch(r2.workerUrl+'/stt',{method:'POST',headers:{'X-API-Key':r2.apiKey,'Content-Type':blob.type||'application/octet-stream','X-STT-Prompt':encodeURIComponent('골프 레슨. '+hint).slice(0,900)},body:blob});
  if(res.status===501||res.status===404||res.status===401){ window._sttReady=false; throw new Error('stt-not-ready '+res.status); }   // 키미설정/경로없음/인증
  if(!res.ok){ var t=''; try{t=await res.text();}catch(e){} throw new Error('stt http '+res.status+' '+t.slice(0,120)); }
  window._sttReady=true;
  var j=await res.json();
  return (j&&j.text||'').trim();
}
// 앱 시작 시 STT 서버(Groq 키 + /stt 경로) 준비 여부 확인 — 녹음 UI 를 미리 맞춤.
// 빈 오디오를 보내 응답 코드로 판정:
//   400 (empty audio — 경로·키 정상) 또는 2xx = 준비됨
//   404(구버전 워커 /stt 없음)·501(키 없음)·401(인증)·5xx = 안 됨
async function checkSttReady(){
  try{
    if(typeof r2==='undefined' || !r2.enabled){ window._sttReady=false; return; }
    var res=await fetch(r2.workerUrl+'/stt',{method:'POST',headers:{'X-API-Key':r2.apiKey,'Content-Type':'audio/mp4'},body:new Uint8Array(0)});
    window._sttReady = (res.status===400 || (res.status>=200 && res.status<300));
    if(typeof render==='function' && S.showLiveSession){ try{render();}catch(e){} }
  }catch(e){ /* 네트워크 실패 — 판정 보류(undefined). 녹음 버튼 표시, 시도 시 실패하면 안내로 전환 */ }
}

// Claude API 키 — 이 기기(브라우저)에만 저장. git/서버 어디에도 안 올라감.
// 우선순위: localStorage > config.js(비워둠 권장)
function getAnthropicKey(){
  try{ var k=localStorage.getItem('golf_pt_anthropic_key'); if(k) return k; }catch(e){}
  return (window.APP_CONFIG&&window.APP_CONFIG.ANTHROPIC_API_KEY)||'';
}
function aiEnabled(){
  var cfg=window.APP_CONFIG||{};
  var wurl=cfg.AI_WORKER_URL||cfg.R2_WORKER_URL;
  var wkey=cfg.AI_WORKER_KEY||cfg.R2_API_KEY;
  if(cfg.AI_VIA_WORKER && wurl && wkey) return true; // 워커 프록시
  return !!getAnthropicKey(); // 기기 로컬 키
}
function setAnthropicKey(){
  var cur='';
  try{ cur=localStorage.getItem('golf_pt_anthropic_key')||''; }catch(e){}
  var masked=cur?(cur.slice(0,10)+'…'+cur.slice(-4)):'(없음)';
  var v=prompt('Claude API 키를 붙여넣으세요 (sk-ant-... )\n현재: '+masked+'\n\n· 이 키는 이 기기에만 저장됩니다 (서버·깃에 안 올라감)\n· 비우고 확인하면 AI 정리 해제\n· AI 정리 비활성 시 앱 내장 정리로 자동 폴백', cur);
  if(v===null) return;
  v=(v||'').trim();
  if(v && v.indexOf('sk-ant-')!==0){ alert('올바른 키 형식이 아닙니다 (sk-ant- 로 시작해야 합니다)'); return; }
  try{ if(v) localStorage.setItem('golf_pt_anthropic_key', v); else localStorage.removeItem('golf_pt_anthropic_key'); }catch(e){ alert('이 기기에 저장할 수 없습니다 (시크릿 모드?)'); return; }
  try{ logAudit('system','AI 키 '+(v?'설정':'해제'),'',{device:'local'}); }catch(e){}
  render();
  liveToast(v?'🤖 AI 정리 켜짐 (이 기기 전용)':'AI 정리 꺼짐 (내장 정리 사용)','ok');
}

// Claude 정리 — 골프 특화 구조화. 1순위 워커 프록시, 2순위 브라우저 직접, 실패 시 null→로컬 폴백.
async function aiSummarizeWithClaude(transcript, author){
  try{
    var cfg=window.APP_CONFIG||{};
    var role=(typeof getRole==='function')?getRole(author):'trainer';
    var isPro=role==='pro';
    var roleLabel=isPro?'골프 프로':'골프 PT 트레이너';
    // 원문 길이에 따라 출력 토큰·요약 밀도 조절 (50분 레슨도 담기게)
    var words=(transcript||'').split(/\s+/).length;
    var maxTok = words>2500?2600 : words>1200?1800 : 1100;
    var system=
      '당신은 '+roleLabel+'의 레슨 녹음(음성인식 원문)을 신뢰도 높은 한국어 세션 일지로 정리하는 전문 AI다.\n'
      +'음성인식 특성상 띄어쓰기·오탈자·중복·말버릇("어","그","자","이제")이 많다. 이를 자연스럽게 교정하되 내용은 절대 창작·과장하지 않는다.\n'
      +(isPro
        ? '골프 스윙 도메인 지식으로 용어를 바로잡아라(예: 샬로잉/코킹/힌징/라그/온플레인/히프턴/체중이동/임팩트/릴리스/페이스앵글/어택앵글 등).\n'
        : '골프 피지컬·기능성 트레이닝 지식으로 용어를 바로잡아라(가동성/안정성/코어/회전/체중이동/유연성/근력).\n')
      +'\n다음 마크다운 형식을 반드시 지켜 출력한다(빈 섹션은 생략):\n'
      +'## 📋 오늘의 핵심\n2~3문장으로 이번 레슨의 주제·결론.\n\n'
      +'## 🎯 교정 포인트\n- **[부위/동작]** 문제점 → 교정 방법 (실제 언급된 것만, 각 1줄)\n\n'
      +'## 🏌️ 드릴·연습\n- **[드릴명]** 방법/횟수/의도\n\n'
      +'## 📈 트랙맨·수치 (원문에 언급 시)\n- 클럽/캐리/구질 등 실제 말한 수치만\n\n'
      +'## 📝 다음 과제\n- 회원이 집/다음까지 할 것\n\n'
      +'## 💬 특이사항\n- 통증·컨디션·멘탈·요청 등\n\n'
      +'규칙: (1) 원문에 없는 내용 금지 (2) 애매하면 넣지 말고 생략 (3) 실제 말한 교정/드릴은 빠뜨리지 말 것 (4) 확률·추측 표현("~인 것 같습니다") 금지 (5) 코치가 회원에게 지시한 핵심은 최대한 보존.';
    var payload={
      model:cfg.ANTHROPIC_MODEL||'claude-haiku-4-5',
      max_tokens:maxTok,
      system:system,
      messages:[{role:'user',content:'다음은 '+roleLabel+'의 레슨 녹음 원문이다. 위 형식으로 정리하라:\n\n"""\n'+transcript+'\n"""'}]
    };
    var parse=function(data){ var t=(data&&data.content&&data.content[0]&&data.content[0].text)||''; return t.trim()||null; };
    // 1순위: 워커 프록시 (Anthropic 키가 Cloudflare 시크릿에만 존재)
    // AI_WORKER_URL 있으면 그쪽, 없으면 R2_WORKER_URL 재사용
    var wbase=cfg.AI_WORKER_URL||cfg.R2_WORKER_URL;
    var wauth=cfg.AI_WORKER_KEY||cfg.R2_API_KEY;
    if(cfg.AI_VIA_WORKER && wbase && wauth){
      try{
        var wurl=String(wbase).replace(/\/+$/,'')+'/claude';
        var wres=await fetch(wurl,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':wauth},body:JSON.stringify(payload)});
        if(wres.ok){ var wt=parse(await wres.json()); if(wt) return wt; }
        else console.warn('[claude] worker http', wres.status);
      }catch(e){ console.warn('[claude] worker fail:', e&&e.message); }
      // 워커 실패 → 아래 직접 키 폴백 시도
    }
    // 2순위: 브라우저 직접 호출 (이 기기 localStorage 키)
    var key=getAnthropicKey();
    if(!key) return null;
    var res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify(payload)
    });
    if(!res.ok){ console.warn('[claude] http',res.status); return null; }
    return parse(await res.json());
  }catch(e){
    console.warn('[claude] fail:', e&&e.message);
    return null;
  }
}

// 받아쓴 원문 → 불릿 세션카드 (로컬 AI 키워드 태깅)
function structureTranscript(transcript, author){
  var t=(transcript||'').replace(/\s+/g,' ').trim();
  if(!t) return '';
  var parts=t.split(/(?:다\.|요\.|음\.|죠\.|\.|!|\?|\n|,|\s그리고\s|\s그다음\s|\s그\s다음\s|\s이어서\s)/);
  var lines=[];
  parts.forEach(function(p){ p=p.trim(); if(p.length>=4 && lines.indexOf(p)===-1) lines.push(p); });
  if(lines.length===0) lines=[t];
  var bullets=lines.slice(0,14).map(function(l){ return '- '+l; });
  var tags=[];
  try{
    var dict = getRole(author)==='pro' ? GOLF_KEYWORDS : PT_KEYWORDS;
    var low=t.toLowerCase();
    Object.keys(dict).forEach(function(cat){ if((dict[cat].keywords||[]).some(function(w){return low.indexOf(w)!==-1;})) tags.push(cat); });
  }catch(e){}
  return '[AI 자동 정리'+(tags.length?' · '+tags.slice(0,4).join('·'):'')+']\n'+bullets.join('\n');
}
// 종료 시: 구조화 + 트랙맨 요약 → 기존 세션카드 모달에 프리필 (트레이너 검토 후 저장)
function openVoiceDraft(memberId, author, transcript){
  var m=S.members.find(function(x){return x.id===memberId;});
  if(!m) return false;
  var accessible=(S.currentRole==='admin'||S.currentRole==='infodesk')||(m.assignedTo&&m.assignedTo.indexOf(S.currentUser)!==-1);
  var authorOk=author===S.currentUser && INSTRUCTORS.some(function(i){return i.name===author;});
  if(!accessible || !authorOk) return false;
  var todayShots=S.shotEvents.filter(function(s){return s.memberId===memberId && String(s.ts).slice(0,10)===today();});
  var summary='';
  if(todayShots.length){
    var carries=todayShots.map(function(s){return parseFloat(s.data&&s.data.carry)||0;}).filter(Boolean);
    summary='\n\n[트랙맨] 저장된 샷 '+todayShots.length+'개'+(carries.length?' · 베스트 캐리 '+Math.max.apply(null,carries)+'yd':'');
  }
  S.showLiveSession=false; S.selectedMember=memberId; S.editSessionId=null;
  var localStructured=structureTranscript(transcript,author);
  // rawTranscript = 받아쓴 전문(원문). 신뢰도 담보용 — 세션에 함께 저장, 화면에선 접어둠.
  S.newSession={ date:today(), author:author, content:localStructured+summary, rawTranscript:(transcript||'').trim(), media:[], mediaUrls:['',''] };
  S.showAddSession=true;
  if(aiEnabled()){
    S.newSession._aiPending=true;
    aiSummarizeWithClaude(transcript,author).then(function(better){
      if(better && S.showAddSession && S.newSession){
        S.newSession.content = better + summary;
        S.newSession._aiPending=false;
        try{ liveToast('🤖 AI 정리 완료 — 검토 후 저장','ok'); }catch(e){}
        try{ render(); }catch(e){}
      } else if(S.newSession){ S.newSession._aiPending=false; try{render();}catch(e){} }
    });
  }
  return true;
}

// ============ 렌더 ============
function renderLiveSession(){
  if(!S.showLiveSession) return '';
  var role = S.currentRole, isAdmin = role==='admin';
  var canCoach = role==='pro' || role==='trainer' || isAdmin;
  var bays = (S.bays && S.bays.length) ? S.bays : BAYS_DEFAULT;

  var paused = (typeof shotPauseOn==='function') && shotPauseOn();
  var html = '<div class="live-wrap'+(paused?' shot-paused':'')+'">';
  html += '<div class="live-head"><button class="btn live-close-btn" onclick="closeLiveSession()">‹ 닫기</button>'
       +  '<div class="live-title">🏌️ 수업 센터'+(paused?' <span class="paused-pill">🔇 수신 정지</span>':'')+'</div>'
       +  '<button class="btn live-refresh-btn" onclick="reloadApp()" title="새로고침">🔄</button></div>';
  if(isAdmin){
    html += '<div class="shot-pause-bar">'
         +  (paused
              ? '<div class="sp-msg">🔇 <b>샷 수신 일시정지</b> 중 — 에이전트가 보내는 새 샷이 화면에 안 뜹니다</div>'
                +'<button class="btn sp-resume" onclick="toggleShotPause()">▶ 수신 재개</button>'
              : '<button class="btn sp-pause" onclick="toggleShotPause()" title="가짜/원치 않는 샷이 들어올 때 긴급 차단">🔇 샷 수신 일시정지</button>')
         +  '</div>';
  }
  if(canCoach){
    html += '<div class="class-actions">'
         +  '<button class="btn primary class-live-btn" onclick="openClassPick(\'live\')">🎯 라이브 수업<small>베이 배정 · 샷 자동 저장</small></button>'
         +  (role==='pro'||role==='trainer' ? '<button class="btn class-journal-btn" onclick="openClassPick(\'journal\')">✏️ 일지만 기록<small>샷 없이 바로 작성</small></button>' : '')
         +  '</div>';
  }
  html += '<div class="live-sub">베이에 회원을 배정하면, 트랙맨 샷이 <strong>그 회원에게 저장</strong>됩니다. '
       +  '<span class="live-live-tag">● TrackMan 실시간 연동</span></div>';
  html += '<div class="bay-grid">';
  bays.forEach(function(bay){ html += renderBayCard(bay, canCoach, isAdmin); });
  html += '</div>';
  html += renderShotLog(isAdmin);
  if(S.liveToast){ html += '<div class="live-toast '+S.liveToast.kind+'">'+S.liveToast.msg+'</div>'; }
  html += '</div>';

  html += renderLiveStartModal();
  html += renderLiveConfirmModal();
  html += renderReassignModal();
  html += renderBayPickModal();
  html += renderClassPickModal();
  return html;
}

// ===== 수업 센터 — 회원 선택 (라이브 수업 / 일지만 기록 공용) =====
function openClassPick(mode){ S.classPick=mode; S.classPickQuery=''; render(); }
function closeClassPick(){ S.classPick=null; S.classPickQuery=''; render(); }
function classPickMember(memberId){
  var mode=S.classPick; S.classPick=null; S.classPickQuery='';
  if(mode==='journal'){
    // 샷 저장 없이 일지만 — 회원 화면으로 이동해 일지 카드 열기
    S.selectedMember=memberId; S.showLiveSession=false;
    openAddSession();
    return;
  }
  openLiveForMember(memberId);  // 라이브 수업 — 베이 선택으로
}
function renderClassPickModal(){
  if(!S.classPick) return '';
  var isAdmin=S.currentRole==='admin';
  var journal=S.classPick==='journal';
  var q=(S.classPickQuery||'').trim().toLowerCase(), qcho=getChosung(q);
  var list=S.members.filter(function(m){
    if(!isAdmin && !(m.assignedTo&&m.assignedTo.indexOf(S.currentUser)!==-1)) return false;
    return true;
  });
  return '<div class="modal-overlay" onclick="if(event.target===this)closeClassPick()"><div class="modal">'
    + '<div class="modal-title">'+(journal?'✏️ 일지만 기록':'🎯 라이브 수업')+' — 회원 선택</div>'
    + (journal?'<div class="classpick-note">샷 저장 없이 수업 일지만 작성합니다</div>':'')
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="filterPickRows(this.value,&apos;classPickQuery&apos;)" autocomplete="off" autocorrect="off" autocapitalize="off"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">배정된 회원이 없습니다</div>'
       : '<div class="pick-empty empty-state" style="display:none">검색 결과 없음</div>'+list.map(function(m){
           var cho=getChosung(m.name);
           var hide=q&&m.name.toLowerCase().indexOf(q)===-1&&cho.indexOf(qcho)===-1;
           var busyBay=Object.keys(S.activeSessions).find(function(b){return S.activeSessions[b].memberId===m.id;});
           var blocked=!journal && busyBay;   // 라이브는 진행중이면 차단, 일지는 무관
           return '<div class="live-member'+(blocked?' busy':'')+'" data-name="'+m.name.toLowerCase().replace(/"/g,'')+'" data-cho="'+cho.replace(/"/g,'')+'"'+(hide?' style="display:none"':'')+(blocked?'':' onclick="classPickMember(\''+m.id+'\')"')+'>'
             + '<div class="member-avatar '+m.color+'">'+initials(m.name)+'</div>'
             + '<div class="lm-name">'+m.name+'</div>'
             + (busyBay?'<span class="lm-busy">'+getBay(busyBay).name+' 진행중</span>':'')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeClassPick()">취소</button></div>'
    + '</div></div>';
}

function renderBayCard(bay, canCoach, isAdmin){
  var act = S.activeSessions[bay.id];
  var typeLabel = bay.type==='lesson_only' ? '레슨 전용' : '연습 · 레슨';
  var head = '<div class="bay-card-hd '+bay.color+'"><span class="bay-name">'+bay.name+'</span><span class="bay-type">'+typeLabel+'</span></div>';

  if(!act){
    var emptyBody = '<div class="bay-empty">'
      + '<div class="bay-empty-txt">비어있음</div>'
      + (canCoach ? '<button class="btn primary bay-assign-btn" onclick="openLiveStart(\''+bay.id+'\')">+ 회원 배정</button>'
                  : '<div class="bay-empty-sub">진행중인 세션 없음</div>')
      + '</div>';
    return '<div class="bay-card empty">'+head+emptyBody+'</div>';
  }

  var stale = isStaleSession(act);
  var shots = liveBayShots(bay.id, act);
  var silence = shotSilenceMin(shots);
  var elapsed = formatElapsed(act.startedAt);
  var roleCls = getRole(act.author)==='pro' ? 'pro' : 'trainer';

  var body = '<div class="bay-active">';
  if(stale){ body += '<div class="bay-stale">⚠️ 어제 시작된 세션입니다.<br>굿샷이 차단됩니다 — 종료 후 다시 시작하세요.</div>'; }
  body += '<div class="bay-member"><div class="member-avatar '+memberColor(act.memberId)+'">'+initials(act.memberName)+'</div>'
        + '<div class="bay-member-info"><div class="bay-member-name">'+act.memberName+'님</div>'
        + '<div class="bay-author '+roleCls+'">'+act.author+' · '+elapsed+' 경과</div></div></div>';
  body += '<div class="bay-shots">'
        + (shots.length>0
            ? ('저장된 샷 <strong>'+shots.length+'</strong>개'
               + (silence!==null && silence>=30 ? ' · <span class="bay-silence">'+silence+'분간 없음</span>' : ''))
            : '아직 저장된 샷 없음')
        + '</div>';

  // 레슨 모드 — '방금 친 샷' 을 베이카드 상단(회원 바로 아래)에 크게 띄움.
  // 페이지 아래쪽에 작게 보이던 문제 해결 + 새 샷은 _isNew 로 강조.
  var modeEarly = bayMode(bay.id, act);
  if(!stale && modeEarly==='lesson'){
    var psHTML = _buildPendingShotsHTML(bay.id);
    if(psHTML){ body += psHTML;
    }
  }
  // 수업 녹음 — 🎙 녹음하면 15초마다 아래에 글이 실시간으로 붙고, ⏹ 종료 시 자동 저장.
  // 변환 서버(Groq) 미설정이면 녹음 대신 메모 입력 안내 (헷갈리지 않게).
  var sttOff = (window._sttReady === false);
  if(!stale){
    if(recSupported() && _rec.bayId===bay.id){
      body += '<div class="rec-bar on"><span class="rec-dot"></span><span class="rec-label">녹음 중 <span id="rec-elapsed">'+_recElapsed()+'</span></span>'
            + '<button class="rec-stop" onclick="stopBayRec(\''+bay.id+'\')">⏹ 녹음 종료</button></div>'
            + '<div class="rec-live" id="rec-live-text">'+esc(((act._transcript||'').trim()).slice(-300)||'듣는 중... 말하면 15초 안에 글로 나타나요')+'</div>';
    } else if(act._sttBusy){
      body += '<div class="rec-bar busy"><span class="rec-spin">🌀</span><span class="rec-label">마지막 조각 변환 중...</span></div>';
    } else {
      if(recSupported() && !_rec.bayId && !sttOff){
        body += '<button class="btn rec-start-btn" onclick="startBayRec(\''+bay.id+'\')">🎙 수업 녹음<small>말하면 실시간으로 글이 됩니다 · 종료 시 자동 저장</small></button>';
      }
      if(sttOff){
        body += '<div class="rec-disabled">🎙 음성→글 변환 서버가 아직 준비 안 됐어요.<br><b>아래 메모칸에 직접 입력</b>하거나, <b>키보드의 마이크 🎤</b>로 받아쓰기 하세요.<br><small>(관리자: 워커에 Groq 키 등록하면 실시간 녹음이 켜집니다)</small></div>';
      }
      // 메모칸 — 녹음 텍스트 확인·수정 + 직접 타이핑/키보드 받아쓰기 (항상 접근 가능)
      if((act._transcript||'').trim() || !recSupported() || sttOff){
        body += '<div class="voice-ios">'
              +   '<div class="vi-head">📝 수업 메모 <small>(자동 저장 · 세션 종료 시 AI 정리)</small></div>'
              +   '<textarea class="vi-area" placeholder="수업 내용을 입력하거나 키보드 마이크 🎤 로 받아쓰세요." oninput="updateVoiceText(\''+bay.id+'\',this.value)">'+esc(act._transcript||'')+'</textarea>'
              + '</div>';
      }
    }
  }
  var mode = modeEarly;
  if(!stale){
    if(mode==='lesson'){
      // 레슨 모드: 모드 토글만 여기 (샷 목록은 상단에 이미 표시됨)
      body += '<div class="bay-mode-row"><span class="bay-mode lesson">레슨 · 선별 저장</span>'
            + '<button class="mode-switch" onclick="setBayMode(\''+bay.id+'\',\'practice\')">연습으로</button></div>';
      var hasPending = (typeof pendingShotsForBay==='function') && pendingShotsForBay(bay.id).length>0;
      if(!hasPending){
        body += '<div class="bay-auto">🎯 공을 치면 여기에 <strong>최근 샷</strong>이 떠요 — 좋은 것만 저장</div>';
      }
    } else {
      // 연습 모드: 자동 저장
      body += '<div class="bay-mode-row"><span class="bay-mode practice">연습 · 자동 저장</span>'
            + '<button class="mode-switch" onclick="setBayMode(\''+bay.id+'\',\'lesson\')">레슨으로</button></div>';
      body += '<div class="bay-auto">🎯 공을 치면 트랙맨이 <strong>모두 자동 저장</strong>합니다</div>';
    }
  }
  body += '<div class="bay-actions">';
  body += '<button class="btn bay-end-btn" onclick="endLiveSession(\''+bay.id+'\')">⏹ 종료</button>';
  body += '</div></div>';
  return '<div class="bay-card active" data-bay="'+bay.id+'">'+head+body+'</div>';
}

function _shotTimeLabel(s){
  // ts 우선 신뢰 (v5.7부터 에이전트가 '처리 시각'을 정확히 보냄).
  // ts 없을 때만 _rcvAt(이 기기가 처음 본 시각) — 단 그 경우 '방금' 표시는 안 함
  // (새로 열 때마다 옛 샷이 전부 '방금'으로 보이던 오표시 방지).
  var ref = s.ts ? Date.parse(s.ts) : NaN;
  var fromTs = !isNaN(ref);
  if(!fromTs) ref = s._rcvAt;
  if(!ref || isNaN(ref)) return '';
  var diff = Date.now() - ref;
  if(fromTs && diff < 5*60000 && diff > -5*60000) return '방금';
  if(diff > 0 && diff < 60*60000) return Math.round(diff/60000)+'분 전';
  var t = new Date(ref);
  var sameDay = (new Date()).toDateString()===t.toDateString();
  return (sameDay?'':String(t.getMonth()+1)+'/'+t.getDate()+' ')
       + String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
}
function renderShotLog(isAdmin){
  var canCoach = S.currentRole==='pro' || S.currentRole==='trainer' || isAdmin;
  var all = S.shotEvents.slice().sort(function(a,b){
    var ra=a._rcvAt||0, rb=b._rcvAt||0;
    if(ra&&rb) return rb-ra;
    return String(b.ts||'').localeCompare(String(a.ts||''));
  });
  var assigned = all.filter(function(s){ return !(s._unassigned && !s.memberName); });
  var unassignedAll = all.filter(function(s){ return s._unassigned && !s.memberName; });
  var mockCount = (S.shotEvents||[]).filter(function(s){return s.source==='mock';}).length;
  var total = S.shotEvents.length;
  var showUn = !!S._showUnassigned;
  var selMode = !!S._shotSelMode;
  if(!S._shotSel) S._shotSel = {};
  var selCount = Object.keys(S._shotSel).filter(function(k){return S._shotSel[k];}).length;
  var shots = assigned.slice(0,30);

  var html = '<div class="shot-log"><div class="shot-log-hd">최근 저장된 샷 '+total+'개'
           + (canCoach && total>0 && !selMode ? ' <button class="small-btn sel-mode-btn" onclick="enterShotSelMode()">☑︎ 선택</button>' : '')
           + (isAdmin && mockCount>0 && !selMode ? ' <button class="purge-demo-btn" onclick="purgeDemoShots()">🗑 데모 '+mockCount+'개</button>' : '')
           + (isAdmin && total>0 && !selMode ? ' <button class="purge-all-btn" onclick="purgeAllShots()">🗑 전체 삭제</button>' : '')
           + '</div>';

  // 선택 모드 툴바
  if(selMode){
    var selTotal=(S.shotEvents||[]).length;
    var isAllSel=selCount>=selTotal && selTotal>0;
    html += '<div class="sel-toolbar">'
         + '<button class="small-btn" onclick="selectAllShots()">전체 선택</button>'
         + '<button class="small-btn" onclick="clearShotSel()">선택 해제</button>'
         + '<span class="sel-count">'+selCount+'개 선택</span>'
         + '<button class="small-btn del sel-del-btn"'+(selCount?'':' disabled')+' onclick="deleteSelectedShots()">'+(isAllSel?'🗑 전체 삭제(서버 포함)':'🗑 선택 삭제')+'</button>'
         + '<button class="small-btn" onclick="exitShotSelMode()">취소</button>'
         + '</div>';
  }

  if(unassignedAll.length>0 && !selMode){
    html += '<div class="unassigned-fold">'
         + '<button class="unassigned-toggle" onclick="toggleUnassigned()">📥 미배정 '+unassignedAll.length+'개 '+(showUn?'▲ 접기':'▼ 펼치기')+'</button>'
         + (isAdmin ? ' <button class="small-btn purge-un-btn" onclick="purgeUnassignedShots()">🗑 미배정만 삭제</button>' : '')
         + '</div>';
  }
  // 선택 모드에선 배정/미배정 모두 보여서 한 번에 정리 가능
  var rowsToShow = selMode ? unassignedAll.concat(assigned).slice(0,80)
                 : (showUn ? unassignedAll.slice(0,50).concat(shots) : shots);
  if(rowsToShow.length===0){
    html += '<div class="empty-state">아직 저장된 샷이 없습니다</div>';
  } else {
    html += '<div class="shot-list">' + rowsToShow.map(function(s){
      var bay = getBay(s.bayId);
      var d = s.data||{};
      var metric = (d._units&&d._units.dist==='m')||d._src==='trackman_io';
      var carry = d.carry!=null&&d.carry!==''? (Math.round((metric?parseFloat(d.carry):parseFloat(d.carry)*0.9144)*10)/10)+'m' : '';
      var unassigned = s._unassigned && (!s.memberName);
      var checked = !!S._shotSel[s.id];
      return '<div class="shot-row'+(unassigned?' unassigned':'')+(selMode?' selectable'+(checked?' on':''):'')+'"'
        + (selMode?' onclick="toggleShotSel(\''+s.id+'\')"':'')+'>'
        + (selMode?'<span class="shot-check">'+(checked?'☑':'☐')+'</span>':'')
        + '<span class="shot-bay '+bay.color+'">'+bay.name+'</span>'
        + '<span class="shot-member">'+(s.memberName||'<span class="unassigned-tag">미배정</span>')+'</span>'
        + '<span class="shot-club">'+(d.club||'')+'</span>'
        + '<span class="shot-metric">'+carry+'</span>'
        + '<span class="shot-time">'+_shotTimeLabel(s)+'</span>'
        + (s.source==='mock' ? '<span class="shot-mock">데모</span>' : '')
        + (!selMode && isAdmin ? '<button class="small-btn shot-move" onclick="openReassign(\''+s.id+'\')">'+(unassigned?'배정':'이동')+'</button>' : '')
        + (!selMode && canCoach ? '<button class="small-btn del" onclick="deleteShot(\''+s.id+'\')">삭제</button>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  html += '</div>';
  return html;
}
function toggleUnassigned(){ S._showUnassigned = !S._showUnassigned; if(typeof render==='function') render(); }
// ===== 샷 선택 모드 (체크박스 다중 삭제) =====
// 선택 모드 토글 — render() 안 부르고 부분 패치만 (.shot-log 영역만 교체).
// render 가 root.innerHTML 통째 재생성 시 iOS Safari 가 새 .live-wrap layout 완료 전에
// scrollTop 복원이 일어나 스크롤이 위로 튀던 문제 해결.
function _patchShotLogOnly(){
  try{
    var logEl = document.querySelector('.shot-log');
    if(!logEl || typeof renderShotLog!=='function') return false;
    var isAdmin = S.currentRole==='admin';
    logEl.outerHTML = renderShotLog(isAdmin);
    return true;
  }catch(e){ return false; }
}
function enterShotSelMode(){ S._shotSelMode=true; S._shotSel={}; if(_patchShotLogOnly()) return; render(); }
function exitShotSelMode(){ S._shotSelMode=false; S._shotSel={}; if(_patchShotLogOnly()) return; render(); }
function clearShotSel(){ S._shotSel={}; if(_patchShotLogOnly()) return; render(); }
function toggleShotSel(id){ if(!S._shotSel) S._shotSel={}; S._shotSel[id]=!S._shotSel[id]; if(_patchShotLogOnly()) return; render(); }
function selectAllShots(){
  S._shotSel={};
  (S.shotEvents||[]).forEach(function(s){ S._shotSel[s.id]=true; });
  if(_patchShotLogOnly()) return; render();
}
async function deleteSelectedShots(){
  var ids = Object.keys(S._shotSel||{}).filter(function(k){return S._shotSel[k];});
  if(!ids.length) return;
  var total = (S.shotEvents||[]).length;
  // 화면에 보이는 샷을 전부 선택했으면 = "전부 지우려는 의도".
  // 화면 상한(1000)보다 서버에 더 많이 쌓여 있으면, 보이는 것만 지워도 나머지가 다시 뜬다.
  // → 이 경우 서버 전체 삭제(deleteAllShots)로 확실히 비운다.
  var wipeAll = ids.length >= total && total > 0;
  var msg = wipeAll
    ? '⚠️ 저장된 샷을 서버까지 전부 삭제합니다.\n(화면에 안 보이는 옛 샷 포함 · 트랙맨 PC 영상은 그대로)\n\n되돌릴 수 없습니다. 계속할까요?'
    : '선택한 '+ids.length+'개 샷을 삭제합니다.\n(트랙맨 PC 영상은 그대로)\n계속할까요?';
  if(!confirm(msg)) return;

  var idset = {}; ids.forEach(function(id){ idset[id]=true; });
  var targets = (S.shotEvents||[]).filter(function(s){ return idset[s.id]; });
  // 1) 즉시 화면 갱신
  S.shotEvents = wipeAll ? [] : (S.shotEvents||[]).filter(function(s){ return !idset[s.id]; });
  S._shotSelMode=false; S._shotSel={};
  try{ save(); }catch(e){}
  if(typeof _patchShotLogOnly==='function') _patchShotLogOnly(); else render();
  liveToastSafe(wipeAll ? '🗑 전체 삭제 중...' : '🗑 '+targets.length+'개 삭제됨');
  // 2) 폴링 정지 + 서버 삭제 + R2 백그라운드
  var hadPoll = !!_livePollTimer;
  if(typeof stopLivePolling==='function') stopLivePolling();
  _liveLastIds = null;
  window._shotsDeleting = true;
  var op = wipeAll ? cloud.deleteAllShots() : cloud.deleteShotsBulk(ids);
  Promise.resolve(op).then(function(ok){
    targets.forEach(function(s){ if(s.videoR2Key){ try{ r2.remove(s.videoR2Key); }catch(e){} } });
    if(!ok){ liveToastSafe('⚠️ 서버 삭제 실패 — 다시 시도해주세요'); }
    else if(wipeAll){ liveToastSafe('✓ 전체 삭제 완료'); }
    window._shotsDeleting = false;
    if(hadPoll && typeof startLivePolling==='function') setTimeout(startLivePolling, 800);
  });
}
async function purgeUnassignedShots(){
  var un = (S.shotEvents||[]).filter(function(s){ return s._unassigned && !s.memberName; });
  if(!un.length) return;
  if(!confirm('미배정 '+un.length+'개 삭제합니다.\n(트랙맨 PC 영상은 그대로)\n계속할까요?')) return;
  var ids = un.map(function(s){return s.id;});
  // 즉시 화면 갱신
  S.shotEvents = S.shotEvents.filter(function(s){ return !(s._unassigned && !s.memberName); });
  try{ save(); }catch(e){}
  if(typeof _patchShotLogOnly==='function') _patchShotLogOnly(); else render();
  liveToastSafe('🗑 미배정 '+un.length+'개 삭제됨');
  // 백그라운드 정리
  var hadPoll = !!_livePollTimer;
  if(typeof stopLivePolling==='function') stopLivePolling();
  _liveLastIds = null;
  window._shotsDeleting = true;
  Promise.resolve(cloud.deleteShotsBulk(ids)).then(function(){
    un.forEach(function(s){ if(s.videoR2Key){ try{ r2.remove(s.videoR2Key); }catch(e){} } });
    window._shotsDeleting = false;
    if(hadPoll && typeof startLivePolling==='function') setTimeout(startLivePolling, 1200);
  });
}

function renderLiveStartModal(){
  if(!S.liveStartBay) return '';
  var bay = getBay(S.liveStartBay);
  var isAdmin = S.currentRole==='admin';
  var q = (S.liveStartQuery||'').trim().toLowerCase(), qcho=getChosung(q);
  var list = S.members.filter(function(m){
    if(!isAdmin && !(m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1)) return false;
    return true;
  });
  return '<div class="modal-overlay" onclick="if(event.target===this)closeLiveStart()"><div class="modal">'
    + '<div class="modal-title">'+bay.name+' — 회원 배정</div>'
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="filterPickRows(this.value,&apos;liveStartQuery&apos;)" autocomplete="off" autocorrect="off" autocapitalize="off"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">배정된 회원이 없습니다</div>'
       : '<div class="pick-empty empty-state" style="display:none">검색 결과 없음</div>'+list.map(function(m){
           var cho=getChosung(m.name);
           var hide=q&&m.name.toLowerCase().indexOf(q)===-1&&cho.indexOf(qcho)===-1;
           var busyBay = Object.keys(S.activeSessions).find(function(b){ return S.activeSessions[b].memberId===m.id; });
           return '<div class="live-member'+(busyBay?' busy':'')+'" data-name="'+m.name.toLowerCase().replace(/"/g,'')+'" data-cho="'+cho.replace(/"/g,'')+'"'+(hide?' style="display:none"':'')+(busyBay?'':' onclick="pickLiveMember(\''+m.id+'\')"')+'>'
             + '<div class="member-avatar '+m.color+'">'+initials(m.name)+'</div>'
             + '<div class="lm-name">'+m.name+'</div>'
             + (busyBay ? '<span class="lm-busy">'+getBay(busyBay).name+' 진행중</span>' : '')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeLiveStart()">취소</button></div>'
    + '</div></div>';
}

// 회원 등록 상태 경고 (만료/임박) — 라이브 시작 전 안내용
function memberStatusWarn(memberId){
  var m=S.members.find(function(x){return x.id===memberId;}); if(!m) return '';
  var warns=[];
  var d=(typeof daysUntilExpiry==='function')?daysUntilExpiry(typeof nearestExpiry==='function'?nearestExpiry(m):m.expiry):null;
  if(d!==null){ if(d<0) warns.push('⛔ 이용권 <b>만료</b>됨 ('+(-d)+'일 지남)'); else if(d<=14) warns.push('⏰ 이용권 <b>D-'+d+'</b> — 곧 만료'); }
  if(!warns.length) return '';
  return '<div class="live-confirm-expiry">'+warns.join('<br>')+'</div>';
}
function renderLiveConfirmModal(){
  var c = S.liveConfirm; if(!c) return '';
  var bay = getBay(c.bayId);
  return '<div class="modal-overlay"><div class="modal live-confirm">'
    + '<div class="live-confirm-bay '+bay.color+'">'+bay.name+'</div>'
    + '<div class="live-confirm-msg"><strong>'+c.memberName+'</strong>님 레슨을<br>'+bay.name+'에서 시작합니다.</div>'
    + memberStatusWarn(c.memberId)
    + '<div class="live-confirm-warn">⚠️ '+bay.name+'이(가) <strong>비어있는지 직접 확인</strong>하셨습니까?<br><span class="lcw-sub">다른 회원이 연습 중인 타석이면 안 됩니다.</span></div>'
    + '<div class="modal-actions"><button class="btn" onclick="cancelLiveConfirm()">취소</button><button class="btn primary" onclick="confirmLiveStart()">확인 · 시작</button></div>'
    + '</div></div>';
}

function renderReassignModal(){
  if(!S.liveReassignShot) return '';
  var shot = S.shotEvents.find(function(s){ return s.id===S.liveReassignShot; });
  if(!shot) return '';
  var q = (S.liveStartQuery||'').trim().toLowerCase(), qcho=getChosung(q);
  var list = S.members.slice();
  return '<div class="modal-overlay" onclick="if(event.target===this)closeReassign()"><div class="modal">'
    + '<div class="modal-title">굿샷 재할당 — 현재 「'+shot.memberName+'」</div>'
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="옮길 회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="filterPickRows(this.value,&apos;liveStartQuery&apos;)" autocomplete="off" autocorrect="off" autocapitalize="off"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">회원이 없습니다</div>'
       : '<div class="pick-empty empty-state" style="display:none">검색 결과 없음</div>'+list.map(function(m){
           var cho=getChosung(m.name);
           var hide=q&&m.name.toLowerCase().indexOf(q)===-1&&cho.indexOf(qcho)===-1;
           return '<div class="live-member'+(m.id===shot.memberId?' busy':'')+'" data-name="'+m.name.toLowerCase().replace(/"/g,'')+'" data-cho="'+cho.replace(/"/g,'')+'" onclick="applyReassign(\''+m.id+'\')"'+(hide?' style="display:none"':'')+'>'
             + '<div class="member-avatar '+m.color+'">'+initials(m.name)+'</div>'
             + '<div class="lm-name">'+m.name+'</div>'
             + (m.id===shot.memberId ? '<span class="lm-busy">현재</span>' : '')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeReassign()">취소</button></div>'
    + '</div></div>';
}
