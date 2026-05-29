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
// ⚠️ 현재는 트랙맨 연동 전 "데모(목) 모드" — 굿샷 데이터는 모의값이며 source:'mock'으로 표시됩니다.
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
// 트랙맨 연동 전 모의 샷 데이터 (연동 시 에이전트가 보내는 실제 값으로 대체)
function mockShotData(){
  var clubs=['드라이버','3번 우드','5번 우드','5번 아이언','7번 아이언','9번 아이언','피칭웨지'];
  var club=clubs[Math.floor(Math.random()*clubs.length)];
  var ball = 140 + Math.random()*45;
  var clubSpeed = 90 + Math.random()*35;
  var carry = Math.round(150 + Math.random()*85);
  var smash = (ball/clubSpeed);
  return {
    club: club,
    ballSpeed: ball.toFixed(1)+' mph',
    clubSpeed: clubSpeed.toFixed(1)+' mph',
    carry: carry+' yd',
    smash: smash.toFixed(2),
    _mock: true
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
  render();
}
function closeLiveSession(){ S.showLiveSession=false; render(); }

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
  var sess = {memberId:c.memberId, memberName:c.memberName, author:author, startedAt:new Date().toISOString(), note:''};
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
  var bay = getBay(bayId);
  if(!confirm(bay.name+' · '+act.memberName+'님 세션을 종료할까요?\n(종료해도 저장된 굿샷 기록은 회원에게 남습니다)')) return;
  delete S.activeSessions[bayId];
  save();
  logActivity('라이브 세션 종료', act.memberId, bay.name);
  logAudit('session','라이브 세션 종료', act.memberName, {bay:bay.name});
  cloud.endActiveSession(bayId);
  render();
  liveToast('⏹ '+bay.name+' 세션 종료','ok');
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

// ============ 렌더 ============
function renderLiveSession(){
  if(!S.showLiveSession) return '';
  var role = S.currentRole, isAdmin = role==='admin';
  var canCoach = role==='pro' || role==='trainer' || isAdmin;
  var bays = (S.bays && S.bays.length) ? S.bays : BAYS_DEFAULT;

  var html = '<div class="live-wrap">';
  html += '<div class="live-head"><div class="live-title">🎯 라이브 세션</div><button class="btn" onclick="closeLiveSession()">닫기</button></div>';
  html += '<div class="live-sub">베이를 선택해 회원을 배정하면, <strong>굿샷이 그 회원에게만</strong> 저장됩니다. '
       +  '<span class="live-mock-tag">현재 트랙맨 연동 전 데모(목) 모드</span></div>';
  html += '<div class="bay-grid">';
  bays.forEach(function(bay){ html += renderBayCard(bay, canCoach, isAdmin); });
  html += '</div>';
  html += renderShotLog(isAdmin);
  if(S.liveToast){ html += '<div class="live-toast '+S.liveToast.kind+'">'+S.liveToast.msg+'</div>'; }
  html += '</div>';

  html += renderLiveStartModal();
  html += renderLiveConfirmModal();
  html += renderReassignModal();
  return html;
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
            ? ('굿샷 <strong>'+shots.length+'</strong>개'
               + (silence!==null && silence>=30 ? ' · <span class="bay-silence">'+silence+'분간 없음</span>' : ''))
            : '아직 굿샷 없음')
        + '</div>';
  body += '<div class="bay-actions">';
  body += '<button class="btn goodshot-btn'+(stale?' is-disabled':'')+'" '
        + (stale ? 'disabled' : 'onclick="triggerGoodShot(\''+bay.id+'\')"') + '>🎯 굿샷</button>';
  body += '<button class="btn bay-end-btn" onclick="endLiveSession(\''+bay.id+'\')">⏹ 종료</button>';
  body += '</div></div>';
  return '<div class="bay-card active">'+head+body+'</div>';
}

function renderShotLog(isAdmin){
  var shots = S.shotEvents.slice().sort(function(a,b){ return b.ts.localeCompare(a.ts); }).slice(0,30);
  var html = '<div class="shot-log"><div class="shot-log-hd">최근 굿샷 '+S.shotEvents.length+'개'
           + (isAdmin ? ' <span class="shot-log-admin">관리자: 잘못 들어간 샷은 「이동」으로 다른 회원에게 재할당</span>' : '')
           + '</div>';
  if(shots.length===0){
    html += '<div class="empty-state">아직 저장된 굿샷이 없습니다</div>';
  } else {
    html += '<div class="shot-list">' + shots.map(function(s){
      var bay = getBay(s.bayId);
      var t = new Date(s.ts);
      var ts = String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
      return '<div class="shot-row">'
        + '<span class="shot-bay '+bay.color+'">'+bay.name+'</span>'
        + '<span class="shot-member">'+s.memberName+'</span>'
        + '<span class="shot-club">'+((s.data&&s.data.club)||'')+'</span>'
        + '<span class="shot-metric">'+((s.data&&s.data.carry)||'')+'</span>'
        + '<span class="shot-time">'+ts+'</span>'
        + (s.source==='mock' ? '<span class="shot-mock">데모</span>' : '')
        + (isAdmin ? '<button class="small-btn shot-move" onclick="openReassign(\''+s.id+'\')">이동</button>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  html += '</div>';
  return html;
}

function renderLiveStartModal(){
  if(!S.liveStartBay) return '';
  var bay = getBay(S.liveStartBay);
  var isAdmin = S.currentRole==='admin';
  var q = (S.liveStartQuery||'').trim().toLowerCase();
  var list = S.members.filter(function(m){
    if(!isAdmin && !(m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1)) return false;
    if(q && m.name.toLowerCase().indexOf(q)===-1 && getChosung(m.name).indexOf(getChosung(q))===-1) return false;
    return true;
  });
  return '<div class="modal-overlay" onclick="if(event.target===this)closeLiveStart()"><div class="modal">'
    + '<div class="modal-title">'+bay.name+' — 회원 배정</div>'
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="S.liveStartQuery=this.value;render()"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">배정된 회원이 없습니다</div>'
       : list.map(function(m){
           var busyBay = Object.keys(S.activeSessions).find(function(b){ return S.activeSessions[b].memberId===m.id; });
           return '<div class="live-member'+(busyBay?' busy':'')+'"'+(busyBay?'':' onclick="pickLiveMember(\''+m.id+'\')"')+'>'
             + '<div class="member-avatar '+m.color+'">'+initials(m.name)+'</div>'
             + '<div class="lm-name">'+m.name+'</div>'
             + (busyBay ? '<span class="lm-busy">'+getBay(busyBay).name+' 진행중</span>' : '')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeLiveStart()">취소</button></div>'
    + '</div></div>';
}

function renderLiveConfirmModal(){
  var c = S.liveConfirm; if(!c) return '';
  var bay = getBay(c.bayId);
  return '<div class="modal-overlay"><div class="modal live-confirm">'
    + '<div class="live-confirm-bay '+bay.color+'">'+bay.name+'</div>'
    + '<div class="live-confirm-msg"><strong>'+c.memberName+'</strong>님 레슨을<br>'+bay.name+'에서 시작합니다.</div>'
    + '<div class="live-confirm-warn">⚠️ '+bay.name+'이(가) <strong>비어있는지 직접 확인</strong>하셨습니까?<br><span class="lcw-sub">다른 회원이 연습 중인 타석이면 안 됩니다.</span></div>'
    + '<div class="modal-actions"><button class="btn" onclick="cancelLiveConfirm()">취소</button><button class="btn primary" onclick="confirmLiveStart()">확인 · 시작</button></div>'
    + '</div></div>';
}

function renderReassignModal(){
  if(!S.liveReassignShot) return '';
  var shot = S.shotEvents.find(function(s){ return s.id===S.liveReassignShot; });
  if(!shot) return '';
  var q = (S.liveStartQuery||'').trim().toLowerCase();
  var list = S.members.filter(function(m){
    if(q && m.name.toLowerCase().indexOf(q)===-1 && getChosung(m.name).indexOf(getChosung(q))===-1) return false;
    return true;
  });
  return '<div class="modal-overlay" onclick="if(event.target===this)closeReassign()"><div class="modal">'
    + '<div class="modal-title">굿샷 재할당 — 현재 「'+shot.memberName+'」</div>'
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="옮길 회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="S.liveStartQuery=this.value;render()"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">회원이 없습니다</div>'
       : list.map(function(m){
           return '<div class="live-member'+(m.id===shot.memberId?' busy':'')+'" onclick="applyReassign(\''+m.id+'\')">'
             + '<div class="member-avatar '+m.color+'">'+initials(m.name)+'</div>'
             + '<div class="lm-name">'+m.name+'</div>'
             + (m.id===shot.memberId ? '<span class="lm-busy">현재</span>' : '')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeReassign()">취소</button></div>'
    + '</div></div>';
}
