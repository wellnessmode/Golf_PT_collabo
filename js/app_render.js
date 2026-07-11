// 랜딩 2단계: 브랜드/사진 랜딩 → [입장하기] → 로그인(역할 선택)
function enterHero(){ S.heroEntered=true; render(); try{ var c=document.querySelector('.role-hero'); if(c) c.scrollTop=c.scrollHeight; }catch(e){} }
function exitHero(){ S.heroEntered=false; render(); }
function renderRoleSelector(){
  var root=document.getElementById('root');
  var pros=INSTRUCTORS.filter(function(i){return i.role==='pro';});
  var trainers=INSTRUCTORS.filter(function(i){return i.role==='trainer';});
  var brand=APP_BRAND;
  var heroImgs=(brand.heroImages||[]).filter(Boolean);
  var _tp=String(brand.name||'').trim().split(/\s+/);
  var titleHtml=_tp.length>1 ? (_tp.slice(0,-1).join(' ')+' <span>'+_tp.slice(-1)[0]+'</span>') : (brand.name||'');
  // 시네마틱 배경은 항상 베이스로 깔고, 사진은 그 위에 겹침 —
  // 사진 URL 이 죽거나 느려도 빈 화면 없이 프리미엄 배경이 유지된다.
  var photosHtml = heroImgs.length
    ? '<div class="hero-photos" id="hero-photos">'+heroImgs.map(function(u,i){return '<div class="hero-photo'+(i===0?' on':'')+'" style="background-image:url(\''+String(u).replace(/'/g,'%27')+'\')"></div>';}).join('')+'</div>'
    : '';
  var bgHtml = '<div class="hero-cine">'
      +'<svg class="hero-arc" viewBox="0 0 400 780" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
      +'<defs><linearGradient id="haArc" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#00d29a" stop-opacity="0.04"/><stop offset="50%" stop-color="#00d29a" stop-opacity="0.85"/><stop offset="100%" stop-color="#3f7bff" stop-opacity="0.08"/></linearGradient></defs>'
      +'<path d="M-40,820 Q150,140 480,330" fill="none" stroke="url(#haArc)" stroke-width="2.6" stroke-linecap="round"/>'
      +'<path d="M-40,842 Q180,235 480,432" fill="none" stroke="rgba(0,210,154,0.16)" stroke-width="1.4" stroke-dasharray="2 9" stroke-linecap="round"/>'
      +'<path d="M-40,864 Q210,330 480,520" fill="none" stroke="rgba(63,123,255,0.11)" stroke-width="1.2" stroke-dasharray="2 12"/>'
      +'<circle cx="150" cy="384" r="3.4" fill="#00d29a"/><circle cx="150" cy="384" r="12" fill="none" stroke="rgba(0,210,154,0.32)" stroke-width="1"/>'
      +'</svg></div>';
  var roleBtn=function(cls,role,user,title,desc){
    return '<button class="hero-role '+cls+'" onclick="setRole(\''+role+'\',\''+user+'\')"><span class="hr-txt"><span class="hr-title">'+title+'</span>'+(desc?'<span class="hr-desc">'+desc+'</span>':'')+'</span><span class="hr-arrow">→</span></button>';
  };
  root.innerHTML=`<div class="role-hero">
    <div class="hero-bg">${bgHtml}${photosHtml}</div>
    <div class="hero-scrim"></div>
    <div class="hero-top">
      <div class="hero-wordmark">${titleHtml}<i>${(brand.sub||'').replace(/&/g,'&amp;')}</i></div>
      <button class="hero-ver" onclick="var n=this.closest('.role-hero').querySelector('.update-notice');if(n){n.classList.toggle('open');n.scrollIntoView({behavior:'smooth',block:'end'});}">${APP_VERSION.version}</button>
    </div>
    <div class="hero-content${S.heroEntered?' entered':''}">
      <div class="hero-kicker">GOLF × FITNESS · POWERED BY ${brand.measuredBy||'TRACKMAN'}</div>
      <h1 class="hero-title">${titleHtml}</h1>
      <p class="hero-copy">${(brand.heroCopy||'').replace(/</g,'&lt;')}</p>
      ${S.heroEntered ? `
      <div class="hero-roles">
        <div class="hero-rgroup"><span class="hero-rlabel">센터 관리</span>${roleBtn('rc-infodesk','infodesk','인포데스크','인포데스크','회원 등록 · 관리')}</div>
        <div class="hero-rgroup"><span class="hero-rlabel">골프 프로</span>${pros.map(function(inst){return roleBtn('rc-pro','pro',inst.name,inst.name,'');}).join('')}</div>
        <div class="hero-rgroup"><span class="hero-rlabel">골프 PT</span>${trainers.map(function(inst){return roleBtn('rc-trainer','trainer',inst.name,inst.name,'');}).join('')}</div>
        <div class="hero-rgroup"><span class="hero-rlabel">시스템</span>${roleBtn('rc-admin','admin','관리자','관리자','관리자 모드')}</div>
      </div>
      <button class="hero-back" onclick="exitHero()">← 처음으로</button>
      ` : `
      <button class="hero-enter" onclick="enterHero()">입장하기<span>→</span></button>
      <div class="hero-enter-hint">담당자 계정으로 로그인</div>
      `}
      <div class="update-notice collapsed">
        <div class="update-head" onclick="this.parentElement.classList.toggle('collapsed')">
          <span>${APP_VERSION.version} · ${APP_VERSION.date} · 업데이트 내역</span>
          <span class="update-chevron">▾</span>
        </div>
        <ul class="update-list">${APP_VERSION.changes.map(function(c){return '<li>'+c+'</li>';}).join('')}</ul>
      </div>
    </div>
  </div>${S.showPwModal?'<div class="modal-overlay" onclick="if(event.target===this)cancelPassword()"><div class="modal pw-modal" style="width:340px"><div class="modal-title" style="text-align:center">🔒 '+(S.pendingRole?S.pendingRole.user:'')+'</div>'+(bio.available&&S.pendingRole&&bio.isRegistered(S.pendingRole.role,S.pendingRole.user)?'<button class="btn bio-btn"'+(S.bioBusy?' disabled':'')+' onclick="bioLoginNow()">'+(S.bioBusy?'🔓 인증 중...':'🆔 Face ID · 지문으로 로그인')+'</button><div class="pw-divider"><span>또는 비밀번호</span></div>':'')+'<div class="form-group"><label class="form-label">비밀번호</label><input class="form-input" type="password" placeholder="비밀번호를 입력하세요" oninput="S.pwInput=this.value" onkeydown="if(event.key===\'Enter\')submitPassword()" autofocus></div>'+(S.pwError?'<div style="color:#993c1d;font-size:12px;margin-bottom:10px;text-align:center">비밀번호가 일치하지 않습니다</div>':'')+(S.bioError?'<div style="color:#993c1d;font-size:11.5px;margin-bottom:10px;text-align:center">'+S.bioError+'</div>':'')+(!bio.available?'<label class="pw-trust"><input type="checkbox" '+(S.trustDevice?'checked':'')+' onchange="S.trustDevice=this.checked"><span>이 기기에서 자동 로그인<small>다음부터 비밀번호 없이 바로 입장 (스튜디오 공용 기기용)</small></span></label>':'')+'<div class="modal-actions"><button class="btn" onclick="cancelPassword()">취소</button><button class="btn primary" onclick="submitPassword()">확인</button></div></div></div>':''}${S.bioEnrollFor?'<div class="modal-overlay"><div class="modal" style="width:360px;text-align:center"><div style="font-size:46px;margin:6px 0 10px">🆔</div><div class="modal-title" style="text-align:center;margin-bottom:8px">생체 로그인 등록</div><div style="font-size:13px;color:var(--tx-2);line-height:1.7;margin-bottom:16px">이 기기에서 다음부터<br><b>Face ID / 지문 / 홍채</b>로 즉시 로그인할 수 있어요.<br><span style="font-size:11px;color:var(--tx-3)">(이 기기에만 저장 · 서버 전송 없음)</span></div>'+(S.bioError?'<div style="color:#993c1d;font-size:11.5px;margin-bottom:10px">'+S.bioError+'</div>':'')+'<div class="modal-actions" style="justify-content:center;gap:8px"><button class="btn" onclick="bioEnrollSkip()">다음에</button><button class="btn primary"'+(S.bioBusy?' disabled':'')+' onclick="bioEnrollNow()">'+(S.bioBusy?'등록 중...':'🆔 등록하기')+'</button></div></div></div>':''}`;
  // 히어로 배경 사진이 여러 장이면 5초마다 크로스페이드
  try{ if(window.__heroRot){ clearInterval(window.__heroRot); window.__heroRot=null; } }catch(e){}
  if(heroImgs.length>1){
    window.__heroRot=setInterval(function(){
      var wrap=document.getElementById('hero-photos'); if(!wrap){ try{clearInterval(window.__heroRot);}catch(e){} return; }
      var slides=wrap.querySelectorAll('.hero-photo'); if(slides.length<2) return;
      var cur=wrap.querySelector('.hero-photo.on'); var idx=Array.prototype.indexOf.call(slides,cur); if(idx<0) idx=0;
      slides[idx].classList.remove('on'); slides[(idx+1)%slides.length].classList.add('on');
    }, 5000);
  }
}

// 흰 화면 방지 + 스크롤 자동 보존:
// 이 앱은 body{overflow:hidden} 라 페이지 자체가 스크롤하지 않고, 내부 컨테이너
// (.live-wrap / .content / .member-list / .perf-overlay 등) 가 각자 스크롤한다.
// render() 가 innerHTML 을 통째로 재생성하면 컨테이너가 새로 만들어져 scrollTop=0 으로
// 리셋. 그래서 [선택]/폴링 등 어떤 render 든 화면이 위로 튀어 보임.
// 해결: render 직전에 스크롤 가능한 모든 컨테이너의 scrollTop 을 selector→값 으로
// 스냅샷, render 후 같은 selector 로 다시 찾아 복원. 화면이 바뀌면(키 다름) 미적용.
var _SCROLL_SELS = [
  '.main > .live-wrap', '.content', '.member-list', '.perf-overlay',
  '.ex-picker-list', '.live-member-list', '.modal-overlay'
];
function _snapshotScrolls(){
  var snap = {};
  for(var i=0;i<_SCROLL_SELS.length;i++){
    try{
      var els = document.querySelectorAll(_SCROLL_SELS[i]);
      for(var j=0;j<els.length;j++){
        if(els[j].scrollTop > 0){
          // 같은 selector 의 j 번째 컨테이너에 복원
          snap[_SCROLL_SELS[i]+'@'+j] = els[j].scrollTop;
        }
      }
    }catch(e){}
  }
  try{
    var ws = window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
    if(ws>0) snap.__win = ws;
  }catch(e){}
  return snap;
}
function _restoreScrolls(snap){
  if(!snap) return;
  Object.keys(snap).forEach(function(k){
    try{
      if(k==='__win'){ window.scrollTo(0, snap[k]); return; }
      var at = k.lastIndexOf('@');
      var sel = k.slice(0, at), idx = parseInt(k.slice(at+1),10)||0;
      var els = document.querySelectorAll(sel);
      if(els[idx]) els[idx].scrollTop = snap[k];
    }catch(e){}
  });
}
// 경량 마크다운 → HTML (세션 카드 AI 정리 표시용). ## 제목 · **볼드** · - 불릿.
// 원문은 이미 사람이 검토한 AI 출력이라 XSS 위험 낮지만, < 는 이스케이프.
function mdLite(text){
  if(!text) return '';
  var esc = String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var lines = esc.split('\n');
  var out = [];
  lines.forEach(function(ln){
    var t = ln.trim();
    if(!t){ out.push('<div class="md-sp"></div>'); return; }
    if(/^##\s+/.test(t)){ out.push('<div class="md-h2">'+t.replace(/^##\s+/,'')+'</div>'); return; }
    if(/^#\s+/.test(t)){ out.push('<div class="md-h2">'+t.replace(/^#\s+/,'')+'</div>'); return; }
    var b = t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
    if(/^[-•]\s+/.test(t)){ out.push('<div class="md-li">'+b.replace(/^[-•]\s+/,'')+'</div>'); return; }
    out.push('<div class="md-p">'+b+'</div>');
  });
  return out.join('');
}
function _renderKey(){
  return (S.currentRole||'')+'|'+(S.selectedMember||'')+'|'
       + (S.showLiveSession?'L':'') + (S.showPerformance?'P':'')
       + (S.showDashboard?'D':'') + (S.showReport?'R':'') + (S.showAddSession?'S':'');
}
function render(){
  var snap = null;
  try{ snap = _snapshotScrolls(); }catch(e){}
  var keyBefore = window._lastRenderKey;
  try{
    _render();
  }catch(e){
    console.error('[render] 오류:', e);
    try{ _renderRecovery(e); }catch(_){}
  }
  // 같은 화면이면 스크롤 복원. 다른 화면이면 자연스럽게 0 부터.
  try{
    var keyAfter = _renderKey();
    window._lastRenderKey = keyAfter;
    if(keyBefore && keyBefore===keyAfter && snap && Object.keys(snap).length){
      // rAF 두 번 — innerHTML 후 layout 완료 시점에 복원(iOS Safari 호환)
      requestAnimationFrame(function(){
        _restoreScrolls(snap);
        requestAnimationFrame(function(){ _restoreScrolls(snap); });
      });
    }
  }catch(e){}
}
function _renderRecovery(err){
  var root = document.getElementById('root');
  if(!root) return;
  // 이미 정상 화면이 그려져 있으면(내용 있음) 건드리지 않음 — 마지막 정상 상태 유지
  if(root.children && root.children.length>0 && !root.querySelector('.recovery-panel')) return;
  root.innerHTML = '<div class="recovery-panel" style="max-width:420px;margin:22vh auto;padding:0 24px;text-align:center;font-family:-apple-system,sans-serif;color:#1a1f26">'
    + '<div style="font-size:46px;margin-bottom:14px">🛠</div>'
    + '<div style="font-size:17px;font-weight:800;margin-bottom:8px">화면을 다시 불러올게요</div>'
    + '<div style="font-size:13px;color:#888;line-height:1.7;margin-bottom:20px">일시적인 표시 문제가 있었어요.<br>아래 버튼을 누르면 정상으로 돌아옵니다.</div>'
    + '<button onclick="recoverApp()" style="padding:12px 28px;background:#00b884;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer">다시 불러오기</button>'
    + '</div>';
}
// 복구 버튼 — 모달/임시상태 닫고 안전하게 재렌더 (그래도 안 되면 새로고침)
function recoverApp(){
  try{
    S.showLiveSession=false; S.showPerformance=false; S.showReport=false;
    S.showAddSession=false; S.showAddMember=false; S.perfShotModal=null;
    S.liveToast=null; S.showPwModal=false; S.bioEnrollFor=null; S.showTranscriptVault=false;
    render();
    var root=document.getElementById('root');
    if(!root || !root.children || root.children.length===0 || root.querySelector('.recovery-panel')){
      location.reload();
    }
  }catch(e){ location.reload(); }
}
function _render(){
  if(!S.currentRole){document.body.classList.add('role-select');renderRoleSelector();return;}
  document.body.classList.remove('role-select');
  const root = document.getElementById('root');
  const isAdmin = S.currentRole==='admin';
  const isInfo = S.currentRole==='infodesk' || isAdmin;
  if(!isInfo && S.selectedMember){
    var _sel = S.members.find(function(m){return m.id===S.selectedMember;});
    if(!_sel || !_sel.assignedTo || _sel.assignedTo.indexOf(S.currentUser)===-1) S.selectedMember = null;
  }
  const mid = S.selectedMember;
  const member = mid ? S.members.find(m => m.id===mid) : null;
  const allSess = mid ? (S.sessions[mid]||[]).slice().sort((a,b) => b.date.localeCompare(a.date)) : [];
  const sessions = S.filterAuthor==='all' ? allSess : allSess.filter(s => getRole(s.author)===S.filterAuthor);
  const assess = mid ? (S.assessments[mid]||{}) : {};
  const st = mid ? stats(mid) : null;
  const warnings = mid ? ASSESSMENT_ITEMS.filter(function(item){var v=assess[item.key];return v&&(v.result==='제한'||v.result==='주의 필요');}).map(function(item){return {name:item.name,result:assess[item.key].result,impact:BODY_SWING_MAP[item.key]||''};}) : [];

  root.innerHTML = `
  <div class="sidebar-backdrop${S.sidebarOpen?' show':''}" onclick="toggleSidebar()"></div>
  <div class="sidebar${S.sidebarOpen?' open':''}">
    <div class="sidebar-logo">
      <img class="sidebar-logo-img" src="assets/logo.png" alt="내셔널짐">
      <div class="sidebar-top-actions">
        <button class="sidebar-bell" onclick="event.stopPropagation();reloadApp()" title="새로고침" aria-label="새로고침"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><polyline points="3 21 3 16 8 16"/></svg></button>
        <button class="sidebar-bell" onclick="event.stopPropagation();openActivityLog()" title="알림" aria-label="알림">${getUnreadCount()>0?'<span class="bell-badge">'+getUnreadCount()+'</span>':''}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16v-5a6 6 0 0 0-12 0v5l-1.6 2.3a.5.5 0 0 0 .4.7h14.4a.5.5 0 0 0 .4-.7L18 16z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg></button>
        <button class="sidebar-home-btn" onclick="event.stopPropagation();switchRole()" title="로그아웃" aria-label="로그아웃"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></button>
      </div>
    </div>
    ${(S.currentRole==='pro'||S.currentRole==='trainer'||S.currentRole==='admin')?'':''}
    ${isInfo ? `
    <div class="sidebar-section-label">전체 회원 관리</div>
    <div class="infodesk-tools">
      ${isAdmin?'<button class="mp-btn live-admin-btn" onclick="event.stopPropagation();openLiveSession()">🏌️ 수업 센터</button>':''}
      <button class="mp-btn" onclick="event.stopPropagation();openDashboard()">대시보드</button>
      <button class="mp-btn demo-btn" onclick="event.stopPropagation();openDemoPerformance()">📊 데모 화면</button>
      ${isAdmin?'<button class="mp-btn backup-btn" onclick="event.stopPropagation();backupData()">💾 데이터 백업</button><button class="mp-btn backup-btn" onclick="event.stopPropagation();triggerRestore()">↩︎ 백업 복구</button>':''}
      <div class="infodesk-summary">PT+골프 ${S.members.filter(function(m){return (m.memberType||'pt_lesson')==='pt_lesson';}).length}명 · 골프 ${S.members.filter(function(m){return m.memberType==='lesson';}).length}명 · 총 ${S.members.length}명</div>
    </div>
    ` : `
    <div class="sidebar-tabs">
      <div class="sidebar-tab${S.sidebarTab==='pt_lesson'?' active':''}" onclick="S.sidebarTab='pt_lesson';render()">PT+골프</div>
      <div class="sidebar-tab${S.sidebarTab==='lesson'?' active':''}" onclick="S.sidebarTab='lesson';render()">골프</div>
    </div>
    `}
    <input class="sidebar-search" placeholder="회원 검색..." value="${(S.memberSearch||'').replace(/"/g,'&quot;')}" oninput="filterMemberRows(this.value)" autocomplete="off" autocorrect="off" autocapitalize="off" onclick="event.stopPropagation()">
    <div class="member-list">
      ${S.members.filter(function(m){var mType=m.memberType||'pt_lesson';if(!isInfo){if(mType!==S.sidebarTab) return false;if(!(m.assignedTo&&m.assignedTo.indexOf(S.currentUser)!==-1)) return false;}return true;}).map(function(m){
        var _cho=getChosung(m.name); var _q=(S.memberSearch||'').trim().toLowerCase();
        var _hide=_q&&m.name.toLowerCase().indexOf(_q)===-1&&_cho.indexOf(getChosung(_q))===-1;
        return `
        <div class="member-item${m.id===mid?' active':''}" data-name="${m.name.toLowerCase().replace(/"/g,'')}" data-cho="${_cho.replace(/"/g,'')}"${_hide?' style="display:none"':''} onclick="selectMember('${m.id}')">
          <div class="member-avatar ${m.color}">${initials(m.name)}</div>
          <div class="member-name">${m.name}${expiryBadge(nearestExpiry(m))}${(m.memberType||'pt_lesson')==='lesson'?'<span class="type-tag lesson-tag">골프</span>':''}</div>
          <div class="session-badge">${(S.sessions[m.id]||[]).length}</div>
          <div class="member-actions">
            ${(isInfo&&!isAdmin)?'<button class="member-edit-btn" onclick="event.stopPropagation();openEditMember(\''+m.id+'\')">'+'수정</button>':''}
            ${(isInfo&&!isAdmin)&&!S.deleteRequests[m.id]?'<button class="member-del-btn" onclick="event.stopPropagation();requestDelete(\''+m.id+'\')">'+'삭제</button>':''}
            ${S.deleteRequests[m.id]?'<span class="del-pending-badge">삭제대기</span>':''}
          </div>
        </div>`;}).join('')}
    </div>
    ${(isInfo&&!isAdmin)?'<div class="add-member-btn" onclick="openAddMember()">+ 새 회원 등록</div>':''}
    <div class="sidebar-mypage">
      ${!isInfo?'<button class="mp-btn dash-btn" onclick="event.stopPropagation();openDashboard()">대시보드</button>':''}
      <div class="mp-label">마이페이지</div>
      ${bio.available?'<button class="mp-btn'+(bio.isRegistered(S.currentRole,S.currentUser)?' bio-on':'')+'" onclick="event.stopPropagation();bioToggleSelf()">🆔 '+(bio.isRegistered(S.currentRole,S.currentUser)?'생체 로그인 켜짐':'생체 로그인 등록')+'</button>':''}
      <button class="mp-btn" onclick="openPasswordChange()">비밀번호 변경</button>
      ${S.currentRole==='admin'?'<button class="mp-btn" onclick="openTranscriptVault()">🎙 녹음 원문 보관함</button>':''}
      ${S.currentRole==='admin'?'<button class="mp-btn" onclick="openAuditLog()">감사 로그</button>':''}
      ${isInfo?'<button class="mp-btn" onclick="event.stopPropagation();window.open(\'manual.html\',\'_blank\')">사용 매뉴얼</button>':''}
      <div class="mp-version" onclick="event.stopPropagation();reloadApp&&reloadApp()" title="탭하면 최신 버전으로 새로고침">버전 ${APP_VERSION.version} · ${APP_VERSION.date}</div>
    </div>
    ${syncBadge()}
  </div>
  <button class="mobile-toggle" onclick="toggleSidebar()">☰</button>

  <div class="main">
    ${S.showLiveSession ? renderLiveSession() : (member ? `
    <div class="topbar">
      <div class="member-title-wrap">
        <div class="topbar-avatar ${member.color}">${initials(member.name)}</div>
        <div>
          <div class="member-title">${member.name} 회원님</div>
          <div class="member-subtitle">${(function(){var lessonExp=member.golfLessonExpiry||member.expiry||'';var ptExp=member.golfPTExpiry||'';if((member.memberType||'pt_lesson')==='lesson'){return '레슨 '+(st?st.pro+st.trainer:0)+'/'+(member.golfLessonCount||'0')+'회'+(lessonExp?' · ~'+lessonExp+expiryBadge(lessonExp):'');}return '레슨 '+(st?st.pro:0)+'/'+(member.golfLessonCount||'0')+'회'+(lessonExp?' (~'+lessonExp+expiryBadge(lessonExp)+')':'')+' · PT '+(st?st.trainer:0)+'/'+(member.golfPTCount||'0')+'회'+(ptExp?' (~'+ptExp+expiryBadge(ptExp)+')':'');})()}</div>
          ${(member.phone||member.email||member.registeredDate)?`<div class="member-detail-line">${member.phone?'📞 '+member.phone:''}${member.email?' · ✉ '+member.email:''}${member.registeredDate?' · 가입일 '+member.registeredDate:''}</div>`:''}
          ${(member.handicap||member.avgScore||member.focusPoints)?`<div class="member-detail-line golf-profile">${member.handicap?'HC '+member.handicap:''}${member.avgScore?' · 평균 '+member.avgScore+'타':''}${member.focusPoints?' · '+member.focusPoints:''}</div>`:''}
          ${member.goal?`<div class="member-detail-line goal-line">목표: ${member.goal}</div>`:''}
        </div>
      </div>
      <div class="topbar-actions">
        <button class="btn perf-open-btn" onclick="openPerformance()" title="성과 대시보드 + AI 리포트">📊 성과·리포트</button>
        ${(S.handovers[mid]&&S.handovers[mid].length>0)?'<button class="btn ho-btn" onclick="openHandover(\''+mid+'\')" title="인수인계 기록">인수인계 <span class="ho-count">'+S.handovers[mid].length+'</span></button>':''}
        ${!isInfo?'<button class="btn primary live-mini" onclick="openLiveForMember(\''+mid+'\')" title="베이 배정 + 트랙맨 샷 자동 저장">🎯 라이브 수업</button>':''}
        ${!isInfo?'<button class="btn journal-btn" onclick="openAddSession()" title="샷 저장 없이 일지만 작성">✏️ 일지만 기록</button>':''}
        ${S.deleteRequests[mid]&&!isInfo?'<button class="btn danger" onclick="approveDelete(\''+mid+'\')">'+'삭제 승인</button><button class="btn" onclick="rejectDelete(\''+mid+'\')">'+'거절</button>':''}
      </div>
    </div>
    <div class="content${S._memberSwitch?' content-switch':''}">
      ${st ? `<div class="stat-row"><div class="stat"><div class="stat-val">${st.total}</div><div class="stat-lbl">총 세션</div></div><div class="stat"><div class="stat-val blue">${st.pro}</div><div class="stat-lbl">골프 프로</div></div><div class="stat"><div class="stat-val green">${st.trainer}</div><div class="stat-lbl">골프 PT</div></div></div>` : ''}

      <div class="section-card">
        <div class="section-header${S.assessOpen?' open':''}" onclick="toggleAssess()">
          <div class="section-label"><div class="dot dot-green"></div>체형 기능 평가<span class="sec-count">(${ASSESSMENT_ITEMS.filter(i=>{const v=assess[i.key];return v&&v.result&&v.result!=='미검사'}).length}/${ASSESSMENT_ITEMS.length})${assess._date?' · '+assess._date:''}${assess._author?' · '+assess._author:''}${assess._history&&assess._history.length>0?' · 히스토리 '+assess._history.length+'회':''}</span></div>
          <div class="chevron">▼</div>
        </div>
        ${S.assessOpen ? `
        <div class="assess-meta">
          <label class="assess-date-label">평가일</label>
          <input type="date" class="assess-date-input" value="${assess._date||''}" ${isInfo?'disabled':''} onchange="updateAssessDate(this.value)">
          <label class="assess-date-label">평가자</label>
          <select class="assess-author-select" ${isInfo?'disabled':''} onchange="updateAssessAuthor(this.value)"><option value="">선택</option>${INSTRUCTORS.map(function(i){return '<option value="'+i.name+'"'+(assess._author===i.name?' selected':'')+'>'+i.name+'</option>';}).join('')}</select>
          ${!isInfo?'<button class="btn" style="font-size:11px;padding:5px 10px" onclick="snapshotAssessment()">애프터 평가 시작</button>':''}
        </div>
        ${assess._history&&assess._history.length>0?'<div class="assess-history">'+assess._history.map(function(h,i){return '<div class="history-item"><strong>'+h.date+'</strong> <span>('+ASSESSMENT_ITEMS.filter(function(it){var v=h.items[it.key];return v&&v.result&&v.result!=='미검사';}).length+'/'+ASSESSMENT_ITEMS.length+')</span></div>';}).join('')+'</div>':''}
        <div class="assessment-grid">
          ${ASSESSMENT_ITEMS.map(item => {const v=assess[item.key]||{result:'미검사',note:''};const warn=v.result&&v.result!=='정상'&&v.result!=='미검사';return `<div class="assess-item${warn?' warn':''}"><div class="assess-name">${item.name}</div><div class="assess-cp">${item.cp}</div><div class="assess-row"><select class="assess-select" ${isInfo?'disabled ':''} onchange="updateAssess('${item.key}','result',this.value)">${RESULT_OPTIONS.map(o=>`<option value="${o}"${v.result===o?' selected':''}>${o}</option>`).join('')}</select></div><input class="assess-note-input" placeholder="특이사항" value="${(v.note||'').replace(/"/g,'&quot;')}" ${isInfo?'disabled ':''} onchange="updateAssess('${item.key}','note',this.value)" />${warn&&BODY_SWING_MAP[item.key]?`<div class="body-swing-alert"><span class="bsa-icon">!</span> ${BODY_SWING_MAP[item.key]}</div>`:''}</div>`;}).join('')}
        </div>` : ''}
      </div>

      <div class="section-card">
        <div class="section-header open" style="cursor:default">
          <div class="section-label"><div class="dot dot-amber"></div>세션 기록<span class="sec-count">(${sessions.length}건)</span></div>
          <div class="section-right">
            ${sessions.length>1?'<div class="filter-btn expand-btn" onclick="toggleAllSessions()">'+(sessions.every(function(s){return S.openSessions&&S.openSessions[s.id];})?'모두 접기':'모두 펼치기')+'</div>':''}
            <div class="filter-btn${S.filterAuthor==='all'?' active':''}" onclick="setFilter('all')">전체</div>
            <div class="filter-btn${S.filterAuthor==='pro'?' pro-active':''}" onclick="setFilter('pro')">프로</div>
            <div class="filter-btn${S.filterAuthor==='trainer'?' trainer-active':''}" onclick="setFilter('trainer')">트레이너</div>
          </div>
        </div>
        ${warnings.length>0 ? `<div class="warning-banner${S.warningBannerCollapsed?' collapsed':''}"><div class="wb-head" onclick="toggleWarningBanner()"><span>체형 제한 ${warnings.length}개 확인 — 레슨/운동 전 검토 필요</span><span class="wb-chevron">▼</span></div><div class="wb-body">${warnings.map(function(w){return '<div class="wb-item"><strong>'+w.name+'</strong> ('+w.result+'): '+w.impact+'</div>';}).join('')}</div></div>` : ''}
        <div class="sessions-list">
          ${sessions.length===0 ? `<div class="empty-state">기록된 세션이 없습니다<br><span style="font-size:11px">상단 '+ 세션 기록' 버튼으로 추가하세요</span></div>` :
          sessions.map((s,si) => { var so=(S.openSessions&&S.openSessions[s.id]!==undefined)?S.openSessions[s.id]:(si===0); var prev=(s.content||'').replace(/\s+/g,' ').trim(); return `
            <div class="session-card${so?' open':''}${(so&&S._animSession===s.id)?' just-opened':''}">
              <div class="session-hd ${(function(r){return r==='pro'?'pro':r==='trainer'?'trainer':'admin';})(getRole(s.author))}" onclick="toggleSession('${s.id}')">
                <div class="role-tag ${(function(r){return r==='pro'?'pro':r==='trainer'?'trainer':'admin';})(getRole(s.author))}">${(function(r){return r==='pro'?'GOLF PRO':r==='trainer'?'GOLF PT':'관리자';})(getRole(s.author))}</div>
                <div class="session-author">${s.author}</div>
                <div class="session-date">${s.date}</div>
                ${s.author!==S.currentUser&&s._addedAt&&s._addedAt>(S.lastSeen[S.currentUser]||'')?'<span class="new-badge">NEW</span>':''}
                ${(function(){var mm=s.media||[];var nv=mm.filter(function(x){var t=x.mimeType||inferMime(x.name||'')||(x.data||'');return String(t).indexOf('video')!==-1;}).length;var ni=mm.length-nv;var b='';if(nv>0)b+='<span class="media-chip vid">🎬'+(nv>1?nv:'')+'</span>';if(ni>0)b+='<span class="media-chip img">📷'+(ni>1?ni:'')+'</span>';return b;})()}
                <div class="session-chevron">▼</div>
              </div>
              <div class="session-collapsed" onclick="toggleSession('${s.id}')">${prev.slice(0,42)}${prev.length>42?'…':''}</div>
              <div class="session-bd">
                <div class="session-content">${typeof mdLite==='function'?mdLite(s.content):s.content}</div>
                ${(isAdmin&&s.rawTranscript&&s.rawTranscript.trim()&&s.rawTranscript.trim()!==(s.content||'').trim())?'<details class="raw-transcript"><summary>🎙 녹음 원문 전체 보기 ('+Math.round(s.rawTranscript.trim().length)+'자) · 관리자 전용</summary><div class="raw-transcript-body">'+s.rawTranscript.replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div></details>':''}
                ${s.media&&s.media.length>0?'<div class="session-media">'+s.media.map(function(m,mi){var localSrc=m.mediaId?(S.mediaUrls[m.mediaId]||''):'';var remoteSrc=(r2.enabled&&(m.r2Key||m.mediaId))?r2.url(m.r2Key||m.mediaId):'';var src=localSrc||remoteSrc||(m.data||'');var mime=m.mimeType||(m.data||'').slice(5,30)||inferMime(m.name)||'';var isImg=mime.indexOf('image/')!==-1||(m.data&&m.data.indexOf('image/')!==-1);var isVideo=mime.indexOf('video/')!==-1||(m.data&&m.data.indexOf('video/')!==-1);var failNote=(m.r2Status==='failed'&&m.mediaId)?'<div class="sm-error">☁ 클라우드 업로드 실패 — 이 기기에만 저장됨 · <a href="#" onclick="event.preventDefault();retryMediaUpload(\''+s.id+'\','+mi+')">다시 업로드</a></div>':'';if(m.type==='file'&&src&&isImg) return '<img class="sm-thumb" src="'+src+'" onclick="openMediaView(this.src)" alt="'+((m.name||'').replace(/"/g,'&quot;'))+'">'+failNote;if(m.type==='file'&&src&&isVideo){var vid='v_'+s.id+'_'+mi;return '<div class="video-wrap" id="wrap_'+vid+'"><video class="sm-video" id="'+vid+'" src="'+src+'" controls playsinline preload="metadata" crossorigin="anonymous" onerror="onVideoError(this,\''+vid+'\')"></video><div class="video-controls"><button class="vc-btn" onclick="toggleLoop(\''+vid+'\')" id="loop_'+vid+'" title="반복 재생">반복</button><span class="vc-spacer"></span><button class="vc-btn" onclick="setSpeed(\''+vid+'\',1)">1x</button><button class="vc-btn" onclick="setSpeed(\''+vid+'\',0.5)">0.5x</button><button class="vc-btn" onclick="setSpeed(\''+vid+'\',0.25)">0.25x</button><button class="vc-btn" onclick="setSpeed(\''+vid+'\',0.125)">0.125x</button><span class="vc-speed" id="spd_'+vid+'">1x</span></div>'+failNote+'</div>';}if(m.type==='file'&&src&&!isImg&&!isVideo){var vid2='v_'+s.id+'_'+mi;return '<div class="video-wrap" id="wrap_'+vid2+'"><video class="sm-video" id="'+vid2+'" src="'+src+'" controls playsinline preload="metadata" crossorigin="anonymous" onerror="onVideoError(this,\''+vid2+'\')"></video><div class="sm-hint">미디어 유형 미확인 · 재생 안 되면 <a href="'+src+'" target="_blank" rel="noopener">새 창에서 열기</a></div></div>';}if(m.type==='file'&&!src) return '<div class="sm-missing">미디어 로딩 중 — 다른 기기에서 업로드한 영상은 R2 동기화 후 표시됩니다</div>';return '';}).join('')+'</div>':''}
                ${s._ai?'<div class="ai-summary"><div class="ai-header">AI 분석</div><div class="ai-body"><p class="ai-text">'+s._ai.summary+'</p>'+(s._ai.next_focus?'<div class="ai-focus">다음 집중: '+s._ai.next_focus+'</div>':'')+'<div class="ai-recs"><div class="ai-rec-col"><div class="ai-rec-title">골프 훈련</div>'+(s._ai.golf_drills||[]).map(function(d){return '<div class="ai-rec-item">'+d+'</div>';}).join('')+'</div><div class="ai-rec-col"><div class="ai-rec-title">웨이트</div>'+(s._ai.weight_training||[]).map(function(d){return '<div class="ai-rec-item">'+d+'</div>';}).join('')+'</div></div></div></div>':''}
                <div class="session-actions">
                  ${!isInfo?'<button class="small-btn edit" onclick="openEditSession(\''+s.id+'\')">'+'수정</button>':''}
                  ${!isInfo?'<button class="small-btn del" onclick="deleteSession(\''+s.id+'\')">'+'삭제</button>':''}
                </div>
              </div>
            </div>`; }).join('')}
        </div>
      </div>
    </div>
    ` : `
    ${S.showDashboard ? renderDashboard() : `<div class="no-member"><div class="no-member-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div style="font-size:14px;font-weight:600;color:var(--tx-3)">회원을 선택하세요</div><div style="font-size:12px;color:var(--tx-3)">좌측에서 회원을 클릭하거나 새 회원을 등록하세요</div></div>`}`)}
  </div>

  ${S.showAddSession ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">${S.editSessionId?'세션 기록 수정':'세션 기록 추가'} — ${member?member.name+' 회원님':''}</div>
      <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" value="${S.newSession.date}" onchange="updateNS('date',this.value)"></div>
      <div class="form-group"><label class="form-label">담당자</label><div class="radio-group">${INSTRUCTORS.map(function(inst){var canPick=inst.name===S.currentUser||S.currentRole==='admin';var sel=S.newSession.author===inst.name?(inst.role==='pro'?' sel-pro':' sel-trainer'):'';if(!canPick) return '<div class="radio-opt disabled" style="opacity:0.4;pointer-events:none">'+inst.name+'</div>';return '<div class="radio-opt'+sel+'" onclick="updateNS(\'author\',\''+inst.name+'\')">'+ inst.name+'</div>';}).join('')}</div></div>
      ${S.newSession._aiPending?'<div class="ai-pending">🤖 AI가 골프 레슨 내용을 정리하는 중... (몇 초)</div>':''}
      <div class="form-group"><label class="form-label">${getRole(S.newSession.author)==='trainer'?'PT레슨 내용':'골프레슨 내용'} ${getRole(S.newSession.author)==='trainer'?'<button type="button" class="ex-add-btn" onclick="openExercisePicker()">+ 운동 빠른추가</button>':'<button type="button" class="ex-add-btn" onclick="openGolfLessonPicker()">+ 레슨 빠른추가</button>'}</label><textarea class="form-textarea" style="min-height:200px" placeholder="${getRole(S.newSession.author)==='trainer'?'웨이트 트레이닝, 기능성 훈련, 모빌리티, 코어 안정화 등':'오늘 진행한 레슨 내용을 입력하세요'}" oninput="updateNS('content',this.value)">${S.newSession.content}</textarea></div>
      ${(isAdmin&&S.newSession.rawTranscript&&S.newSession.rawTranscript.trim())?'<details class="raw-transcript"><summary>🎙 녹음 원문 전체 ('+S.newSession.rawTranscript.trim().length+'자) — AI 정리가 놓친 게 없나 확인 · 관리자 전용</summary><div class="raw-transcript-body">'+S.newSession.rawTranscript.replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div></details>':''}
      ${getRole(S.newSession.author)==='trainer'?`
      <div class="form-group"><label class="form-label">사진 · 영상 첨부</label><div class="media-input-box"><div class="exercise-video-list">${(S.newSession.media||[]).filter(function(x){return x.view==='exercise'||x.view==='photo';}).map(function(x,i){var idx=(S.newSession.media||[]).findIndex(function(m){return m===x;});var icon=(x.mimeType||'').indexOf('image/')!==-1?'IMG':'VID';return '<div class="media-file-item"><span>'+icon+' '+(x.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';}).join('')}</div><div class="media-upload-row"><label class="media-upload-btn">+ 사진 추가<input type="file" accept="image/*" multiple onchange="handleExerciseVideoUpload(this)" style="display:none"></label><label class="media-upload-btn">+ 영상 추가<input type="file" accept="video/*" multiple onchange="handleExerciseVideoUpload(this)" style="display:none"></label></div><div class="media-hint">여러 장 선택 가능 · 파일당 최대 100MB</div></div></div>
      <div class="form-group"><label class="form-label">스윙 영상</label><div class="media-input-box"><div class="video-slot-grid"><div class="video-slot"><div class="vs-label">정면</div>${(function(){var f=(S.newSession.media||[]).find(function(x){return x.view==='front';});var idx=(S.newSession.media||[]).findIndex(function(x){return x.view==='front';});if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';return '<label class="media-upload-btn">+ 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'front\')" style="display:none"></label>';})()}</div><div class="video-slot"><div class="vs-label">측면</div>${(function(){var f=(S.newSession.media||[]).find(function(x){return x.view==='side';});var idx=(S.newSession.media||[]).findIndex(function(x){return x.view==='side';});if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';return '<label class="media-upload-btn">+ 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'side\')" style="display:none"></label>';})()}</div></div></div></div>
      `:`
      <div class="form-group"><label class="form-label">스윙 영상</label><div class="media-input-box"><div class="video-slot-grid"><div class="video-slot"><div class="vs-label">정면</div>${(function(){var f=(S.newSession.media||[]).find(function(x){return x.view==='front';});var idx=(S.newSession.media||[]).findIndex(function(x){return x.view==='front';});if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';return '<label class="media-upload-btn">+ 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'front\')" style="display:none"></label>';})()}</div><div class="video-slot"><div class="vs-label">측면</div>${(function(){var f=(S.newSession.media||[]).find(function(x){return x.view==='side';});var idx=(S.newSession.media||[]).findIndex(function(x){return x.view==='side';});if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';return '<label class="media-upload-btn">+ 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'side\')" style="display:none"></label>';})()}</div></div></div></div>
      <div class="form-group"><label class="form-label">사진 · 영상 첨부</label><div class="media-input-box"><div class="exercise-video-list">${(S.newSession.media||[]).filter(function(x){return x.view==='exercise'||x.view==='photo';}).map(function(x,i){var idx=(S.newSession.media||[]).findIndex(function(m){return m===x;});var icon=(x.mimeType||'').indexOf('image/')!==-1?'IMG':'VID';return '<div class="media-file-item"><span>'+icon+' '+(x.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';}).join('')}</div><div class="media-upload-row"><label class="media-upload-btn">+ 사진 추가<input type="file" accept="image/*" multiple onchange="handleExerciseVideoUpload(this)" style="display:none"></label><label class="media-upload-btn">+ 영상 추가<input type="file" accept="video/*" multiple onchange="handleExerciseVideoUpload(this)" style="display:none"></label></div><div class="media-hint">여러 장 선택 가능 · 파일당 최대 100MB</div></div></div>
      `}
      <div class="modal-actions"><button class="btn" onclick="closeModal()">취소</button><button class="btn primary" ${S.uploading>0?'disabled title="업로드 중..."':''} onclick="${S.editSessionId?'saveEditSession()':'addSession()'}">${S.uploading>0?'⏳ '+(S.uploadMsg||'업로드 중 ('+S.uploading+')'):(S.editSessionId?'수정 저장':'기록 저장')}</button></div>
    </div>
  </div>` : ''}

  ${S.showAddMember ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">${S.editMemberId?'회원 정보 수정':'새 회원 등록'}</div>
      <div class="form-group"><label class="form-label">회원 유형</label><div class="radio-group"><div class="radio-opt${S.newMember.memberType==='pt_lesson'?' sel-pro':''}" onclick="S.newMember.memberType='pt_lesson';render()">PT + 골프</div><div class="radio-opt${S.newMember.memberType==='lesson'?' sel-trainer':''}" onclick="S.newMember.memberType='lesson';render()">골프</div></div></div>
      <div class="form-group"><label class="form-label">회원 이름</label><input class="form-input" placeholder="예: 김민수" value="${(S.newMember.name||'').replace(/"/g,'&quot;')}" oninput="S.newMember.name=this.value" autofocus></div>
      <div class="member-info-row"><div class="form-group"><label class="form-label">연락처</label><input class="form-input" type="tel" placeholder="010-0000-0000" value="${(S.newMember.phone||'').replace(/"/g,'&quot;')}" oninput="S.newMember.phone=this.value"></div><div class="form-group"><label class="form-label">이메일</label><input class="form-input" type="email" placeholder="example@email.com" value="${(S.newMember.email||'').replace(/"/g,'&quot;')}" oninput="S.newMember.email=this.value"></div></div>
      <div class="form-group"><label class="form-label">등록일</label><input type="date" class="form-input" value="${S.newMember.registeredDate||''}" oninput="S.newMember.registeredDate=this.value"></div>
      <div class="form-section-label">골프 레슨</div>
      <div class="member-info-row"><div class="form-group"><label class="form-label">등록 횟수</label><input class="form-input" type="number" placeholder="예: 12" value="${S.newMember.golfLessonCount||''}" oninput="S.newMember.golfLessonCount=this.value"></div><div class="form-group"><label class="form-label">등록 금액 (원)</label><input class="form-input" placeholder="예: 480,000" value="${(S.newMember.golfLessonAmount||'').replace(/"/g,'&quot;')}" oninput="S.newMember.golfLessonAmount=this.value"></div></div>
      <div class="form-group"><label class="form-label">레슨 유효기간</label><input type="date" class="form-input" value="${S.newMember.golfLessonExpiry||S.newMember.expiry||''}" oninput="S.newMember.golfLessonExpiry=this.value"></div>
      ${S.newMember.memberType==='pt_lesson'?`<div class="form-section-label">골프 PT</div><div class="member-info-row"><div class="form-group"><label class="form-label">등록 횟수</label><input class="form-input" type="number" placeholder="예: 12" value="${S.newMember.golfPTCount||''}" oninput="S.newMember.golfPTCount=this.value"></div><div class="form-group"><label class="form-label">등록 금액 (원)</label><input class="form-input" placeholder="예: 480,000" value="${(S.newMember.golfPTAmount||'').replace(/"/g,'&quot;')}" oninput="S.newMember.golfPTAmount=this.value"></div></div><div class="form-group"><label class="form-label">PT 유효기간</label><input type="date" class="form-input" value="${S.newMember.golfPTExpiry||''}" oninput="S.newMember.golfPTExpiry=this.value"></div>`:``}
      <div class="form-section-label">골프 프로필</div>
      <div class="member-info-row"><div class="form-group"><label class="form-label">핸디캡</label><input class="form-input" type="number" placeholder="예: 18" value="${S.newMember.handicap||''}" oninput="S.newMember.handicap=this.value"></div><div class="form-group"><label class="form-label">평균 타수</label><input class="form-input" type="number" placeholder="예: 95" value="${S.newMember.avgScore||''}" oninput="S.newMember.avgScore=this.value"></div></div>
      <div class="form-group"><label class="form-label">목표</label><input class="form-input" placeholder="예: 3개월 내 100타 깨기" value="${(S.newMember.goal||'').replace(/"/g,'&quot;')}" oninput="S.newMember.goal=this.value"></div>
      <div class="form-group"><label class="form-label">주력 교정 포인트</label><input class="form-input" placeholder="예: 슬라이스, 힙 슬라이드" value="${(S.newMember.focusPoints||'').replace(/"/g,'&quot;')}" oninput="S.newMember.focusPoints=this.value"></div>
      <div class="form-group"><label class="form-label">담당 지도자 배정</label><div class="assign-grid">${INSTRUCTORS.map(function(inst){var checked=(S.newMember.assignedTo||[]).indexOf(inst.name)!==-1;var cls=inst.role==='pro'?'assign-pro':'assign-trainer';return '<label class="assign-opt '+cls+(checked?' checked':'')+'"><input type="checkbox" '+(checked?'checked ':'')+' onchange="toggleAssign(\''+inst.name+'\')">'+ ' '+inst.name+'</label>';}).join('')}</div></div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">취소</button><button class="btn primary" onclick="${S.editMemberId?'saveMemberEdit()':'addMember()'}">${S.editMemberId?'저장':'등록'}</button></div>
    </div>
  </div>` : ''}

  ${renderExercisePicker()}
  ${renderGolfLessonPicker()}

  ${S.showActivityLog ? `<div class="modal-overlay" onclick="if(event.target===this){S.showActivityLog=false;render()}"><div class="modal" style="width:520px"><div class="modal-title">활동 로그</div><div class="activity-log-list">${S.activityLog.slice().reverse().slice(0,50).map(function(e){var d=new Date(e.time);var ts=(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');return '<div class="log-item"><div class="log-time">'+ts+'</div><div class="log-body"><strong>'+e.user+'</strong> — '+(e.memberName||'')+' '+e.action+(e.detail?' : '+e.detail:'')+'</div></div>';}).join('')||'<div class="empty-state">아직 활동 기록이 없습니다</div>'}</div><div class="modal-actions"><button class="btn" onclick="S.showActivityLog=false;render()">닫기</button></div></div></div>` : ''}

  ${S.showPwChange ? `<div class="modal-overlay" onclick="if(event.target===this){S.showPwChange=false;render()}"><div class="modal" style="width:380px"><div class="modal-title">비밀번호 변경</div><div class="form-group"><label class="form-label">현재 비밀번호</label><input type="password" class="form-input" oninput="S.pwChange.current=this.value" autofocus></div><div class="form-group"><label class="form-label">새 비밀번호 (4자 이상)</label><input type="password" class="form-input" oninput="S.pwChange.newPw=this.value"></div><div class="form-group"><label class="form-label">새 비밀번호 확인</label><input type="password" class="form-input" oninput="S.pwChange.confirm=this.value" onkeydown="if(event.key==='Enter')submitPasswordChange()"></div>${S.pwChangeError?'<div style="color:#993c1d;font-size:12px;margin-bottom:10px;text-align:center">'+S.pwChangeError+'</div>':''}<div class="modal-actions"><button class="btn" onclick="S.showPwChange=false;render()">취소</button><button class="btn primary" onclick="submitPasswordChange()">변경</button></div></div></div>` : ''}

  ${S.showAuditLog ? (function(){
    var allUsers=['인포데스크'].concat(INSTRUCTORS.map(function(i){return i.name;}));var userCounts={};allUsers.forEach(function(u){userCounts[u]=0;});S.auditLog.forEach(function(e){if(userCounts.hasOwnProperty(e.user)) userCounts[e.user]++;});
    if(!S.auditUserSelected){return `<div class="modal-overlay" onclick="if(event.target===this){S.showAuditLog=false;render()}"><div class="modal" style="width:520px"><div class="modal-title">감사 로그 — 계정 선택</div><div class="audit-user-grid">${allUsers.map(function(u){var role=u==='인포데스크'?'infodesk':(INSTRUCTORS.find(function(i){return i.name===u;})||{}).role||'';var icon=u==='인포데스크'?'D':(role==='pro'?'P':'T');return '<div class="audit-user-card au-'+role+'" onclick="S.auditUserSelected=\''+u+'\';render()"><div class="auc-icon">'+icon+'</div><div class="auc-name">'+u+'</div><div class="auc-count">'+userCounts[u]+'건</div></div>';}).join('')}</div><div class="modal-actions"><button class="btn" onclick="S.showAuditLog=false;render()">닫기</button></div></div></div>`;}
    var filtered=S.auditLog.filter(function(e){return e.user===S.auditUserSelected;});if(S.auditFilter&&S.auditFilter!=='all') filtered=filtered.filter(function(e){return e.category===S.auditFilter;});
    return `<div class="modal-overlay" onclick="if(event.target===this){S.showAuditLog=false;S.auditUserSelected=null;render()}"><div class="modal" style="width:780px;max-width:96vw"><div class="modal-title"><button class="btn" style="font-size:10px;padding:4px 8px;margin-right:8px" onclick="S.auditUserSelected=null;render()">← 뒤로</button>${S.auditUserSelected} 감사 로그<span style="font-size:11px;font-weight:400;color:#9ca89e;margin-left:8px">(${filtered.length}건)</span></div><div class="audit-filter">${['all','auth','member','session','assess','system'].map(function(c){return '<button class="audit-filter-btn'+(S.auditFilter===c?' active':'')+'" onclick="S.auditFilter=\''+c+'\';render()">'+(c==='all'?'전체':c==='auth'?'인증':c==='member'?'회원':c==='session'?'세션':c==='assess'?'평가':'시스템')+'</button>';}).join('')}<button class="btn" style="font-size:10px;padding:4px 8px;margin-left:auto" onclick="exportAuditLog('${S.auditUserSelected}')">CSV</button></div><div class="audit-log-list">${filtered.slice().reverse().slice(0,200).map(function(e){var d=new Date(e.time);var ts=d.getFullYear().toString().slice(2)+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');var catLabel={auth:'AUTH',member:'MBR',session:'SES',assess:'ASS',system:'SYS'}[e.category]||e.category;var metaStr='';try{metaStr=JSON.stringify(e.meta).slice(0,200);}catch(err){metaStr='';}return '<div class="audit-row audit-'+e.category+'"><div class="au-time">'+ts+'</div><div class="au-cat">'+catLabel+'</div><div class="au-action">'+e.action+'</div><div class="au-target">'+(e.target||'')+'</div><div class="au-meta">'+metaStr+'</div></div>';}).join('')||'<div class="empty-state">로그가 없습니다</div>'}</div><div class="modal-actions"><button class="btn" onclick="S.showAuditLog=false;S.auditUserSelected=null;render()">닫기</button></div></div></div>`;
  })() : ''}

  ${renderHandoverModal()}
  ${renderReportModal()}
  ${renderTranscriptVault()}
  ${renderImageCardModal()}
  ${renderPerformance()}
  `;
  setTimeout(function(){if(S.memberSearch){var el=document.querySelector('.sidebar-search');if(el){el.focus();el.setSelectionRange(S.memberSearch.length,S.memberSearch.length);}}if(S.exercisePicker&&S.exercisePicker.open&&S.exercisePicker.query){var el2=document.querySelector('.ex-picker-search input');if(el2){el2.focus();el2.setSelectionRange(S.exercisePicker.query.length,S.exercisePicker.query.length);}}if((S.liveStartBay||S.liveReassignShot)&&S.liveStartQuery){var el3=document.querySelector('.live-search-input');if(el3){el3.focus();try{el3.setSelectionRange(S.liveStartQuery.length,S.liveStartQuery.length);}catch(e){}}}},0);
}

// ============ 이벤트 핸들러 ============
function selectMember(id){
  var ml=document.querySelector('.member-list'); var mtop=ml?ml.scrollTop:0;
  S.selectedMember=id; S.filterAuthor='all'; S.sidebarOpen=false; S.showLiveSession=false;
  S._memberSwitch=true; render(); S._memberSwitch=false;
  var ml2=document.querySelector('.member-list'); if(ml2) ml2.scrollTop=mtop; // 목록 스크롤 유지
  var c=document.querySelector('.content'); if(c) c.scrollTop=0;             // 본문은 위에서 시작
}
function toggleAssess(){S.assessOpen=!S.assessOpen; render();}
function toggleWarningBanner(){S.warningBannerCollapsed=!S.warningBannerCollapsed; render();}
function setFilter(f){S.filterAuthor=f; render();}
function openAddSession(){S.newSession={date:today(),author:S.currentUser||'',content:'',media:[],mediaUrls:['','']}; S.showAddSession=true; render();}

// ============ 운동 빠른추가 픽커 ============
function openExercisePicker(){S.exercisePicker={open:true,query:'',category:'all',selected:[]};render();setTimeout(function(){var inp=document.querySelector('.ex-picker-search input');if(inp) inp.focus();},50);}
function closeExercisePicker(){S.exercisePicker.open=false;render();}

// ============ 골프레슨 빠른추가 (프로 전용) ============
function openGolfLessonPicker(){S.golfLessonPicker={open:true,query:'',category:'all',selected:[]};render();setTimeout(function(){var inp=document.querySelector('.gl-picker-search input');if(inp) inp.focus();},50);}
function closeGolfLessonPicker(){S.golfLessonPicker.open=false;render();}
function updateGolfLessonQuery(v){S.golfLessonPicker.query=v;render();setTimeout(function(){var inp=document.querySelector('.gl-picker-search input');if(inp){inp.focus();var l=inp.value.length;try{inp.setSelectionRange(l,l);}catch(e){}}},10);}
function setGolfLessonCategory(c){S.golfLessonPicker.category=c;render();}
function toggleGolfLessonSelect(idx){
  var p=S.golfLessonPicker; var item=GOLF_LESSON_ITEMS[idx];
  var existing=p.selected.findIndex(function(x){return x._idx===idx;});
  if(existing!==-1) p.selected.splice(existing,1);
  else p.selected.push({_idx:idx, n:item.n, s:item.s, f:item.f});
  render();
}
function removeGolfLessonSel(i){S.golfLessonPicker.selected.splice(i,1);render();}
function applyGolfLessonPicker(){
  var sel=S.golfLessonPicker.selected;
  if(!sel.length){closeGolfLessonPicker();return;}
  var lines=sel.map(function(x){return '- '+x.n+(x.f?' ('+x.f+')':'');});
  var current=S.newSession.content||'';
  S.newSession.content=(current?(current+'\n'):'')+lines.join('\n');
  S.golfLessonPicker={open:false,query:'',category:'all',selected:[]};
  render();
}
function matchGolfLesson(item, query){
  if(!query) return true;
  var q=query.trim().toLowerCase();
  if(!q) return true;
  if(item.n.toLowerCase().indexOf(q)!==-1) return true;
  if((item.s||'').toLowerCase().indexOf(q)!==-1) return true;
  if((item.f||'').toLowerCase().indexOf(q)!==-1) return true;
  var qCho=getChosung(q); var nCho=getChosung(item.n);
  if(nCho.indexOf(qCho)!==-1) return true;
  if(getChosung(item.f||'').indexOf(qCho)!==-1) return true;
  return false;
}
function renderGolfLessonPicker(){
  var p=S.golfLessonPicker;
  if(!p||!p.open) return '';
  var cats=['all','셋업','백스윙','다운스윙','임팩트','릴리스','구질','드라이버','아이언','숏게임','퍼팅','전략','멘탈','스피드','경사','트러블','리듬'];
  var filtered=GOLF_LESSON_ITEMS.filter(function(x){
    if(p.category!=='all' && x.s!==p.category) return false;
    return matchGolfLesson(x, p.query);
  });
  var catCounts={};
  cats.forEach(function(c){catCounts[c]=c==='all'?GOLF_LESSON_ITEMS.length:GOLF_LESSON_ITEMS.filter(function(x){return x.s===c;}).length;});
  return '<div class="modal-overlay ex-picker-overlay" onclick="if(event.target===this)closeGolfLessonPicker()"><div class="modal ex-picker">'+
    '<div class="ex-picker-hd"><div class="ex-picker-title">골프레슨 빠른추가</div><button class="modal-close" onclick="closeGolfLessonPicker()">×</button></div>'+
    '<div class="gl-picker-search ex-picker-search"><input class="form-input" placeholder="레슨 항목 검색 (예: 샬로윙, 하체턴, ㅅㅋㅍ)" value="'+(p.query||'').replace(/"/g,'&quot;')+'" oninput="updateGolfLessonQuery(this.value)"></div>'+
    '<div class="ex-picker-tabs">'+cats.map(function(c){
      return '<button class="ex-tab '+(p.category===c?'active':'')+'" onclick="setGolfLessonCategory(\''+c+'\')">'+
        (c==='all'?'전체':'피니시'===c?c:c)+' <span>'+catCounts[c]+'</span></button>';
    }).join('')+'</div>'+
    '<div class="ex-picker-list">'+
    (filtered.length===0?'<div class="ex-empty">검색 결과가 없습니다</div>':
    filtered.map(function(x,i){
      var realIdx=GOLF_LESSON_ITEMS.indexOf(x);
      var sel=p.selected.some(function(s){return s._idx===realIdx;});
      return '<div class="ex-item'+(sel?' selected':'')+'" onclick="toggleGolfLessonSelect('+realIdx+')">'+
        '<div class="ex-col"><div class="ex-name">'+x.n+'</div><div class="ex-meta"><span class="ex-sub">'+x.s+'</span> · '+x.f+'</div></div>'+
        (sel?'<div class="ex-check">✓</div>':'')+
      '</div>';
    }).join(''))+
    '</div>'+
    (p.selected.length>0?'<div class="ex-selected-box"><div class="ex-selected-title">선택 '+p.selected.length+'개</div>'+
    p.selected.map(function(s,i){
      return '<div class="ex-sel-row"><span class="ex-sel-name">'+s.n+'</span><button class="ex-sel-rm" onclick="event.stopPropagation();removeGolfLessonSel('+i+')">×</button></div>';
    }).join('')+'</div>':'')+
    '<div class="ex-picker-ft"><button class="btn" onclick="closeGolfLessonPicker()">취소</button><button class="btn primary"'+(p.selected.length===0?' disabled':'')+' onclick="applyGolfLessonPicker()">선택 '+p.selected.length+'개 추가</button></div>'+
  '</div></div>';
}
function updateExerciseQuery(v){S.exercisePicker.query=v;render();setTimeout(function(){var inp=document.querySelector('.ex-picker-search input');if(inp){inp.focus();var l=inp.value.length;try{inp.setSelectionRange(l,l);}catch(e){}}},10);}
function setExerciseCategory(c){S.exercisePicker.category=c;render();}
function toggleExerciseSelect(idx){var ex=EXERCISES[idx];if(!ex) return;var list=S.exercisePicker.selected;var found=list.findIndex(function(x){return x.n===ex.n;});if(found>=0){list.splice(found,1);}else{list.push({n:ex.n,s:ex.s,sets:ex.ds,reps:ex.dr,u:ex.u});}render();}
function updateSelectedEx(i,key,v){var item=S.exercisePicker.selected[i];if(!item) return;var n=parseInt(v,10);if(isFinite(n)&&n>0) item[key]=n;}
function removeSelectedEx(i){S.exercisePicker.selected.splice(i,1);render();}
