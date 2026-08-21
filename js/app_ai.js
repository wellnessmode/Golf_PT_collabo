// ============ 로컬 AI 분석 (키워드 기반, API 불필요) ============
var GOLF_KEYWORDS = {
  '셋업': {keywords:['그립','어드레스','포스처','볼 포지션','얼라인먼트','스탠스','셋업'], drills:['그립 체크','포스처 체크','볼 포지션 드릴','알라이먼트 스틱 드릴']},
  '백스윙': {keywords:['백스윙','테이크어웨이','숄더턴','어깨 회전','코킹','힌지','탑 포지션','오버스윙','플레인'], drills:['원피스 테이크어웨이','숄더 턴 드릴','하프 백스윙 드릴','탑 포지션 홀드']},
  '다운스윙': {keywords:['다운스윙','전환','트랜지션','하체','힙','골반','샬로윙','라그','슬롯','시퀀스','범프','인사이드','지면반력'], drills:['하체 리드 드릴','샬로윙 연습','라그 유지 드릴','범프 드릴','힙 클리어 드릴']},
  '임팩트': {keywords:['임팩트','핸드퍼스트','스쿠핑','플리핑','컴프레션','스매시','디센딩'], drills:['임팩트 백 드릴','핸드 퍼스트 연습','스쿠핑 방지 드릴','임팩트 포지션 홀드']},
  '릴리스': {keywords:['릴리스','손목','팔로스루','피니시','익스텐션','로테이션'], drills:['손목 릴리스 드릴','팔로스루 체크','피니시 밸런스']},
  '구질': {keywords:['드로우','페이드','슬라이스','훅','푸시','풀','탑핑','뒤땅','생크','탄도','구질'], drills:['인텐셔널 페이드','인텐셔널 드로우','슬라이스 교정 드릴','훅 교정 드릴']},
  '숏게임': {keywords:['칩','피치','벙커','로브','어프로치','웨지','스핀','업앤다운'], drills:['칩 샷 드릴','피치 컨트롤','벙커 익스플로전','웨지 거리 컨트롤']},
  '퍼팅': {keywords:['퍼팅','퍼트','스트로크','라인','브레이크','래그','그린'], drills:['퍼팅 거리 드릴','퍼팅 방향 드릴','게이트 드릴','브레이크 리딩']},
  '드라이버': {keywords:['드라이버','티샷','비거리','어퍼블로','런치'], drills:['드라이버 어퍼 블로','드라이버 페이드','드라이버 드로우']},
  '템포': {keywords:['템포','리듬','속도','타이밍','메트로놈'], drills:['템포 드릴','메트로놈 스윙','슬로우 모션 스윙']},
  '스피드': {keywords:['스피드','스윙속도','파워','폭발력'], drills:['스윙 스피드 트레이닝','스피드 스틱','지면반력 드릴']},
};
var PT_KEYWORDS = {
  '하체': {keywords:['스쿼트','런지','데드리프트','힙','둔근','대퇴','햄스트링','카프','레그'], exercises:['스쿼트','루마니안 데드리프트','불가리안 SS','힙 쓰러스트','레그 프레스']},
  '상체': {keywords:['벤치','프레스','로우','풀업','푸쉬업','숄더','래터럴','컬','삼두','이두','가슴','등','어깨'], exercises:['벤치프레스','덤벨 로우','숄더 프레스','랫풀다운','페이스 풀']},
  '코어': {keywords:['코어','플랭크','데드버그','크런치','복근','버드독','팔로프','항회전'], exercises:['플랭크','사이드 플랭크','데드버그','팔로프 프레스','행잉 레그 레이즈']},
  '회전': {keywords:['회전','로테이션','우드찹','메디신볼','MB','랜드마인','사선'], exercises:['메디신볼 회전 슬램','케이블 우드 찹','랜드마인 트위스트','로테이셔널 MB 쓰로우']},
  '모빌리티': {keywords:['모빌리티','가동성','스트레치','흉추','고관절','CARs','FRC','90/90'], exercises:['T스파인 로테이션','90/90 힙 트위스트','월드 그레이티스트 스트레치','힙 CARs']},
  '안정성': {keywords:['안정성','밸런스','싱글레그','보수','프리오셉션','고유감각'], exercises:['싱글 레그 RDL','힙 에어플레인','보수볼 스탠스','Y밸런스 테스트']},
  '파워': {keywords:['파워','폭발력','점프','스윙','케틀벨','클린','스내치'], exercises:['케틀벨 스윙','박스 점프','파워 클린','메디신볼 슬램']},
};

function generateLocalSummary(memberId, session){
  if(session._ai) return;
  if(!session.content || session.content.trim().length<5) return;
  // 요약 인용에는 헤더([레슨 녹음 메모...] 등)·마크다운 기호·불릿 대시를 걷어낸 본문만 사용
  var plain = session.content.replace(/^\[[^\]]*\]\s*/,'').replace(/^#+\s.*$/gm,'').replace(/^[-•*]\s*/gm,'').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
  if(plain.length<5) plain=session.content.trim();
  var content = session.content.toLowerCase();
  var role = getRole(session.author);
  var detected = [];
  var drills = [];
  var exercises = [];

  if(role==='pro'){
    Object.keys(GOLF_KEYWORDS).forEach(function(cat){
      var k = GOLF_KEYWORDS[cat];
      var matched = k.keywords.filter(function(w){return content.indexOf(w)!==-1;});
      if(matched.length>0){
        detected.push(cat);
        drills = drills.concat(k.drills.slice(0, 2));
      }
    });
    // PT 추천도 추가
    var ptRecs = [];
    Object.keys(PT_KEYWORDS).forEach(function(cat){
      var k = PT_KEYWORDS[cat];
      // 골프 키워드와 연관된 PT 추천
      if(detected.indexOf('다운스윙')!==-1 && (cat==='하체'||cat==='회전'||cat==='코어')) ptRecs=ptRecs.concat(k.exercises.slice(0,1));
      if(detected.indexOf('백스윙')!==-1 && (cat==='모빌리티'||cat==='회전')) ptRecs=ptRecs.concat(k.exercises.slice(0,1));
      if(detected.indexOf('임팩트')!==-1 && (cat==='코어'||cat==='하체')) ptRecs=ptRecs.concat(k.exercises.slice(0,1));
      if(detected.indexOf('스피드')!==-1 && (cat==='파워'||cat==='하체')) ptRecs=ptRecs.concat(k.exercises.slice(0,1));
    });
    if(ptRecs.length===0) ptRecs=['코어 안정화 훈련','흉추 모빌리티','힙 파워 트레이닝'];
    session._ai = {
      summary: detected.length>0 ? detected.join(' · ')+' 관련 레슨 진행. '+plain.slice(0,60)+(plain.length>60?'...':'') : plain.slice(0,80)+(plain.length>80?'...':''),
      golf_drills: drills.length>0 ? drills.slice(0,3) : ['기본 스윙 드릴','숏게임 연습','퍼팅 루틴'],
      weight_training: ptRecs.slice(0,3),
      next_focus: detected.length>0 ? detected[0]+' 심화 연습 권장' : '기본기 반복 훈련'
    };
  } else {
    // 트레이너
    Object.keys(PT_KEYWORDS).forEach(function(cat){
      var k = PT_KEYWORDS[cat];
      var matched = k.keywords.filter(function(w){return content.indexOf(w)!==-1;});
      if(matched.length>0){
        detected.push(cat);
        exercises = exercises.concat(k.exercises.slice(0, 2));
      }
    });
    var golfRecs = [];
    if(detected.indexOf('회전')!==-1) golfRecs.push('하체턴 드릴','샬로윙 연습');
    if(detected.indexOf('하체')!==-1) golfRecs.push('지면반력 드릴','웨이트 시프트');
    if(detected.indexOf('코어')!==-1) golfRecs.push('임팩트 포지션 연습','피니시 밸런스');
    if(detected.indexOf('모빌리티')!==-1) golfRecs.push('백스윙 플레인 체크','숄더 턴 드릴');
    if(golfRecs.length===0) golfRecs=['스윙 템포 연습','숏게임 연습','퍼팅 드릴'];
    session._ai = {
      summary: detected.length>0 ? detected.join(' · ')+' 훈련 진행. '+plain.slice(0,60)+(plain.length>60?'...':'') : plain.slice(0,80)+(plain.length>80?'...':''),
      golf_drills: golfRecs.slice(0,3),
      weight_training: exercises.length>0 ? exercises.slice(0,3) : ['코어 안정화','하체 근력 훈련','모빌리티 루틴'],
      next_focus: detected.length>0 ? detected[0]+' 강화 훈련 지속' : '전신 밸런스 훈련'
    };
  }
  save();
}

// ============ 세션 수정 ============
function openEditSession(sid){
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(s){return s.id===sid;});
  if(!sess) return;
  S.editSessionId = sid;
  S.newSession = {
    date: sess.date,
    time: sess.time || '',
    author: sess.author,
    content: sess.content,
    rawTranscript: sess.rawTranscript || '',   // 녹음 원문 — 저장된 일지도 AI로 다시 정리할 수 있게
    media: (sess.media||[]).slice(),
    mediaUrls:['','']
  };
  S.showAddSession = true;
  render();
}
function saveEditSession(){
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(s){return s.id===S.editSessionId;});
  if(!sess) return;
  if(!S.newSession.content.trim()){alert('내용을 입력하세요');return;}
  sess.date = S.newSession.date;
  sess.time = S.newSession.time || undefined;
  sess.content = S.newSession.content.trim();
  sess.media = (S.newSession.media||[]).slice();
  logActivity('세션 수정', mid, sess.content.slice(0,40));
  logAudit('session','세션 수정',(S.members.find(function(x){return x.id===mid;})||{}).name||'',{date:sess.date,content:sess.content.slice(0,80)});
  S.editSessionId = null;
  S.showAddSession = false;
  save(); render();
  syncSessionUp(mid, sess);
  try{ if(typeof autoPublishReport==='function') autoPublishReport(mid); }catch(e){}   // 고정 리포트 링크 자동 갱신
}

// ============ 대시보드 ============
function openDashboard(){S.showDashboard=true;S.showLiveSession=false;S.selectedMember=null;render();}
// 대시보드 최근 활동 → 해당 회원의 그 일지를 펼쳐서 열기
function openSessionFromDash(mid, sid){
  if(!S.openSessions) S.openSessions={};
  S.openSessions[sid]=true;
  selectMember(mid);
  setTimeout(function(){
    try{ var el=document.querySelector('.session-hd[onclick*="'+sid+'"]'); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){}
  }, 150);
}
function closeDashboard(){S.showDashboard=false;render();}
// 홈 대시보드 — 회원을 선택하지 않은 기본 화면 (로그인 착지점).
// 예전엔 담당 첫 회원이 자동 선택돼 "첫 화면이 맨날 로버트" 였음.
function renderDashboard(){
  var isInfo = S.currentRole==='infodesk'||S.currentRole==='admin';
  var visibleMembers = S.members.filter(function(m){
    if(m.ownerWatch) return false;   // 관찰용 회원은 통계·목록 어디에도 산입 안 함 (사이드바에서만 접근)
    if(isInfo) return true;
    return m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1;
  });
  var totalMembers = visibleMembers.length;
  var totalSessions = 0;
  var proSessions = 0;
  var trainerSessions = 0;
  var thisMonthSessions = 0;
  var todaySessions = 0;
  var todayStr = today();
  var thisMonth = today().slice(0,7);
  var expiringMembers = [];
  var recentActivity = [];
  visibleMembers.forEach(function(m){
    var sess = S.sessions[m.id]||[];
    totalSessions += sess.length;
    sess.forEach(function(s){
      if(getRole(s.author)==='pro') proSessions++;
      else trainerSessions++;
      if(s.date.slice(0,7)===thisMonth) thisMonthSessions++;
      if(s.date===todayStr) todaySessions++;
      recentActivity.push({member:m.name, mid:m.id, date:s.date, time:s.time||'', author:s.author, content:s.content, id:s.id, _addedAt:s._addedAt});
    });
    // 레슨/PT 각각 만료 임박 체크
    ['golfLessonExpiry','golfPTExpiry','expiry'].forEach(function(key){
      var val = m[key];
      if(!val) return;
      // expiry는 레슨/PT 값이 있으면 건너뜀 (하위호환용)
      if(key==='expiry' && (m.golfLessonExpiry||m.golfPTExpiry)) return;
      var d = daysUntilExpiry(val);
      if(d!==null && d>=0 && d<=30){
        var label = key==='golfPTExpiry'?'PT':(key==='golfLessonExpiry'?'레슨':'');
        expiringMembers.push({name:m.name+(label?' ('+label+')':''), days:d, expiry:val});
      }
    });
  });
  recentActivity.sort(sessionCompare); // 날짜+시간 기준 최신순 (앱 공통 정렬 규칙)
  recentActivity = recentActivity.slice(0,15);
  expiringMembers.sort(function(a,b){return a.days-b.days;});
  // 지도자별 세션 수
  var instructorStats = {};
  INSTRUCTORS.forEach(function(i){instructorStats[i.name]=0;});
  visibleMembers.forEach(function(m){
    (S.sessions[m.id]||[]).forEach(function(s){
      if(instructorStats.hasOwnProperty(s.author)) instructorStats[s.author]++;
    });
  });
  // 회원별 진행률
  var memberProgress = visibleMembers.map(function(m){
    var sess = (S.sessions[m.id]||[]);
    var st = stats(m.id);
    var lessonTotal = parseInt(m.golfLessonCount)||0;
    var ptTotal = parseInt(m.golfPTCount)||0;
    var lessonPct = lessonTotal>0?Math.min(100,Math.round(st.pro/lessonTotal*100)):0;
    var ptPct = ptTotal>0?Math.min(100,Math.round(st.trainer/ptTotal*100)):0;
    return {name:m.name, id:m.id, total:sess.length, lessonPct:lessonPct, ptPct:ptPct, pro:st.pro, trainer:st.trainer, lessonTotal:lessonTotal, ptTotal:ptTotal};
  }).sort(function(a,b){return b.total-a.total;});

  var isStaff = S.currentRole==='pro'||S.currentRole==='trainer';
  var todayLabel = (function(){ var d=new Date(); return (d.getMonth()+1)+'월 '+d.getDate()+'일 '+['일','월','화','수','목','금','토'][d.getDay()]+'요일'; })();
  return `
  <div class="dashboard">
    <div class="dash-header">
      <h2>${isStaff?('안녕하세요, '+S.currentUser+'님 👋'):'대시보드'}</h2>
      <span class="dash-ver">${todayLabel} · ${APP_VERSION.version}</span>
    </div>
    ${S.currentRole!=='infodesk'?'<button class="dash-live-btn" onclick="openLiveSession()">🏌️ 수업 센터 <small>타석 레슨 시작 · 트랙맨 샷 자동 저장</small></button>':''}
    ${(function(){
      var dm=visibleMembers.filter(function(m){return m.reportDirty&&m.reportId;});
      if(!dm.length) return '';
      // 오래 밀린 순으로 — 며칠씩 방치된 검토부터 위에
      dm.sort(function(a,b){ return String(a.reportDirty).localeCompare(String(b.reportDirty)); });
      return '<div class="dash-card dash-review-card"><h3>📤 리포트 검토 대기 <b>'+dm.length+'</b>명 <small>검토 완료를 눌러야 회원 링크에 반영됩니다</small></h3>'
        +dm.map(function(m){
          var last=(S.sessions[m.id]||[]).slice().sort(sessionCompare)[0];
          var lastD=last&&last.date ? String(last.date).slice(5).replace('-','.') : '';
          var days=Math.floor((Date.now()-(Date.parse(m.reportDirty)||Date.now()))/86400000);
          var wait=days<=0?'오늘':days+'일째 대기';
          return '<button class="dash-review-row" onclick="selectMember(\''+m.id+'\');openPerformance()">'
            +'<span>'+m.name+(lastD?'<small>레슨 '+lastD+'</small>':'')+'</span>'
            +'<i class="drr-days'+(days>=3?' late':'')+'">'+wait+'</i>'
            +'<em>검토 →</em></button>';
        }).join('')
        +'</div>';
    })()}
    <div class="dash-stats">
      <div class="dash-stat"><div class="ds-val green">${todaySessions}</div><div class="ds-lbl">오늘 세션</div></div>
      <div class="dash-stat"><div class="ds-val blue">${thisMonthSessions}</div><div class="ds-lbl">이번 달</div></div>
      <div class="dash-stat"><div class="ds-val">${totalMembers}</div><div class="ds-lbl">회원</div></div>
      <div class="dash-stat"><div class="ds-val">${totalSessions}</div><div class="ds-lbl">총 세션</div></div>
      <div class="dash-stat"><div class="ds-val amber">${trainerSessions}</div><div class="ds-lbl">PT 세션</div></div>
    </div>
    <div class="dash-grid">
      ${isInfo?`<div class="dash-card">
        <h3>지도자별 세션</h3>
        <div class="dash-bar-list">${Object.keys(instructorStats).map(function(name){
          var cnt = instructorStats[name];
          var pct = totalSessions>0?Math.round(cnt/totalSessions*100):0;
          return '<div class="dash-bar-row"><span class="dbr-name">'+name+'</span><div class="dbr-bar-wrap"><div class="dbr-bar '+(name.indexOf('프로')!==-1?'pro':'trainer')+'" style="width:'+pct+'%"></div></div><span class="dbr-cnt">'+cnt+'</span></div>';
        }).join('')}</div>
      </div>`:''}
      <div class="dash-card">
        <h3>만료 임박 회원</h3>
        ${expiringMembers.length>0?'<div class="dash-expire-list">'+expiringMembers.map(function(e){
          return '<div class="dash-expire-item"><span>'+e.name+'</span><span class="exp-badge exp-soon">D-'+e.days+'</span><span class="de-date">~'+e.expiry+'</span></div>';
        }).join('')+'</div>':'<div class="empty-state" style="padding:20px">30일 이내 만료 회원이 없습니다</div>'}
      </div>
    </div>
    <div class="dash-card" style="margin-top:12px">
      <h3>회원별 진행률</h3>
      <div class="dash-progress-list">
        ${memberProgress.map(function(p){
          return '<div class="dash-prog-row" onclick="selectMember(\''+p.id+'\');closeDashboard()">'+
            '<span class="dp-name">'+p.name+'</span>'+
            '<div class="dp-bars">'+
              '<div class="dp-bar-group"><span class="dp-lbl">레슨</span><div class="dp-bar-wrap"><div class="dp-bar pro" style="width:'+p.lessonPct+'%"></div></div><span class="dp-pct">'+p.pro+'/'+p.lessonTotal+'</span></div>'+
              '<div class="dp-bar-group"><span class="dp-lbl">PT</span><div class="dp-bar-wrap"><div class="dp-bar trainer" style="width:'+p.ptPct+'%"></div></div><span class="dp-pct">'+p.trainer+'/'+p.ptTotal+'</span></div>'+
            '</div>'+
          '</div>';
        }).join('')}
      </div>
    </div>
    <div class="dash-card" style="margin-top:12px">
      <h3>최근 활동 (최근 15건)</h3>
      <div class="dash-recent">
        ${recentActivity.map(function(a){
          var prevTxt=String(a.content||'').replace(/^##\s+/gm,'').replace(/\*\*/g,'').replace(/^[-•·]\s+/gm,'').replace(/\s+/g,' ').trim();
          return '<div class="dash-recent-item clickable" onclick="openSessionFromDash(\''+a.mid+'\',\''+a.id+'\')"><span class="dr-date">'+a.date+(a.time?'<em class="dr-time">'+timeLabel(a.time)+'</em>':'')+'</span><span class="dr-member">'+a.member+'</span><span class="dr-author role-tag '+(getRole(a.author)==='pro'?'pro':'trainer')+'">'+(getRole(a.author)==='pro'?'PRO':'PT')+'</span><span class="dr-content">'+prevTxt.slice(0,50)+(prevTxt.length>50?'…':'')+'</span><span class="dr-open">열기 ›</span></div>';
        }).join('')||'<div class="empty-state" style="padding:20px">최근 활동이 없습니다</div>'}
      </div>
    </div>
  </div>`;
}

function addMember(){
  const name = S.newMember.name.trim();
  if(!name){alert('이름을 입력하세요'); return;}
  const id = uid();
  const color = AVATAR_COLORS[S.members.length % AVATAR_COLORS.length];
  const m = {
    id, name, color,
    phone:S.newMember.phone||'', email:S.newMember.email||'',
    registeredDate:S.newMember.registeredDate||today(),
    golfLessonCount:S.newMember.golfLessonCount,
    golfPTCount:S.newMember.golfPTCount,
    golfLessonAmount:S.newMember.golfLessonAmount,
    golfPTAmount:S.newMember.golfPTAmount,
    expiry:S.newMember.expiry||'',
    golfLessonExpiry:S.newMember.golfLessonExpiry||'',
    golfPTExpiry:S.newMember.golfPTExpiry||'',
    assignedTo:S.newMember.assignedTo||[],
    memberType:S.newMember.memberType||'pt_lesson',
    handicap:S.newMember.handicap||'',
    avgScore:S.newMember.avgScore||'',
    goal:S.newMember.goal||'',
    focusPoints:S.newMember.focusPoints||''
  };
  S.members.push(m);
  S.assessments[id] = {};
  S.sessions[id] = [];
  S.selectedMember = id;
  S.showAddMember = false;
  logActivity('회원 등록', id, name);
  logAudit('member','회원 등록',name,{phone:m.phone,email:m.email,registeredDate:m.registeredDate,expiry:m.expiry});
  save(); render();
  syncMemberUp(m);
}


async function handleFileUpload(input, view){
  var files=Array.from(input.files||[]);
  if(!files.length)return;
  var existing=S.newSession.media||[];
  // view별로 1개만 허용
  if(view){
    var exists = existing.find(function(x){return x.view===view;});
    if(exists){alert(view==='front'?'정면 영상이 이미 있습니다':'측면 영상이 이미 있습니다');input.value='';return;}
  }
  var MAX_FILE_SIZE = 100*1024*1024;
  if(!mediaDB.db){
    var ok = await mediaDB.init();
    if(!ok){alert('브라우저가 IndexedDB를 지원하지 않습니다.\nURL 입력을 사용해주세요.');input.value='';return;}
  }
  if(navigator.storage && navigator.storage.persist){
    try{await navigator.storage.persist();}catch(e){}
  }
  var est = await getStorageEstimate();
  if(est && est.quota){
    var totalWanted = files.reduce(function(a,f){return a+f.size;},0);
    var remaining = est.quota - est.usage;
    if(totalWanted > remaining * 0.8){
      console.warn('storage low');
      input.value=''; return;
    }
  }
  input.value='';
  for(var i=0;i<files.length;i++){
    var origFile = files[i];
    if(origFile.size > MAX_FILE_SIZE){
      alert(origFile.name+' : '+(origFile.size/1024/1024).toFixed(1)+'MB\n파일당 최대 100MB까지 가능합니다.');
      continue;
    }
    S.uploading++;
    S.uploadMsg = '저장 중...';
    render();
    var file = origFile;
    var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    var resolvedMime = file.type || inferMime(file.name);
    var saved = await mediaDB.put(mediaId, file, {mimeType:resolvedMime, name:file.name});
    S.uploading--;
    S.uploadMsg = '';
    if(!saved){
      console.warn('file save failed');
      render();
      continue;
    }
    var verify = await mediaDB.get(mediaId);
    if(!verify || !verify.blob){
      console.warn('file verify failed');
      render();
      continue;
    }
    try{S.mediaUrls[mediaId] = URL.createObjectURL(file);}catch(e){}
    var mediaItem = {type:'file', view:view||'other', name:file.name, mimeType:resolvedMime, size:file.size, mediaId:mediaId};
    // R2 업로드 (백그라운드) — 성공 시 r2Key 기록
    if(r2.enabled){
      mediaItem.r2Key = mediaId;
      mediaItem.r2Status = 'uploading';
      (function(item, blob, sessDraft){
        r2.upload(mediaId, blob).then(function(ok){
          item.r2Status = ok ? 'synced' : 'failed';
          render();
          // 이미 세션이 저장된 이후라면 세션 메타를 재업로드해서 r2Key 동기화
          try{
            var sid = S.selectedMember;
            var stored = sid && (S.sessions[sid]||[]).find(function(x){
              return (x.media||[]).some(function(mm){return mm.mediaId===mediaId;});
            });
            if(stored) syncSessionUp(sid, stored);
          }catch(e){}
        });
      })(mediaItem, file, S.newSession);
    }
    S.newSession.media.push(mediaItem);
    render();
    if(view) break; // view별 1개만
  }
}
async function handleExerciseVideoUpload(input){
  var files = Array.from(input.files||[]);
  if(!files.length) return;
  input.value='';
  for(var i=0;i<files.length;i++){
    await handleFileUploadSingle(files[i], 'exercise');
  }
}
async function handleFileUploadSingle(file, view){
  var MAX_FILE_SIZE = 100*1024*1024;
  if(file.size > MAX_FILE_SIZE){
    alert(file.name+' : '+(file.size/1024/1024).toFixed(1)+'MB\n파일당 최대 100MB까지 가능합니다.');
    return;
  }
  if(!mediaDB.db){
    var ok = await mediaDB.init();
    if(!ok){alert('브라우저가 IndexedDB를 지원하지 않습니다.');return;}
  }
  S.uploading++;
  S.uploadMsg = '저장 중...';
  render();
  var processed = file;
  var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  var resolvedMime = processed.type || inferMime(file.name);
  var saved = await mediaDB.put(mediaId, processed, {mimeType:resolvedMime, name:file.name});
  S.uploading--;
  S.uploadMsg = '';
  if(!saved){console.warn('file save failed'); render(); return;}
  try{S.mediaUrls[mediaId] = URL.createObjectURL(processed);}catch(e){}
  var mediaItem = {type:'file', view:view, name:file.name, mimeType:resolvedMime, size:processed.size, mediaId:mediaId};
  if(r2.enabled){
    mediaItem.r2Key = mediaId;
    mediaItem.r2Status = 'uploading';
    (function(item, blob){
      r2.upload(mediaId, blob).then(function(ok){
        item.r2Status = ok ? 'synced' : 'failed';
        render();
        // 세션이 이미 저장된 뒤 업로드가 끝났으면 세션 메타를 재동기화 (r2Key 반영)
        try{
          var sid = S.selectedMember;
          var stored = sid && (S.sessions[sid]||[]).find(function(x){
            return (x.media||[]).some(function(mm){return mm.mediaId===mediaId;});
          });
          if(stored) syncSessionUp(sid, stored);
        }catch(e){}
      });
    })(mediaItem, processed);
  }
  S.newSession.media.push(mediaItem);
  render();
}
// 업로드 실패 영상 수동 재업로드 (세션카드 배지에서 호출)
async function retryMediaUpload(sid, mi){
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(x){return x.id===sid;});
  var item = sess && sess.media && sess.media[mi];
  if(!item) return;
  if(!item.mediaId){ alert('로컬 원본이 없어 재업로드할 수 없습니다'); return; }
  var rec = await mediaDB.get(item.mediaId);
  if(!rec || !rec.blob){ alert('이 기기에 원본이 없습니다.\n업로드했던 기기에서 앱을 열면 자동 재업로드됩니다.'); return; }
  item.r2Status='uploading'; render();
  var ok = await r2.upload(item.r2Key||item.mediaId, rec.blob);
  item.r2Status = ok ? 'synced' : 'failed';
  if(ok){ item.r2Key = item.r2Key||item.mediaId; syncSessionUp(mid, sess); }
  try{save();}catch(e){}
  render();
  liveToastSafe(ok ? '☁ 영상 업로드 완료 — 다른 기기에서도 보입니다' : '업로드 실패 — 네트워크 확인 후 다시 시도');
}
async function removeMediaFile(idx){
  var m = S.newSession.media[idx];
  if(m && m.mediaId){
    await mediaDB.del(m.mediaId);
        if(m.r2Key || m.mediaId) r2.remove(m.r2Key||m.mediaId);
    if(S.mediaUrls[m.mediaId]){URL.revokeObjectURL(S.mediaUrls[m.mediaId]); delete S.mediaUrls[m.mediaId];}
  }
  S.newSession.media.splice(idx,1);
  render();
}
function updateMediaUrl(idx,val){S.newSession.mediaUrls[idx]=val;}
function toggleLoop(vid){
  var v=document.getElementById(vid);
  var btn=document.getElementById('loop_'+vid);
  if(!v)return;
  v.loop=!v.loop;
  if(btn){btn.classList.toggle('active',v.loop);}
}
// 영상 로드 실패 시 사용자 안내 (R2 누락 / CORS / 디코딩 실패 등)
function onVideoError(videoEl, vid){
  try{
    var wrap=document.getElementById('wrap_'+vid);
    if(!wrap || wrap.querySelector('.sm-error')) return;
    var reason='영상을 불러올 수 없습니다';
    var err=videoEl && videoEl.error;
    if(err){
      if(err.code===2) reason='네트워크 오류 — R2 연결 확인';
      else if(err.code===3) reason='영상 디코딩 실패 — 포맷 문제';
      else if(err.code===4) reason='영상 파일 없음 — 업로드 기기에서 다시 열어 R2 동기화가 완료되면 표시됩니다';
    }
    var src=videoEl ? videoEl.currentSrc || videoEl.src : '';
    var note=document.createElement('div');
    note.className='sm-error';
    var safe=String(src||'').replace(/[<>"]/g,'');
    note.innerHTML=reason+(safe?' · <a href="'+safe+'" target="_blank" rel="noopener">새 창 열기</a>':'');
    wrap.appendChild(note);
  }catch(e){}
}
function setSpeed(vid,spd){
  var v=document.getElementById(vid);
  var label=document.getElementById('spd_'+vid);
  if(!v)return;
  v.playbackRate=spd;
  if(label) label.textContent=spd+'x';
  var wrap=document.getElementById('wrap_'+vid);
  if(wrap){
    wrap.querySelectorAll('.vc-btn').forEach(function(b){
      if(b.textContent.indexOf('x')!==-1 && b.textContent.indexOf('반복')===-1){
        b.classList.toggle('active', parseFloat(b.textContent)===spd);
      }
    });
  }
}
function openMediaView(src){
  var d=document.createElement('div');d.className='media-overlay';
  d.onclick=function(){d.remove();};
  d.innerHTML='<img src="'+src+'" style="max-width:92vw;max-height:92vh;border-radius:8px">';
  document.body.appendChild(d);
}


async function deleteSession(id){
  if(!confirm('이 세션 기록을 삭제하시겠습니까?')) return;
  const mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(x){return x.id===id;});
  if(sess && sess.media){
    for(var i=0;i<sess.media.length;i++){
      var m = sess.media[i];
      if(m.mediaId){
        await mediaDB.del(m.mediaId);
                if(m.r2Key || m.mediaId) r2.remove(m.r2Key||m.mediaId);
        if(S.mediaUrls[m.mediaId]){URL.revokeObjectURL(S.mediaUrls[m.mediaId]); delete S.mediaUrls[m.mediaId];}
      }
    }
  }
  S.sessions[mid] = (S.sessions[mid]||[]).filter(s => s.id!==id);
  if(!S.deletedSessionIds) S.deletedSessionIds = {};
  S.deletedSessionIds[id] = Date.now();   // tombstone — 머지에서 부활 방지
  logActivity('세션 삭제', mid, '');
  logAudit('session','세션 삭제', (S.members.find(function(x){return x.id===mid;})||{}).name||'', {sessionId:id, date:sess&&sess.date, author:sess&&sess.author});
  save(); render();
  try{ await cloud.deleteSession(id); }catch(e){ console.warn('[cloud] deleteSession await fail:', e); }
  try{ if(typeof autoPublishReport==='function') autoPublishReport(mid); }catch(e){}   // 고정 리포트 링크 자동 갱신
}

// ============ 기존 세션 자동 분석 (로컬) ============
function analyzeExistingSessions(){
  var count = 0;
  for(var mid in S.sessions){
    var sessions = S.sessions[mid]||[];
    for(var i=0;i<sessions.length;i++){
      if(sessions[i]._ai) continue;
      if(!sessions[i].content || sessions[i].content.trim().length<5) continue;
      generateLocalSummary(mid, sessions[i]);
      count++;
    }
  }
  if(count>0) render();
}

// ============ 시작 ============
init();
setTimeout(function(){ analyzeExistingSessions(); }, 3000);
