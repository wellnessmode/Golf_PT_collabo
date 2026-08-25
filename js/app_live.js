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
// 숫자 시각 비교 + 2분 허용 — 문자열 포맷 차이(Z vs +00:00)나 시계 오차로
// 방금 친 샷이 카운트에서 빠지는 것 방지. 시작시각이 깨져 있으면(파싱 불가)
// "0개 고정" 버그 대신 베이의 샷을 그대로 보여준다.
function liveBayShots(bayId, act){
  var st = act ? Date.parse(act.startedAt) : NaN;
  return S.shotEvents.filter(function(s){
    if(s.bayId!==bayId) return false;
    if(!act || isNaN(st)) return true;
    var t = Date.parse(s.ts);
    return isNaN(t) ? true : (t >= st - 120000);
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
// ===== 샷 영상 상태 칩 — 업로드 진행(%) 표시 + 준비되면 그 자리에서 바로 재생 =====
// 데이터가 먼저 오고 영상은 20~40초 뒤 붙는 구조라, 그 사이 "영상이 왜 없지?" 혼란 방지.
function _vidChip(s){
  var d = s.data||{};
  var key = d.videoMp4R2Key || d.videoDL || d.videoFO || s.videoR2Key;
  if (key){
    _vidWarm(key); if(d.videoFO && d.videoFO!==key) _vidWarm(d.videoFO);
    return '<button class="small-btn vid-view-btn" onclick="event.stopPropagation();openShotVideo(\''+s.id+'\')">🎬 보기</button>';
  }
  if (d._videoPending){
    var t0 = s._rcvAt || Date.parse(d.measuredAt || s.ts) || 0;
    if (t0 && Date.now()-t0 < 8*60000){
      // 90초 기준 추정 — 내장 카메라(대용량) 변환·업로드까지 감안한 현실적인 속도
      var pct = Math.min(97, Math.max(3, Math.round((Date.now()-t0)/90000*100)));
      return '<span class="vid-uploading">🎞 <span class="vid-pct" data-t0="'+t0+'">'+pct+'%</span></span>';
    }
  }
  return '';
}
// ===== 클럽 딜리버리 — ① 실측 궤적 추적 오버레이 + ② 대형 딜리버리 패널 =====
// ① 영상 프레임 차분으로 클럽헤드(유일한 고속 이동체)의 이동 중심점을 추적해
//    실제 궤적 곡선을 영상 위에 입힌다 (TPS 임팩트 비디오 방식).
//    실패(미지원·CORS·잡음)하면 조용히 생략 — 아래 패널이 항상 받쳐줌.
// ② 다이어그램은 영상 "아래"에 크게: 각도에 비례해 커지는 부채꼴(패스·페이스)로
//    1° 차이도 눈에 보이게 + 트랙맨 스타일 수치 그리드.
function _clubPathOverlayHTML(d){
  if(!d || (d.clubPath==null && d.faceAngle==null)) return '';
  var cp=parseFloat(d.clubPath); if(isNaN(cp)) cp=0;
  var fa=parseFloat(d.faceAngle); if(isNaN(fa)) fa=0;
  var f2p = (d.faceToPath!=null && !isNaN(parseFloat(d.faceToPath))) ? parseFloat(d.faceToPath) : (fa-cp);
  var dirTxt = cp>0.3?'인투아웃':(cp<-0.3?'아웃투인':'스트레이트');
  var f2pTxt = f2p>0.5?'페이드·슬라이스 성향':(f2p<-0.5?'드로우·훅 성향':'스퀘어');
  // 각도 → 화면 각(시인성 3배, ±35° 캡). 비포/애프터의 1~2° 차이도 부채꼴 면적으로 보이게.
  var pa=Math.max(-35,Math.min(35,-cp*3));
  var fq=Math.max(-40,Math.min(40,-fa*3));
  function wedge(cx0,cy0,r,a0,a1,color){
    var s=Math.min(a0,a1), e=Math.max(a0,a1);
    if(e-s<0.6) return '';
    var sr=s*Math.PI/180, er=e*Math.PI/180;
    return '<path d="M '+cx0+','+cy0+' L '+(cx0+r*Math.cos(sr)).toFixed(1)+','+(cy0+r*Math.sin(sr)).toFixed(1)
      +' A '+r+' '+r+' 0 0 1 '+(cx0+r*Math.cos(er)).toFixed(1)+','+(cy0+r*Math.sin(er)).toFixed(1)+' Z" fill="'+color+'"/>';
  }
  var BX=176, BY=86;   // 볼 위치
  var svg='<svg viewBox="0 0 320 172" preserveAspectRatio="xMidYMid meet">'
    +'<defs><linearGradient id="cdTrail" gradientUnits="userSpaceOnUse" x1="306" y1="0" x2="58" y2="0">'
      +'<stop offset="0%" stop-color="rgba(255,255,255,0)"/><stop offset="60%" stop-color="rgba(255,255,255,.75)"/>'
      +'<stop offset="100%" stop-color="#00d29a"/></linearGradient></defs>'
    // 타깃 라인(가로 점선) + 타깃 밴드(왼쪽)
    +'<line x1="12" y1="'+BY+'" x2="308" y2="'+BY+'" stroke="rgba(255,255,255,.4)" stroke-width="1.4" stroke-dasharray="3 4.4"/>'
    +'<rect x="8" y="'+(BY-4.4)+'" width="26" height="8.8" rx="4" fill="rgba(63,123,255,.9)"/>'
    +'<text x="21" y="'+(BY-10)+'" text-anchor="middle" font-size="9" fill="rgba(120,165,255,.9)" font-weight="700">타깃</text>'
    // 패스 부채꼴(타깃라인 ↔ 패스라인 사이, 각도에 비례해 커짐) + 패스 라인
    +wedge(BX,BY,92,180,180+pa,'rgba(0,210,154,.13)')
    +'<g transform="rotate('+pa.toFixed(1)+' '+BX+' '+BY+')">'
      +'<line x1="306" y1="'+BY+'" x2="'+(BX-118)+'" y2="'+BY+'" stroke="url(#cdTrail)" stroke-width="3.4" stroke-linecap="round"/>'
      +'<path d="M '+(BX-118)+','+BY+' l 9,-5 M '+(BX-118)+','+BY+' l 9,5" stroke="#00d29a" stroke-width="3" stroke-linecap="round" fill="none"/>'
    +'</g>'
    +'<text x="'+(BX-98)+'" y="'+(BY+(pa<0?-14:20)+pa*1.15).toFixed(0)+'" font-size="12.5" fill="#39e6b0" font-weight="800">패스 '+(cp>0?'+':'')+cp.toFixed(1)+'°</text>'
    // 페이스 부채꼴(스퀘어 페이스 ↔ 실제 페이스) + 페이스 라인(볼에 걸친 굵은 선)
    +wedge(BX,BY,46,-90,-90+fq,'rgba(246,193,119,.2)')
    +'<g transform="rotate('+fq.toFixed(1)+' '+BX+' '+BY+')"><line x1="'+BX+'" y1="'+(BY-40)+'" x2="'+BX+'" y2="'+(BY+40)+'" stroke="#f6c177" stroke-width="3.4" stroke-linecap="round"/></g>'
    +'<text x="'+(BX+14)+'" y="'+(BY-46)+'" font-size="12.5" fill="#f6c177" font-weight="800">페이스 '+(fa>0?'+':'')+fa.toFixed(1)+'°</text>'
    // 볼
    +'<circle cx="'+BX+'" cy="'+BY+'" r="6.4" fill="#fff"/><circle cx="'+(BX-2)+'" cy="'+(BY-2)+'" r="2" fill="rgba(0,0,0,.12)"/>'
    // 요약(하단)
    +'<text x="160" y="164" text-anchor="middle" font-size="11.5" fill="rgba(255,255,255,.78)" font-weight="700">'+dirTxt+' · 페이스 투 패스 '+(f2p>0?'+':'')+f2p.toFixed(1)+'° · '+f2pTxt+'</text>'
    +'</svg>';
  // 트랙맨 스타일 수치 그리드 (있는 값만)
  var met=(d._units&&d._units.dist==='m')||d._src==='trackman_io';
  var tiles=[];
  function tile(l,v,u){ if(v==null||isNaN(v)) return; tiles.push('<div class="cdm"><div class="cdm-l">'+l+'</div><div class="cdm-v">'+v+'<small>'+u+'</small></div></div>'); }
  var cs=d.clubSpeed!=null?parseFloat(d.clubSpeed):null; if(cs!=null&&!met) cs=cs*0.44704;
  tile('클럽 스피드', cs!=null?cs.toFixed(1):null, ' m/s');
  tile('어택 앵글', d.attack!=null?(d.attack>0?'+':'')+parseFloat(d.attack).toFixed(1):null, '°');
  tile('클럽 패스', (cp>0?'+':'')+cp.toFixed(1), '°');
  tile('페이스 앵글', (fa>0?'+':'')+fa.toFixed(1), '°');
  tile('페이스 투 패스', (f2p>0?'+':'')+f2p.toFixed(1), '°');
  tile('스핀량', d.spin!=null?Math.round(d.spin):null, ' rpm');
  return '<div class="club-panel"><div class="cd-diagram">'+svg+'</div>'
    +(tiles.length?'<div class="cd-grid">'+tiles.join('')+'</div>':'')
    +'</div>';
}
// 클럽 뷰 시크바 (기본 컨트롤이 꺼져 있으므로 자체 스크롤 제공 — 비교재생기와 동일 UX)
function _cvSeekSync(v){
  try{
    var w=v.closest('.vid-wrap'); if(!w) return;
    var s=w.querySelector('.vv-seek'); if(!s||s._drag) return;
    if(isFinite(v.duration)&&v.duration){
      s.value=Math.round(v.currentTime/v.duration*1000);
      var c=w.querySelector('[data-role="cvcur"]'); if(c) c.textContent=(Math.round(v.currentTime*10)/10).toFixed(1)+'s';
      var dd=w.querySelector('[data-role="cvdur"]'); if(dd) dd.textContent=(Math.round(v.duration*10)/10).toFixed(1)+'s';
    }
    _cvPlayIcon(v);
  }catch(e){}
}
// 드래그 시작 → 자동 일시정지(재생과 안 싸움), 놓으면 원래 재생 상태 복귀
function _cvSeekInput(s){
  try{
    var w=s.closest('.vid-wrap'); var v=w&&w.querySelector('video'); if(!v) return;
    if(!s._drag){ s._drag=true; s._wasPlaying=!v.paused; if(!v.paused) v.pause(); }
    if(isFinite(v.duration)&&v.duration){
      v.currentTime=v.duration*(parseInt(s.value,10)||0)/1000;
      var c=w.querySelector('[data-role="cvcur"]'); if(c) c.textContent=(Math.round(v.currentTime*10)/10).toFixed(1)+'s';
    }
  }catch(e){}
}
function _cvSeekDone(s){
  try{
    var w=s.closest('.vid-wrap'); var v=w&&w.querySelector('video');
    if(s._wasPlaying && v){ v.play().catch(function(){}); }
    s._drag=false; s._wasPlaying=false;
    if(v) _cvPlayIcon(v);
  }catch(e){}
}
function _cvPlayToggle(btn){
  try{
    var w=btn.closest('.vid-wrap'); var v=w&&w.querySelector('video'); if(!v) return;
    if(v.paused){ v.play().catch(function(){}); } else { v.pause(); }
    _cvPlayIcon(v);
  }catch(e){}
}
function _cvPlayIcon(v){
  try{
    var w=v.closest('.vid-wrap'); var b=w&&w.querySelector('.cv-play'); if(!b) return;
    b.textContent = v.paused ? '▶' : '⏸';
  }catch(e){}
}
function _cvSeekRowHTML(){
  return '<div class="vv-seekrow">'
    +'<button class="cv-play" onclick="_cvPlayToggle(this)">▶</button>'
    +'<span class="cv-time" data-role="cvcur">0.0s</span>'
    +'<input type="range" class="vv-seek cmp-seek" min="0" max="1000" value="0" step="1" oninput="_cvSeekInput(this)" onchange="_cvSeekDone(this)">'
    +'<span class="cv-time" data-role="cvdur">—</span></div>';
}
// 영상 재생 실패 정밀 진단 — "만료·정리" 뭉뚱그림 대신 실제 사유를 확인해 표시.
// 404 = 서버에 파일 없음(업로드 실패/삭제), 200 = 파일은 있는데 이 기기가 재생 못 하는 형식.
async function _vidDiag(videoEl, key){
  var box = videoEl && videoEl.parentElement; if(!box) return;
  var msg = '영상을 재생할 수 없습니다';
  var sub = '';
  try{
    var res = await fetch(r2.url(key), {headers:{'Range':'bytes=0-1'}});
    if(res.status===404){ msg='영상 파일이 서버에 없어요'; sub='업로드 실패 또는 정리(삭제)됨 — 에이전트 로그 확인 필요'; }
    else if(res.ok){ msg='파일은 서버에 있는데 이 기기에서 재생이 안 되는 형식이에요'; sub='[영상 저장]으로 내려받아 동영상 앱으로 재생하거나, 관리자에게 알려주세요 (mkv/특수 코덱)'; }
    else { msg='영상 서버 응답 오류 ('+res.status+')'; sub='잠시 후 다시 시도해주세요'; }
  }catch(e){ msg='네트워크 연결 문제로 영상을 못 불러왔어요'; sub='연결 확인 후 다시 열어주세요'; }
  try{
    box.innerHTML='<div class="pv-vm-novid"><div class="pv-vm-novid-t">'+msg+'<br><span style="font-size:11px;opacity:.75">'+sub+'</span><br><span style="font-size:9.5px;opacity:.5;word-break:break-all">'+String(key||'')+'</span></div></div>';
  }catch(e){}
}
// 영상 사전 워밍 — [🎬 보기] 칩이 뜨는 순간 2바이트만 미리 요청해 두면, 워커가
// 백그라운드로 영상 전체를 엣지 캐시에 적재한다 → 실제 재생 탭 때 첫 프레임이 즉시 뜸.
// 키당 1회만, 렌더를 막지 않게 비동기로.
var _vidWarmed = {};
function _vidWarm(key){
  if(!key || _vidWarmed[key] || typeof r2==='undefined' || !r2.enabled) return;
  _vidWarmed[key]=1;
  setTimeout(function(){
    try{ fetch(r2.url(key), {headers:{'Range':'bytes=0-1'}}).catch(function(){ delete _vidWarmed[key]; }); }catch(e){ delete _vidWarmed[key]; }
  },0);
}
// 남은시간 카운트다운 티커 — [data-cntdn] 요소를 1초마다 갱신 (재렌더 없이).
// 음성 변환 배지·AI 일지 정리 배너에서 "약 N초" 를 실시간으로 줄여 보여준다.
if (!window.__cntdnTimer){
  window.__cntdnTimer = setInterval(function(){
    try{
      var els = document.querySelectorAll('[data-cntdn]');
      for (var i=0;i<els.length;i++){
        var t0 = parseInt(els[i].getAttribute('data-t0'),10)||0; if(!t0) continue;
        var max = parseInt(els[i].getAttribute('data-max'),10)||30;
        var left = max - Math.floor((Date.now()-t0)/1000);
        els[i].textContent = left>0 ? ('약 '+left+'초 남음') : '거의 다 됐어요...';
      }
    }catch(e){}
  }, 1000);
}
function _cntdnHtml(t0, max){
  var left = Math.max(0, max - Math.floor((Date.now()-(t0||Date.now()))/1000));
  return '<span data-cntdn data-t0="'+(t0||Date.now())+'" data-max="'+max+'">'+(left>0?('약 '+left+'초 남음'):'거의 다 됐어요...')+'</span>';
}
// 진행률 틱커 — 1.5초마다 화면의 % 만 직접 갱신 (재렌더 없이). 약 90초 기준 추정치.
if (!window.__vidPctTimer){
  window.__vidPctTimer = setInterval(function(){
    try{
      var els = document.querySelectorAll('.vid-pct[data-t0]');
      for (var i=0;i<els.length;i++){
        var t0 = parseInt(els[i].getAttribute('data-t0'),10)||0; if(!t0) continue;
        els[i].textContent = Math.min(97, Math.max(3, Math.round((Date.now()-t0)/90000*100))) + '%';
      }
    }catch(e){}
  }, 1500);
}
// 라이브 화면에서 샷 영상 즉시 재생 (오버레이) — 측면(DL)·정면(FO) 있으면 전환 탭 제공
function openShotVideo(shotId){
  var s = (S.shotEvents||[]).find(function(x){return x.id===shotId;}); if(!s) return;
  var d = s.data||{};
  var dl = d.videoDL || d.videoMp4R2Key || s.videoR2Key;   // 측면(주)
  var fo = d.videoFO || null;                              // 정면
  var cl = d.videoClub || null;                            // 클럽 딜리버리(임팩트)
  if((!dl && !fo && !cl) || typeof r2==='undefined' || !r2.enabled) return;
  var views = [];
  // 대표 영상이 클럽/정면과 같은 파일이면 "측면" 탭으로 중복 표시하지 않음 (정직한 라벨)
  if(dl && dl!==cl && dl!==fo) views.push({label:'측면', key:dl});
  if(fo) views.push({label:'정면', key:fo});
  if(cl) views.push({label:'클럽', key:cl});
  var cur = 0;
  var div = document.createElement('div'); div.className='media-overlay';
  div.onclick = function(e){ if(e.target===div) div.remove(); };
  var tabsHtml = views.length>1
    ? '<div class="vv-tabs">'+views.map(function(v,i){return '<button class="vv-tab'+(i===0?' on':'')+'" data-vi="'+i+'">'+v.label+'</button>';}).join('')+'</div>'
    : '';
  // 상단 고정 ✕ — 세로 영상은 내용이 한 화면을 넘어 하단 닫기가 안 보이는 문제 해결.
  // 영상 높이도 (탭+시크바+배속+닫기)를 뺀 화면 높이로 제한해 최대한 한 화면에 들어가게.
  div.innerHTML = '<button class="vv-close-top" onclick="this.closest(\'.media-overlay\').remove()">✕ 닫기</button>'
    + '<div style="width:min(94vw,560px)">'
    + tabsHtml
    + '<div class="vid-wrap">'
      + '<video src="'+r2.url(views[0].key)+'" crossorigin="anonymous" autoplay playsinline style="width:100%;max-height:76vh;max-height:calc(100dvh - 230px);border-radius:12px;background:#000"></video>'
      + _cvSeekRowHTML()
      + _clubPathOverlayHTML(d)
    + '</div>'
    + '<div class="vv-speeds"><span>배속</span>'
      + [0.125,0.25,0.5,1].map(function(sp){ return '<button class="vv-sp" data-sp="'+sp+'">'+(sp===1?'1×':String(sp).replace('0.','.')+'×')+'</button>'; }).join('')
    + '</div>'
    + '<div style="text-align:center;margin-top:10px"><button onclick="this.closest(\'.media-overlay\').remove()" style="padding:9px 22px;background:rgba(255,255,255,.16);color:#fff;border:none;border-radius:10px;font-weight:700">닫기</button></div></div>';
  document.body.appendChild(div);
  var vid = div.querySelector('video');
  var wrap = div.querySelector('.vid-wrap');
  var rate = 1;
  function markRate(){
    Array.prototype.forEach.call(div.querySelectorAll('.vv-sp'), function(x){ x.classList.toggle('on', parseFloat(x.getAttribute('data-sp'))===rate); });
  }
  // 앵글별 기본 설정 — 클럽 딜리버리: 180° 회전(샤프트 아래) + 기본 0.5× 슬로우 +
  // 기본 컨트롤 OFF(회전 시 컨트롤까지 뒤집히는 문제) → 탭 재생/정지 + 자동 반복 + 패스 오버레이
  function applyView(){
    var isClub = views[cur].label==='클럽';
    vid.classList.toggle('vid-flip', isClub);
    wrap.classList.toggle('club-on', isClub);
    // 모든 앵글에서 기본 컨트롤 OFF — 스크롤 중 중앙 ▶·±10초 버튼이 화면을 가리지 않게.
    // 조작은 자체 시크바(항상 표시) + 화면 탭 + ▶/⏸ 버튼으로.
    vid.controls = false;
    vid.loop = isClub;
    rate = isClub ? 0.5 : 1;
    try{ vid.playbackRate = rate; }catch(e){}
    markRate();
  }
  ['play','pause','ended'].forEach(function(ev){ vid.addEventListener(ev, function(){ _cvPlayIcon(vid); }); });
  vid.addEventListener('click', function(){ if(!vid.controls){ if(vid.paused){ vid.play().catch(function(){}); } else { vid.pause(); } _cvPlayIcon(vid); } });
  vid.addEventListener('loadedmetadata', function(){ try{ vid.playbackRate = rate; }catch(e){} });   // 일부 브라우저는 src 교체 시 배속 리셋
  vid.addEventListener('timeupdate', function(){ _cvSeekSync(vid); });
  vid.addEventListener('error', function(){ try{ _vidDiag(vid, views[cur].key); }catch(e){} });
  applyView();
  Array.prototype.forEach.call(div.querySelectorAll('.vv-sp'), function(b){
    b.onclick = function(){ rate = parseFloat(b.getAttribute('data-sp'))||1; try{ vid.playbackRate = rate; }catch(e){} markRate(); };
  });
  Array.prototype.forEach.call(div.querySelectorAll('.vv-tab'), function(b){
    b.onclick = function(){
      var i = parseInt(b.getAttribute('data-vi'),10)||0; if(i===cur) return; cur=i;
      Array.prototype.forEach.call(div.querySelectorAll('.vv-tab'), function(x){ x.classList.remove('on'); }); b.classList.add('on');
      var t = vid.currentTime||0;
      vid.src = r2.url(views[i].key); vid.load();
      applyView();
      vid.addEventListener('loadedmetadata', function once(){ try{ vid.currentTime=t; }catch(e){} vid.removeEventListener('loadedmetadata', once); });
      vid.play().catch(function(){});
    };
  });
}

// 베이카드 '방금 친 샷' HTML 생성 (renderBayCard 와 _patchLivePartials 공용)
function _buildPendingShotsHTML(bayId){
  var pend = (typeof pendingShotsForBay==='function') ? pendingShotsForBay(bayId) : [];
  // 이 세션에서 방금 저장한 샷도 목록에 남긴다 — 카드가 사라지지 않고
  // "✓ 비포로 저장됨" 상태 + [저장 취소]로 표시 (실수 즉시 복구 가능)
  var act0 = S.activeSessions[bayId];
  var savedRecent = (S.shotEvents||[]).filter(function(s){
    return s.source==='agent' && s.bayId===bayId && s._uiSavedAt && (Date.now()-s._uiSavedAt < 30*60000)
        && act0 && s.memberId===act0.memberId;
  });
  var all = savedRecent.concat(pend);
  if(!all.length) return '';
  all.sort(function(a,b){ var ra=a._rcvAt||0, rb=b._rcvAt||0; if(ra&&rb) return rb-ra; return String(b.ts||'').localeCompare(String(a.ts||'')); });
  // 기본은 최근 6개(수업 중 라이브 선별용). [전체 샷]을 누르면 이 세션의 모든 샷을
  // "처음 친 샷부터" 펼쳐서 — 레슨 끝에 첫 샷을 📌 비포로 지정할 수 있다 (레슨 중 폰 조작 불필요).
  var showAll = !!(S._psShowAll && S._psShowAll[bayId]);
  var list = showAll ? all.slice().reverse() : all.slice(0,6);
  var html = '<div class="pending-shots big" data-bay-pending="'+bayId+'"><div class="ps-title">⛳ '
        + (showAll?'이 수업 전체 샷 — 처음 친 샷부터':'방금 친 샷 — 비포/애프터로 저장')
        + '<span class="ps-count">'+all.length+'</span>'
        + (all.length>6||showAll ? '<button type="button" class="ps-showall" onclick="togglePsShowAll(\''+bayId+'\')">'+(showAll?'최근만 보기':'전체 샷 ⏮')+'</button>' : '')
        + '</div>';
  if(showAll) html += '<div class="ps-allhint">맨 위가 이 수업의 <b>처음 친 샷</b> — 📌 비포로 지정하면 리포트에 교정 전 스윙으로 남습니다</div>';
  list.forEach(function(s){
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
    var savedTag = s._uiSavedAt ? (s.data&&s.data._tag) : null;   // 'before'|'after'|undefined(일반)
    var stateCls = savedTag==='before' ? ' saved-before' : (savedTag==='after' ? ' saved-after' : (s._uiSavedAt?' saved-plain':''));
    var actions;
    if(s._uiSavedAt){
      // 저장 완료 상태 — 확정 배지 + [저장 취소]만 활성, 나머지 비활성
      var tagLabel = savedTag==='before' ? '✓ 비포로 저장됨' : (savedTag==='after' ? '✓ 애프터로 저장됨' : '✓ 저장됨');
      actions = '<span class="ps-saved-badge '+(savedTag||'plain')+'">'+tagLabel+'</span>'
              + '<button class="ps-tag before" disabled>비포로 저장</button>'
              + '<button class="ps-tag after" disabled>애프터로 저장</button>'
              + '<button class="ps-cancel" onclick="cancelLessonShot(\''+s.id+'\')">저장 취소</button>';
    } else {
      actions = '<button class="ps-tag before big" onclick="saveLessonShot(\''+s.id+'\',\''+bayId+'\',\'before\')">📌 비포로 저장</button>'
              + '<button class="ps-tag after big" onclick="saveLessonShot(\''+s.id+'\',\''+bayId+'\',\'after\')">✅ 애프터로 저장</button>'
              + '<button class="ps-drop" onclick="dropLessonShot(\''+s.id+'\')">버림</button>';
    }
    html += '<div class="ps-card'+fresh+stateCls+'" data-shot="'+s.id+'">'
          + '<div class="psc-hd"><span class="psc-club">'+club+'</span>'+_vidChip(s)+'<span class="psc-time">'+when+'</span></div>'
          + '<div class="psc-metrics">'+bits.join('')+'</div>'
          + '<div class="psc-actions">'+actions+'</div></div>';
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
        var todayCnt2 = (S.shotEvents||[]).filter(function(s){ return s.bayId===bayId && String(s.ts).slice(0,10)===today(); }).length;
        shotsEl.innerHTML = shotsCnt>0 ? ('저장된 샷 <strong>'+shotsCnt+'</strong>개')
          : (todayCnt2>0 ? ('이번 수업 샷 없음 · 오늘 '+todayCnt2+'개는 아래 목록에') : '아직 저장된 샷 없음');
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
      // 로컬에 받아쓴 전문이 남아 있으면 버리지 않고 일지 초안으로 (유실 방지)
      var local = S.activeSessions && S.activeSessions[bayId];
      var tx = local && (local._transcript||'').trim();
      var mid = (local||act).memberId, author=(local||act).author;
      delete src[bayId];
      if(S.activeSessions) delete S.activeSessions[bayId];
      try{ cloud.endActiveSession(bayId); }catch(e){}
      try{ logAudit('session','방치 세션 자동종료', act.memberName||'', {bay:bayId, startedAt:act.startedAt}); }catch(e){}
      console.warn('[live] 방치 세션 자동종료:', bayId, act.memberName, act.startedAt);
      if(tx && author===S.currentUser){
        try{ if(openVoiceDraft(mid, author, tx)) liveToastSafe('🎙 어제 세션의 녹음 전문을 일지 초안으로 복구했어요'); }catch(e){}
      }
    }
  });
}

// 오래된 미배정 샷 자동 정리 (관리자 기기, 24시간 경과분) — 에이전트는 그대로 두고
// 앱이 노이즈를 스스로 청소. 회원에게 귀속된 샷은 절대 건드리지 않음. PC 원본 무관.
var _stalePurgeDone = false;
function purgeStaleUnassigned(){
  if(_stalePurgeDone) return;                       // 세션당 1회
  // 프로·트레이너·관리자 기기 모두 실행 — 관리자 전용이던 시절엔 미배정 샷이
  // 수백 개씩 쌓였음(2026-08 실측 635개). 삭제는 멱등이라 다기기 겹침 안전.
  if(S.currentRole!=='pro' && S.currentRole!=='trainer' && S.currentRole!=='admin') return;
  var cutoff = Date.now() - 24*3600*1000;
  var stale = (S.shotEvents||[]).filter(function(s){
    if(s.memberName){
      // 귀속된 샷 보호 — 단, 관찰용(타석 점검) 샷은 하루 지나면 행·영상 함께 정리
      // (점검용이라 기록 가치 없음 + 최근 샷 1000개 창을 잠식해 실회원 샷을 밀어냄)
      if(!(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(s.memberId))) return false;
      var actW=S.activeSessions[s.bayId];
      if(actW && actW.memberId===s.memberId) return false;   // 점검 세션 진행 중이면 보호
    }
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
    stale.forEach(r2RemoveShotVideos);
    console.warn('[live] 오래된 미배정 '+ids.length+'건 자동 정리');
    try{ liveToastSafe('🧹 오래된 미배정 '+ids.length+'개 자동 정리됨'); }catch(e){}
  });
}
// 영상 보관 정책 — "앱에서 저장(선별)한 샷"만 영상 영구 보관.
// 연습모드 자동귀속 샷의 영상은 SHOT_VIDEO_KEEP_DAYS(기본 3일) 후 자동 삭제.
// 측정 데이터(수치·행)는 유지되므로 성과 리포트 그래프는 그대로 나온다.
// 회원별 최근 N개 "영상 보유" 샷 ID 집합 — 보관 정책과 스토리지 진단이 공용으로 보호
function _memberRecentVideoShotIds(n){
  var byM={}, prot={};
  (S.shotEvents||[]).slice().sort(function(a,b){ return String(b.ts||'').localeCompare(String(a.ts||'')); }).forEach(function(s){
    if(!s.memberId || (typeof AGENT_EMPTY_MEMBER!=='undefined' && s.memberId===AGENT_EMPTY_MEMBER)) return;
    if(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(s.memberId)) return;   // 관찰용 샷은 보호 대상 아님
    var d=s.data||{};
    if(!(s.videoR2Key || d.videoMp4R2Key || d.videoDL || d.videoFO || d.videoClub)) return;
    var arr=byM[s.memberId]=byM[s.memberId]||[];
    if(arr.length<n){ arr.push(1); prot[s.id]=1; }
  });
  return prot;
}
var _vidRetentionDone = false;
function purgeOldShotVideos(){
  if(_vidRetentionDone) return;                     // 세션당 1회
  // 프로·트레이너·관리자 기기 모두 실행 — 관리자 전용이던 시절엔 관리자가 수업 센터를
  // 안 열면 미보관 영상이 무한 누적돼 R2 요금이 계속 나왔음(2026-08 청구서 135GB).
  // R2 삭제는 멱등이라 여러 기기가 겹쳐 실행해도 안전. 호출 시점은 loadLive 직후(최신 _kept 반영).
  if(S.currentRole!=='pro' && S.currentRole!=='trainer' && S.currentRole!=='admin') return;
  _vidRetentionDone = true;
  var days = (window.APP_CONFIG && APP_CONFIG.SHOT_VIDEO_KEEP_DAYS) || 3;
  var cutoff = Date.now() - days*24*3600*1000;
  // 회원 귀속 샷은 "회원별 최근 8개(영상 보유)"를 태그 없이도 보호 — 비포/애프터를
  // 안 눌러도 리포트의 스윙 영상 캐러셀이 비지 않게 (2026-08-16 윤명숙 리포트 영상 0개 사고)
  var prot = _memberRecentVideoShotIds(8);
  var targets = (S.shotEvents||[]).filter(function(s){
    if(s.data && s.data._kept) return false;                                   // 선별 저장 샷 보호
    if(prot[s.id]) return false;                                               // 회원별 최근 영상 보호
    var d = s.data||{};
    if(!(s.videoR2Key || d.videoMp4R2Key || d.videoDL || d.videoFO || d.videoClub)) return false;   // 영상 없는 샷
    var t = Date.parse(s.ts);
    return !isNaN(t) && t < cutoff;
  });
  if(!targets.length) return;
  targets.forEach(function(s){
    r2RemoveShotVideos(s);                          // R2 삭제 (키 지우기 전에!) — 전 앵글 포함
    s.videoR2Key = null;
    if(s.data){ delete s.data.videoMp4R2Key; delete s.data.videoDL; delete s.data.videoFO; delete s.data.videoClub; }
    try{ cloud.clearShotVideo(s); }catch(e){}       // 다른 기기에도 "영상 없음" 전파
  });
  try{ save(); }catch(e){}
  console.warn('[live] 보관정책: 미보관 샷 영상 '+targets.length+'건 정리(데이터 유지)');
  try{ liveToastSafe('🎞 '+days+'일 지난 미보관 샷 영상 '+targets.length+'개 자동 정리(수치는 유지)'); }catch(e){}
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
    // 영상 상태 변화 감지 — 데이터 먼저 오고 영상이 나중에 붙는 구조라, 영상 키/업로드중
    // 플래그가 바뀌면 재렌더해야 "업로드중 → 🎬 보기" 전환이 화면에 반영된다.
    var vidSig = (live.shotEvents||[]).slice(-80).map(function(s){
      var d=s.data||{}; return s.id+((d.videoMp4R2Key||d.videoDL)?'v':((d.videoFO||d.videoClub)?'f':(s.videoR2Key?'k':(d._videoPending?'p':'-'))));
    }).join('');
    var vidChanged = (window._liveLastVidSig!==undefined) && (window._liveLastVidSig!==vidSig);
    window._liveLastVidSig = vidSig;
    var changed = hasNew || (actBefore!==actAfter) || countChanged || vidChanged;
    _liveLastIds = curIds;
    if(typeof applyRemoteActive==='function') applyRemoteActive(live.activeSessions); else S.activeSessions=live.activeSessions;
    // _isNew/_rcvAt/_uiSavedAt(저장됨 카드 상태) 보존하며 머지
    var oldMap={}; (S.shotEvents||[]).forEach(function(s){oldMap[s.id]=s;});
    S.shotEvents = (live.shotEvents||[]).map(function(s){
      var o=oldMap[s.id];
      if(o){ if(o._rcvAt) s._rcvAt=o._rcvAt; if(o._isNew) s._isNew=o._isNew; if(o._uiSavedAt) s._uiSavedAt=o._uiSavedAt; }
      return s;
    });
    autoEndOverdueSessions(); // 2시간 넘게 켜진 세션 자동 종료 — 이후 샷이 계속 귀속되는 것 차단
    if(typeof reconcileAgentShots==='function') reconcileAgentShots();
    purgeStaleUnassigned();   // 첫 폴링에서 24h+ 미배정 노이즈 자동 청소(관리자)
    purgeOldShotVideos();     // 보관정책: 미보관 샷 영상 3일 후 자동 삭제(관리자, 데이터 유지)
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
  var dup=Object.keys(S.activeSessions).find(function(b){return S.activeSessions[b].memberId===memberId;});
  if(dup){ liveToast(getBay(dup).name+'에서 이미 진행 중입니다','err'); S.liveBayPickFor=null; render(); return; }
  if(S.activeSessions[bayId]){
    // 앞 타임 세션이 안 꺼져 있음 — 막지 않고 확인 후 인수
    if(!_takeOverConfirm(bayId)) return;
    if(!forceEndPrevSession(bayId)) return;
  }
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
    snapshot.forEach(r2RemoveShotVideos);
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
// tag: 'before'(교정 전 습관) | 'after'(교정 후) — 프로가 직접 지정.
// 저장 후에도 카드는 남고 [저장 취소]로 즉시 복구 가능.
function saveLessonShot(shotId, bayId, tag){
  var act=S.activeSessions[bayId]; if(!act){ liveToast('활성 세션이 없습니다','err'); return; }
  var s=(S.shotEvents||[]).find(function(x){return x.id===shotId;}); if(!s) return;
  s.memberId=act.memberId; s.memberName=act.memberName; s.author=act.author; delete s._pendingBay;
  if(!s.data) s.data={};
  s.data._kept=1;   // 선별 저장 = 영상 영구 보관 (보관 정책에서 제외)
  if(tag==='before'||tag==='after') s.data._tag=tag;
  s._uiSavedAt=Date.now();   // 카드 유지 + "저장됨" 상태 표시용 (이 기기 한정)
  save();
  try{ cloud.reassignShot(s.id, act.memberId, act.memberName); cloud.updateShotData(s); }catch(e){}
  logActivity('레슨 샷 저장'+(tag?' ('+(tag==='before'?'비포':'애프터')+')':''), act.memberId, getBay(bayId).name+' · '+((s.data&&s.data.club)||''));
  render();
  liveToast('✓ '+act.memberName+'님에게 저장'+(tag?(tag==='before'?' — 📌 비포 영상':' — ✅ 애프터 영상'):''),'ok');
  try{ if(typeof autoPublishReport==='function') autoPublishReport(act.memberId); }catch(e){}   // 고정 리포트 링크 자동 갱신
  if(navigator.vibrate){ try{ navigator.vibrate(30); }catch(e){} }
}
// '방금 친 샷' 전체/최근 보기 토글 — 레슨 끝에 처음 샷을 비포로 지정할 때 사용
function togglePsShowAll(bayId){
  if(!S._psShowAll) S._psShowAll={};
  S._psShowAll[bayId]=!S._psShowAll[bayId];
  render();
}
// 저장 취소 — 샷을 다시 미배정(대기) 상태로 되돌린다
function cancelLessonShot(shotId){
  var s=(S.shotEvents||[]).find(function(x){return x.id===shotId;}); if(!s) return;
  s.memberId=null; s.memberName=null; s.author=null;
  if(s.data){ delete s.data._tag; delete s.data._kept; }
  delete s._uiSavedAt;
  save();
  try{ cloud.reassignShot(s.id, null, null); cloud.updateShotData(s); }catch(e){}
  render();
  liveToast('저장 취소됨 — 다시 선택할 수 있어요','ok');
}
// 레슨 모드: 이 샷 버림 (화면+서버+R2 영상까지 제거 — 영상만 남는 고아 방지)
function dropLessonShot(shotId){
  var s=(S.shotEvents||[]).find(function(x){return x.id===shotId;});
  if(s) r2RemoveShotVideos(s);
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
        // 관찰용(타석 점검) 세션은 담당자·관리자 외에는 빈 타석으로 표기 (조용히 인수됨)
        if(occ && typeof isOwnerWatchMember==='function' && isOwnerWatchMember(occ.memberId)
           && !(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) occ=null;
        // 사용 중인 타석도 누를 수 있음 — 앞 타임 세션 종료 확인 후 인수 (연속 레슨)
        return '<button class="baypick '+b.color+(occ?' occ':'')+'" onclick="pickBayForMember(\''+b.id+'\')">'
          + '<span class="bp-name">'+b.name+'</span><span class="bp-sub">'+(occ?occ.memberName+' 진행중 · 종료 후 시작':'여기서 시작')+'</span></button>';
      }).join('')
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="cancelBayPick()">취소</button></div>'
    + '</div></div>';
}

// ============ 앞 타임 세션 인수 (같은 타석 연속 레슨) ============
// 앞 프로가 세션 종료를 잊고 가면 다음 프로가 그 타석에서 시작을 못 했다 —
// 막는 대신 "앞 세션을 종료하고 새로 시작할까요?" 확인 후 인수한다.
// 이 기기에는 남의 일지 카드를 열지 않는다: 앞 담당자가 받아쓴 전문은 그 담당자
// 기기의 폴링(applyRemoteActive)이 세션 소멸을 감지해 일지 초안으로 복구한다(v9.73).
function _takeOverConfirm(bayId){
  var act=S.activeSessions[bayId]; if(!act) return true;
  // 관찰용(타석 점검) 세션은 묻지 않고 조용히 인수 — 확인창에 이름·담당자가 뜨면
  // 다른 직원에게 드러난다. 끄는 걸 잊어도 다음 레슨 시작이 그냥 진행되게.
  if(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(act.memberId)) return true;
  var mins=Math.round((Date.now()-new Date(act.startedAt).getTime())/60000);
  var dur=isNaN(mins)||mins<0?'':' · '+(mins>=60?Math.floor(mins/60)+'시간 '+(mins%60)+'분':mins+'분')+' 경과';
  return confirm('⚠️ '+getBay(bayId).name+'에 앞 타임 레슨이 아직 켜져 있어요\n\n'
    + act.memberName+'님 · 담당 '+(act.author||'?')+dur+'\n\n'
    + '앞 세션을 종료하고 새로 시작할까요?\n'
    + '(앞 담당자가 받아쓴 녹음은 그 담당자 기기에서 일지 초안으로 자동 복구됩니다)');
}
function forceEndPrevSession(bayId){
  var act=S.activeSessions[bayId]; if(!act) return true;
  if(typeof _rec!=='undefined' && _rec.bayId===bayId){ liveToast('🎙 이 기기에서 녹음 중인 세션입니다 — [종료·글변환]을 먼저 눌러주세요','err'); return false; }
  var memberId=act.memberId, memberName=act.memberName, author=act.author;
  var tx=String(act._transcript||'').trim();
  var bayName=getBay(bayId).name;
  if(S.voiceBay===bayId){ try{ stopVoice(bayId); }catch(e){} }
  delete S.activeSessions[bayId];
  try{ if(S._psShowAll) delete S._psShowAll[bayId]; }catch(e){}
  save();
  logActivity('앞 세션 종료(다음 레슨 시작)', memberId, bayName);
  logAudit('session','앞 세션 종료(다음 레슨 시작)', memberName, {bay:bayName, prevAuthor:author, by:S.currentUser});
  try{ cloud.endActiveSession(bayId); }catch(e){}
  // 앞 세션이 내 것이었고 받아쓴 내용이 있으면 초안/보관함으로 회수 (조용히 버리지 않음)
  if(tx && author===S.currentUser && !(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(memberId))){
    try{
      if(!S.showAddSession && openVoiceDraft(memberId, author, tx)){
        liveToastSafe('🎙 앞 세션의 녹음 전문을 일지 초안으로 복구했어요 — 저장 후 새 세션을 시작하세요');
      } else {
        S._lostTx=S._lostTx||[];
        S._lostTx.push({memberId:memberId, author:author, tx:tx, at:new Date().toISOString()});
        try{ save(); }catch(e){}
      }
    }catch(e){}
  }
  return true;
}

// ============ 세션 시작 (회원 배정 → 명시 컨펌) ============
function openLiveStart(bayId){
  if(S.activeSessions[bayId]){
    if(!_takeOverConfirm(bayId)) return;
    if(!forceEndPrevSession(bayId)) return;
  }
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
  // 이중 안전 체크 (컨펌 사이에 상태가 바뀌었을 수 있음 — 폴링이 앞 세션을 되살린 경우 포함)
  if(S.activeSessions[c.bayId]){
    if(!_takeOverConfirm(c.bayId) || !forceEndPrevSession(c.bayId)){ S.liveConfirm=null; render(); return; }
  }
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

// ============ 세션 자동 종료 (2시간 초과) ============
// 레슨은 한 타임 최대 ~50분. 종료를 잊고 두면 다음 이용자의 샷까지 그 회원에게
// 계속 귀속되므로, SESSION_AUTO_END_HOURS(기본 2시간) 초과 세션은 자동 종료한다.
// 담당자 기기에 받아쓴 녹음이 있으면 일지 초안으로 살려서 열어준다(내용 유실 방지).
function autoEndOverdueSessions(){
  var hours=(window.APP_CONFIG && APP_CONFIG.SESSION_AUTO_END_HOURS)||2;
  var limit=hours*3600*1000;
  var ended=[];
  Object.keys(S.activeSessions||{}).forEach(function(bayId){
    var act=S.activeSessions[bayId]; if(!act||!act.startedAt) return;
    var t=new Date(act.startedAt).getTime(); if(isNaN(t)) return;
    if(Date.now()-t < limit) return;
    if(typeof _rec!=='undefined' && _rec.bayId===bayId) return;   // 이 기기에서 녹음 진행 중이면 보류
    if(act._sttBusy && act._sttBusyAt && Date.now()-act._sttBusyAt<90000) return;   // 음성 변환 중(90초 이내)이면 보류 — 오래 걸린 건 걸린 것이므로 진행
    var transcript=(act._transcript||'').trim();
    var memberId=act.memberId, author=act.author, memberName=act.memberName, bayName=getBay(bayId).name;
    var _bkAct={ startedAt: act.startedAt };
    if(S.voiceBay===bayId){ try{ stopVoice(bayId); }catch(e){} }
    delete S.activeSessions[bayId];
    try{ cloud.endActiveSession(bayId); }catch(e){}
    logActivity('세션 자동 종료('+hours+'시간 초과)', memberId, bayName);
    logAudit('session','세션 자동 종료('+hours+'시간 초과)', memberName, {bay:bayName, author:author});
    if(!(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(memberId))) ended.push(bayName+' · '+memberName+'님');   // 관찰용 회원은 토스트에서 제외
    // 담당자 본인 기기 + 받아쓴 내용 있음 → 일지 초안으로 복구 (조용히 버리지 않음)
    if(author===S.currentUser){
      if(transcript){
        try{ openVoiceDraft(memberId, author, transcript); }catch(e){}
      } else {
        // 이 기기에 전문이 없으면(다른 기기에서 녹음 등) 서버 백업에서 복구
        _fetchTranscriptBackup(bayId, _bkAct).then(function(bk){
          if(!bk) return;
          try{ if(openVoiceDraft(memberId, author, bk)){ liveToastSafe('🎙 서버 백업에서 녹음 전문을 복구했어요 — 일지를 저장하세요'); render(); } }catch(e){}
        });
      }
    }
  });
  if(ended.length){
    try{ save(); }catch(e){}
    try{ liveToastSafe('⏱ 2시간 경과 — '+ended.join(', ')+' 세션 자동 종료됨'); }catch(e){}
    try{ render(); }catch(e){}
  }
}

// ============ 세션 종료 (수동) ============
async function endLiveSession(bayId){
  var act = S.activeSessions[bayId]; if(!act) return;
  if(typeof _rec!=='undefined' && _rec.bayId===bayId){ liveToast('🎙 녹음 [종료·글변환]을 먼저 눌러주세요','err'); return; }
  if(act._sttBusy){
    // 90초 넘은 "변환 중"은 걸린 상태 — 종료를 막지 않고 자동 해제(예전엔 여기서 영구 차단)
    if(act._sttBusyAt && Date.now()-act._sttBusyAt<90000){ liveToast('음성 변환 중 — 잠시 후 종료해주세요','err'); return; }
    delete act._sttBusy; delete act._sttBusyAt;
  }
  var bay = getBay(bayId);
  var hasVoice = (act._transcript||'').trim().length>0;
  var pendCnt = (typeof pendingShotsForBay==='function') ? pendingShotsForBay(bayId).length : 0;
  var msg = bay.name+' · '+act.memberName+'님 세션을 종료할까요?\n'
    + (hasVoice ? '(받아쓴 내용을 AI가 세션카드로 정리합니다)' : '(세션 기록 카드가 열립니다 — 메모를 추가하고 저장하세요)')
    + (pendCnt ? '\n\n💡 비포/애프터 지정은 종료 전에만 가능해요 — [전체 샷 ⏮]에서 처음 친 샷도 지정할 수 있습니다 (미저장 샷 '+pendCnt+'개)' : '');
  if(!confirm(msg)) return;
  try{ window.__busyHold = Date.now() + 15000; }catch(e){}   // 종료 처리~일지 카드 열림 사이 SW 리로드 보류
  var transcript = act._transcript||'', memberId = act.memberId, author = act.author;
  var _bkAct = { startedAt: act.startedAt };   // 서버 백업 키 계산용 (삭제 전에 캡처)
  if(S.voiceBay===bayId) stopVoice(bayId);
  delete S.activeSessions[bayId];
  try{ if(S._psShowAll) delete S._psShowAll[bayId]; }catch(e){}   // 전체 샷 보기 토글 초기화
  save();
  logActivity('라이브 세션 종료', memberId, bay.name);
  logAudit('session','라이브 세션 종료', act.memberName, {bay:bay.name, voice:hasVoice});
  cloud.endActiveSession(bayId);
  // 관찰용 회원(타석 점검) — 일지 작성 없이 조용히 종료
  if(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(memberId)){
    liveToast('⏹ '+bay.name+' 세션 종료','ok'); render(); return;
  }
  // 전문이 비어 있으면(페이지가 죽었거나 다른 기기에서 종료 등) 서버 백업에서 복구 시도
  if(!transcript.trim()){
    try{
      var _bk=await _fetchTranscriptBackup(bayId, _bkAct);
      if(_bk){ transcript=_bk; liveToast('🎙 서버 백업에서 녹음 전문을 복구했어요','ok'); }
    }catch(e){}
  }
  // 라이브 세션 종료 = 세션 기록 생성 (일원화). 음성 있으면 AI 정리, 없으면 빈 카드.
  if(transcript.trim()){
    openVoiceDraft(memberId, author, transcript);
    liveToast('🤖 AI가 세션카드를 정리했어요 — 확인 후 저장','ok');
  } else {
    // 음성 없음 → 회원 선택 후 빈 세션카드 모달 (수기 입력)
    S.selectedMember = memberId;
    S.newSession = {date:today(), time:nowHalfHour(), author:author||S.currentUser||'', content:'', media:[], mediaUrls:['','']};
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
  r2RemoveShotVideos(shot);   // R2 영상(mkv+mp4) 실제 삭제 — 확인문구대로 함께 제거(고아 방지)
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
      if(finalT){ a._transcript=((a._transcript||'')+' '+finalT).replace(/\s+/g,' ').trim(); save(); _backupTranscript(bayId, a); }
      if(S.voiceBay===bayId) updateVoicePreview(bayId, interim);
    };
    rec.onerror=function(e){ console.warn('[voice] error:', e&&e.error); };
    // 브라우저가 주기적으로 종료 → 의도적 중지가 아니면 자동 재시작
    rec.onend=function(){ if(S.voiceBay===bayId && _voiceRec===rec){ try{ rec.start(); }catch(e){ S.voiceBay=null; render(); } } };
    rec.start();
    _voiceRec = rec; S.voiceBay = bayId;
    try{ var ub=document.getElementById('upd-banner'); if(ub) ub.remove(); }catch(e){}   // 녹음 중 업데이트 배너 숨김
    render();
  }catch(e){ console.warn('[voice] start fail:', e); liveToast('받아쓰기 시작 실패','err'); S.voiceBay=null; render(); }
}
function stopVoice(bayId){
  S.voiceBay = null;
  if(_voiceRec){ try{ _voiceRec.onend=null; _voiceRec.stop(); }catch(e){} _voiceRec=null; }
  save(); render();
  try{ setTimeout(function(){ if(typeof checkAppUpdate==='function') checkAppUpdate(); }, 5000); }catch(e){}   // 녹음 끝 → 밀린 업데이트 배너 재표시
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
// 화면이 꺼졌다 켜지면 wakeLock 이 해제돼 있음 — 녹음 중이면 재획득 (갤럭시 백그라운드 킬 방어)
try{
  document.addEventListener('visibilitychange', async function(){
    if(document.visibilityState!=='visible') return;
    try{
      if(_rec.bayId && navigator.wakeLock && (!_rec.wakeLock || _rec.wakeLock.released)){
        var lk = await navigator.wakeLock.request('screen');
        // await 사이에 녹음이 끝났으면(자동 종료·수동 종료 경합) 새 락을 바로 해제 — 화면 잠금 누수 방지
        if(!_rec.bayId){ try{ lk.release(); }catch(e){} return; }
        _rec.wakeLock = lk;
      }
    }catch(e){}
  });
}catch(e){}
var REC_SEG_MS = 20000;   // 20초마다 잘라 변환 — Whisper 30초 창에 가깝게 늘려 단어 중간 절단·헛인식↓ (실시간 표시는 유지)
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
      var warn='';
      if(_rec.failN){ warn='\n⚠️ 변환 실패 '+_rec.failN+'조각: '+String(_rec.lastFailMsg||'').slice(0,70); }
      else if((_rec.emptyN||0)>=2){ warn='\n⚠️ 마이크 소리가 안 들어와요 — 재연결 시도 중'; }
      live.textContent = (txt ? txt.slice(-300) : '듣는 중... 말하면 20초 안에 글로 나타나요') + warn;
    }
  }catch(e){}
}
// 한 세그먼트(20초) 녹음 시작 — 끝나면 즉시 다음 세그먼트로 이어지고, 이전 조각은 병렬 변환
function _startSegment(){
  var mime=_recMime();
  var opts={audioBitsPerSecond:48000}; if(mime) opts.mimeType=mime;  // 32k→48k: 잡음 많은 스튜디오에서 말소리 선명도↑ (파일 크기는 여전히 작음)
  var mr=new MediaRecorder(_rec.stream, opts);
  var segChunks=[];
  mr.ondataavailable=function(e){ if(e.data&&e.data.size) segChunks.push(e.data); };
  mr.onstop=function(){
    var isFinal=_rec.stopping;
    var blob=new Blob(segChunks,{type:(segChunks[0]&&segChunks[0].type)||'audio/mp4'});
    var tiny = blob.size<=2000;
    if(!isFinal && _rec.bayId){
      // 빈 조각 감시 — 일부 기기(iOS)는 같은 스트림에 녹음기를 다시 만들면 소리가 안 담긴다.
      // 2번 연속 비면 마이크 스트림을 새로 받아 자가 복구(예전엔 조용히 버려져 "침묵 녹음").
      if(tiny){ _rec.emptyN=(_rec.emptyN||0)+1; } else { _rec.emptyN=0; }
      if(_rec.emptyN>=2){
        navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}})
          .then(function(ns){
            // 재획득 도착 전에 종료됐으면 새 스트림을 즉시 꺼서 마이크 점유 누수 방지
            if(!_rec.bayId || _rec.stopping){ try{ns.getTracks().forEach(function(t){t.stop();});}catch(e){} return; }
            try{ if(_rec.stream) _rec.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
            _rec.stream=ns; _rec.emptyN=0; _startSegment();
          })
          .catch(function(){ if(_rec.bayId && !_rec.stopping) _startSegment(); });
      } else {
        _startSegment();   // 공백 최소화 — 먼저 다음 조각 시작
      }
    }
    if(!tiny){ _handleSegment(blob, isFinal); }
    else if(isFinal){ _finishRec(); }
    _recUpdateUI();
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
// ---------- 전사 서버 백업 (2026-08-11 김현수 50분 레슨 유실 사고 재발 방지) ----------
// 받아쓴 전문이 "녹음한 기기의 localStorage"에만 있어서, 페이지가 죽거나 다른 기기가
// 세션을 종료하면 통째로 사라졌다. 이제 세그먼트마다 R2(rec/)에 전문을 덮어써 두고,
// 종료 시 전문이 비어 있으면 서버 백업에서 복구한다. rec/ 라이프사이클(30일)로 자동 정리.
function _recBackupKey(bayId, act){
  var t=Date.parse(act&&act.startedAt); if(isNaN(t)) t=0;
  return 'rec/tx_'+bayId+'_'+t+'.txt';
}
function _backupTranscript(bayId, act, force){
  try{
    if(!act || !(act._transcript||'').trim()) return;
    if(typeof r2==='undefined' || !r2.enabled) return;
    var now=Date.now();
    if(!force && act._txBackupAt && now-act._txBackupAt<8000) return;   // 과도한 업로드 방지
    act._txBackupAt=now;
    r2.upload(_recBackupKey(bayId, act), new Blob([act._transcript], {type:'text/plain'}));
  }catch(e){}
}
async function _fetchTranscriptBackup(bayId, act){
  try{
    if(typeof r2==='undefined' || !r2.enabled) return '';
    var res=await fetch(r2.url(_recBackupKey(bayId, act)));
    if(!res || !res.ok) return '';
    return String(await res.text()||'').trim();
  }catch(e){ return ''; }
}
// Whisper 환각 필터 — 무음/잡음 구간에서 유튜브 자막 문구 등을 지어내는 유명 버그.
// 실제 레슨 일지에 "자막 제공 및 광고는..." 같은 문장이 섞여 저장되는 것을 차단.
var _STT_HALLU = [
  /자막\s*(제공|제작|정보)[^.]*/g, /광고\s*(문의|포함|는)[^.]*/g, /윗?방송을?\s*확인[^.]*/g,
  /구독[과와]?\s*좋아요[^.]*/g, /구독\s*부탁[^.]*/g, /좋아요[와과]?\s*구독[^.]*/g, /알림\s*설정[^.]*/g,
  /시청해\s*주?셔서\s*감사[^.]*/g, /시청\s*감사[^.]*/g, /다음\s*(영상|시간)에서?\s*만나[^.]*/g,
  /(MBC|KBS|SBS|JTBC|YTN)\s*뉴스[^.]*/g, /뉴스\s*[가-힣]{2,4}입니다[^.]*/g,
  /이\s*영상은\s*유료\s*광고[^.]*/g, /한글\s*자막\s*by[^.]*/gi, /www\.[a-z0-9.\-]+/gi
];
function sttFilterHallucination(text){
  var t=String(text||'');
  _STT_HALLU.forEach(function(re){ t=t.replace(re,' '); });
  t=t.replace(/\s{2,}/g,' ').trim();
  return t.length<2 ? '' : t;
}
async function _handleSegment(blob, isFinal){
  var bayId=_rec.bayId || _rec._lastBay;
  _rec.pendingStt++;
  var text='';
  try{ text=await sttTranscribe(blob); }
  catch(e){
    console.warn('[stt] segment fail:', e&&e.message);
    _rec.failN=(_rec.failN||0)+1;
    _rec.lastFailMsg=String(e&&e.message||'변환 실패');
    if(!window._sttUnavailable){
      window._sttUnavailable=true;
      // 실패 사유를 그대로 보여준다 — "미설정"으로 뭉뚱그리면 네트워크 문제를 못 알아챈다
      liveToast('⚠️ 음성 변환 실패: '+_rec.lastFailMsg.slice(0,80)+' (녹음 원본은 보관됨)','err');
    }
    // 변환 실패 조각은 원본을 R2에 백업 (아무것도 잃지 않게)
    try{ r2.upload('rec/'+bayId+'_'+Date.now()+'_'+_rec.segIdx+(String(blob.type).indexOf('mp4')!==-1?'.m4a':'.webm'), blob); }catch(_){}
  }
  _rec.pendingStt--;
  text=sttFilterHallucination(text);   // 무음 구간 환각 문장("자막 제공..." 등) 제거
  if(text){
    _rec.tx=((_rec.tx||'')+' '+text).trim();     // 녹음기 버퍼 — 폴링과 무관하게 절대 안 사라짐
    var act=S.activeSessions[bayId];
    if(act){ act._transcript=_recFullText(); try{save();}catch(e){} _backupTranscript(bayId, act); }
    _recUpdateUI();   // render 없이 실시간 텍스트만 갱신
  }
  if(isFinal){ _finishRec(); }
}
// 최종 마무리 — 모든 변환 완료 후 전문을 세션에 확정 기록.
// ⏱ 최대 45초만 기다린다 — 변환 요청이 걸려서 안 돌아와도 지금까지의 텍스트로
// 확정하고 배지를 반드시 내린다(예전엔 무한 대기 → "마지막 조각 변환 중" 영구 표시
// + 세션 종료 버튼까지 차단되던 버그).
function _finishRec(){
  if(!_rec._finishT0) _rec._finishT0=Date.now();
  var timedOut = (Date.now()-_rec._finishT0 > 45000);
  if(_rec.pendingStt>0 && !timedOut){ setTimeout(_finishRec, 400); return; }   // 남은 변환 대기
  var bayId=_rec._lastBay;
  var act=bayId && S.activeSessions[bayId];
  var full=_recFullText();
  try{ localStorage.removeItem('golf_pt_rec_active'); }catch(e){}   // 녹음이 정상 마무리됨 — 자동 재개 마커 해제
  if(act){
    if(full) act._transcript=full;   // 최종 전문 덮어쓰기 (중간에 뭐가 지웠어도 복원)
    delete act._sttBusy; delete act._sttBusyAt;
    try{save();}catch(e){}
    _backupTranscript(bayId, act, true);   // 최종 전문 서버 백업 (스로틀 무시)
  }
  _rec._lastBay=null; _rec._finishT0=null;
  var failN=_rec.failN||0, emptyN=_rec.emptyN||0;
  if(timedOut && _rec.pendingStt>0){
    liveToast('⚠️ 일부 변환이 응답 없음 — 지금까지 인식된 내용으로 저장했어요 (원본 오디오는 보관됨)','err');
  } else if(failN>0){
    liveToast(full ? ('🎙 저장 완료 — 단, '+failN+'개 조각 변환 실패(원본 보관됨). 서버·네트워크 확인 필요') : ('⚠️ 음성 변환 '+failN+'개 조각 모두 실패 — 원본 오디오는 보관됨. 관리자에게 문의'), full?'ok':'err');
  } else if(!full && emptyN>0){
    liveToast('⚠️ 마이크 소리가 녹음되지 않았어요 — 마이크 권한·다른 앱 점유 확인 후 다시 시도','err');
  } else {
    liveToast(full ? '🎙 녹음 저장 완료 — 세션 종료 시 AI가 일지로 정리해요' : '🎙 녹음 종료 — 인식된 내용이 없습니다', full?'ok':'err');
  }
  render();
}
// 끊긴 녹음 자동 재개 — 갤럭시 절전 등이 화면 꺼진 웹앱을 죽이면 녹음도 함께 죽는다.
// 재시작 시 복구 마커가 남아 있고 그 타석 세션이 아직 진행 중이면, 담당자 기기에서
// 녹음을 자동으로 다시 시작한다 (이전 전문은 세그먼트마다 저장돼 있어 이어붙음).
function resumeInterruptedRec(){
  try{
    var raw=localStorage.getItem('golf_pt_rec_active'); if(!raw) return;
    var info=null; try{ info=JSON.parse(raw); }catch(e){}
    if(!info || !info.bayId || Date.now()-(info.at||0) > 6*3600*1000){ try{localStorage.removeItem('golf_pt_rec_active');}catch(e){} return; }
    if(_rec.bayId) return;                                            // 이미 녹음 중
    if(S.currentRole!=='pro' && S.currentRole!=='trainer') return;    // 담당자 기기에서만
    if(info.author && info.author!==S.currentUser) return;
    var act=S.activeSessions[info.bayId];
    if(!act || act.author!==S.currentUser){ try{localStorage.removeItem('golf_pt_rec_active');}catch(e){} return; }   // 세션이 이미 끝남
    try{ localStorage.removeItem('golf_pt_rec_active'); }catch(e){}
    S.showLiveSession=true; S.showDashboard=false; S.selectedMember=null;
    try{ if(typeof startLivePolling==='function') startLivePolling(); }catch(e){}
    startBayRec(info.bayId);                                          // 마이크 권한은 이미 허용됨 — 제스처 없이 재개
    try{ liveToastSafe('🎙 중단됐던 녹음을 자동으로 다시 시작했어요 — 이전 내용은 저장돼 있습니다'); }catch(e){}
    try{ render(); }catch(e){}
  }catch(e){}
}
try{ setTimeout(resumeInterruptedRec, 4000); }catch(e){}   // 부팅(자동 로그인 복원) 후
async function startBayRec(bayId){
  if(!recSupported()){ liveToast('이 기기는 녹음을 지원하지 않습니다','err'); return; }
  if(_rec.bayId){ liveToast('이미 '+getBay(_rec.bayId).name+'에서 녹음 중입니다','err'); return; }
  var act=S.activeSessions[bayId]; if(!act){ liveToast('먼저 회원을 배정하세요','err'); return; }
  try{
    var stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}});
    // txBase = 녹음 시작 전 이미 있던 메모, tx = 이번 녹음으로 쌓이는 텍스트(자체 버퍼)
    _rec={bayId:bayId, stream:stream, mr:null, chunks:[], startedAt:Date.now(), uiTimer:null, segTimer:null, wakeLock:null, stopping:false, segIdx:0, pendingStt:0, txBase:(act._transcript||'').trim(), tx:''};
    // 진행 중 표시 — 앱이 죽어도(갤럭시 절전 킬 등) 재시작 시 녹음을 자동 재개하기 위한 복구 마커
    try{ localStorage.setItem('golf_pt_rec_active', JSON.stringify({bayId:bayId, at:Date.now(), author:S.currentUser||''})); }catch(e){}
    try{ var ub=document.getElementById('upd-banner'); if(ub) ub.remove(); }catch(e){}   // 녹음 중 업데이트 배너 숨김
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
  try{ localStorage.removeItem('golf_pt_rec_active'); }catch(e){}   // 의도적 종료 — 자동 재개 마커 해제
  _rec.stopping=true;
  _rec._lastBay=bayId;
  clearInterval(_rec.uiTimer); clearTimeout(_rec.segTimer); clearTimeout(_rec.autoStop);
  try{ if(_rec.wakeLock) _rec.wakeLock.release(); }catch(e){}
  var act=S.activeSessions[bayId];
  if(act){ act._sttBusy=true; act._sttBusyAt=Date.now(); }   // 마지막 조각 변환 중 표시 (시각 기록 — 오래되면 자동 해제)
  try{ _rec.mr.stop(); }catch(e){ _finishRec(); }
  try{ _rec.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
  _rec.bayId=null; _rec.mr=null; _rec.stream=null;
  render();
  try{ setTimeout(function(){ if(typeof checkAppUpdate==='function') checkAppUpdate(); }, 5000); }catch(e){}   // 녹음 끝 → 밀린 업데이트 배너 재표시
}
async function sttTranscribe(blob){
  if(!r2.enabled) throw new Error('worker 미설정');
  // ⚠️ 직전 조각 텍스트를 힌트로 넘기지 않음 — 한 조각이 깨지면 그 오류가
  //    다음 조각 프롬프트로 전파돼 눈덩이처럼 증폭되던 문제(오염 되먹임) 차단.
  //    프롬프트는 워커의 고정 골프 용어사전을 그대로 사용(빈 힌트 = 사전 사용).
  // 타임아웃(35초) 필수 — 요청 하나가 무한 대기하면 pendingStt 가 안 줄어
  //   "마지막 조각 변환 중" 이 영원히 안 끝나고 세션 종료까지 막힌다.
  var lastErr;
  for(var attempt=0; attempt<2; attempt++){
    var ac = (typeof AbortController!=='undefined') ? new AbortController() : null;
    var killT = ac ? setTimeout(function(){ try{ac.abort();}catch(e){} }, 35000) : null;
    try{
      var res=await fetch(r2.workerUrl+'/stt',{method:'POST',headers:{'X-API-Key':r2.apiKey,'Content-Type':blob.type||'application/octet-stream'},body:blob,signal:ac?ac.signal:undefined});
      clearTimeout(killT);
      if(res.status===501||res.status===404||res.status===401){ window._sttReady=false; throw new Error('stt-not-ready '+res.status); }   // 키미설정/경로없음/인증 — 재시도 무의미
      if(!res.ok){ var t=''; try{t=await res.text();}catch(e){} lastErr=new Error('stt http '+res.status+' '+t.slice(0,120)); continue; }  // 5xx 등 → 1회 재시도
      window._sttReady=true;
      var j=await res.json();
      return (j&&j.text||'').trim();
    }catch(e){
      clearTimeout(killT);
      if(/stt-not-ready/.test(e&&e.message||'')) throw e;
      lastErr=(e&&e.name==='AbortError') ? new Error('stt 응답 시간 초과(35초) — 네트워크 확인') : e;
    }
  }
  throw (lastErr||new Error('stt 변환 실패'));
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

// fetch + 타임아웃 — 응답이 영영 안 오면 AI 정리가 '진행 중'에 영구히 갇힌다 (실패로 전환해 재시도 경로로)
function _fetchT(url, opts, ms){
  var ac=(typeof AbortController!=='undefined')?new AbortController():null;
  var t=ac?setTimeout(function(){ try{ac.abort();}catch(_){} }, ms||45000):null;
  var o=ac?Object.assign({},opts,{signal:ac.signal}):opts;
  return fetch(url,o).finally(function(){ if(t) clearTimeout(t); });
}

// Claude 정리 — 골프 특화 구조화. 1순위 워커 프록시, 2순위 브라우저 직접, 실패 시 null→로컬 폴백.
async function aiSummarizeWithClaude(transcript, author){
  try{
    transcript=sttFilterHallucination(transcript);   // 환각 문장("자막 제공..." 등) 제거 후 AI에 전달
    if(!transcript) return null;
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
      +'\n[화자 구분 — 매우 중요]\n'
      +'녹음은 마이크 하나로 녹음되어 화자 표시가 없다. 대부분은 지도자('+roleLabel+')의 발화이고, 회원 발화는 짧은 대답·질문 위주다.\n'
      +'- 누가 말했는지 불확실한 문장을 회원의 상태·컨디션으로 단정하지 마라. (실제 사고 예: 지도자가 자기 라운드 얘기로 "골프 쳤는데 더웠다"고 한 것을 회원 컨디션 저하로 기록하고 "체력 보강"을 처방함 — 이런 오류 절대 금지)\n'
      +'- 레슨 지도와 무관한 사담·잡담(날씨, 라운드 후기, 식사, 근황)은 일지에 넣지 않는다.\n'
      +'- 지도자가 명시적으로 말하지 않은 처방·권고·과제를 만들어내지 마라.\n'
      +'- 회원 관련 특이사항(통증·요청 등)은 회원이 말한 것이 문맥상 분명할 때만 기록한다.\n'
      +'\n다음 마크다운 형식을 반드시 지켜 출력한다(빈 섹션은 생략):\n'
      +'## 📋 오늘의 핵심\n1~2문장으로 이번 레슨의 주제·결론.\n\n'
      +'## 🎯 교정 포인트\n- **[부위/동작]** 문제점 → 교정 방법 (실제 언급된 것만, 각 1줄)\n\n'
      +'## 🏌️ 드릴·연습\n- **[드릴명]** 방법/횟수/의도\n\n'
      +'## 📈 트랙맨·수치 (원문에 언급 시)\n- 클럽/캐리/구질 등 실제 말한 수치만\n\n'
      +'## 📝 다음 과제\n- 회원이 집/다음까지 할 것\n\n'
      +'## 💬 특이사항\n- 통증·컨디션·멘탈·요청 등 (화자가 회원임이 분명한 것만)\n\n'
      +'[항목 수·핵심 표시]\n'
      +'- 불릿은 전체 합쳐 최대 8개, 각 1줄. 사소한 것은 과감히 생략.\n'
      +'- 전체 불릿 중 이번 레슨에서 가장 중요한 2~3개 앞에 [핵심] 을 붙여라. 예: - [핵심] **[백스윙]** ... ([핵심]은 반드시 2~3개, 일지에는 이것만 기본으로 실린다)\n'
      +'\n규칙: (1) 원문에 없는 내용 금지 (2) 애매하면 넣지 말고 생략 (3) 실제 말한 교정/드릴은 빠뜨리지 말 것 (4) 확률·추측 표현("~인 것 같습니다") 금지 (5) 코치가 회원에게 지시한 핵심은 최대한 보존.';
    var payload={
      model:cfg.ANTHROPIC_MODEL||'claude-haiku-4-5',
      max_tokens:maxTok,
      system:system,
      messages:[{role:'user',content:'다음은 '+roleLabel+'의 레슨 녹음 원문이다. 위 형식으로 정리하라:\n\n"""\n'+transcript+'\n"""'}]
    };
    var parse=function(data){ var t=(data&&data.content&&data.content[0]&&data.content[0].text)||''; return t.trim()||null; };
    window.__aiLastError='';
    // 1순위: 워커 프록시 (Anthropic 키가 Cloudflare 시크릿에만 존재)
    // AI_WORKER_URL 있으면 그쪽, 없으면 R2_WORKER_URL 재사용
    var wbase=cfg.AI_WORKER_URL||cfg.R2_WORKER_URL;
    var wauth=cfg.AI_WORKER_KEY||cfg.R2_API_KEY;
    if(cfg.AI_VIA_WORKER && wbase && wauth){
      try{
        var wurl=String(wbase).replace(/\/+$/,'')+'/claude';
        var wres=await _fetchT(wurl,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':wauth},body:JSON.stringify(payload)},60000);
        var wbodyText=''; try{ wbodyText=await wres.text(); }catch(_){}
        if(wres.ok){
          var wj=null; try{ wj=JSON.parse(wbodyText); }catch(_){}
          var wt=parse(wj); if(wt) return wt;
          // 200인데 본문에 error(예: Anthropic {type:'error'})가 담겨오는 경우
          window.__aiLastError='워커 200이지만 응답 이상: '+String((wj&&wj.error&&(wj.error.message||wj.error.type))||wbodyText).slice(0,200);
        } else {
          var wmsg=wbodyText; try{ var we=JSON.parse(wbodyText); wmsg=(we.error&&(we.error.message||we.error.type))||we.detail||we.error||wbodyText; }catch(_){}
          window.__aiLastError='워커 '+wres.status+': '+String(wmsg).slice(0,200);
          console.warn('[claude] worker http', wres.status, String(wbodyText).slice(0,200));
        }
      }catch(e){ window.__aiLastError='워커 통신 오류: '+(e&&e.message||e); console.warn('[claude] worker fail:', e&&e.message); }
      // 워커 실패 → 아래 직접 키 폴백 시도(있으면)
    }
    // 2순위: 브라우저 직접 호출 (이 기기 localStorage 키)
    var key=getAnthropicKey();
    if(!key){ if(!window.__aiLastError) window.__aiLastError='AI 정리 미설정 (워커 프록시·기기 키 모두 없음)'; return null; }
    var res=await _fetchT('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify(payload)
    });
    if(!res.ok){ var dt=''; try{dt=await res.text();}catch(_){} window.__aiLastError='직접호출 '+res.status+': '+String(dt).slice(0,200); console.warn('[claude] http',res.status); return null; }
    return parse(await res.json());
  }catch(e){
    window.__aiLastError='예외: '+(e&&e.message||e);
    console.warn('[claude] fail:', e&&e.message);
    return null;
  }
}

// 받아쓴 원문 → 임시 메모 카드 (AI 정리 전 프리필 / AI 실패 시 폴백)
// ※ 가짜 "[AI 자동 정리]" 라벨 금지 — AI 정리는 aiSummarizeWithClaude 성공 시에만.
// STT 조각("자 다시", "하나 했다가")을 그대로 불릿으로 나열하지 않고,
// 짧은 조각은 앞 문장에 이어붙이고 필러만 있는 조각은 버려 읽을 수 있는 메모로 만든다.
var _STT_FILLER = /^(네|예|자|어|음|그|이제|좋아요|좋습니다|오케이|그렇죠|그쵸|맞아요|다시|한\s*번\s*더|자\s*다시|다시\s*한\s*번(\s*더)?|하나|둘|셋|넷|다섯)[.!?\s]*$/;
function structureTranscript(transcript, author){
  var t=sttFilterHallucination((transcript||'').replace(/\s+/g,' ').trim());
  if(!t) return '';
  var parts=t.split(/(?:다\.|요\.|음\.|죠\.|\.|!|\?|\n)/);
  var lines=[];
  parts.forEach(function(p){
    p=p.trim();
    if(!p || _STT_FILLER.test(p)) return;                    // 필러/구령만 있는 조각은 버림
    if(p.length<12 && lines.length){ lines[lines.length-1]+=' '+p; return; }  // 짧은 조각은 앞 문장에 병합
    if(p.length<6) return;
    if(lines.indexOf(p)===-1) lines.push(p);
  });
  if(lines.length===0) lines=[t];
  var bullets=lines.slice(0,10).map(function(l){ return '- '+l; });
  var tags=[];
  try{
    var dict = getRole(author)==='pro' ? GOLF_KEYWORDS : PT_KEYWORDS;
    var low=t.toLowerCase();
    Object.keys(dict).forEach(function(cat){ if((dict[cat].keywords||[]).some(function(w){return low.indexOf(w)!==-1;})) tags.push(cat); });
  }catch(e){}
  return '[레슨 녹음 메모'+(tags.length?' · '+tags.slice(0,4).join('·'):'')+' — AI 정리 대기]\n'+bullets.join('\n');
}
// ---------- AI 정리 항목 분해/조립 — 핵심 2~3개만 일지에, 나머지는 체크로 추가 ----------
// AI 출력(섹션별 마크다운)을 항목 리스트로 분해. [핵심] 표시된 항목이 기본 선택.
function aiParseSummary(md){
  var lines=String(md||'').split('\n');
  var items=[], head=[], curTag='', inHead=false;
  lines.forEach(function(ln){
    var t=ln.trim();
    var h=/^##\s*(.+)$/.exec(t);
    if(h){ curTag=(h[1].match(/^\S+/)||[''])[0]; inHead=h[1].indexOf('오늘의 핵심')!==-1; return; }
    if(/^[-•]\s+/.test(t)){
      var body=t.replace(/^[-•]\s+/,'');
      var core=body.indexOf('[핵심]')!==-1;
      body=body.replace(/\[핵심\]\s*/g,'').trim();
      if(body) items.push({t:body, tag:(inHead?'':curTag), on:core});
      return;
    }
    if(inHead && t) head.push(t);
  });
  // AI가 [핵심]을 안 붙였으면 앞 3개를 기본 선택 (핵심 없는 일지 방지)
  if(items.length && !items.some(function(i){return i.on;})) items.slice(0,3).forEach(function(i){i.on=true;});
  return { head:head.join(' ').trim(), items:items };
}
// 선택된 항목들로 일지 본문 구성
function aiBuildContent(head, items){
  var out='## 📋 오늘의 핵심\n'+(head||'').trim();
  var sel=(items||[]).filter(function(i){return i.on;});
  if(sel.length) out+='\n\n'+sel.map(function(i){return '- '+(i.tag&&i.tag!=='📋'?i.tag+' ':'')+i.t;}).join('\n');
  return out;
}
// AI 결과(원문 md)를 newSession 에 반영 — 핵심만 본문에, 전체 항목은 체크 리스트로
function aiApplyToForm(ns, md){
  var pr=aiParseSummary(md);
  if(!pr.items.length && !pr.head){ ns._aiBuilt=md; ns._aiHead=null; ns._aiItems=null; return md; }  // 형식 밖 출력은 그대로 사용
  ns._aiHead=pr.head; ns._aiItems=pr.items;
  ns._aiBuilt=aiBuildContent(pr.head, pr.items);
  return ns._aiBuilt;
}
// 항목 체크 토글 (일지 작성 폼)
function toggleAiItem(idx){
  var ns=S.newSession; if(!ns||!ns._aiItems||!ns._aiItems[idx]) return;
  var untouched = ns.content === (ns._aiBuilt||'') + (ns._tmSummary||'');
  if(!untouched && !confirm('일지 내용을 직접 수정하셨습니다.\n항목 선택을 바꾸면 본문이 AI 정리(선택 항목 기준)로 다시 채워집니다.\n계속할까요?')) { render(); return; }
  ns._aiItems[idx].on=!ns._aiItems[idx].on;
  ns._aiBuilt=aiBuildContent(ns._aiHead, ns._aiItems);
  ns.content=ns._aiBuilt+(ns._tmSummary||'');
  render();
}

// 종료 시: 구조화 + 트랙맨 요약 → 기존 세션카드 모달에 프리필 (트레이너 검토 후 저장)
function openVoiceDraft(memberId, author, transcript){
  var m=S.members.find(function(x){return x.id===memberId;});
  if(!m) return false;
  if(m.ownerWatch) return false;   // 관찰용 회원은 일지 초안 생성 안 함 (자동 종료·복구 경로 포함)
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
  var prefill=localStructured+summary;
  // rawTranscript = 받아쓴 전문(원문). 신뢰도 담보용 — 세션에 함께 저장, 화면에선 접어둠.
  S.newSession={ date:today(), time:nowHalfHour(), author:author, content:prefill, rawTranscript:(transcript||'').trim(), media:[], mediaUrls:['',''], _tmSummary:summary };
  S.showAddSession=true;
  if(aiEnabled()){
    var ns=S.newSession;
    ns._aiPending=true; ns._aiPendingAt=Date.now();
    aiSummarizeWithClaude(transcript,author).then(function(better){
      ns._aiPending=false;
      // 프로가 AI를 기다리지 않고 이미 저장했으면 → 결과를 '저장된 일지'에 바로 반영
      // (addSession 이 ns._savedTo 에 저장 위치를 남김. 두 번째 AI 요청 없이 이 결과를 재사용)
      if(ns._savedTo){
        var to=ns._savedTo;
        if(better){
          if(typeof applyAiResultToSaved==='function') applyAiResultToSaved(to.mid, to.sessId, better, to.tmSummary);
        } else if(typeof bgAiCleanupSaved==='function'){
          // 진행 중이던 요청이 실패 → 저장본 대상으로 한 번 더 시도
          bgAiCleanupSaved(to.mid, to.sessId, transcript, author, to.tmSummary);
        }
        return;
      }
      if(S.newSession!==ns) return;   // 다른 회원 폼으로 교체됨 → 이 결과는 폐기
      if(better && S.showAddSession){
        if(ns.content===prefill){
          // 사용자가 아직 손 안 댐 → 핵심만 본문에, 전체 항목은 체크 리스트로
          ns.content = aiApplyToForm(ns, better) + summary;
          try{ liveToast('🤖 AI 정리 완료 — 핵심만 담았어요, 항목 체크로 추가 가능','ok'); }catch(e){}
        } else {
          // 사용자가 수정 중 → 덮어쓰지 않고 보관, 버튼으로 교체 가능
          ns._aiAlt = aiApplyToForm(ns, better) + summary;
          try{ liveToast('🤖 AI 정리 완료 — 수정 중이어서 자동 반영 안 함 (버튼으로 교체 가능)','ok'); }catch(e){}
        }
      } else if(!better){
        // AI 실패를 눈에 보이게 — 조용히 받아쓰기 메모로 저장되는 사고 방지
        ns._aiFailed=true;
        ns._aiFailReason=window.__aiLastError||'';
        try{ liveToast('⚠️ AI 정리 실패 — 받아쓰기 메모 상태입니다. [AI 정리 다시 시도]를 눌러주세요','err'); }catch(e){}
      }
      try{ render(); }catch(e){}
    });
  }
  return true;
}
// AI 정리 재시도 (일지 작성 폼의 버튼) — 워커 AI 설정을 고친 뒤나 일시 오류 때 사용
function retryAiSummarize(){
  var ns=S.newSession;
  if(!ns || ns._aiPending) return;
  // 원문(rawTranscript)이 있으면 그걸로, 없으면(관리자 아닌 기기 등) 현재 메모 내용을 소스로 정리.
  var src = (ns.rawTranscript && ns.rawTranscript.trim())
    ? ns.rawTranscript
    : String(ns.content||'').replace(/^\[레슨 녹음 메모[^\]]*\]\s*/,'').replace(/^[•\-·]\s*/gm,'').replace(/\n\[트랙맨\][\s\S]*$/,'').trim();
  if(!src){ alert('정리할 내용이 없습니다.'); return; }
  if(!aiEnabled()){ alert('AI 정리가 설정되지 않았습니다.\n워커에 ANTHROPIC_API_KEY 시크릿을 등록하거나(권장), 관리자 모드의 AI 설정에서 키를 입력하세요.'); return; }
  ns._aiPending=true; ns._aiPendingAt=Date.now(); ns._aiFailed=false; render();
  aiSummarizeWithClaude(src, ns.author).then(function(better){
    ns._aiPending=false;
    // 재시도 중에 저장하고 폼을 닫았으면 → 결과를 저장된 일지에 반영 (addSession 이 _savedTo 를 남김)
    if(ns._savedTo && better && typeof applyAiResultToSaved==='function'){
      var to=ns._savedTo;
      applyAiResultToSaved(to.mid, to.sessId, better, to.tmSummary);
      return;
    }
    if(S.newSession!==ns) return;
    if(better){
      ns.content = aiApplyToForm(ns, better) + (ns._tmSummary||'');
      ns._aiAlt=null;
      try{ liveToast('🤖 AI 정리 완료 — 핵심만 담았어요, 항목 체크로 추가 가능','ok'); }catch(e){}
    } else {
      ns._aiFailed=true;
      ns._aiFailReason=window.__aiLastError||'';
      try{ liveToast('⚠️ AI 정리 실패 — '+(window.__aiLastError||'워커 AI 설정 확인'),'err'); }catch(e){}
    }
    try{ render(); }catch(e){}
  });
}
// AI 정리 결과로 교체 (사용자 수정 중이라 자동 반영 안 된 경우의 버튼)
function applyAiAlt(){
  var ns=S.newSession;
  if(!ns || !ns._aiAlt) return;
  ns.content=ns._aiAlt; ns._aiAlt=null; render();
}
// 관리자 AI 정리 연결 테스트 — 샘플 원문을 워커 /claude 로 보내 결과/오류를 즉시 확인.
// 레슨을 실제로 녹음하지 않고도 "왜 AI 정리가 안 되나"를 바로 진단할 수 있다.
async function testAiConnection(){
  if(S.currentRole!=='admin'){ alert('관리자 전용 기능입니다'); return; }
  if(!aiEnabled()){ alert('AI 정리 미설정\n\nconfig.js 의 AI_VIA_WORKER / R2_WORKER_URL / R2_API_KEY 를 확인하세요.'); return; }
  try{ liveToast('🤖 AI 정리 연결 테스트 중... (몇 초)','ok'); }catch(e){}
  var sample='자 오늘은 드라이버 셋업하고 백스윙 탑에서 손목 코킹 유지하는 거 연습했고, 다운스윙에서 하체 먼저 쓰라고 얘기했어요. 임팩트 때 페이스 스퀘어. 다음엔 릴리스 타이밍 잡아보죠.';
  var out=null; try{ out=await aiSummarizeWithClaude(sample,'정우진 프로'); }catch(e){ window.__aiLastError='예외: '+(e&&e.message||e); }
  if(out){ alert('✅ AI 정리 정상 동작합니다.\n\n샘플 결과 미리보기:\n\n'+out.slice(0,500)); }
  else{ alert('❌ AI 정리 실패\n\n사유: '+(window.__aiLastError||'알 수 없음')+'\n\n확인: (1) 워커 최신본 배포 여부 (2) config.js ANTHROPIC_MODEL 명 (3) 워커 ANTHROPIC_API_KEY 시크릿'); }
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
         +  '<button class="btn primary class-live-btn" onclick="openClassPick(\'live\')">🏌️ 타석 레슨<small>베이 배정 · 샷 자동 저장</small></button>'
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
    + '<div class="modal-title">'+(journal?'✏️ 일지만 기록':'🏌️ 타석 레슨')+' — 회원 선택</div>'
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
  // 관찰용(타석 점검) 세션은 담당자·관리자 외에는 빈 타석으로 보임 — [+ 회원 배정]을
  // 누르면 조용히 인수되므로(_takeOverConfirm) 다른 직원에겐 막히지도, 드러나지도 않음
  if(act && typeof isOwnerWatchMember==='function' && isOwnerWatchMember(act.memberId)
     && !(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) act = null;
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
  // 이름 옆 [종료] — 카드 맨 아래까지 스크롤하지 않고 바로 종료 (아래 큰 종료 버튼도 유지)
  body += '<div class="bay-member"><div class="member-avatar '+memberColor(act.memberId)+'">'+initials(act.memberName)+'</div>'
        + '<div class="bay-member-info"><div class="bay-member-name">'+act.memberName+'님</div>'
        + '<div class="bay-author '+roleCls+'">'+act.author+' · '+elapsed+' 경과</div></div>'
        + '<button class="bay-end-top" onclick="endLiveSession(\''+bay.id+'\')">⏹ 종료</button></div>';
  // 세션 샷이 0개여도 오늘 이 타석 샷이 있으면 알려줌 — "샷이 사라졌나?" 혼란 방지
  // (카드는 이번 세션 시작 이후만 셈. 이전 샷은 아래 '최근 저장된 샷' 목록에 있음)
  var todayBayCnt = (S.shotEvents||[]).filter(function(s){ return s.bayId===bay.id && String(s.ts).slice(0,10)===today(); }).length;
  body += '<div class="bay-shots">'
        + (shots.length>0
            ? ('저장된 샷 <strong>'+shots.length+'</strong>개'
               + (silence!==null && silence>=30 ? ' · <span class="bay-silence">'+silence+'분간 없음</span>' : ''))
            : (todayBayCnt>0 ? '이번 수업 샷 없음 · 오늘 '+todayBayCnt+'개는 아래 목록에' : '아직 저장된 샷 없음'))
        + '</div>';

  // 레슨 모드 — '방금 친 샷' 을 베이카드 상단(회원 바로 아래)에 크게 띄움.
  // 페이지 아래쪽에 작게 보이던 문제 해결 + 새 샷은 _isNew 로 강조.
  var modeEarly = bayMode(bay.id, act);
  if(!stale && modeEarly==='lesson'){
    var psHTML = _buildPendingShotsHTML(bay.id);
    if(psHTML){ body += psHTML;
    }
  }
  // 수업 녹음 — 🎙 녹음하면 20초마다 아래에 글이 실시간으로 붙고, ⏹ 종료 시 자동 저장.
  // 변환 서버(Groq) 미설정이면 녹음 대신 메모 입력 안내 (헷갈리지 않게).
  var sttOff = (window._sttReady === false);
  if(!stale){
    if(recSupported() && _rec.bayId===bay.id){
      body += '<div class="rec-bar on"><span class="rec-dot"></span><span class="rec-label">녹음 중 <span id="rec-elapsed">'+_recElapsed()+'</span></span>'
            + '<button class="rec-stop" onclick="stopBayRec(\''+bay.id+'\')">⏹ 녹음 종료</button></div>'
            + '<div class="rec-live" id="rec-live-text">'+esc(((act._transcript||'').trim()).slice(-300)||'듣는 중... 말하면 20초 안에 글로 나타나요')+'</div>';
    } else if(act._sttBusy && act._sttBusyAt && Date.now()-act._sttBusyAt<90000){
      body += '<div class="rec-bar busy"><span class="rec-spin">🌀</span><span class="rec-label">마지막 조각 변환 중 · '+_cntdnHtml(act._sttBusyAt, 45)+'</span></div>';
    } else if(act._sttBusy){
      // 90초 넘게 "변환 중" 이면 뭔가 걸린 것 — 자동 해제(세션 종료 차단까지 풀림). 텍스트는 이미 있는 만큼 보존됨.
      delete act._sttBusy; delete act._sttBusyAt;
      try{save();}catch(e){}
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
  // 관찰용(타석 점검) 회원의 샷은 담당자·관리자 외의 샷 목록에 표시하지 않음
  if(!(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())){
    all = all.filter(function(s){ return !(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(s.memberId)); });
  }
  var assigned = all.filter(function(s){ return !(s._unassigned && !s.memberName); });
  var unassignedAll = all.filter(function(s){ return s._unassigned && !s.memberName; });
  var mockCount = (S.shotEvents||[]).filter(function(s){return s.source==='mock';}).length;
  var total = all.length;
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
        + _vidChip(s)
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
    targets.forEach(r2RemoveShotVideos);
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
    un.forEach(r2RemoveShotVideos);
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
