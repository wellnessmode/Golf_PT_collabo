function renderRoleSelector(){
  var root=document.getElementById('root');
  var pros=INSTRUCTORS.filter(function(i){return i.role==='pro';});
  var trainers=INSTRUCTORS.filter(function(i){return i.role==='trainer';});
  root.innerHTML=`<div class="role-selector">
    <div class="role-header">
      <img class="role-logo-img" src="assets/logo.png" alt="내셔널짐">
      <p class="role-sub">Collaborative Coaching Platform</p>
    </div>
    <div class="role-section">
      <div class="role-section-label">센터 관리</div>
      <div class="role-row">
        <div class="role-card rc-infodesk" onclick="setRole('infodesk','인포데스크')">
          <div class="role-card-title">인포데스크</div><div class="role-card-desc">회원 등록 · 관리</div>
        </div>
      </div>
    </div>
    <div class="role-section">
      <div class="role-section-label">골프 프로</div>
      <div class="role-row">${pros.map(function(inst){
        return '<div class="role-card rc-pro" onclick="setRole(\'pro\',\''+inst.name+'\')">'+'<div class="role-card-title">'+inst.name+'</div><div class="role-card-desc">골프 레슨 기록</div></div>';
      }).join('')}</div>
    </div>
    <div class="role-section">
      <div class="role-section-label">골프 PT</div>
      <div class="role-row">${trainers.map(function(inst){
        return '<div class="role-card rc-trainer" onclick="setRole(\'trainer\',\''+inst.name+'\')">'+'<div class="role-card-title">'+inst.name+'</div><div class="role-card-desc">골프 PT 기록</div></div>';
      }).join('')}</div>
    </div>
    <div class="role-section">
      <div class="role-section-label">시스템 관리</div>
      <div class="role-row">
        <div class="role-card rc-admin" onclick="setRole('admin','관리자')">
          <div class="role-card-title">관리자</div><div class="role-card-desc">관리자 모드</div>
        </div>
      </div>
    </div>
    <div class="update-notice">
      <div class="update-head" onclick="this.parentElement.classList.toggle('collapsed')">
        <span>${APP_VERSION.version} 업데이트 · ${APP_VERSION.date}</span>
        <span class="update-chevron">▼</span>
      </div>
      <ul class="update-list">${APP_VERSION.changes.map(function(c){return '<li>'+c+'</li>';}).join('')}</ul>
    </div>
  </div>${S.showPwModal?'<div class="modal-overlay" onclick="if(event.target===this)cancelPassword()"><div class="modal" style="width:340px"><div class="modal-title" style="text-align:center">🔒 '+(S.pendingRole?S.pendingRole.user:'')+'</div><div class="form-group"><label class="form-label">비밀번호</label><input class="form-input" type="password" placeholder="비밀번호를 입력하세요" oninput="S.pwInput=this.value" onkeydown="if(event.key===\'Enter\')submitPassword()" autofocus></div>'+(S.pwError?'<div style="color:#993c1d;font-size:12px;margin-bottom:10px;text-align:center">비밀번호가 일치하지 않습니다</div>':'')+'<div class="modal-actions"><button class="btn" onclick="cancelPassword()">취소</button><button class="btn primary" onclick="submitPassword()">확인</button></div></div></div>':''}`;
}

function render(){
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
        <button class="sidebar-bell" onclick="event.stopPropagation();openActivityLog()">${getUnreadCount()>0?'<span class="bell-badge">'+getUnreadCount()+'</span>':''}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></button>
        <button class="sidebar-home-btn" onclick="event.stopPropagation();switchRole()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>
      </div>
    </div>
    ${isInfo ? `
    <div class="sidebar-section-label">전체 회원 관리</div>
    <div class="infodesk-tools">
      <button class="mp-btn" onclick="event.stopPropagation();openDashboard()">대시보드</button>
      <div class="infodesk-summary">PT+골프 ${S.members.filter(function(m){return (m.memberType||'pt_lesson')==='pt_lesson';}).length}명 · 골프 ${S.members.filter(function(m){return m.memberType==='lesson';}).length}명 · 총 ${S.members.length}명</div>
    </div>
    ` : `
    <div class="sidebar-tabs">
      <div class="sidebar-tab${S.sidebarTab==='pt_lesson'?' active':''}" onclick="S.sidebarTab='pt_lesson';render()">PT+골프</div>
      <div class="sidebar-tab${S.sidebarTab==='lesson'?' active':''}" onclick="S.sidebarTab='lesson';render()">골프</div>
    </div>
    `}
    <input class="sidebar-search" placeholder="회원 검색..." value="${(S.memberSearch||'').replace(/"/g,'&quot;')}" oninput="S.memberSearch=this.value;render()" onclick="event.stopPropagation()">
    <div class="member-list">
      ${S.members.filter(function(m){var mType=m.memberType||'pt_lesson';if(!isInfo){if(mType!==S.sidebarTab) return false;if(!(m.assignedTo&&m.assignedTo.indexOf(S.currentUser)!==-1)) return false;}if(S.memberSearch){var q=S.memberSearch.trim().toLowerCase();if(q&&m.name.toLowerCase().indexOf(q)===-1&&getChosung(m.name).indexOf(getChosung(q))===-1) return false;}return true;}).map(m => `
        <div class="member-item${m.id===mid?' active':''}" onclick="selectMember('${m.id}')">
          <div class="member-avatar ${m.color}">${initials(m.name)}</div>
          <div class="member-name">${m.name}${expiryBadge(nearestExpiry(m))}${(m.memberType||'pt_lesson')==='lesson'?'<span class="type-tag lesson-tag">골프</span>':''}</div>
          <div class="session-badge">${(S.sessions[m.id]||[]).length}</div>
          <div class="member-actions">
            ${(isInfo&&!isAdmin)?'<button class="member-edit-btn" onclick="event.stopPropagation();openEditMember(\''+m.id+'\')">'+'수정</button>':''}
            ${(isInfo&&!isAdmin)&&!S.deleteRequests[m.id]?'<button class="member-del-btn" onclick="event.stopPropagation();requestDelete(\''+m.id+'\')">'+'삭제</button>':''}
            ${S.deleteRequests[m.id]?'<span class="del-pending-badge">삭제대기</span>':''}
          </div>
        </div>`).join('')}
    </div>
    ${(isInfo&&!isAdmin)?'<div class="add-member-btn" onclick="openAddMember()">+ 새 회원 등록</div>':''}
    <div class="sidebar-mypage">
      ${!isInfo?'<button class="mp-btn dash-btn" onclick="event.stopPropagation();openDashboard()">대시보드</button>':''}
      <div class="mp-label">마이페이지</div>
      ${S.currentRole!=='admin'?'<button class="mp-btn" onclick="openPasswordChange()">비밀번호 변경</button>':''}
      ${S.currentRole==='admin'?'<button class="mp-btn" onclick="openAuditLog()">감사 로그</button>':''}
      ${isInfo?'<button class="mp-btn" onclick="event.stopPropagation();window.open(\'manual.html\',\'_blank\')">사용 매뉴얼</button>':''}
    </div>
    ${syncBadge()}
  </div>
  <button class="mobile-toggle" onclick="toggleSidebar()">☰</button>

  <div class="main">
    ${member ? `
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
        <button class="btn" onclick="openImageCard()" title="이미지 카드">카드</button>
        <button class="btn" onclick="openReport()" title="회원 리포트">리포트</button>
        ${(S.handovers[mid]&&S.handovers[mid].length>0)?'<button class="btn ho-btn" onclick="openHandover(\''+mid+'\')" title="인수인계 기록">인수인계 <span class="ho-count">'+S.handovers[mid].length+'</span></button>':''}
        ${!isInfo?'<button class="btn primary" onclick="openAddSession()">+ 세션 기록</button>':''}
        ${S.deleteRequests[mid]&&!isInfo?'<button class="btn danger" onclick="approveDelete(\''+mid+'\')">'+'삭제 승인</button><button class="btn" onclick="rejectDelete(\''+mid+'\')">'+'거절</button>':''}
      </div>
    </div>
    <div class="content">
      ${st ? `<div class="stat-row"><div class="stat"><div class="stat-val">${st.total}</div><div class="stat-lbl">총 세션</div></div><div class="stat"><div class="stat-val blue">${st.pro}</div><div class="stat-lbl">골프 프로</div></div><div class="stat"><div class="stat-val green">${st.trainer}</div><div class="stat-lbl">골프 PT</div></div></div>` : ''}

      <div class="section-card">
        <div class="section-header${S.assessOpen?' open':''}" onclick="toggleAssess()">
          <div class="section-label"><div class="dot dot-green"></div>체형 기능 평가<span class="sec-count">(${ASSESSMENT_ITEMS.filter(i=>{const v=assess[i.key];return v&&v.result&&v.result!=='미검사'}).length}/${ASSESSMENT_ITEMS.length})${assess._date?' · '+assess._date:''}${assess._history&&assess._history.length>0?' · 히스토리 '+assess._history.length+'회':''}</span></div>
          <div class="chevron">▼</div>
        </div>
        ${S.assessOpen ? `
        <div class="assess-meta">
          <label class="assess-date-label">평가일</label>
          <input type="date" class="assess-date-input" value="${assess._date||''}" ${isInfo?'disabled':''} onchange="updateAssessDate(this.value)">
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
            <div class="filter-btn${S.filterAuthor==='all'?' active':''}" onclick="setFilter('all')">전체</div>
            <div class="filter-btn${S.filterAuthor==='pro'?' pro-active':''}" onclick="setFilter('pro')">프로</div>
            <div class="filter-btn${S.filterAuthor==='trainer'?' trainer-active':''}" onclick="setFilter('trainer')">트레이너</div>
          </div>
        </div>
        ${warnings.length>0 ? `<div class="warning-banner${S.warningBannerCollapsed?' collapsed':''}"><div class="wb-head" onclick="toggleWarningBanner()"><span>체형 제한 ${warnings.length}개 확인 — 레슨/운동 전 검토 필요</span><span class="wb-chevron">▼</span></div><div class="wb-body">${warnings.map(function(w){return '<div class="wb-item"><strong>'+w.name+'</strong> ('+w.result+'): '+w.impact+'</div>';}).join('')}</div></div>` : ''}
        <div class="sessions-list">
          ${sessions.length===0 ? `<div class="empty-state">기록된 세션이 없습니다<br><span style="font-size:11px">상단 '+ 세션 기록' 버튼으로 추가하세요</span></div>` :
          sessions.map(s => `
            <div class="session-card">
              <div class="session-hd ${getRole(s.author)==='pro'?'pro':'trainer'}">
                <div class="role-tag ${getRole(s.author)==='pro'?'pro':'trainer'}">${getRole(s.author)==='pro'?'GOLF PRO':'GOLF PT'}</div>
                <div class="session-author">${s.author}</div>
                <div class="session-date">${s.date}</div>
                ${s.author!==S.currentUser&&s._addedAt&&s._addedAt>(S.lastSeen[S.currentUser]||'')?'<span class="new-badge">NEW</span>':''}
              </div>
              <div class="session-bd">
                <div class="session-content">${s.content}</div>
                ${s.media&&s.media.length>0?'<div class="session-media">'+s.media.map(function(m,mi){var localSrc=m.mediaId?(S.mediaUrls[m.mediaId]||''):'';var remoteSrc=(r2.enabled&&(m.r2Key||m.mediaId))?r2.url(m.r2Key||m.mediaId):'';var src=localSrc||remoteSrc||(m.data||'');var mime=m.mimeType||(m.data||'').slice(5,30)||'';var isImg=mime.indexOf('image/')!==-1||(m.data&&m.data.indexOf('image/')!==-1);var isVideo=mime.indexOf('video/')!==-1||(m.data&&m.data.indexOf('video/')!==-1);if(m.type==='file'&&src&&isImg) return '<img class="sm-thumb" src="'+src+'" onclick="openMediaView(this.src)" alt="'+((m.name||'').replace(/"/g,'&quot;'))+'">';if(m.type==='file'&&src&&isVideo){var vid='v_'+s.id+'_'+mi;return '<div class="video-wrap" id="wrap_'+vid+'"><video class="sm-video" id="'+vid+'" src="'+src+'" controls playsinline preload="auto" crossorigin="anonymous"></video><div class="video-controls"><button class="vc-btn" onclick="toggleLoop(\''+vid+'\')" id="loop_'+vid+'" title="반복 재생">반복</button><span class="vc-spacer"></span><button class="vc-btn" onclick="setSpeed(\''+vid+'\',1)">1x</button><button class="vc-btn" onclick="setSpeed(\''+vid+'\',0.5)">0.5x</button><button class="vc-btn" onclick="setSpeed(\''+vid+'\',0.25)">0.25x</button><button class="vc-btn" onclick="setSpeed(\''+vid+'\',0.125)">0.125x</button><span class="vc-speed" id="spd_'+vid+'">1x</span></div></div>';}if(m.type==='file'&&!src) return '<div class="sm-missing">미디어 로딩 중</div>';return '';}).join('')+'</div>':''}
                ${s._ai?'<div class="ai-summary"><div class="ai-header">AI 분석</div><div class="ai-body"><p class="ai-text">'+s._ai.summary+'</p>'+(s._ai.next_focus?'<div class="ai-focus">다음 집중: '+s._ai.next_focus+'</div>':'')+'<div class="ai-recs"><div class="ai-rec-col"><div class="ai-rec-title">골프 훈련</div>'+(s._ai.golf_drills||[]).map(function(d){return '<div class="ai-rec-item">'+d+'</div>';}).join('')+'</div><div class="ai-rec-col"><div class="ai-rec-title">웨이트</div>'+(s._ai.weight_training||[]).map(function(d){return '<div class="ai-rec-item">'+d+'</div>';}).join('')+'</div></div></div></div>':''}
                <div class="session-actions">
                  ${!isInfo?'<button class="small-btn edit" onclick="openEditSession(\''+s.id+'\')">'+'수정</button>':''}
                  ${!isInfo?'<button class="small-btn del" onclick="deleteSession(\''+s.id+'\')">'+'삭제</button>':''}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    ` : `
    ${S.showDashboard ? renderDashboard() : `<div class="no-member"><div class="no-member-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div style="font-size:14px;font-weight:600;color:var(--tx-3)">회원을 선택하세요</div><div style="font-size:12px;color:var(--tx-3)">좌측에서 회원을 클릭하거나 새 회원을 등록하세요</div></div>`}`}
  </div>

  ${S.showAddSession ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">${S.editSessionId?'세션 기록 수정':'세션 기록 추가'} — ${member?member.name+' 회원님':''}</div>
      <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" value="${S.newSession.date}" onchange="updateNS('date',this.value)"></div>
      <div class="form-group"><label class="form-label">담당자</label><div class="radio-group">${INSTRUCTORS.map(function(inst){var isMe=inst.name===S.currentUser;var sel=S.newSession.author===inst.name?(inst.role==='pro'?' sel-pro':' sel-trainer'):'';if(!isMe) return '<div class="radio-opt disabled" style="opacity:0.4;pointer-events:none">'+inst.name+'</div>';return '<div class="radio-opt'+sel+'" onclick="updateNS(\'author\',\''+inst.name+'\')">'+ inst.name+'</div>';}).join('')}</div></div>
      <div class="form-group"><label class="form-label">${getRole(S.newSession.author)==='trainer'?'PT레슨 내용':'골프레슨 내용'} ${getRole(S.newSession.author)==='trainer'?'<button type="button" class="ex-add-btn" onclick="openExercisePicker()">+ 운동 빠른추가</button>':'<button type="button" class="ex-add-btn" onclick="openGolfLessonPicker()">+ 레슨 빠른추가</button>'}</label><textarea class="form-textarea" placeholder="${getRole(S.newSession.author)==='trainer'?'웨이트 트레이닝, 기능성 훈련, 모빌리티, 코어 안정화 등':'오늘 진행한 레슨 내용을 입력하세요'}" oninput="updateNS('content',this.value)">${S.newSession.content}</textarea></div>
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
  ${renderImageCardModal()}
  `;
  setTimeout(function(){if(S.memberSearch){var el=document.querySelector('.sidebar-search');if(el){el.focus();el.setSelectionRange(S.memberSearch.length,S.memberSearch.length);}}if(S.exercisePicker&&S.exercisePicker.open&&S.exercisePicker.query){var el2=document.querySelector('.ex-picker-search input');if(el2){el2.focus();el2.setSelectionRange(S.exercisePicker.query.length,S.exercisePicker.query.length);}}},0);
}

// ============ 이벤트 핸들러 ============
function selectMember(id){S.selectedMember=id; S.filterAuthor='all'; S.sidebarOpen=false; render();}
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
