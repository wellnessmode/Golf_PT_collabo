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
// 날짜는 한국 시간으로 비교 — 예전엔 UTC 날짜라 오전 9시 전에 시작한 수업이 9시부터 '어제 세션'이 돼 자동 종료·녹음 차단됐다.
// 날짜가 바뀐 것만으로는 진행 중인 수업을 끊지 않는다 — 자동 종료 시간(SESSION_AUTO_END_HOURS, 기본 2시간)도 지나야 '어제 세션'
function _kstDay(ms){ return new Date(ms+9*3600000).toISOString().slice(0,10); }
function isStaleSession(act){
  if(!act || !act.startedAt) return false;
  var t=Date.parse(act.startedAt), now=Date.now();
  if(isNaN(t)) return String(act.startedAt).slice(0,10) < _kstDay(now);
  var minAge=((window.APP_CONFIG && APP_CONFIG.SESSION_AUTO_END_HOURS)||2)*3600*1000;
  return _kstDay(t) < _kstDay(now) && now-t >= minAge;
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

// 라이브 세션 활성 중 자동 폴링 — 새로고침 안 눌러도 새 샷 자동 표시.
// 폴링 시점에 이전 샷ID 들을 기억해 '새로 들어온 것' 만 _isNew 마킹 → 카드에 강조.
// 전송량 절약(B2 — 예전엔 4초마다 최근 샷 1000개를 통째로 다시 받아 화면 1대가 1시간에 25~85MB):
//  · 화면이 숨겨졌거나(폰 잠금·다른 앱) 이전 폴링이 아직 안 끝났으면 건너뜀
//  · 진행 중인 수업이 어디에도 없으면 30초 간격(타석 PC 는 수업이 켜진 타석의 샷만 올림), 있으면 4초
//  · 평소엔 진행 세션 + 최근 20분 샷만 받아 id 로 합치고, 전체(최근 1000개)는 5분마다·앱 시작·새로고침 때만
//    (다른 기기에서 지우거나 옮긴 20분 넘은 샷은 최대 5분 늦게 반영)
var _livePollTimer = null, _liveLastIds = null;
var LIVE_POLL_MS=4000, LIVE_IDLE_MS=30000, LIVE_WINDOW_MS=20*60000, LIVE_FULL_MS=5*60000;
var _livePoll = { busy:0, seq:0, lastAt:0 };
// 이 기기에서 방금 시작·종료한 수업 — 서버 저장이 끝나기 전에 보낸 확인(폴링) 답은 그 변화를 아직 모르므로, 그 답으로 되돌리지 않는다
// (예전엔 느린 와이파이에서 시작 저장보다 먼저 온 답이 방금 시작한 수업을 지워, 30초 가까이 샷이 미배정으로 쌓이고 '+ 회원 배정'이 다시 떴다)
// bayId → {sess:시작한 세션 | null, gone:종료한 세션, at:바꾼 시각, done:서버 저장 요청이 끝난 시각}
var _liveLocal = {};
function _liveLocalMark(bayId, sess, p, gone){
  var e={sess:sess||null, gone:gone||null, at:Date.now(), done:0}; _liveLocal[bayId]=e;
  Promise.resolve(p).then(function(){ e.done=Date.now(); }, function(){ e.done=Date.now(); });
}
// reqAt 에 보낸 요청의 진행 세션 답(remote) — 아직 서버에 닿지 않았을 수 있는 이 기기의 변화를 다시 얹는다. 저장이 끝난 뒤에 보낸 요청의 답(또는 1분 경과)부터는 서버를 따른다
function _liveLocalApply(remote, reqAt){
  remote=remote||{};
  Object.keys(_liveLocal).forEach(function(b){
    var e=_liveLocal[b];
    if((e.done && reqAt>e.done) || Date.now()-e.at>60000){ delete _liveLocal[b]; return; }
    var r=remote[b];
    if(e.sess){ if(!r || r.memberId!==e.sess.memberId || Date.parse(r.startedAt)!==Date.parse(e.sess.startedAt)) remote[b]=Object.assign({}, e.sess); }
    else if(e.gone && r && r.memberId===e.gone.memberId && Date.parse(r.startedAt)===Date.parse(e.gone.startedAt)) delete remote[b];   // 방금 끝낸 그 수업(다른 기기에서 새로 시작한 수업은 그대로)
  });
  return remote;
}
function startLivePolling(){
  try{ hbEnsure(); }catch(e){}   // 타석 PC 상태 신호(하트비트) — 60초마다, 화면이 보일 때만
  if(_livePollTimer) return;
  // 첫 회는 즉시
  _livePollTick(true);
  _livePollTimer = setInterval(_livePollTick, LIVE_POLL_MS);
  // 폰 백그라운드 갔다 오면 즉시 한 번 더
  if(!window._liveVisHook){
    window._liveVisHook = true;
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden && S.showLiveSession) _livePollTick(true);
    });
  }
}
function stopLivePolling(){
  if(_livePollTimer){ clearInterval(_livePollTimer); _livePollTimer=null; }
  _liveLastIds = null;
  _livePoll.busy = 0; _livePoll.seq++;   // 진행 중이던 폴링의 응답은 버린다(샷 삭제 직후 옛 샷이 되살아나지 않게)
}
// ===== 샷 영상 상태 칩 — 업로드 진행(%) 표시 + 준비되면 그 자리에서 바로 재생 =====
// 데이터가 먼저 오고 영상은 20~40초 뒤 붙는 구조라, 그 사이 "영상이 왜 없지?" 혼란 방지.
function _vidChip(s){
  var d = s.data||{};
  var key = d.videoMp4R2Key || d.videoDL || d.videoFO || s.videoR2Key;
  if (key){
    _vidWarm(key); if(d.videoFO && d.videoFO!==key) _vidWarm(d.videoFO);
    return '<button class="small-btn vid-view-btn" onclick="event.stopPropagation();openShotVideo(\''+safeId(s.id)+'\')">🎬 보기</button>';
  }
  if (d._videoPending){
    var t0 = s._rcvAt || Date.parse(d.measuredAt || s.ts) || 0;
    var el = t0 ? Date.now()-t0 : 0;
    if (t0 && el < 30*60000){
      // 90초까지는 추정 %(내장 카메라 변환·업로드 감안). 그 뒤로는 %가 97에서 멈춰 "거의 다 됐나?"
      // 오해를 부르므로 경과 시간을 그대로 보여준다 — 타석 PC 대기열이 밀린 상태가 눈에 보이게.
      // (구버전 에이전트는 원본을 통째로 올려 한 건에 수 분 → 연타 시 대기열 정체)
      if (el < 90000){
        var pct = Math.max(3, Math.round(el/90000*100));
        return '<span class="vid-uploading">🎞 <span class="vid-pct" data-t0="'+t0+'">'+pct+'%</span></span>';
      }
      var mins = Math.floor(el/60000);
      return '<span class="vid-uploading slow" title="타석 PC 에서 변환·업로드 대기 중">🎞 <span class="vid-pct" data-t0="'+t0+'">'+(mins<1?'처리 중':mins+'분째')+'</span></span>';
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
    box.innerHTML='<div class="pv-vm-novid"><div class="pv-vm-novid-t">'+msg+'<br><span style="font-size:11px;opacity:.75">'+sub+'</span><br><span style="font-size:9.5px;opacity:.5;word-break:break-all">'+esc(key||'')+'</span></div></div>';
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
// 진행률 틱커 — 1.5초마다 화면의 표시만 직접 갱신 (재렌더 없이). _vidChip 과 같은 규칙:
// 90초까지는 추정 %, 그 뒤로는 "N분째"(타석 PC 대기열 정체가 보이게).
function _vidPctText(t0){
  var el = Date.now()-t0;
  if (el < 90000) return Math.max(3, Math.round(el/90000*100)) + '%';
  var mins = Math.floor(el/60000);
  return mins<1 ? '처리 중' : mins+'분째';
}
if (!window.__vidPctTimer){
  window.__vidPctTimer = setInterval(function(){
    try{
      var els = document.querySelectorAll('.vid-pct[data-t0]');
      for (var i=0;i<els.length;i++){
        var t0 = parseInt(els[i].getAttribute('data-t0'),10)||0; if(!t0) continue;
        els[i].textContent = _vidPctText(t0);
        var p = els[i].parentNode;
        if (p && p.classList && Date.now()-t0 >= 90000) p.classList.add('slow');
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
      + '<video src="'+esc(r2.url(views[0].key))+'" crossorigin="anonymous" autoplay playsinline style="width:100%;max-height:76vh;max-height:calc(100dvh - 230px);border-radius:12px;background:#000"></video>'
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
  var html = '<div class="pending-shots big" data-bay-pending="'+safeId(bayId)+'"><div class="ps-title">⛳ '
        + (showAll?'이 수업 전체 샷 — 처음 친 샷부터':'방금 친 샷 — 비포/애프터로 저장')
        + '<span class="ps-count">'+all.length+'</span>'
        + (all.length>6||showAll ? '<button type="button" class="ps-showall" onclick="togglePsShowAll(\''+safeId(bayId)+'\')">'+(showAll?'최근만 보기':'전체 샷 ⏮')+'</button>' : '')
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
      actions = '<span class="ps-saved-badge '+(savedTag==='before'||savedTag==='after'?savedTag:'plain')+'">'+tagLabel+'</span>'
              + '<button class="ps-tag before" disabled>비포로 저장</button>'
              + '<button class="ps-tag after" disabled>애프터로 저장</button>'
              + '<button class="ps-cancel" onclick="cancelLessonShot(\''+safeId(s.id)+'\')">저장 취소</button>';
    } else {
      actions = '<button class="ps-tag before big" onclick="saveLessonShot(\''+safeId(s.id)+'\',\''+safeId(bayId)+'\',\'before\')">📌 비포로 저장</button>'
              + '<button class="ps-tag after big" onclick="saveLessonShot(\''+safeId(s.id)+'\',\''+safeId(bayId)+'\',\'after\')">✅ 애프터로 저장</button>'
              + '<button class="ps-drop" onclick="dropLessonShot(\''+safeId(s.id)+'\')">버림</button>';
    }
    html += '<div class="ps-card'+fresh+stateCls+'" data-shot="'+safeId(s.id)+'">'
          + '<div class="psc-hd"><span class="psc-club">'+esc(club)+'</span>'+_vidChip(s)+'<span class="psc-time">'+when+'</span></div>'
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
    // 0) 타석 카드 구성이 바뀜(다른 기기에서 수업 시작·종료, 회원 바뀜 등) → 아래 패치는 이미 그려진 수업 카드만 고치므로 전체 render
    //    (예전엔 빈 타석에 생긴 수업이 누가 화면을 누를 때까지 '비어있음'으로 남았다)
    if(_liveCardsStale()) return false;
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
        var _td2 = today();   // 샷 ts 는 UTC — 이 기기 날짜로 바꿔 비교 (오전 9시 전 샷이 빠지지 않게, v10.00)
        var todayCnt2 = (S.shotEvents||[]).filter(function(s){ return s.bayId===bayId && localDay(s.ts)===_td2; }).length;
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
      if(typeof _rec!=='undefined' && _rec.bayId===bayId) return;   // 이 기기에서 녹음 중 — 녹음을 마친 뒤에 (2시간 규칙과 같게)
      if(local && local._sttBusy && local._sttBusyAt && Date.now()-local._sttBusyAt<90000) return;   // 마지막 조각 변환 중
      var tx = local && (local._transcript||'').trim();
      var mid = (local||act).memberId, author=(local||act).author;
      delete src[bayId];
      if(S.activeSessions) delete S.activeSessions[bayId];
      try{ cloud.endActiveSession(bayId); }catch(e){}
      try{ logAudit('session','방치 세션 자동종료', act.memberName||'', {bay:bayId, startedAt:act.startedAt}); }catch(e){}
      console.warn('[live] 방치 세션 자동종료:', bayId, act.memberName, act.startedAt);
      if(tx && author===S.currentUser){
        try{ if(openVoiceDraft(mid, author, tx, (local||act).startedAt)) liveToastSafe('🎙 어제 세션의 녹음 전문을 일지 초안으로 복구했어요'); }catch(e){}   // 그 수업 날짜로
      }
    }
  });
}

// ============ 샷 자동 정리 · 세션 자동 종료 — 주기 실행 (A4·D6, v9.99) ============
// 예전엔 수업 센터를 연 뒤 첫 폴링에서 '앱 실행당 1번'만 돌아, 며칠씩 켜 두는 기기에선 미배정 샷(24시간)·미보관 영상(3일)이 쌓였고
// 아무도 수업 센터를 안 열면 끄지 않은 세션이 계속 켜져 있었다. → 서버 자료를 받은 직후(앱 시작·로그인), 30분마다, 앱으로 돌아올 때
// 다시 실행한다. 프로·트레이너·관리자 기기만(삭제는 멱등이라 여러 기기가 겹쳐도 안전). 화면이 숨겨졌거나 샷 수신 일시정지·일괄 삭제 중이면 건너뜀.
var SHOT_MAINT_MS = 30*60000;
var _maint = { busy:false, lastAt:0, pending:false };
function _maintRole(){ return S.currentRole==='pro' || S.currentRole==='trainer' || S.currentRole==='admin'; }
async function shotMaintTick(reason){
  if(!_maintRole() || typeof cloud==='undefined' || !cloud.enabled) return false;
  if(S.cloudSync==='loading'){ _maint.pending=true; return false; }   // 서버 자료를 받는 중 — 다 받으면(shotMaintAfterLoad) 바로
  if(S.cloudSync==='auth' || S._authNeedLoad || document.hidden) return false;
  var now = Date.now();
  if(reason==='timer' && now-_maint.lastAt < SHOT_MAINT_MS) return false;
  if(reason==='resume' && now-_maint.lastAt < 60000) return false;
  if((reason==='boot' || reason==='login') && _maint.lastAt && now-_maint.lastAt < 20000) return false;   // 방금 돌았음
  if(_maint.busy || (typeof shotPauseOn==='function' && shotPauseOn()) || window._shotsDeleting) return false;
  _maint.busy = true; _maint.lastAt = now; _maint.pending = false;
  try{
    try{ await delQueueRetry(); }catch(e){}            // 지난번에 못 지운 영상·행부터
    try{ await _maintActiveSessions(); }catch(e){}     // 어제 시작·2시간 넘은 세션 자동 종료
    try{ await purgeStaleUnassigned(); }catch(e){}     // 24시간 넘은 미배정 샷(행 + 영상)
    try{ await purgeOldShotVideos(); }catch(e){}       // 3일 지난 미보관 샷 영상(수치는 유지)
    try{ await purgeOldOrigVideos(); }catch(e){}       // 7일 지난 원본 영상
  } finally { _maint.busy = false; _maint.lastAt = Date.now(); try{ save(); }catch(e){} }
  return true;
}
// 앱 시작·새로고침이 서버 자료(라이브 포함)를 다 받은 직후 — 처음 받은 때, 또는 받는 사이에 로그인했을 때만
function shotMaintAfterLoad(){
  if(!_maint.pending && _maint.lastAt) return;
  setTimeout(function(){ shotMaintTick('boot'); }, 0);
}
try{
  setInterval(function(){ shotMaintTick('timer'); }, 60000);   // 1분마다 확인 → 30분 지났으면 실행 (폰이 잠들었다 깨도 밀리지 않게)
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) setTimeout(function(){ shotMaintTick('resume'); }, 1500); });
}catch(e){}
// 수업 센터가 닫혀 있어도 끄지 않은 세션을 자동 종료 — 열려 있으면 폴링이 매번 한다
async function _maintActiveSessions(){
  if(S.showLiveSession && _livePollTimer) return;
  var reqAt = Date.now();
  var a = await cloud.loadActiveSessions(); if(!a) return;
  a = _liveLocalApply(a, reqAt);   // 방금 이 기기에서 시작·종료한 수업이 서버에 닿기 전의 답이면 되돌리지 않게
  // 0개 = 잠긴 DB 에서 토큰이 안 먹혀도 이렇게 보인다 → 확인되기 전엔 이 기기의 진행 세션을 비우지 않음
  if(!Object.keys(a).length && Object.keys(S.activeSessions||{}).length && !(await _emptyAnswerTrusted())) return;
  if(S.showLiveSession && _livePollTimer) return;   // 그사이 수업 센터를 열었으면 폴링에 맡김
  autoEndStaleSessions(a);
  applyRemoteActive(a);
  autoEndOverdueSessions();
}

// 오래된 미배정 샷 자동 정리 (24시간 경과분) — 에이전트는 그대로 두고 앱이 노이즈를 스스로 청소.
// 회원에게 귀속된 샷은 절대 건드리지 않음. PC 원본 무관. 24시간 기준은 그대로(레슨 뒤 미배정 샷을 회원에게 넘길 시간).
// 후보는 서버에서 바로 찾는다 — 이 기기의 최근 1000개 목록 밖으로 밀린 옛 미배정 샷도, 그사이 다른 기기에서 배정된 샷도 정확히.
// 영상(R2) 먼저 → 다 지워진 샷만 행 삭제(A2). 고객 리포트가 쓰는 영상 파일은 남긴다(행만 정리).
async function purgeStaleUnassigned(){
  if(!_maintRole()) return 0;
  var now = Date.now(), cutoff = now - 24*3600*1000;
  var ow = (S.members||[]).filter(function(m){ return m && m.ownerWatch && safeId(m.id); }).map(function(m){ return m.id; });
  var rows = await cloud.staleShotRows(new Date(cutoff).toISOString(), ow);
  if(!rows || !rows.length) return 0;
  var stale = rows.filter(function(s){ return _staleWanted(s, now); });
  if(!stale.length) return 0;
  var keep = await cloud.reportStrings(); if(!keep) return 0;   // 리포트 목록을 못 받음 → 이번엔 지우지 않음
  var r = await delShotsRun(stale, {keep:keep, auto:'stale'});
  if(r.rows){
    console.warn('[live] 오래된 미배정 '+r.rows+'건 자동 정리');
    if(S.showLiveSession) liveToastSafe('🧹 오래된 미배정 '+r.rows+'개 자동 정리됨');
  }
  return r.rows;
}
// 24시간 넘은 미배정 샷 정리 규칙 (서버에서 방금 받은 샷 s 로 판단) — 대기열에서 다시 할 때도 같은 규칙으로 다시 판단한다(_delAutoRecheck)
function _staleWanted(s, now){
  if(!s) return false;
  var cutoff = now - 24*3600*1000;
  if(s.memberName){
    // 귀속된 샷 보호 — 단, 관찰용(타석 점검) 샷은 하루 지나면 행·영상 함께 정리
    // (점검용이라 기록 가치 없음 + 최근 샷 1000개 창을 잠식해 실회원 샷을 밀어냄)
    if(!(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(s.memberId))) return false;
    var actW=S.activeSessions[s.bayId];
    if(actW && actW.memberId===s.memberId) return false;   // 점검 세션 진행 중이면 보호
    if(s.data && s.data._kept) return false;               // 점검 중 [저장]한 샷은 리포트용 — 지우지 않음
  }
  // 원본 영상을 받은 샷(orig)은 원본 보관 기간(7일, purgeOldOrigVideos) 동안 행도 보호.
  // 요청만 걸린 샷(_origReq)은 PC 가 영영 응답 안 할 수도 있으니 요청 후 7일까지만 보호
  if(s.data && s.data.orig) return false;
  if(s.data && s.data._origReq==1 && now-(Date.parse(s.data._origReqAt||'')||0) < 7*24*3600*1000) return false;
  var act=S.activeSessions[s.bayId];   // 진행 중 레슨의 대기샷 보호 (그 세션 시작 뒤에 측정된 샷)
  if(act && !s.memberName && bayMode(s.bayId, act)==='lesson'){ var mt=Date.parse((s.data&&s.data.measuredAt)||s.ts), st=Date.parse(act.startedAt); if(!isNaN(mt) && !isNaN(st) && mt>=st-120000) return false; }
  var t = Date.parse(s.ts);
  return !isNaN(t) && t < cutoff;
}
// 3일 지난 미보관 샷 영상 정리 규칙 (prot: 회원별 최근 영상 보호 목록)
function _retentionWanted(s, prot, cutoff){
  if(!s) return false;
  if(s.data && s.data._kept) return false;                                   // 선별 저장 샷 보호
  if(prot[s.id]) return false;                                               // 회원별 최근 영상 보호
  if(!shotVideoKeys(s,'video').length) return false;                         // 영상 없는 샷
  var t = Date.parse(s.ts);
  return !isNaN(t) && t < cutoff;
}
// 대기열에 남은 자동 정리 작업(a: 'stale' 24시간 미배정 · 'keep' 3일 영상 · 'orig' 7일 원본)을 다시 하기 직전 — 그 샷을 서버에서 다시 읽고
// 고객 리포트 글자도 다시 받아 지금도 지울 대상인지 판단한다. 예전엔 처음 실패했을 때의 판단을 최대 30일 동안 그대로 다시 실행해, 그 사이
// 다른 기기에서 회원에게 배정·[저장]한 샷이나 고객 리포트가 쓰기 시작한 영상까지 지웠다(대기 중인 샷은 이 기기 화면에서도 숨겨져 알 수 없었음).
// 이제: 배정·저장된 샷의 작업은 버리고(샷이 다시 보임), 리포트·다른 샷이 쓰는 파일은 지우지 않는다. 확인하지 못하면 자동 작업은 이번엔 쉰다
async function _delAutoRecheck(jobs){
  var auto=(jobs||[]).filter(function(j){ return j && !j.x && j.a && j.id; });
  if(!auto.length) return jobs;
  var rows=await cloud.shotsByIds(auto.map(function(j){ return j.id; }), true);
  var rep=rows ? await cloud.reportStrings() : null;
  if(!rows || !rep) return jobs.filter(function(j){ return !(j && j.a && j.id); });
  var now=Date.now(), prot=_memberRecentVideoShotIds(8), oc=now-ORIG_VIDEO_KEEP_DAYS*24*3600*1000;
  auto.forEach(function(j){
    var s=rows[j.id], d=(s && s.data)||{};
    if(s){
      if(j.op==='del' && (d._kept || !_staleWanted(s, now))){ j.x=1; return; }      // 그 사이 회원에게 배정·저장됨 → 지우지 않음
      if(j.op==='clear' && (d._kept || prot[s.id])){ j.x=1; return; }               // 그 사이 [저장]됨
      if(j.op==='orig' && d.orig && !(Date.parse(d.orig.at) < oc)){ var cur=shotVideoKeys(s,'orig'); j.k=j.k.filter(function(k){ return cur.indexOf(k)===-1; }); }   // 새로 받은 원본은 그대로
    }
    var ex={}; ex[j.id]=1; var used=_keysInUse(ex);
    j.k=j.k.filter(function(k){ return !rep[k] && !used[k]; });                       // 리포트·다른 샷이 쓰는 파일은 남긴다
  });
  delQ.save();
  return jobs.filter(function(j){ return j && !j.x; });
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
// 프로·트레이너·관리자 기기 모두 실행 — 관리자 전용이던 시절엔 관리자가 수업 센터를
// 안 열면 미보관 영상이 무한 누적돼 R2 요금이 계속 나왔음(2026-08 청구서 135GB). R2 삭제는 멱등이라 여러 기기가 겹쳐도 안전.
// 영상을 먼저 지우고(A2) 지워진 키만 서버 행에서 비운다 — 못 지운 영상의 키는 그대로 남아(그 영상은 계속 재생됨) 다음 정리 때 다시.
// 고객 리포트가 쓰는 영상은 지우지 않는다(A6 — 날짜별 비포/애프터·클럽별 기록은 저장(_kept) 안 한 샷 영상도 쓴다).
async function purgeOldShotVideos(){
  if(!_maintRole()) return 0;
  var days = (window.APP_CONFIG && APP_CONFIG.SHOT_VIDEO_KEEP_DAYS) || 3;
  var cutoff = Date.now() - days*24*3600*1000;
  // 회원 귀속 샷은 "회원별 최근 8개(영상 보유)"를 태그 없이도 보호 — 비포/애프터를
  // 안 눌러도 리포트의 스윙 영상 캐러셀이 비지 않게 (2026-08-16 윤명숙 리포트 영상 0개 사고)
  var prot = _memberRecentVideoShotIds(8), busy = delQ.ids();
  var want = function(s){ return !!s && !busy[s.id] && _retentionWanted(s, prot, cutoff); };   // 이미 지우는 중인 샷은 빼고
  var cand = (S.shotEvents||[]).filter(want);
  if(!cand.length) return 0;
  // 지우기 직전에 서버 값으로 다시 확인 — 이 기기 목록은 몇 분~몇 시간 전 것이라, 그사이 다른 기기에서 [저장](_kept)했을 수 있다
  var fresh = await cloud.shotsByIds(cand.map(function(s){ return s.id; }));
  if(!fresh) return 0;
  var targets = cand.map(function(s){ return fresh[s.id]; }).filter(want);
  if(!targets.length) return 0;
  var rep = await cloud.reportStrings(); if(!rep) return 0;   // 리포트 목록을 못 받음 → 이번엔 지우지 않음
  var ids = {}; targets.forEach(function(s){ ids[s.id]=1; });
  var keep = _keysInUse(ids); Object.keys(rep).forEach(function(k){ keep[k]=1; });
  var jobs = targets.map(function(s){ var j=delJob(s.id, 'clear', shotVideoKeys(s,'video').filter(function(k){ return !keep[k]; })); j.a='keep'; return j; }).filter(function(j){ return j.k.length; });
  if(!jobs.length) return 0;
  var r = await delJobsRun(delQ.add(jobs));
  var n = r.done.filter(function(j){ return j.op==='clear'; }).length;
  if(n){
    try{ save(); }catch(e){}
    console.warn('[live] 보관정책: 미보관 샷 영상 '+n+'건 정리(데이터 유지)');
    if(S.showLiveSession) liveToastSafe('🎞 '+days+'일 지난 미보관 샷 영상 '+n+'개 자동 정리(수치는 유지)');
  }
  return n;
}
// 원본 영상(요청해서 PC 에서 올린 고화질 파일)은 7일 뒤 자동 삭제 — 원본은 크기가 커서
// 오래 두면 무료 용량을 잠식한다. 삭제 후 행은 일반 규칙(미배정 24h 등)으로 돌아간다. 파일을 먼저 지우고 다 지워지면 data.orig 를 비운다.
var ORIG_VIDEO_KEEP_DAYS = 7;
async function purgeOldOrigVideos(){
  if(!(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) return 0;   // 요청 주체 기기에서만
  var cutoff = Date.now() - ORIG_VIDEO_KEEP_DAYS*24*3600*1000, busy = delQ.ids(), jobs = [];
  (S.shotEvents||[]).forEach(function(s){
    var o=s.data && s.data.orig; if(!o || !o.at || busy[s.id]) return;
    var t=Date.parse(o.at); if(isNaN(t) || t>=cutoff) return;
    var j=delJob(s.id, 'orig', shotVideoKeys(s,'orig')); j.a='orig'; jobs.push(j);
  });
  if(!jobs.length) return 0;
  var r = await delJobsRun(delQ.add(jobs));
  var n = r.done.filter(function(j){ return j.op==='orig'; }).length;
  if(n){ try{ save(); }catch(e){} console.warn('[live] 원본 영상 보관기간 만료 '+n+'건 정리'); }
  return n;
}

// 서버에서 온 샷 s 에 이 기기 전용 표시(_rcvAt/_isNew/_uiSavedAt=저장됨 카드 상태)를 이어 붙인다
function _liveKeep(s, o){
  if(!o) return s;
  if(o._rcvAt) s._rcvAt=o._rcvAt; if(o._isNew) s._isNew=o._isNew; if(o._uiSavedAt) s._uiSavedAt=o._uiSavedAt;
  // 방금 보낸 원본 요청 플래그가 서버 반영 전 폴링 응답에 덮이지 않게 (60초 창)
  try{ if(o.data && o.data._origReq==1 && s.data && s.data._origReq!=1 && !s.data.orig && Date.now()-(Date.parse(o.data._origReqAt||'')||0)<60000){ s.data._origReq=1; s.data._origReqAt=o.data._origReqAt; } }catch(e){}
  return s;
}
// 전체(최근 1000개) 결과 → 그대로 교체 (서버에 없는 샷 = 지워진 샷). 삭제 대기열의 샷은 빼고(그 답이 대기열에 적히기 전에 받은 것일 수 있음)
function _liveMergeFull(live){
  var om={}, gone=delQ.ids('del'); (S.shotEvents||[]).forEach(function(s){ om[s.id]=s; });
  return (live.shotEvents||[]).filter(function(s){ return !gone[s.id]; }).map(function(s){ return _liveKeep(s, om[s.id]); });
}
// 최근 20분 창 결과 → id 로 합치기: 받은 샷은 새 값으로, 처음 보는 샷은 추가, 창 안쪽(5초 여유)인데 서버 답에 없는 샷·
// 콕 집어 물었는데 없는 샷은 다른 기기에서 지운 것으로 보고 뺀다. 창 밖의 샷은 그대로(5분마다 전체로 맞춤). 최근 1000개만 유지.
function _liveMergeWindow(live){
  var got={}, asked={}, out=[], gone=delQ.ids('del');
  (live.shotEvents||[]).concat(live.extra||[]).forEach(function(s){ if(!gone[s.id]) got[s.id]=s; });
  (live.ids||[]).forEach(function(id){ asked[id]=1; });
  var cut=Date.parse(live.since)+5000;
  (S.shotEvents||[]).forEach(function(o){
    var n=got[o.id];
    if(n){ out.push(_liveKeep(n, o)); delete got[o.id]; return; }
    var t=Date.parse(o.ts);
    if(live.complete && !isNaN(t) && t>=cut) return;
    if(asked[o.id]) return;
    out.push(o);
  });
  Object.keys(got).forEach(function(id){ out.push(got[id]); });
  out.sort(function(a,b){ return (Date.parse(a.ts)||0)-(Date.parse(b.ts)||0); });   // 오래된 → 최신 (전체 결과와 같은 순서)
  return out.length>1000 ? out.slice(out.length-1000) : out;
}
// 창(20분)보다 오래됐지만 지켜볼 샷 — 30분 안에 원본 영상을 요청한 샷(PC 가 올리면 ⬇ 버튼이 바로 뜨게 id 로 콕 집어 받음, 최대 20개)
function _liveWatchIds(now){
  var out=[];
  (S.shotEvents||[]).forEach(function(s){
    var d=s.data||{}; if(d._origReq!=1) return;
    var t=Date.parse(s.ts); if(!isNaN(t) && t>=now-LIVE_WINDOW_MS) return;   // 창 안이면 어차피 받음
    var at=Date.parse(d._origReqAt||''); if(isNaN(at) || now-at>30*60000) return;
    if(!safeId(s.id)) return;
    out.push(s.id);
  });
  return out.slice(-20);
}
// 이 창 결과를 적용하면 화면에서 뭔가 사라지나 (진행 세션 · 창 안의 샷 · 콕 집어 물은 샷)
function _liveWouldDrop(live){
  if(Object.keys(S.activeSessions||{}).length) return true;
  if(live.ids && live.ids.length) return true;
  var cut=Date.parse(live.since)+5000;
  return (S.shotEvents||[]).some(function(s){ var t=Date.parse(s.ts); return !isNaN(t) && t>=cut; });
}
async function _livePollTick(force){
  if(!S.showLiveSession) { stopLivePolling(); return; }
  if(!cloud || !cloud.enabled) return;
  if(document.hidden) return;   // 화면이 숨겨짐(폰 잠금·다른 앱) — 돌아오면 visibilitychange 가 바로 1번
  var now = Date.now();
  if(_livePoll.busy && now-_livePoll.busy < 25000) return;   // 이전 폴링이 아직 진행 중 (25초 넘게 안 끝나면 멈춘 것으로 보고 새로)
  if(typeof shotPauseOn==='function' && shotPauseOn()) return;
  if(window._shotsDeleting) return;   // 일괄 삭제 진행 중 — 서버 정리 전 재로드 금지
  var idle = !Object.keys(S.activeSessions||{}).length;
  if(!force && idle && now-_livePoll.lastAt < LIVE_IDLE_MS-LIVE_POLL_MS/2){
    // 진행 중인 수업이 없으면 샷 조회(큰 쪽)는 약 30초 간격 — 진행 세션(0~3행, 아주 작음)만 4초마다 확인해
    // 다른 기기·타석 아이패드에서 시작한 수업을 바로 알아챈다(예전엔 다음 30초 폴링까지 몰랐다). 찾으면 지금 바로 전체로 받는다
    var aseq = ++_livePoll.seq; _livePoll.busy = now;
    var a = null;
    try{ a = await cloud.loadActiveSessions(); }catch(e){}
    finally{ if(aseq===_livePoll.seq) _livePoll.busy = 0; }
    if(aseq!==_livePoll.seq || !a || !S.showLiveSession) return;
    if(!Object.keys(_liveLocalApply(a, now)).length) return;
    now = Date.now();
  }
  var seq = ++_livePoll.seq; _livePoll.busy = now; _livePoll.lastAt = now;
  try{
    var full = !_liveFullAt || now-_liveFullAt >= LIVE_FULL_MS;   // 5분마다 전체(최근 1000개), 그 사이엔 최근 20분 창
    var live = full ? await cloud.loadLive() : await cloud.loadLiveWindow(new Date(now-LIVE_WINDOW_MS).toISOString(), _liveWatchIds(now));
    if(!live || seq!==_livePoll.seq) return;   // 실패, 또는 그 사이 폴링을 멈췄다 다시 켬(옛 응답)
    live.activeSessions = _liveLocalApply(live.activeSessions||{}, now);   // 이 기기에서 방금 시작·종료한 수업이 서버에 닿기 전 답이면 되돌리지 않게
    if(!S.showLiveSession) return;  // 폴링 중 닫혔으면 무시
    if(window._shotsDeleting) return; // 폴링 요청이 삭제 시작 '전'에 나갔어도, 응답 적용은 차단
    // 모든 결과가 0행인데 화면에서 지울 게 있다 — 잠긴 DB 에서 토큰이 안 먹혀도 이렇게 보이므로 토큰부터 확인(무효면 비밀번호 창, 화면은 그대로)
    if(!full && live.empty && _liveWouldDrop(live)){
      if(!(await _emptyAnswerTrusted())) return;
      if(seq!==_livePoll.seq || !S.showLiveSession || window._shotsDeleting) return;
    }
    autoEndStaleSessions(live.activeSessions);  // 어제 켜두고 잊은 세션 자동 종료(서버 포함)
    // 변경 감지를 위해 ID 집합 / 활성세션 키 비교
    var prev = _liveLastIds;
    var hasNew = false;
    if(prev){
      var prevSet = {}; prev.forEach(function(id){prevSet[id]=true;});
      (live.shotEvents||[]).concat(live.extra||[]).forEach(function(s){ if(!prevSet[s.id]){ s._isNew = Date.now(); hasNew = true; } });
    }
    // 진행 수업 비교는 타석·회원·시작 시각까지 (같은 타석에서 회원만 바뀌어도 다시 그리게) — 적용한 뒤의 실제 상태로
    var actSig = function(){ var a=S.activeSessions||{}; return JSON.stringify(Object.keys(a).sort().map(function(b){ return b+'='+_bayCardSig(a[b]); })); };
    var actBefore = actSig();
    if(typeof applyRemoteActive==='function') applyRemoteActive(live.activeSessions); else S.activeSessions=live.activeSessions;
    var actAfter = actSig();
    // _isNew/_rcvAt/_uiSavedAt(저장됨 카드 상태) 보존하며 머지
    S.shotEvents = full ? _liveMergeFull(live) : _liveMergeWindow(live);
    if(full) _liveFullAt = Date.now();
    var curIds = S.shotEvents.map(function(s){return s.id;});
    var countChanged = !prev || curIds.length !== prev.length;
    // 영상 상태 변화 감지 — 데이터 먼저 오고 영상이 나중에 붙는 구조라, 영상 키/업로드중
    // 플래그가 바뀌면 재렌더해야 "업로드중 → 🎬 보기" 전환이 화면에 반영된다.
    var sigShots = S.shotEvents.slice(-80);
    if(!full && live.ids && live.ids.length){ var _ask={}; live.ids.forEach(function(id){ _ask[id]=1; }); S.shotEvents.forEach(function(s){ if(_ask[s.id] && sigShots.indexOf(s)===-1) sigShots.push(s); }); }   // 지켜보는(원본 요청) 샷의 변화도 화면에
    var vidSig = sigShots.map(function(s){
      var d=s.data||{}; return s.id+((d.videoMp4R2Key||d.videoDL)?'v':((d.videoFO||d.videoClub)?'f':(s.videoR2Key?'k':(d._videoPending?'p':'-'))))+(d.orig?'o':'')+(d._origReq==1?'r':'')+(d._origErr?'e':'');
    }).join('');
    var vidChanged = (window._liveLastVidSig!==undefined) && (window._liveLastVidSig!==vidSig);
    window._liveLastVidSig = vidSig;
    var changed = hasNew || (actBefore!==actAfter) || countChanged || vidChanged;
    _liveLastIds = curIds;
    autoEndOverdueSessions(); // 2시간 넘게 켜진 세션 자동 종료 — 이후 샷이 계속 귀속되는 것 차단
    if(typeof reconcileAgentShots==='function') reconcileAgentShots();
    // 24h+ 미배정·3일 지난 미보관 영상·7일 지난 원본 정리는 폴링이 아니라 shotMaintTick(앱 시작·로그인·30분마다·앱 복귀)이 한다
    // 변경 없으면 render 스킵 — 스크롤이 4초마다 위로 튀는 문제 해결
    if(!changed) return;
    try{save();}catch(e){}
    // 1) 부분 DOM 패치 — render 자체를 안 부르고 두 영역만 교체 (가장 매끈). 원본 영상 창이 열려 있으면 그 창도 바뀌어야 하므로 전체 render
    var patched = !S._origPanel && (typeof _patchLivePartials==='function') && _patchLivePartials();
    if(patched) return;
    // 2) 구조적 변경일 때 전체 render — render() 함수 자체가 스크롤 자동 보존
    render();
  }catch(e){ /* 네트워크 일시 오류 무시 — 다음 회차에 재시도 */ }
  finally{ if(seq===_livePoll.seq) _livePoll.busy = 0; }
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
  // 2) 폴링 정지(지울 목록을 대기열에 적기 전에 옛 샷이 다시 부활하지 않도록)
  var hadPoll = !!_livePollTimer;
  if(typeof stopLivePolling==='function') stopLivePolling();
  _liveLastIds = null;
  window._shotsDeleting = true;
  // 3) 서버의 샷 전부(화면 1000개 밖 포함)를 받아 영상부터 지우고, 영상이 다 지워진 샷만 행 삭제(A2)
  //    — 예전 '행 한 번에 전부 삭제'는 화면에 없던 샷의 영상을 주인 없는 파일로 남겼다
  var all = await cloud.shotRowsWhere(null);
  var p = delShotsRun(_shotListUnion(snapshot, all));   // 대기열에 적힌 뒤로는 폴링이 그 샷을 되살리지 않는다
  window._shotsDeleting = false;
  if(hadPoll && typeof startLivePolling==='function') setTimeout(startLivePolling, 1200);
  var r = await p;
  logAudit('session','샷 전체삭제','',{count:n, cloud:!!all, rows:r.rows, left:r.left});
  if(!all) liveToast('⚠️ 서버 삭제 실패 — 다시 시도해주세요','err');
  else if(r.left) liveToast(DEL_LATER_MSG,'err');
  else liveToast('✓ 전체 삭제 완료','ok');
}
// 이 기기 목록 + 서버 목록(있으면 서버 값 우선 — 영상 키가 최신)
function _shotListUnion(local, server){
  var m={}, out=[];
  (server||[]).concat(local||[]).forEach(function(s){ if(s && s.id && !m[s.id]){ m[s.id]=1; out.push(s); } });
  return out;
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
  if(!s.data) s.data={};
  var b4={memberId:s.memberId, memberName:s.memberName, author:s.author, pb:s._pendingBay, kept:s.data._kept, tag:s.data._tag};
  s.memberId=act.memberId; s.memberName=act.memberName; s.author=act.author; delete s._pendingBay;
  s.data._kept=1;   // 선별 저장 = 영상 영구 보관 (보관 정책에서 제외)
  if(tag==='before'||tag==='after') s.data._tag=tag;
  var mine=s._uiSavedAt=Date.now();   // 카드 유지 + "저장됨" 상태 표시용 (이 기기 한정)
  save();
  // 회원 배정 + 표시(_kept·_tag)만 서버에 — data 는 서버 값에 병합(A5). 실패하면 카드를 저장 전으로 되돌리고 '저장 실패 — 다시 눌러주세요'
  var set={_kept:1}; if(tag==='before'||tag==='after') set._tag=tag;
  _shotWrite(s.id, function(){ return cloud.updateShotData(s, set, null, {member_id:act.memberId, member_name:act.memberName}); }, function(cur){
    if(cur._uiSavedAt!==mine) return;   // 그사이 다시 누름(저장 취소 등) — 그 동작이 화면을 정한다
    cur.memberId=b4.memberId; cur.memberName=b4.memberName; cur.author=b4.author; if(b4.pb) cur._pendingBay=b4.pb; delete cur._uiSavedAt;
    if(!cur.data) cur.data={};
    if(b4.kept===undefined) delete cur.data._kept; else cur.data._kept=b4.kept;
    if(b4.tag===undefined) delete cur.data._tag; else cur.data._tag=b4.tag;
  });
  logActivity('레슨 샷 저장'+(tag?' ('+(tag==='before'?'비포':'애프터')+')':''), act.memberId, getBay(bayId).name+' · '+((s.data&&s.data.club)||''));
  render();
  liveToast('✓ '+act.memberName+'님에게 저장'+(tag?(tag==='before'?' — 📌 비포 영상':' — ✅ 애프터 영상'):''),'ok');
  try{ if(typeof autoPublishReport==='function') autoPublishReport(act.memberId, act.author||S.currentUser); }catch(e){}   // 고정 리포트 링크 자동 갱신 — 검토 담당 = 레슨 진행자
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
  var b4={memberId:s.memberId, memberName:s.memberName, author:s.author, ui:s._uiSavedAt, kept:s.data&&s.data._kept, tag:s.data&&s.data._tag};
  s.memberId=null; s.memberName=null; s.author=null;
  if(s.data){ delete s.data._tag; delete s.data._kept; }
  delete s._uiSavedAt;
  save();
  _shotWrite(s.id, function(){ return cloud.updateShotData(s, null, ['_tag','_kept'], {member_id:null, member_name:null}); }, function(cur){
    if(cur._uiSavedAt) return;   // 그사이 다시 저장함
    cur.memberId=b4.memberId; cur.memberName=b4.memberName; cur.author=b4.author; cur._uiSavedAt=b4.ui||Date.now();
    if(!cur.data) cur.data={};
    if(b4.kept!==undefined) cur.data._kept=b4.kept; if(b4.tag!==undefined) cur.data._tag=b4.tag;
  });
  render();
  liveToast('저장 취소됨 — 다시 선택할 수 있어요','ok');
}
// 샷 표시 저장(저장·저장 취소·원본 요청) 결과 확인 (A5) — 서버에서 실제로 바뀌었는지(바뀐 행 1개) 보고, 실패하면(네트워크·권한·그사이 삭제)
// 이 기기 화면을 누르기 전으로 되돌린 뒤 '저장 실패 — 다시 눌러주세요'. 예전엔 결과를 안 봐서 실패해도 '저장됨'으로 보였고 그 샷은
// 24시간 뒤 미배정으로 지워졌다. 같은 샷의 저장은 차례대로(저장 → 바로 취소를 눌러도 순서가 뒤집히지 않게).
var _shotWQ={};
function _shotWrite(id, run, revert){
  if(!(typeof cloud!=='undefined' && cloud.enabled)) return Promise.resolve(true);
  var prev=_shotWQ[id]||Promise.resolve();
  var p=prev.then(function(){ return run(); }).then(function(ok){ return !!ok; }, function(){ return false; }).then(function(ok){
    if(!ok){
      var cur=(S.shotEvents||[]).find(function(x){ return x.id===id; });   // 폴링이 그사이 샷 객체를 새로 바꿨을 수 있어 id 로 다시 찾는다
      if(cur){ try{ revert(cur); }catch(e){} }
      try{ save(); }catch(e){}
      try{ liveToast('저장 실패 — 다시 눌러주세요','err'); }catch(e){}
    }
    return ok;
  });
  _shotWQ[id]=p; p.then(function(){ if(_shotWQ[id]===p) delete _shotWQ[id]; });
  return p;
}
// 영상 삭제가 다 끝나지 않음(다음 정리 때 자동으로 다시) — 수업 센터 화면에서만 알림
function _delLaterToast(r){ if(r && r.left){ try{ if(S.showLiveSession) liveToast(DEL_LATER_MSG,'err'); }catch(e){} } return r; }
// 레슨 모드: 이 샷 버림 (화면+서버+R2 영상까지 제거 — 영상만 남는 고아 방지). 영상을 먼저 지우고 다 지워지면 서버 행(A2)
function dropLessonShot(shotId){
  var s=(S.shotEvents||[]).find(function(x){return x.id===shotId;});
  S.shotEvents=(S.shotEvents||[]).filter(function(x){return x.id!==shotId;});
  save();
  if(s) delShotsRun([s]).then(_delLaterToast, function(){});
  render();
}
function renderBayPickModal(){
  if(!S.liveBayPickFor) return '';
  var m=S.members.find(function(x){return x.id===S.liveBayPickFor;});
  if(!m) return '';
  var bays=(S.bays&&S.bays.length)?S.bays:BAYS_DEFAULT;
  return '<div class="modal-overlay" onclick="if(event.target===this)cancelBayPick()"><div class="modal">'
    + '<div class="modal-title">'+esc(m.name)+'님 — 어느 타석?</div>'
    + '<div class="baypick-grid">'
    + bays.map(function(b){
        var occ=S.activeSessions[b.id];
        // 관찰용(타석 점검) 세션은 담당자·관리자 외에는 빈 타석으로 표기 (조용히 인수됨)
        if(occ && typeof isOwnerWatchMember==='function' && isOwnerWatchMember(occ.memberId)
           && !(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) occ=null;
        // 사용 중인 타석도 누를 수 있음 — 앞 타임 세션 종료 확인 후 인수 (연속 레슨)
        return '<button class="baypick '+safeBayColor(b.color)+(occ?' occ':'')+'" onclick="pickBayForMember(\''+safeId(b.id)+'\')">'
          + '<span class="bp-name">'+esc(b.name)+'</span><span class="bp-sub">'+(occ?esc(occ.memberName)+' 진행중 · 종료 후 시작':'여기서 시작')+'</span></button>';
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
      if(!S.showAddSession && openVoiceDraft(memberId, author, tx, act.startedAt)){
        liveToastSafe('🎙 앞 세션의 녹음 전문을 일지 초안으로 복구했어요 — 저장 후 새 세션을 시작하세요');
      } else {
        S._lostTx=S._lostTx||[];
        S._lostTx.push({memberId:memberId, author:author, tx:tx, at:new Date().toISOString(), startedAt:act.startedAt});
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
  _liveLocalMark(c.bayId, sess, cloud.startActiveSession(c.bayId, sess));   // 저장이 끝나기 전의 폴링 답이 이 수업을 지우지 않게
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
        try{ openVoiceDraft(memberId, author, transcript, _bkAct.startedAt); }catch(e){}
      } else {
        // 이 기기에 전문이 없으면(다른 기기에서 녹음 등) 서버 백업에서 복구
        _fetchTranscriptBackup(bayId, _bkAct).then(function(bk){
          if(!bk) return;
          try{ if(openVoiceDraft(memberId, author, bk, _bkAct.startedAt)){ liveToastSafe('🎙 서버 백업에서 녹음 전문을 복구했어요 — 일지를 저장하세요'); render(); } }catch(e){}
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
  var rcNo = _rcRefusedId(act.memberId);   // 녹음·AI 정리 거부 회원 — 메모는 AI 없이 일지 칸으로
  var pendCnt = (typeof pendingShotsForBay==='function') ? pendingShotsForBay(bayId).length : 0;
  var msg = bay.name+' · '+act.memberName+'님 세션을 종료할까요?\n'
    + (hasVoice ? (rcNo ? '(메모를 세션카드에 옮겨요 — 녹음·AI 정리 거부 회원이라 AI 정리는 하지 않아요)' : '(받아쓴 내용을 AI가 세션카드로 정리합니다)') : '(세션 기록 카드가 열립니다 — 메모를 추가하고 저장하세요)')
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
  _liveLocalMark(bayId, null, cloud.endActiveSession(bayId), act);   // 종료 저장 전의 폴링 답이 이 수업을 되살리지 않게
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
    openVoiceDraft(memberId, author, transcript, _bkAct.startedAt);   // 자정을 넘긴 수업은 시작한 날짜로
    liveToast(rcNo ? '⏹ 세션 종료 — 메모를 세션카드에 옮겼어요, 확인 후 저장' : '🤖 AI가 세션카드를 정리했어요 — 확인 후 저장','ok');
  } else {
    // 음성 없음 → 회원 선택 후 빈 세션카드 모달 (수기 입력) — 날짜·시간은 메모 있는 초안과 같은 기준(_lessonWhen)
    S.selectedMember = memberId;
    var _w = _lessonWhen(_bkAct.startedAt);
    S.newSession = {date:_w.date, time:_w.time, author:author||S.currentUser||'', content:'', media:[], mediaUrls:['','']};
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
  render();
  // R2 영상(전 앵글)을 먼저 지우고, 다 지워지면 서버 행 — 확인문구대로 함께 제거(고아 방지, A2)
  delShotsRun([shot]).then(function(r){ if(r.left) _delLaterToast(r); else liveToast('🗑 샷 삭제됨','ok'); }, function(){});
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
// esc() 는 app_core.js 로 옮김 — 따옴표까지 이스케이프해 속성 값에도 안전 (v9.99)
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
  var segChunks=[], R=_rec;
  mr.ondataavailable=function(e){ if(e.data&&e.data.size) segChunks.push(e.data); };
  mr.onstop=function(){
    if(R.discard){ segChunks=[]; return; }   // 녹음 거부가 확인돼 버린 녹음 — 변환도 저장도 하지 않는다
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
    if(!tiny){ _handleSegment(blob, isFinal, R); }
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
    // 인증 헤더(공용 열쇠·로그인 토큰)를 붙여 읽는다 — 워커가 녹음 백업 읽기를 잠가도(REC_REQUIRE_AUTH=1) 복구가 끊기지 않게.
    // no-store: 브라우저 캐시의 옛 전문이 아니라 방금 올린 전문을 받기
    var res=await wFetch(r2.url(_recBackupKey(bayId, act)), {cache:'no-store'});
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
async function _handleSegment(blob, isFinal, R){
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
  if(R && R.discard) return;           // 그 사이 이 녹음을 버림(녹음 거부 확인) — 받은 글도 쓰지 않는다
  text=sttFilterHallucination(text);   // 무음 구간 환각 문장("자막 제공..." 등) 제거
  if(text){
    _rec.tx=((_rec.tx||'')+' '+text).trim();     // 녹음기 버퍼 — 폴링과 무관하게 절대 안 사라짐
    var act=S.activeSessions[bayId];
    if(act && _rec.mid && act.memberId!==_rec.mid) act=null;   // 그 사이 이 타석에 다른 회원 수업 — 그 회원 메모에 섞지 않는다(끝날 때 녹음한 회원 일지 초안으로)
    if(act){ act._transcript=_recFullText(); try{save();}catch(e){} _backupTranscript(bayId, act); }
    _recUpdateUI();   // render 없이 실시간 텍스트만 갱신
  }
  if(isFinal){ _finishRec(); }
}
// 녹음한 수업이 이미 끝났을 때 받아쓴 글 → 그 회원 일지 초안(지금 못 열면 보관했다가 다음 확인 때). 관찰용 회원은 아님
// startedAt = 그 수업(없으면 녹음) 시작 시각 — 초안 날짜·시간을 그 수업 기준으로
function _recRecover(mid, author, tx, startedAt){
  if(!mid || !tx || (typeof isOwnerWatchMember==='function' && isOwnerWatchMember(mid))) return false;
  try{ if(!S.showAddSession && openVoiceDraft(mid, author, tx, startedAt)){ liveToast('🎙 수업이 다른 곳에서 끝나 녹음 내용을 일지 초안으로 옮겼어요 — 저장해 주세요','ok'); return true; } }catch(e){}
  S._lostTx=S._lostTx||[]; S._lostTx.push({memberId:mid, author:author, tx:tx, at:new Date().toISOString(), startedAt:startedAt}); try{ save(); }catch(e){}
  liveToast('🎙 녹음 내용을 보관했어요 — 잠시 뒤 일지 초안으로 열어요','ok');
  return true;
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
  if(act && _rec.mid && act.memberId!==_rec.mid) act=null;   // 다른 회원 수업으로 바뀜
  var full=_recFullText();
  try{ localStorage.removeItem('golf_pt_rec_active'); }catch(e){}   // 녹음이 정상 마무리됨 — 자동 재개 마커 해제
  // 녹음하던 수업이 그 사이 다른 곳에서 끝났거나(이 기기에만 남겨 둔 수업 · _gone) 다른 회원 수업으로 바뀜 → 받아쓴 글을 녹음한 회원의 일지 초안으로
  if(!act || act._gone){
    var _mid=act ? act.memberId : _rec.mid, _au=act ? act.author : _rec.author, _tx=String(full||(act&&act._transcript)||'').trim();
    var _st=(act && act.startedAt) || (_rec.startedAt ? new Date(_rec.startedAt).toISOString() : '');   // 그 수업(없으면 녹음) 시작 — 초안 날짜용
    if(act){ delete S.activeSessions[bayId]; try{save();}catch(e){} act=null; }
    if(_tx && _mid){ _rec._lastBay=null; _rec._finishT0=null; _recRecover(_mid, _au, _tx, _st); try{ render(); }catch(e){} return; }
  }
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
    if(_rcRefusedId(act.memberId)){ try{ liveToast('🎙 녹음 거부 회원이라 녹음을 다시 시작하지 않았어요','err'); }catch(e){} return; }   // 그 사이 거부가 기록됨
    startBayRec(info.bayId);                                          // 마이크 권한은 이미 허용됨 — 제스처 없이 재개
    try{ liveToastSafe('🎙 중단됐던 녹음을 자동으로 다시 시작했어요 — 이전 내용은 저장돼 있습니다'); }catch(e){}
    try{ render(); }catch(e){}
  }catch(e){}
}
try{ setTimeout(resumeInterruptedRec, 4000); }catch(e){}   // 부팅(자동 로그인 복원) 후
// ---------- 녹음·AI 정리 동의 확인 (v9.99) ----------
// 🎙 수업 녹음 → 서버의 동의 기록을 잠깐 확인 → 동의: 바로 녹음 · 거부: 녹음 안 함(짧은 안내) · 기록 없음: 확인 창
// [오늘 구두 동의 받음 — 기록하고 녹음] [녹음 없이 진행] [취소]. 어떤 경우에도 레슨·샷 저장은 막지 않는다.
var _recSkip = {};   // 이 기기에서 '녹음 없이 진행'을 고른 타석 세션('타석|시작 시각') — 메모칸을 바로 펼친다
async function recStartAsk(bayId){
  var act=S.activeSessions[bayId]; if(!act){ liveToast('먼저 회원을 배정하세요','err'); return; }
  var mid=act.memberId, m=S.members.find(function(x){return x.id===mid;});
  if(m && m.ownerWatch) return startBayRec(bayId);                   // 관찰용(타석 점검) — 예전 그대로
  if(S._rcCheck || _rec.bayId) return;
  // 이 기기에 동의 기록이 있으면 누른 그 자리에서 바로 녹음(v9.98 처럼) — 서버 기록은 뒤에서 확인하고, 그 사이 다른 기기에서 거부가 적혔으면
  // 녹음을 멈추고 버린다(아무것도 변환·저장하지 않음). 예전엔 이 확인을 기다리느라 느린 와이파이에서 매번 2~2.5초 늦게 시작했다
  if(m && recConsentState(m)==='yes'){ _rcCheckBg(m, bayId); return startBayRec(bayId, mid); }
  S._rcCheck=bayId; try{ render(); }catch(e){}
  if(m){ try{ await _rcFresh(m, 2500); }catch(e){} }
  else {
    // 이 기기에 아직 없는 회원(인포데스크에서 방금 등록, 다른 기기에서 수업 시작) — 예전엔 확인 없이 바로 녹음했다. 서버에서 그 회원을 받아 판단한다
    var row=null; try{ row=await _rcFetchMember(mid, 2500); }catch(e){ row=null; }
    if(row && !S.members.some(function(x){ return x.id===row.id; }) && !(S.deletedMemberIds||{})[row.id]){ S.members.push(row); try{ save(); }catch(e){} }
    m=S.members.find(function(x){return x.id===mid;});
  }
  S._rcCheck=null;
  var now=S.activeSessions[bayId];
  if(!now || now.memberId!==mid){ try{ render(); }catch(e){} return; }   // 확인하는 사이 수업이 끝났거나 바뀜
  if(m && m.ownerWatch) return startBayRec(bayId);
  var st=m ? recConsentState(m) : '';
  if(st==='yes') return startBayRec(bayId, mid);
  if(st==='no'){ liveToast('🎙 녹음 거부 회원이에요 — 녹음 없이 진행해요','err'); try{ render(); }catch(e){} return; }
  S.recAsk={bayId:bayId, memberId:mid, name:(m?m.name:act.memberName)||''}; render();   // 기록 없음(서버에서도 못 받은 회원 포함) → 확인 창, 몰래 녹음하지 않는다
}
// 이 기기에 없는 회원을 서버에서 받기 — ms 까지만 기다림. 못 받으면 null
function _rcFetchMember(id, ms){
  if(typeof cloud==='undefined' || !cloud || !cloud.enabled) return Promise.resolve(null);
  var p=Promise.resolve(cloud.memberRow(id)).then(function(m){ return m||null; }, function(){ return null; });
  return Promise.race([p, new Promise(function(r){ setTimeout(function(){ r(null); }, ms||2500); })]);
}
// 동의 기록이 있어 바로 녹음한 뒤 — 서버의 동의 기록을 뒤에서 확인. 다른 기기에서 그 사이 거부가 적혔으면 이 녹음을 멈추고 버린다
function _rcCheckBg(m, bayId){
  if(!m || typeof cloud==='undefined' || !cloud || !cloud.enabled) return;
  Promise.resolve(cloud.memberData(m.id)).then(function(d){
    if(!d || !(_rcAt(d)>_rcAt(m))) return;
    _rcCopy(m, d); try{ save(); }catch(e){}
    if(recConsentState(m)==='no' && _rec.bayId===bayId && _rec.mid===m.id) _recDiscard(bayId, '🎙 녹음 거부가 기록된 회원이에요 — 녹음을 멈췄어요(저장하지 않음)');
    else { try{ render(); }catch(e){} }   // (마이크를 여는 중이었으면 startBayRec 이 거부를 보고 멈춘다)
  }, function(){});
}
// 녹음 버리기 — 녹음기·마이크를 멈추고, 이번 녹음의 조각은 변환·저장하지 않는다(메모는 녹음 전으로)
function _recDiscard(bayId, msg){
  if(_rec.bayId!==bayId) return;
  var R=_rec, act=S.activeSessions[bayId];
  R.discard=true; R.stopping=true;
  try{ localStorage.removeItem('golf_pt_rec_active'); }catch(e){}
  clearInterval(R.uiTimer); clearTimeout(R.segTimer); clearTimeout(R.autoStop);
  try{ if(R.wakeLock) R.wakeLock.release(); }catch(e){}
  try{ if(R.mr) R.mr.stop(); }catch(e){}
  try{ R.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
  if(act && (!R.mid || act.memberId===R.mid)){ act._transcript=R.txBase||''; delete act._sttBusy; delete act._sttBusyAt; try{ save(); }catch(e){} }
  R.tx=''; R.bayId=null; R.mr=null; R.stream=null; R._lastBay=null;
  try{ render(); }catch(e){}
  if(msg) liveToast(msg,'err');
}
function recAskCancel(){ S.recAsk=null; render(); }
function recAskSkip(){
  var q=S.recAsk; S.recAsk=null;
  var a=q && S.activeSessions[q.bayId]; if(a) _recSkip[q.bayId+'|'+(a.startedAt||'')]=1;
  liveToast('녹음 없이 진행해요 — 필요하면 메모칸에 적어 주세요','ok');
}
function recAskOral(){
  var q=S.recAsk; S.recAsk=null;
  if(!q){ try{ render(); }catch(e){} return; }
  // 창을 띄운 사이 타석의 수업이 끝났거나 다른 회원으로 바뀜 → 이 동의를 그 회원 것으로 적지도, 녹음하지도 않는다 (다시 눌러 확인)
  var a=S.activeSessions[q.bayId];
  if(!a || a.memberId!==q.memberId){ liveToast('타석의 회원이 바뀌었어요 — 다시 눌러 주세요','err'); try{ render(); }catch(e){} return; }
  // 이 기기에 아직 없는 회원(서버에서도 못 받음)이면 동의는 서버의 그 회원 행에만 적는다(행이 없으면 아무것도 만들지 않음)
  var m=S.members.find(function(x){return x.id===q.memberId;}), known=!!m;
  if(!m) m={id:q.memberId, name:q.name||a.memberName||''};
  m.recConsent=_rcToday(); m.recConsentHow='구두'; m.recConsentNo=''; m.recConsentBy=S.currentUser||''; m.recConsentAt=new Date().toISOString();
  try{ _rcLog(m); }catch(e){}
  try{ save(); }catch(e){}
  try{ syncConsentUp(m, !known); }catch(e){}   // 동의 칸만 서버에 (이 기기의 낡은 회원 정보로 다른 칸을 되돌리지 않게)
  try{ render(); }catch(e){}
  startBayRec(q.bayId, q.memberId);   // 같은 탭 안에서 바로 시작 — 마이크 권한 창이 막히지 않게
}
function renderRecAskModal(){
  var q=S.recAsk; if(!q) return '';
  var m=S.members.find(function(x){return x.id===q.memberId;});
  return '<div class="modal-overlay" onclick="if(event.target===this)recAskCancel()"><div class="modal rc-ask">'
    + '<div class="rc-ask-icon">🎙</div>'
    + '<div class="modal-title">녹음 동의가 기록되지 않은 회원</div>'
    + '<div class="rc-ask-msg"><b>'+esc(m?m.name:(q.name||''))+'</b>님은 녹음·AI 정리 동의 기록이 없어요.<br>녹음해도 되는지 여쭤 봐 주세요. 동의하지 않으셔도 레슨은 그대로 진행돼요.</div>'
    + '<div class="rc-ask-btns">'
    +   '<button class="btn primary" onclick="recAskOral()">오늘 구두 동의 받음 — 기록하고 녹음</button>'
    +   '<button class="btn" onclick="recAskSkip()">녹음 없이 진행</button>'
    +   '<button class="btn rc-ask-cancel" onclick="recAskCancel()">취소</button>'
    + '</div></div></div>';
}
// expectMid: 확인(동의 창 등)한 회원 — 그 사이 타석 회원이 바뀌었으면 녹음하지 않는다. 녹음 거부가 기록된 회원도 녹음하지 않는다(마이크를 여는 사이 포함)
async function startBayRec(bayId, expectMid){
  if(!recSupported()){ liveToast('이 기기는 녹음을 지원하지 않습니다','err'); return; }
  if(_rec.bayId){ liveToast('이미 '+getBay(_rec.bayId).name+'에서 녹음 중입니다','err'); return; }
  var act=S.activeSessions[bayId]; if(!act){ liveToast('먼저 회원을 배정하세요','err'); return; }
  var _bad=function(a){ return !a || a.memberId!==(expectMid||act.memberId) || _rcRefusedId(a.memberId); };
  if(_bad(act)){ liveToast(_rcRefusedId(act.memberId) ? '🎙 녹음 거부 회원이에요 — 녹음 없이 진행해요' : '타석의 회원이 바뀌었어요 — 다시 눌러 주세요','err'); try{ render(); }catch(e){} return; }
  try{
    var stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}});
    if(_rec.bayId || _bad(S.activeSessions[bayId])){ try{ stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} try{ render(); }catch(e){} return; }   // 마이크를 여는 사이 바뀜·거부 확인됨
    // txBase = 녹음 시작 전 이미 있던 메모, tx = 이번 녹음으로 쌓이는 텍스트(자체 버퍼) · mid/author = 녹음하는 수업의 회원·담당
    _rec={bayId:bayId, stream:stream, mr:null, chunks:[], startedAt:Date.now(), uiTimer:null, segTimer:null, wakeLock:null, stopping:false, segIdx:0, pendingStt:0, txBase:(act._transcript||'').trim(), tx:'', mid:act.memberId, author:act.author};
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
      var res=await wFetch(r2.workerUrl+'/stt',{method:'POST',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob,signal:ac?ac.signal:undefined});
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
    var res=await wFetch(r2.workerUrl+'/stt',{method:'POST',headers:{'Content-Type':'audio/mp4'},body:new Uint8Array(0)});
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
  if(cfg.AI_VIA_WORKER && wurl && (wkey || (cfg.R2_WORKER_URL && tokStore.token()))) return true; // 워커 프록시 (공용 열쇠 또는 로그인 토큰)
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
function _fetchT(url, opts, ms, fn){
  var ac=(typeof AbortController!=='undefined')?new AbortController():null;
  var t=ac?setTimeout(function(){ try{ac.abort();}catch(_){} }, ms||45000):null;
  var o=ac?Object.assign({},opts,{signal:ac.signal}):opts;
  return (fn ? fn(url,o) : fetch(url,o)).finally(function(){ if(t) clearTimeout(t); });   // fn = wFetch (저장 워커: 인증 헤더)
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
    // 워커 후보를 순서대로 시도: AI 전용 워커(AI_WORKER_URL) → R2 워커. 앞이 실패(미배포·404·
    // 통신오류·Anthropic 403 등)하면 다음으로 넘어간다. 2026-09-15 정우진 프로 기기에서
    // "워커 403: Request not allowed" 반복 — Anthropic 이 지원하지 않는 지역의 Cloudflare
    // 엣지에서 워커가 실행된 경우로, 스마트 배치를 켠 AI 전용 워커를 우선 경로로 둔다.
    var wbases=[];
    [cfg.AI_WORKER_URL, cfg.R2_WORKER_URL].forEach(function(b){ b=String(b||'').replace(/\/+$/,''); if(b && wbases.indexOf(b)===-1) wbases.push(b); });
    var wtok=tokStore.token();
    if(cfg.AI_VIA_WORKER && wbases.length && (wauth || wtok)){
      for(var wi=0; wi<wbases.length; wi++){
        // 저장 워커(R2_WORKER_URL)는 로그인 토큰도 받음 → 인증 헤더 공통 처리(wFetch). AI 전용 워커는 공용 열쇠만 알아서 예전처럼
        var viaR2=(typeof r2!=='undefined' && r2.enabled && wbases[wi]===r2.workerUrl);
        if(!viaR2 && !wauth) continue;
        try{
          var wurl=wbases[wi]+'/claude';
          var wres=await _fetchT(wurl,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':wauth||''},body:JSON.stringify(payload)},60000, viaR2?wFetch:null);
          var wbodyText=''; try{ wbodyText=await wres.text(); }catch(_){}
          if(wres.ok){
            var wj=null; try{ wj=JSON.parse(wbodyText); }catch(_){}
            var wt=parse(wj); if(wt) return wt;
            // 200인데 본문에 error(예: Anthropic {type:'error'})가 담겨오는 경우
            window.__aiLastError='워커 200이지만 응답 이상: '+String((wj&&wj.error&&(wj.error.message||wj.error.type))||wbodyText).slice(0,200);
          } else {
            var wmsg=wbodyText; try{ var we=JSON.parse(wbodyText); wmsg=(we.error&&(we.error.message||we.error.type))||we.detail||we.error||wbodyText; }catch(_){}
            if(wres.status===403 && /request not allowed/i.test(String(wmsg))){
              // Anthropic 지역 차단 — 워커가 실행된 엣지 위치 문제. 사용자가 할 일은 없고 재시도로 풀린다.
              window.__aiLastError='AI 서버 지역 차단(워커 403) — 잠시 후 자동 재시도됩니다. 계속되면 관리자에게 알려주세요';
            } else {
              window.__aiLastError='워커 '+wres.status+': '+String(wmsg).slice(0,200);
            }
            console.warn('[claude] worker http', wres.status, wurl, String(wbodyText).slice(0,200));
          }
        }catch(e){ window.__aiLastError='워커 통신 오류: '+(e&&e.message||e); console.warn('[claude] worker fail:', wurl, e&&e.message); }
        // 이 워커 실패 → 다음 후보로
      }
      // 모든 워커 실패 → 아래 직접 키 폴백 시도(있으면)
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

// 수업 일지의 날짜·시간 (v10.00) — 지난 날 시작한 수업(끄지 않은 채 다음 날 자동 종료·복구된 수업, 자정을 넘긴 수업)은 그 수업을 시작한
// 날·시각(30분 단위). 오늘 시작했거나 시작 시각을 모르면 예전처럼 오늘·지금. startedAt = ISO 시각 또는 ms
function _lessonWhen(startedAt){
  var td=today(), t=(startedAt==null||startedAt==='')?NaN:new Date(startedAt).getTime();
  if(isNaN(t) || localDay(t)>=td) return {date:td, time:nowHalfHour(), past:false, st:t};
  var d=new Date(t); return {date:localDay(t), time:String(d.getHours()).padStart(2,'0')+':'+(d.getMinutes()<30?'00':'30'), past:true, st:t};
}
// 종료 시: 구조화 + 트랙맨 요약 → 기존 세션카드 모달에 프리필 (트레이너 검토 후 저장)
// startedAt = 그 수업 시작 시각 — 복구 경로는 수업이 끝나고 몇 시간 뒤(다음 날 아침)에 초안을 열 수 있어서, 날짜·시간·샷 요약을 그 수업 기준으로
function openVoiceDraft(memberId, author, transcript, startedAt){
  var m=S.members.find(function(x){return x.id===memberId;});
  if(!m) return false;
  if(m.ownerWatch) return false;   // 관찰용 회원은 일지 초안 생성 안 함 (자동 종료·복구 경로 포함)
  var accessible=(S.currentRole==='admin'||S.currentRole==='infodesk')||(m.assignedTo&&m.assignedTo.indexOf(S.currentUser)!==-1);
  var authorOk=author===S.currentUser && INSTRUCTORS.some(function(i){return i.name===author;});
  if(!accessible || !authorOk) return false;
  // 그 수업 날(오늘 수업이면 오늘, 이 기기 날짜) 이 회원의 샷 — ts 는 UTC 라 이 기기 날짜로 바꿔 비교 (오전 레슨 샷이 빠지거나 전날 저녁 샷이 섞이지 않게, v10.00)
  // 지난 날 시작한 수업은 자정을 넘겨 친 그 수업의 샷(시작 2분 전 ~ 자동 종료 시간)도
  var _w=_lessonWhen(startedAt), _lim=((window.APP_CONFIG && APP_CONFIG.SESSION_AUTO_END_HOURS)||2)*3600000;
  var todayShots=S.shotEvents.filter(function(s){ if(s.memberId!==memberId) return false; if(localDay(s.ts)===_w.date) return true; if(!_w.past) return false; var t=new Date(s.ts).getTime(); return t>=_w.st-120000 && t<=_w.st+_lim; });
  var summary='';
  if(todayShots.length){
    var carries=todayShots.map(function(s){return parseFloat(s.data&&s.data.carry)||0;}).filter(Boolean);
    summary='\n\n[트랙맨] 저장된 샷 '+todayShots.length+'개'+(carries.length?' · 베스트 캐리 '+Math.max.apply(null,carries)+'yd':'');
  }
  S.showLiveSession=false; S.selectedMember=memberId; S.editSessionId=null;
  if(recConsentState(m)==='no'){
    // 녹음·AI 정리를 거부한 회원 (v9.99) — 메모를 그대로 일지 칸에 옮기고 AI 로 보내지 않는다(녹음 원문으로도 저장 안 함)
    S.newSession={ date:_w.date, time:_w.time, author:author, content:String(transcript||'').trim()+summary, media:[], mediaUrls:['',''], _tmSummary:summary };
    S.showAddSession=true;
    return true;
  }
  var localStructured=structureTranscript(transcript,author);
  var prefill=localStructured+summary;
  // rawTranscript = 받아쓴 전문(원문). 신뢰도 담보용 — 세션에 함께 저장, 화면에선 접어둠.
  S.newSession={ date:_w.date, time:_w.time, author:author, content:prefill, rawTranscript:(transcript||'').trim(), media:[], mediaUrls:['',''], _tmSummary:summary };
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
  if(_rcRefusedId(S.selectedMember)){ alert('녹음·AI 정리를 거부한 회원이에요.\nAI 정리를 하지 않으니 일지를 직접 정리해 주세요.'); return; }
  // 원문(rawTranscript)이 있으면 그걸로, 없으면(관리자 아닌 기기 등) 현재 메모 내용을 소스로 정리.
  if(!aiEnabled()){ alert('AI 정리가 설정되지 않았습니다.\n워커에 ANTHROPIC_API_KEY 시크릿을 등록하거나(권장), 관리자 모드의 AI 설정에서 키를 입력하세요.'); return; }
  // 소스: 기기 원문 → (수정 폼이면) 클라우드 원문을 그 순간만 읽기 → 본문 조각 폴백
  var srcP = (ns.rawTranscript && ns.rawTranscript.trim())
    ? Promise.resolve(ns.rawTranscript)
    : (S.editSessionId && typeof _aiSourceForSession==='function'
        ? _aiSourceForSession({ id:S.editSessionId, content:ns.content })
        : Promise.resolve(typeof _aiSourceFromContent==='function' ? _aiSourceFromContent(ns.content) : String(ns.content||'').trim()));
  ns._aiPending=true; ns._aiPendingAt=Date.now(); ns._aiFailed=false; render();
  srcP.then(function(src){
    if(!src){ ns._aiPending=false; alert('정리할 내용이 없습니다.'); render(); return null; }
    return aiSummarizeWithClaude(src, ns.author);
  }).then(function(better){
    if(better===null && !ns._aiPending) return;   // 소스 없음으로 위에서 종료
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
  html += _staleAgentWarnHTML(bays, isAdmin);
  if(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch()){
    html += '<div class="orig-bar"><button class="btn orig-open-btn" onclick="openOrigPanel()">🎞 원본 영상 요청 <small>최근 24시간 샷 · 고화질 원본 내려받기</small></button></div>';
  }
  html += '<div class="bay-grid">';
  bays.forEach(function(bay){ html += renderBayCard(bay, canCoach, isAdmin); });
  html += '</div>';
  html += renderShotLog(isAdmin);
  if(S.liveToast){ html += '<div class="live-toast '+(S.liveToast.kind==='err'?'err':'ok')+'">'+esc(S.liveToast.msg)+'</div>'; }
  html += '</div>';

  html += renderLiveStartModal();
  html += renderLiveConfirmModal();
  html += renderReassignModal();
  html += renderBayPickModal();
  html += renderClassPickModal();
  html += renderRecAskModal();
  html += renderOrigPanel();
  return html;
}

// ===== 원본 영상 요청 패널 — 담당자(타석 점검)·관리자 전용 =====
// 타석 PC 에는 트랙맨이 샷마다 고화질 원본(아이폰 측면·정면, 클럽 딜리버리, 내장캠)을 날짜별로
// 남긴다. 앱엔 폰 시청용 압축본만 올라오므로, 원본이 필요하면 여기서 샷을 골라 [원본 요청]
// → 그 타석 PC 에이전트가 원본 파일을 그대로 R2(orig/…)에 올리고 행에 data.orig 로 키를 남긴다
// → 이 패널에 ⬇ 버튼이 생긴다. 원본은 7일 뒤 자동 삭제(purgeOldOrigVideos).
function openOrigPanel(){ if(!(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) return; S._origPanel=true; if(!S._origBay) S._origBay='all'; render(); }
function closeOrigPanel(){ S._origPanel=false; render(); }
function setOrigBay(b){ S._origBay=b||'all'; render(); }
function _origShots(){
  var since=Date.now()-24*3600*1000, bayF=S._origBay||'all';
  return (S.shotEvents||[]).filter(function(s){
    if(s.source!=='agent') return false;
    if(bayF!=='all' && s.bayId!==bayF) return false;
    var t=Date.parse(s.ts); return !isNaN(t) && t>=since;
  }).sort(function(a,b){ return String(b.ts||'').localeCompare(String(a.ts||'')); });
}
function requestOrigVideo(sid){
  var s=(S.shotEvents||[]).find(function(x){return x.id===sid;}); if(!s) return;
  s.data=s.data||{};
  var b4={req:s.data._origReq, at:s.data._origReqAt, err:s.data._origErr};
  var at=new Date().toISOString();
  s.data._origReq=1; s.data._origReqAt=at; delete s.data._origErr;
  try{ save(); }catch(e){}
  _shotWrite(s.id, function(){ return cloud.updateShotData(s, {_origReq:1, _origReqAt:at}, ['_origErr']); }, function(cur){
    var d=cur.data||{}; if(d._origReqAt!==at) return;   // 그사이 다시 요청·취소함
    if(b4.req===undefined) delete d._origReq; else d._origReq=b4.req;
    if(b4.at===undefined) delete d._origReqAt; else d._origReqAt=b4.at;
    if(b4.err!==undefined) d._origErr=b4.err;
  });
  try{ logAudit('session','원본 영상 요청', s.memberName||'미배정', {bay:s.bayId, shotId:s.id}); }catch(e){}
  liveToastSafe('🎞 원본 요청 보냄 — 타석 PC 가 올리면 ⬇ 버튼이 생겨요 (보통 1~3분)');
  render();
}
function cancelOrigRequest(sid){
  var s=(S.shotEvents||[]).find(function(x){return x.id===sid;}); if(!s||!s.data) return;
  var b4={req:s.data._origReq, at:s.data._origReqAt};
  delete s.data._origReq; delete s.data._origReqAt;
  try{ save(); }catch(e){}
  _shotWrite(s.id, function(){ return cloud.updateShotData(s, null, ['_origReq','_origReqAt']); }, function(cur){
    var d=cur.data=cur.data||{}; if(d._origReq==1) return;   // 그사이 다시 요청함
    if(b4.req!==undefined) d._origReq=b4.req; if(b4.at!==undefined) d._origReqAt=b4.at;
  });
  render();
}
function _origFname(s, angle, key){
  var d=new Date(s.ts); var p=function(n){return ('0'+n).slice(-2);};
  var ext=((/\.(mkv|mov|mp4)$/i.exec(key||'')||[])[1]||'mp4').toLowerCase();
  return (getBay(s.bayId).name||s.bayId)+'_'+p(d.getMonth()+1)+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes())+'_'+angle+'.'+ext;
}
function renderOrigPanel(){
  if(!S._origPanel) return '';
  if(!(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) return '';
  var bays=(S.bays&&S.bays.length)?S.bays:BAYS_DEFAULT;
  var bayF=S._origBay||'all';
  var chips='<div class="orig-bays"><button class="chip'+(bayF==='all'?' on':'')+'" onclick="setOrigBay(\'all\')">전체</button>'
    + bays.map(function(b){ return '<button class="chip'+(bayF===b.id?' on':'')+'" onclick="setOrigBay(\''+safeId(b.id)+'\')">'+esc(b.name)+'</button>'; }).join('')+'</div>';
  var rows=_origShots();
  var ANG={dl:'측면',fo:'정면',club:'클럽',scene:'내장캠'};
  var list = rows.length===0 ? '<div class="empty-state">최근 24시간에 들어온 샷이 없습니다</div>'
    : '<div class="orig-list">'+rows.slice(0,150).map(function(s){
        var d=s.data||{}; var t=new Date(s.ts); var p=function(n){return ('0'+n).slice(-2);};
        var when=p(t.getMonth()+1)+'/'+p(t.getDate())+' '+p(t.getHours())+':'+p(t.getMinutes());
        var metric=(d._units&&d._units.dist==='m')||d._src==='trackman_io';
        var carry=d.carry!=null&&d.carry!==''?(Math.round((metric?parseFloat(d.carry):parseFloat(d.carry)*0.9144)*10)/10)+'m':'';
        var who=s.memberName?esc(s.memberName):'<span class="unassigned-tag">미배정</span>';
        // 앵글별 변환 진단(에이전트 v11+): 길이·fps·적용 배율 — 정면이 느리게 보일 때 원인을 바로 볼 수 있게
        var vm=d._vidMeta, vmTxt='';
        if(vm && typeof vm==='object'){
          vmTxt=['dl','fo','club'].filter(function(k){return vm[k];}).map(function(k){
            var m=vm[k]; var applied=(m.sp&&m.sp>1)?'·×'+m.sp:('·보정없음'+((m.cfg&&m.cfg>1)?'(요청 ×'+m.cfg+')':''));
            return ({dl:'측면',fo:'정면',club:'클럽'})[k]+' '+(m.dur!=null?m.dur+'s':'')+(m.fps?'·'+m.fps+'fps':'')+applied;
          }).join(' | ');
          if(vmTxt) vmTxt='<span class="orig-m" title="변환 진단: 파일 길이·fps·적용 배율">🎚 '+esc(vmTxt)+'</span>';
        }
        var st='', act='';
        var o=d.orig;
        if(o && (o.dl||o.fo||o.club||o.scene)){
          st='<span class="orig-st ok">✅ 원본 도착'+(o.at?' · '+new Date(o.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'')+'</span>';
          ['dl','fo','club','scene'].forEach(function(k){
            if(!o[k]) return;
            var mb=(o.bytes&&o.bytes[k])?' '+(o.bytes[k]/1e6).toFixed(0)+'MB':'';
            act+='<button class="small-btn" onclick="downloadShotVideo(this,'+jsq(r2.url(o[k]))+','+jsq(_origFname(s,k,o[k]))+')">⬇ '+ANG[k]+' 원본'+mb+'</button>';
          });
        } else if(d._origReq==1){
          var mins=d._origReqAt?Math.floor((Date.now()-Date.parse(d._origReqAt))/60000):0;
          st='<span class="orig-st">⏳ 요청됨 · '+(mins<1?'방금':mins+'분')+(mins>=10?' — PC 응답 없음(에이전트·구버전 확인)':'')+'</span>';
          act='<button class="small-btn" onclick="cancelOrigRequest(\''+safeId(s.id)+'\')">요청 취소</button>';
        } else if(d._origErr){
          st='<span class="orig-st err">⚠️ '+esc(String(d._origErr))+'</span>';
          act='<button class="small-btn" onclick="requestOrigVideo(\''+safeId(s.id)+'\')">다시 요청</button>';
        } else {
          act='<button class="small-btn primary" onclick="requestOrigVideo(\''+safeId(s.id)+'\')">🎞 원본 요청</button>';
        }
        return '<div class="orig-row"><div class="orig-hd"><span class="orig-t">'+when+'</span><span class="shot-bay '+safeBayColor(getBay(s.bayId).color)+'">'+esc(getBay(s.bayId).name)+'</span>'
          + '<span>'+esc(d.club||'')+'</span><span class="orig-m">'+carry+'</span><span class="orig-m">'+who+'</span>'+_vidChip(s)+st+'</div>'
          + (vmTxt?'<div class="orig-hd" style="margin-top:3px">'+vmTxt+'</div>':'')
          + (act?'<div class="orig-act">'+act+'</div>':'')+'</div>';
      }).join('')+'</div>';
  return '<div class="modal-overlay orig-panel" onclick="if(event.target===this)closeOrigPanel()"><div class="modal">'
    + '<div class="modal-title">🎞 원본 영상 요청 <small style="font-weight:600;color:var(--tx-3)">최근 24시간</small></div>'
    + '<div class="orig-note">타석 PC 에 저장된 고화질 원본(측면·정면·클럽·내장캠)을 요청하면 그 PC 에이전트가 올려줍니다. 보통 1~3분, 파일이 크면 더 걸려요. 원본은 <b>7일 뒤 자동 삭제</b>됩니다. 🎬 보기는 폰 시청용 압축본입니다.</div>'
    + chips + list
    + '<div class="modal-actions"><button class="btn" onclick="closeOrigPanel()">닫기</button></div>'
    + '</div></div>';
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
           return '<div class="live-member'+(blocked?' busy':'')+'" data-name="'+m.name.toLowerCase().replace(/"/g,'')+'" data-cho="'+cho.replace(/"/g,'')+'"'+(hide?' style="display:none"':'')+(blocked?'':' onclick="classPickMember(\''+safeId(m.id)+'\')"')+'>'
             + '<div class="member-avatar '+safeColor(m.color)+'">'+esc(initials(m.name))+'</div>'
             + '<div class="lm-name">'+esc(m.name)+'</div>'
             + (busyBay?'<span class="lm-busy">'+esc(getBay(busyBay).name)+' 진행중</span>':'')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeClassPick()">취소</button></div>'
    + '</div></div>';
}

// ============ 타석 PC 상태 신호 — 하트비트 (A3·D7 · v9.99) ============
// 타석 PC 에이전트(v12~)는 시작할 때와 5분마다 저장 워커에 hb/<타석>.json 을 올린다(버전·마지막 신호·트랙맨 최신 파일 나이·영상 대기 수 — 회원 정보 없음).
// 예전엔 PC 가 살아 있는지 원격으로 알 길이 없어, 고장 나면 레슨을 시작한 뒤 '샷이 안 뜬다'로 처음 알았다.
// 수업 센터가 화면에 보이는 동안(관리자는 대시보드에서도) 60초마다 읽어 타석 카드에 'PC 신호 n분 전 · v12 · 트랙맨 파일 n분 전 · 영상 대기 n'.
// 영업시간(07~23시, 한국 시간)에 15분 넘게 신호가 없으면 빨간색. 파일이 없으면(404 — 아직 v12 로 업데이트 안 한 PC) '신호 없음(구버전)'.
// 열쇠 없이 읽는 공개 파일이라 인증 헤더를 붙이지 않는다(붙이면 지금 워커 v1 의 CORS 에 막힘) · 캐시 금지(no-store + 매번 다른 주소).
// 파일 내용은 공용 열쇠로 누구나 쓸 수 있는 저장소에서 오므로 숫자만 꺼내 쓰고, 그 안의 글자는 화면에 넣지 않는다.
// 화면 갱신은 해당 칸만 고친다(render 안 함 — 메모 입력·스크롤이 60초마다 끊기지 않게).
var HB_POLL_MS = 60000, HB_TICK_MS = 5000, HB_RED_MIN = 15;
var _bayHb = { at:0, busy:0, seq:0, data:Object.create(null), loop:false };   // data[타석 id] = {st:'ok'|'none'|'err', j:하트비트, got}
function _hbBays(){ return ((S.bays && S.bays.length) ? S.bays : BAYS_DEFAULT).filter(function(b){ return b && safeId(b.id) && String(b.id).length<=40; }); }
function _hbWanted(){
  if(document.hidden || typeof r2==='undefined' || !r2.enabled || !S.currentRole) return false;
  return !!S.showLiveSession || (S.currentRole==='admin' && !S.selectedMember);   // 수업 센터 · 관리자 대시보드
}
// 수업 센터를 열 때·관리자 대시보드를 그릴 때 — 반복 확인을 (한 번만) 켜고 지금 받을 때가 됐으면 받는다
function hbEnsure(){
  if(!_bayHb.loop){
    _bayHb.loop=true;
    var loop=function(){ try{ hbTick(); }catch(e){} setTimeout(loop, HB_TICK_MS); };
    setTimeout(loop, HB_TICK_MS);
    try{ document.addEventListener('visibilitychange', function(){ if(!document.hidden) hbTick(); }); }catch(e){}
  }
  return hbTick();
}
async function hbTick(force){
  var seq=0;
  try{
    if(!_hbWanted()) return false;
    var now=Date.now();
    if(_bayHb.busy && now-_bayHb.busy<20000) return false;
    if(!force && _bayHb.at && now-_bayHb.at<HB_POLL_MS) return false;
    var bays=_hbBays(); if(!bays.length) return false;
    seq=++_bayHb.seq; _bayHb.busy=now; _bayHb.at=now;
    var res=await Promise.all(bays.map(function(b){ return _hbFetch(b.id); }));
    if(seq!==_bayHb.seq) return false;
    // 잠깐 못 읽었으면(네트워크·서버 오류) 직전에 받은 값을 그대로 두고, 마지막 읽기가 실패했다는 것만 적어 둔다(fail — 다음에 읽히면 사라짐)
    bays.forEach(function(b, i){ var r=res[i], old=_bayHb.data[b.id]; if(r.st==='err' && old && old.st!=='err'){ old.fail=r.got; return; } _bayHb.data[b.id]=r; });
    _bayHb.busy=0;
    _hbPatch();
    return true;
  }catch(e){ return false; }
  finally{ if(seq && seq===_bayHb.seq) _bayHb.busy=0; }
}
async function _hbFetch(id){
  try{
    var res=await fetch(r2.workerUrl+'/hb/'+encodeURIComponent(id)+'.json?t='+Date.now(), {cache:'no-store'});
    if(res.status===404) return {st:'none', got:Date.now()};
    if(!res.ok) return {st:'err', got:Date.now()};
    var j=await res.json();
    return (j && typeof j==='object' && !Array.isArray(j)) ? {st:'ok', j:j, got:Date.now()} : {st:'err', got:Date.now()};
  }catch(e){ return {st:'err', got:Date.now()}; }
}
function _hbNum(v){ if(v===null || v===undefined || v==='' || typeof v==='boolean' || typeof v==='object') return null; var n=Number(v); return isFinite(n) ? n : null; }
function _hbAgo(ms){ var m=Math.floor(ms/60000); if(m<1) return '방금'; if(m<60) return m+'분 전'; var h=Math.floor(m/60); if(h<48) return h+'시간 전'; return Math.floor(h/24)+'일 전'; }
function _hbBiz(ms){ var h=new Date(ms+9*3600000).getUTCHours(); return h>=7 && h<23; }   // 영업시간 07~23시 (한국 시간 — 기기 시간대와 무관)
function _hbKst(ms){ var d=new Date(ms+9*3600000), p=function(n){ return ('0'+n).slice(-2); }; return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes()); }
function _hbSkewMs(j){ var sk=_hbNum(j && j.clockSkewSec); return (sk!==null && Math.abs(sk)<7*86400) ? sk*1000 : 0; }   // 양수 = PC 시계가 빠름
function _hbTime(v){ return (typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) ? Date.parse(v) : NaN; }   // 에이전트가 쓰는 ISO 시각만 (아무 글자나 날짜로 읽지 않게)
// 하트비트를 보낸 시각(PC 시계 오차를 빼서 서버 시각으로) · 버전(숫자만)
function _hbAt(id){
  var d=_bayHb.data[id]; if(!d || d.st!=='ok') return null;
  var t=_hbTime(d.j.at); if(isNaN(t)) return null;
  var v=parseInt(d.j.ver,10);
  return {t:t-_hbSkewMs(d.j), v:(v>0 && v<10000) ? v : 0};
}
// 타석 하나의 표시 → {cls:'ok'|'late'|'red'|'none'|'err', txt} | null(아직 안 읽음) — 하트비트에 있는 칸만 보여 준다
function _hbInfo(id){
  var d=_bayHb.data[id]; if(!d) return null;
  if(d.st==='none') return {cls:'none', txt:'PC 신호 없음(구버전)'};
  var h=_hbAt(id); if(!h) return {cls:'err', txt:'PC 신호 확인 안 됨'};
  var j=d.j, now=Date.now(), age=Math.max(0, now-h.t), p=['PC 신호 '+_hbAgo(age)];
  if(h.v) p.push('v'+h.v);
  var tf=_hbNum(j.trackmanNewestFileAgeSec); if(tf!==null && tf>=0) p.push('트랙맨 파일 '+_hbAgo(tf*1000+age));
  var pv=_hbNum(j.pendingVideos); if(pv===null) pv=_hbNum(j.queueLen); if(pv!==null && pv>=0) p.push('영상 대기 '+Math.round(pv));
  var late=age>HB_RED_MIN*60000;
  // 이 기기가 신호를 못 읽는 중(이 기기의 와이파이 등)이면 예전 신호를 계속 나이 들게 해 '빨간색 — PC 고장'으로 보이지 않게, 확인 안 됨으로
  if(late && d.fail) return {cls:'err', txt:'PC 신호 확인 안 됨(이 기기 연결 확인)'};
  return {cls:late ? (_hbBiz(now) ? 'red' : 'late') : 'ok', txt:p.join(' · ')};
}
// 관리자 대시보드용 덧붙임 — 에이전트 시작(재시작) 시각 · 재시작 때 복구한 영상 작업 · PC 시계 오차 · 켜 둔 세션 상한
function _hbSub(id){
  var d=_bayHb.data[id]; if(!d || d.st!=='ok') return '';
  var j=d.j, out=[], sk=_hbNum(j.clockSkewSec), st=_hbTime(j.startedAt);
  if(!isNaN(st)) out.push('에이전트 시작 '+_hbKst(st-_hbSkewMs(j)));
  var rj=_hbNum(j.recoveredJobs); if(rj!==null && rj>0) out.push('복구한 영상 작업 '+Math.round(rj));
  if(sk!==null && Math.abs(sk)>=2 && Math.abs(sk)<7*86400){ var a=Math.round(Math.abs(sk)); out.push('PC 시계 '+(sk>0?'+':'-')+(a>=60 ? Math.floor(a/60)+'분'+(a%60?' '+(a%60)+'초':'') : a+'초')); }
  if(j.sessionExpired===true) out.push('켜 둔 세션 시간 초과 — 샷 수집 멈춤');
  return out.join(' · ');
}
function _hbLineHTML(id){
  if(!safeId(id) || String(id).length>40) return '';
  var h=_hbInfo(id);
  return '<div class="bay-hb'+(h?' '+h.cls:'')+'" data-hb="'+id+'">'+(h?esc(h.txt):'')+'</div>';
}
function _hbDashHtml(){
  var bays=_hbBays();
  if(!bays.length || typeof r2==='undefined' || !r2.enabled) return '';
  return '<div class="dash-card dash-hb-card"><h3>🖥 타석 PC 상태 <small>PC 에이전트가 5분마다 보내는 신호 · 영업시간(07~23시)에 15분 넘게 없으면 빨간색</small></h3>'
    + bays.map(function(b){
        var h=_hbInfo(b.id);
        return '<div class="hb-row"><span class="hb-bay">'+esc(b.name||b.id)+'</span>'
          + '<span class="bay-hb'+(h?' '+h.cls:'')+'" data-hb="'+b.id+'" data-hbph="확인 중…">'+(h?esc(h.txt):'확인 중…')+'</span>'
          + '<small class="hb-sub" data-hbsub="'+b.id+'">'+esc(_hbSub(b.id))+'</small></div>';
      }).join('')
    + '</div>';
}
// 받은 값으로 화면의 해당 칸만 고친다 (타석 카드 · 대시보드 카드 · 관리자 구버전 경고)
function _hbPatch(){
  try{
    var els=document.querySelectorAll('[data-hb]');
    for(var i=0;i<els.length;i++){
      var el=els[i], h=_hbInfo(el.getAttribute('data-hb'));
      el.className='bay-hb'+(h?' '+h.cls:'');
      el.textContent=h ? h.txt : (el.getAttribute('data-hbph')||'');
    }
    var subs=document.querySelectorAll('[data-hbsub]');
    for(var k=0;k<subs.length;k++) subs[k].textContent=_hbSub(subs[k].getAttribute('data-hbsub'));
    if(S.showLiveSession && S.currentRole==='admin'){
      var html=_staleAgentWarnHTML((S.bays && S.bays.length) ? S.bays : BAYS_DEFAULT, true), old=document.querySelector('.live-wrap .agent-stale');
      if(old){ if(html) old.outerHTML=html; else old.parentNode.removeChild(old); }
      else if(html){ var sub=document.querySelector('.live-wrap .live-sub'); if(sub) sub.insertAdjacentHTML('afterend', html); }
    }
  }catch(e){}
}

// 타석 PC 에이전트 구버전 경고 (관리자 기기만) — 에이전트를 고쳐도 그 PC 에서
// update.ps1 을 안 돌리면 반영되지 않는데, 예전엔 확인할 방법이 없어 "고쳤는데
// 왜 그대로냐"가 반복됐다. 최근 24시간 샷의 _agentVer 와 하트비트(v12~)의 버전 중 더 최근 것으로 판별한다
// (밤사이 업데이트한 PC 가 다음 샷까지 '구버전'으로 남지 않게). 구버전은 _agentVer 자체를 안 실어 보내므로 '없음'도 구버전.
var AGENT_VERSION_EXPECTED = 12;
function _staleAgentWarnHTML(bays, isAdmin){
  try{
    if(!isAdmin) return '';
    var since = Date.now() - 24*3600*1000;
    var latest = {};   // bayId → 가장 최근 근거 {t, v} (샷의 _agentVer 또는 하트비트 버전, 없으면 0)
    (S.shotEvents||[]).forEach(function(s){
      if(s.source!=='agent' || !s.bayId) return;
      var t=Date.parse(s.ts); if(isNaN(t) || t<since) return;
      if(latest[s.bayId] && latest[s.bayId].t>t) return;
      latest[s.bayId]={ t:t, v:(parseInt(s.data&&s.data._agentVer,10)||0) };
    });
    Object.keys(_bayHb.data).forEach(function(b){
      var h=_hbAt(b); if(!h || h.t<since) return;
      if(latest[b] && latest[b].t>h.t) return;
      latest[b]={ t:h.t, v:h.v };
    });
    var stale = Object.keys(latest).filter(function(b){ return latest[b].v < AGENT_VERSION_EXPECTED; });
    if(!stale.length) return '';
    return '<div class="agent-stale">⚠️ '+stale.map(function(b){ return esc(getBay(b).name)+(latest[b].v?' v'+latest[b].v:''); }).join(' · ')+' PC 에이전트가 구버전입니다 (최신 v'+AGENT_VERSION_EXPECTED+')<br>'
         + '<small>해당 타석 PC 에서 update.ps1 을 실행해주세요 — PC 상태 신호·중복 업로드 정리·재시작 영상 복구 등 최신 수정이 아직 적용되지 않았습니다</small></div>';
  }catch(e){ return ''; }
}

// 타석 카드에 보일 수업 — 관찰용(타석 점검) 세션은 담당자·관리자 외에는 빈 타석으로 보임 ([+ 회원 배정]을
// 누르면 조용히 인수되므로(_takeOverConfirm) 다른 직원에겐 막히지도, 드러나지도 않음)
function _bayCardAct(bayId){
  var act = S.activeSessions[bayId];
  if(act && typeof isOwnerWatchMember==='function' && isOwnerWatchMember(act.memberId)
     && !(typeof canSeeOwnerWatch==='function' && canSeeOwnerWatch())) act = null;
  return act || null;
}
// 카드를 그린 근거(회원·시작 시각·어제 세션·다른 곳에서 끝남) — 폴링이 부분 패치로 충분한지 판단할 때 그려진 카드와 비교
function _bayCardSig(act){ return act ? String(act.memberId||'')+'|'+String(act.startedAt||'')+(isStaleSession(act)?'|s':'')+(act._gone?'|g':'') : ''; }
// 그려진 타석 카드가 지금 상태와 다른가 (빈 타석에 수업이 생김·끝남·회원이 바뀜 등) → 부분 패치로는 못 그림
function _liveCardsStale(){
  var grid=document.querySelector('.bay-grid'); if(!grid) return false;
  var cards=grid.querySelectorAll('.bay-card'), bays=(S.bays && S.bays.length) ? S.bays : BAYS_DEFAULT;
  if(cards.length!==bays.length) return true;
  for(var i=0;i<bays.length;i++){
    var c=cards[i], drawn=c.classList.contains('active') ? (c.getAttribute('data-sig')||'') : '';
    if(drawn!==_bayCardSig(_bayCardAct(bays[i].id))) return true;
  }
  return false;
}
function renderBayCard(bay, canCoach, isAdmin){
  var act = _bayCardAct(bay.id);
  var typeLabel = bay.type==='lesson_only' ? '레슨 전용' : '연습 · 레슨';
  var head = '<div class="bay-card-hd '+safeBayColor(bay.color)+'"><span class="bay-name">'+esc(bay.name)+'</span><span class="bay-type">'+typeLabel+'</span></div>'
           + _hbLineHTML(bay.id);   // PC 신호 n분 전 · v12 · 트랙맨 파일 n분 전 · 영상 대기 n (하트비트)

  if(!act){
    var emptyBody = '<div class="bay-empty">'
      + '<div class="bay-empty-txt">비어있음</div>'
      + (canCoach ? '<button class="btn primary bay-assign-btn" onclick="openLiveStart(\''+safeId(bay.id)+'\')">+ 회원 배정</button>'
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
  if(act._gone){ body += '<div class="bay-stale">⏹ 다른 곳에서 끝난 수업이에요 — 녹음을 마치면 내용이 일지 초안으로 옮겨져요</div>'; }
  // 이름 옆 [종료] — 카드 맨 아래까지 스크롤하지 않고 바로 종료 (아래 큰 종료 버튼도 유지)
  // 회원 전화번호 — 녹음 화면에서 바로 보이게(정우진 프로 건의). 탭하면 전화.
  var _bm = S.members.find(function(x){return x.id===act.memberId;});
  var _phone = (_bm && _bm.phone && canCoach) ? String(_bm.phone).trim() : '';
  body += '<div class="bay-member"><div class="member-avatar '+safeColor(memberColor(act.memberId))+'">'+esc(initials(act.memberName))+'</div>'
        + '<div class="bay-member-info"><div class="bay-member-name">'+esc(act.memberName)+'님'
        + (_phone ? ' <a class="bay-phone" href="tel:'+_phone.replace(/[^0-9+]/g,'')+'" onclick="event.stopPropagation()">📞 '+esc(_phone)+'</a>' : '')
        + '</div>'
        + '<div class="bay-author '+roleCls+'">'+esc(act.author)+' · '+elapsed+' 경과</div></div>'
        + '<button class="bay-end-top" onclick="endLiveSession(\''+safeId(bay.id)+'\')">⏹ 종료</button></div>';
  // 수업 녹음 블록 — 회원 이름 "바로 아래"에 둔다(정우진 프로 건의: 녹음 버튼이 위쪽이면 좋겠다).
  // 예전엔 샷 카운트·'방금 친 샷' 아래에 있어 매번 스크롤해야 했다.
  // 🎙 녹음하면 20초마다 글이 실시간으로 붙고, ⏹ 종료 시 자동 저장.
  // 변환 서버(Groq) 미설정이면 녹음 대신 메모 입력 안내 (헷갈리지 않게).
  var sttOff = (window._sttReady === false);
  if(!stale){
    if(recSupported() && _rec.bayId===bay.id){
      body += '<div class="rec-bar on"><span class="rec-dot"></span><span class="rec-label">녹음 중 <span id="rec-elapsed">'+_recElapsed()+'</span></span>'
            + '<button class="rec-stop" onclick="stopBayRec(\''+safeId(bay.id)+'\')">⏹ 녹음 종료</button></div>'
            + '<div class="rec-live" id="rec-live-text">'+esc(((act._transcript||'').trim()).slice(-300)||'듣는 중... 말하면 20초 안에 글로 나타나요')+'</div>';
    } else if(act._sttBusy && act._sttBusyAt && Date.now()-act._sttBusyAt<90000){
      body += '<div class="rec-bar busy"><span class="rec-spin">🌀</span><span class="rec-label">마지막 조각 변환 중 · '+_cntdnHtml(act._sttBusyAt, 45)+'</span></div>';
    } else if(act._sttBusy){
      // 90초 넘게 "변환 중" 이면 뭔가 걸린 것 — 자동 해제(세션 종료 차단까지 풀림). 텍스트는 이미 있는 만큼 보존됨.
      delete act._sttBusy; delete act._sttBusyAt;
      try{save();}catch(e){}
    } else {
      // 녹음·AI 정리 동의 (v9.99) — 거부한 회원은 녹음 버튼 대신 짧은 안내(레슨·샷 저장은 그대로), 기록 없음은 녹음 전에 확인 창
      var rcNo = !!(_bm && !_bm.ownerWatch && recConsentState(_bm)==='no');
      if(rcNo){
        body += '<div class="rec-disabled rc-refused">🎙 녹음 거부 회원 — 녹음 없이 진행해요<br><small>동의가 바뀌면 회원 화면의 녹음 동의 배지에서 고쳐 주세요</small></div>';
      } else if(recSupported() && !_rec.bayId && !sttOff){
        body += (S._rcCheck===bay.id)
          ? '<button class="btn rec-start-btn" disabled>🎙 녹음 동의 확인 중…</button>'
          : '<button class="btn rec-start-btn" onclick="recStartAsk(\''+safeId(bay.id)+'\')">🎙 수업 녹음<small>말하면 실시간으로 글이 됩니다 · 종료 시 자동 저장</small></button>';
      }
      if(sttOff && !rcNo){
        body += '<div class="rec-disabled">🎙 음성→글 변환 서버가 아직 준비 안 됐어요.<br><b>아래 메모칸에 직접 입력</b>하거나, <b>키보드의 마이크 🎤</b>로 받아쓰기 하세요.<br><small>(관리자: 워커에 Groq 키 등록하면 실시간 녹음이 켜집니다)</small></div>';
      }
      // 메모칸 — 녹음 텍스트 확인·수정 + 직접 타이핑/키보드 받아쓰기 (항상 접근 가능)
      if((act._transcript||'').trim() || !recSupported() || sttOff || rcNo || _recSkip[bay.id+'|'+(act.startedAt||'')]){
        body += '<div class="voice-ios">'
              +   '<div class="vi-head">📝 수업 메모 <small>'+(rcNo?'(자동 저장 · 종료 시 일지로 · AI 정리 안 함)':'(자동 저장 · 세션 종료 시 AI 정리)')+'</small></div>'
              +   '<textarea class="vi-area" placeholder="'+(rcNo?'수업 내용을 직접 적어 주세요.':'수업 내용을 입력하거나 키보드 마이크 🎤 로 받아쓰세요.')+'" oninput="updateVoiceText(\''+safeId(bay.id)+'\',this.value)">'+esc(act._transcript||'')+'</textarea>'
              + '</div>';
      }
    }
  }
  // 세션 샷이 0개여도 오늘 이 타석 샷이 있으면 알려줌 — "샷이 사라졌나?" 혼란 방지
  // (카드는 이번 세션 시작 이후만 셈. 이전 샷은 아래 '최근 저장된 샷' 목록에 있음)
  var _tdB = today();   // ts(UTC) → 이 기기 날짜로 비교 (v10.00)
  var todayBayCnt = (S.shotEvents||[]).filter(function(s){ return s.bayId===bay.id && localDay(s.ts)===_tdB; }).length;
  body += '<div class="bay-shots">'
        + (shots.length>0
            ? ('저장된 샷 <strong>'+shots.length+'</strong>개'
               + (silence!==null && silence>=30 ? ' · <span class="bay-silence">'+silence+'분간 없음</span>' : ''))
            : (todayBayCnt>0 ? '이번 수업 샷 없음 · 오늘 '+todayBayCnt+'개는 아래 목록에' : '아직 저장된 샷 없음'))
        + '</div>';

  // 레슨 모드 — '방금 친 샷' 을 녹음 블록 아래에 크게 띄움. 새 샷은 _isNew 로 강조.
  var modeEarly = bayMode(bay.id, act);
  if(!stale && modeEarly==='lesson'){
    var psHTML = _buildPendingShotsHTML(bay.id);
    if(psHTML){ body += psHTML;
    }
  }
  var mode = modeEarly;
  if(!stale){
    if(mode==='lesson'){
      // 레슨 모드: 모드 토글만 여기 (샷 목록은 상단에 이미 표시됨)
      body += '<div class="bay-mode-row"><span class="bay-mode lesson">레슨 · 선별 저장</span>'
            + '<button class="mode-switch" onclick="setBayMode(\''+safeId(bay.id)+'\',\'practice\')">연습으로</button></div>';
      var hasPending = (typeof pendingShotsForBay==='function') && pendingShotsForBay(bay.id).length>0;
      if(!hasPending){
        body += '<div class="bay-auto">🎯 공을 치면 여기에 <strong>최근 샷</strong>이 떠요 — 좋은 것만 저장</div>';
      }
    } else {
      // 연습 모드: 자동 저장
      body += '<div class="bay-mode-row"><span class="bay-mode practice">연습 · 자동 저장</span>'
            + '<button class="mode-switch" onclick="setBayMode(\''+safeId(bay.id)+'\',\'lesson\')">레슨으로</button></div>';
      body += '<div class="bay-auto">🎯 공을 치면 트랙맨이 <strong>모두 자동 저장</strong>합니다</div>';
    }
  }
  body += '<div class="bay-actions">';
  body += '<button class="btn bay-end-btn" onclick="endLiveSession(\''+safeId(bay.id)+'\')">⏹ 종료</button>';
  body += '</div></div>';
  return '<div class="bay-card active" data-bay="'+safeId(bay.id)+'" data-sig="'+esc(_bayCardSig(act))+'">'+head+body+'</div>';
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
  // 기본 30개, [더 보기]로 30개씩 추가 — 연타 중엔 완료된 샷이 30개 밖으로 밀려 못 보던 문제
  var lim = Math.max(30, parseInt(S._shotLogLimit,10)||30);
  var shots = assigned.slice(0,lim);

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
        + (selMode?' onclick="toggleShotSel(\''+safeId(s.id)+'\')"':'')+'>'
        + (selMode?'<span class="shot-check">'+(checked?'☑':'☐')+'</span>':'')
        + '<span class="shot-bay '+safeBayColor(bay.color)+'">'+esc(bay.name)+'</span>'
        + '<span class="shot-member">'+(s.memberName?esc(s.memberName):'<span class="unassigned-tag">미배정</span>')+'</span>'
        + '<span class="shot-club">'+esc(d.club||'')+'</span>'
        + '<span class="shot-metric">'+carry+'</span>'
        + _vidChip(s)
        + '<span class="shot-time">'+_shotTimeLabel(s)+'</span>'
        + (s.source==='mock' ? '<span class="shot-mock">데모</span>' : '')
        + (!selMode && isAdmin ? '<button class="small-btn shot-move" onclick="openReassign(\''+safeId(s.id)+'\')">'+(unassigned?'배정':'이동')+'</button>' : '')
        + (!selMode && canCoach ? '<button class="small-btn del" onclick="deleteShot(\''+safeId(s.id)+'\')">삭제</button>' : '')
        + '</div>';
    }).join('') + '</div>';
    if(!selMode && assigned.length>lim){
      html += '<button class="shot-more-btn" onclick="showMoreShots()">▼ 더 보기 ('+Math.min(30, assigned.length-lim)+'개 · 남은 '+(assigned.length-lim)+'개)</button>';
    }
  }
  html += '</div>';
  return html;
}
function showMoreShots(){
  S._shotLogLimit = Math.max(30, parseInt(S._shotLogLimit,10)||30) + 30;
  if(typeof _patchShotLogOnly==='function' && _patchShotLogOnly()) return;
  if(typeof render==='function') render();
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
  // → 이 경우 서버의 샷 전부(화면 밖 포함)를 받아 영상부터 지우고 행까지 확실히 비운다.
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
  liveToastSafe(wipeAll ? '🗑 전체 삭제 중...' : '🗑 '+targets.length+'개 삭제 중...');
  // 2) 폴링 정지 → 영상(R2)부터 지우고, 영상이 다 지워진 샷만 서버 행 삭제(A2). 전부 삭제면 서버의 샷 전부(화면 밖 포함)를 받아서
  var hadPoll = !!_livePollTimer;
  if(typeof stopLivePolling==='function') stopLivePolling();
  _liveLastIds = null;
  window._shotsDeleting = true;
  var all = wipeAll ? await cloud.shotRowsWhere(null) : null;
  var p = delShotsRun(wipeAll ? _shotListUnion(targets, all) : targets);   // 대기열에 적힌 뒤로는 폴링이 그 샷을 되살리지 않는다
  window._shotsDeleting = false;
  if(hadPoll && typeof startLivePolling==='function') setTimeout(startLivePolling, 800);
  var r = await p;
  if(wipeAll && !all) liveToastSafe('⚠️ 서버 삭제 실패 — 다시 시도해주세요');
  else if(r.left) _delLaterToast(r);
  else liveToastSafe(wipeAll ? '✓ 전체 삭제 완료' : '✓ '+targets.length+'개 삭제됨');
}
async function purgeUnassignedShots(){
  var un = (S.shotEvents||[]).filter(function(s){ return s._unassigned && !s.memberName; });
  if(!un.length) return;
  if(!confirm('미배정 '+un.length+'개 삭제합니다.\n(트랙맨 PC 영상은 그대로)\n계속할까요?')) return;
  // 즉시 화면 갱신
  S.shotEvents = S.shotEvents.filter(function(s){ return !(s._unassigned && !s.memberName); });
  try{ save(); }catch(e){}
  if(typeof _patchShotLogOnly==='function') _patchShotLogOnly(); else render();
  liveToastSafe('🗑 미배정 '+un.length+'개 삭제 중...');
  // 영상(R2)부터 지우고, 영상이 다 지워진 샷만 서버 행 삭제(A2) — 대기열에 적힌 뒤로는 폴링이 그 샷을 되살리지 않는다
  var hadPoll = !!_livePollTimer;
  if(typeof stopLivePolling==='function') stopLivePolling();
  _liveLastIds = null;
  var p = delShotsRun(un);
  if(hadPoll && typeof startLivePolling==='function') setTimeout(startLivePolling, 1200);
  var r = await p;
  if(r.left) _delLaterToast(r); else liveToastSafe('✓ 미배정 '+un.length+'개 삭제됨');
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
    + '<div class="modal-title">'+esc(bay.name)+' — 회원 배정</div>'
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="filterPickRows(this.value,&apos;liveStartQuery&apos;)" autocomplete="off" autocorrect="off" autocapitalize="off"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">배정된 회원이 없습니다</div>'
       : '<div class="pick-empty empty-state" style="display:none">검색 결과 없음</div>'+list.map(function(m){
           var cho=getChosung(m.name);
           var hide=q&&m.name.toLowerCase().indexOf(q)===-1&&cho.indexOf(qcho)===-1;
           var busyBay = Object.keys(S.activeSessions).find(function(b){ return S.activeSessions[b].memberId===m.id; });
           return '<div class="live-member'+(busyBay?' busy':'')+'" data-name="'+m.name.toLowerCase().replace(/"/g,'')+'" data-cho="'+cho.replace(/"/g,'')+'"'+(hide?' style="display:none"':'')+(busyBay?'':' onclick="pickLiveMember(\''+safeId(m.id)+'\')"')+'>'
             + '<div class="member-avatar '+safeColor(m.color)+'">'+esc(initials(m.name))+'</div>'
             + '<div class="lm-name">'+esc(m.name)+'</div>'
             + (busyBay ? '<span class="lm-busy">'+esc(getBay(busyBay).name)+' 진행중</span>' : '')
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
    + '<div class="live-confirm-bay '+safeBayColor(bay.color)+'">'+esc(bay.name)+'</div>'
    + '<div class="live-confirm-msg"><strong>'+esc(c.memberName)+'</strong>님 레슨을<br>'+esc(bay.name)+'에서 시작합니다.</div>'
    + memberStatusWarn(c.memberId)
    + '<div class="live-confirm-warn">⚠️ '+esc(bay.name)+'이(가) <strong>비어있는지 직접 확인</strong>하셨습니까?<br><span class="lcw-sub">다른 회원이 연습 중인 타석이면 안 됩니다.</span></div>'
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
    + '<div class="modal-title">굿샷 재할당 — 현재 「'+esc(shot.memberName)+'」</div>'
    + '<div class="form-group"><input class="form-input live-search-input" placeholder="옮길 회원 검색..." value="'+q.replace(/"/g,'&quot;')+'" oninput="filterPickRows(this.value,&apos;liveStartQuery&apos;)" autocomplete="off" autocorrect="off" autocapitalize="off"></div>'
    + '<div class="live-member-list">'
    + (list.length===0 ? '<div class="empty-state">회원이 없습니다</div>'
       : '<div class="pick-empty empty-state" style="display:none">검색 결과 없음</div>'+list.map(function(m){
           var cho=getChosung(m.name);
           var hide=q&&m.name.toLowerCase().indexOf(q)===-1&&cho.indexOf(qcho)===-1;
           return '<div class="live-member'+(m.id===shot.memberId?' busy':'')+'" data-name="'+m.name.toLowerCase().replace(/"/g,'')+'" data-cho="'+cho.replace(/"/g,'')+'" onclick="applyReassign(\''+safeId(m.id)+'\')"'+(hide?' style="display:none"':'')+'>'
             + '<div class="member-avatar '+safeColor(m.color)+'">'+esc(initials(m.name))+'</div>'
             + '<div class="lm-name">'+esc(m.name)+'</div>'
             + (m.id===shot.memberId ? '<span class="lm-busy">현재</span>' : '')
             + '</div>';
         }).join(''))
    + '</div>'
    + '<div class="modal-actions"><button class="btn" onclick="closeReassign()">취소</button></div>'
    + '</div></div>';
}
