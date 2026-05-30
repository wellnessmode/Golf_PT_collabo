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
  render();
}
function closeLiveSession(){ S.showLiveSession=false; render(); }

// 회원 카드에서 바로 라이브 시작 (회원 → 베이 선택)
function openLiveForMember(memberId){
  var m=S.members.find(function(x){return x.id===memberId;}); if(!m) return;
  S.showLiveSession=true; S.showDashboard=false; S.sidebarOpen=false;
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
  var hasVoice = (act._transcript||'').trim().length>0;
  var msg = bay.name+' · '+act.memberName+'님 세션을 종료할까요?\n'
    + (hasVoice ? '(받아쓴 내용을 AI가 세션카드로 정리해 드립니다)' : '(저장된 샷 기록은 회원에게 남습니다)');
  if(!confirm(msg)) return;
  var transcript = act._transcript||'', memberId = act.memberId, author = act.author;
  if(S.voiceBay===bayId) stopVoice(bayId);
  delete S.activeSessions[bayId];
  save();
  logActivity('라이브 세션 종료', memberId, bay.name);
  logAudit('session','라이브 세션 종료', act.memberName, {bay:bay.name, voice:hasVoice});
  cloud.endActiveSession(bayId);
  var drafted = false;
  if(transcript.trim()) drafted = openVoiceDraft(memberId, author, transcript);
  render();
  if(drafted) liveToast('🤖 AI가 세션카드를 정리했어요 — 확인 후 저장','ok');
  else liveToast('⏹ '+bay.name+' 세션 종료','ok');
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

// Claude Haiku 정리 — 1순위: R2 워커 프록시(키 서버에만), 2순위: 브라우저 직접(기기 키), 실패 시 null→로컬 폴백
async function aiSummarizeWithClaude(transcript, author){
  try{
    var cfg=window.APP_CONFIG||{};
    var role=(typeof getRole==='function')?getRole(author):'trainer';
    var roleLabel=role==='pro'?'골프 프로':'PT 트레이너';
    var system='당신은 골프 레슨 세션카드 작성 보조 AI입니다. '+roleLabel+'이 레슨 중 말한 내용을 구조화된 한국어 세션카드로 정리합니다. '
      +'반드시 아래 형식을 지키세요:\n'
      +'[AI 자동 정리]\n- 핵심 포인트 (5-8개 불릿)\n- 각 불릿은 25자 이내, 명확한 동사형\n- 중복 제거, 시간 순서 유지\n- 운동/드릴/교정 포인트가 있으면 우선 추출\n'
      +'추가 텍스트(설명·인사·확률표현) 금지. 형식만 출력.';
    var payload={
      model:cfg.ANTHROPIC_MODEL||'claude-haiku-4-5',
      max_tokens:600,
      system:system,
      messages:[{role:'user',content:'다음 받아쓴 원문을 세션카드로 정리해주세요:\n\n'+transcript}]
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
  S.newSession={ date:today(), author:author, content:localStructured+summary, media:[], mediaUrls:['',''] };
  S.showAddSession=true;
  // Claude 키 있으면 백그라운드로 더 정교한 정리 시도 — 응답 오면 자동 교체
  if(aiEnabled()){
    aiSummarizeWithClaude(transcript,author).then(function(better){
      if(better && S.showAddSession && S.newSession){
        S.newSession.content = better + summary;
        try{ liveToast('🤖 Claude AI 정리 완료','ok'); }catch(e){}
        try{ render(); }catch(e){}
      }
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
  html += renderBayPickModal();
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
            ? ('저장된 샷 <strong>'+shots.length+'</strong>개'
               + (silence!==null && silence>=30 ? ' · <span class="bay-silence">'+silence+'분간 없음</span>' : ''))
            : '아직 저장된 샷 없음')
        + '</div>';
  // 음성 받아쓰기 — 기기별 하이브리드
  if(!stale){
    var mode=voiceMode();
    if(mode==='web'){
      if(S.voiceBay===bay.id){
        body += '<div class="voice-rec"><div class="vr-head"><span class="vr-dot"></span>녹음 중 · 받아쓰기<button class="vr-stop" onclick="stopVoice(\''+bay.id+'\')">중지</button></div>'
              + '<div class="vr-text">'+(esc((act._transcript||'').slice(-90))||'듣는 중...')+'</div></div>';
      } else {
        body += '<button class="btn voice-btn" onclick="startVoice(\''+bay.id+'\')">🎙 '+((act._transcript||'').trim()?'받아쓰기 계속':'음성 기록 시작')+'</button>';
      }
    } else if(mode==='ios'){
      // 아이폰/아이패드: 시스템 받아쓰기 (textarea + 키보드의 🎤 버튼 안내)
      body += '<div class="voice-ios">'
            +   '<div class="vi-head">🎙 <b>키보드의 마이크 버튼</b>으로 받아쓰기</div>'
            +   '<textarea class="vi-area" placeholder="레슨 내용을 말하거나 입력하세요. 키보드 마이크 🎤 누르면 음성→텍스트 자동 변환." oninput="updateVoiceText(\''+bay.id+'\',this.value)">'+esc(act._transcript||'')+'</textarea>'
            + '</div>';
    } else if((act._transcript||'').trim()){
      body += '<div class="voice-note">🎙 받아쓰기 미지원 기기 — 종료 시 직접 입력</div>';
    }
  }
  body += '<div class="bay-actions">';
  body += '<button class="btn goodshot-btn'+(stale?' is-disabled':'')+'" '
        + (stale ? 'disabled' : 'onclick="triggerGoodShot(\''+bay.id+'\')"') + '>🎯 굿샷</button>';
  body += '<button class="btn bay-end-btn" onclick="endLiveSession(\''+bay.id+'\')">⏹ 종료</button>';
  body += '</div></div>';
  return '<div class="bay-card active" data-bay="'+bay.id+'">'+head+body+'</div>';
}

function renderShotLog(isAdmin){
  var canCoach = S.currentRole==='pro' || S.currentRole==='trainer' || isAdmin;
  var shots = S.shotEvents.slice().sort(function(a,b){ return b.ts.localeCompare(a.ts); }).slice(0,30);
  var html = '<div class="shot-log"><div class="shot-log-hd">최근 저장된 샷 '+S.shotEvents.length+'개'
           + (isAdmin ? ' <span class="shot-log-admin">관리자: 잘못 들어간 샷은 「이동」으로 다른 회원에게 재할당</span>' : '')
           + '</div>';
  if(shots.length===0){
    html += '<div class="empty-state">아직 저장된 샷이 없습니다</div>';
  } else {
    html += '<div class="shot-list">' + shots.map(function(s){
      var bay = getBay(s.bayId);
      var t = new Date(s.ts);
      var ts = String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
      return '<div class="shot-row">'
        + '<span class="shot-bay '+bay.color+'">'+bay.name+'</span>'
        + '<span class="shot-member">'+s.memberName+'</span>'
        + '<span class="shot-club">'+((s.data&&s.data.club)||'')+'</span>'
        + '<span class="shot-metric">'+(s.data&&s.data.carry!=null&&s.data.carry!==''?Math.round(parseFloat(s.data.carry))+'yd':'')+'</span>'
        + '<span class="shot-time">'+ts+'</span>'
        + (s.source==='mock' ? '<span class="shot-mock">데모</span>' : '')
        + (isAdmin ? '<button class="small-btn shot-move" onclick="openReassign(\''+s.id+'\')">이동</button>' : '')
        + (canCoach ? '<button class="small-btn del" onclick="deleteShot(\''+s.id+'\')">삭제</button>' : '')
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
