          'X-API-Key': this.apiKey,
          'Content-Type': (blob && blob.type) || 'application/octet-stream'
        },
        body: blob
      });
      if(!res.ok){
        console.warn('[r2] upload http', res.status);
        return false;
      }
      return true;
    }catch(e){console.warn('[r2] upload 실패:', e); return false;}
  },
  async download(key){
    if(!this.enabled) return null;
    try{
      const res = await fetch(this.url(key));
      if(!res.ok) return null;
      return await res.blob();
    }catch(e){console.warn('[r2] download 실패:', e); return null;}
  },
  async remove(key){
    if(!this.enabled) return false;
    try{
      const res = await fetch(this.url(key), {
        method:'DELETE',
        headers:{'X-API-Key': this.apiKey}
      });
      return res.ok;
    }catch(e){console.warn('[r2] delete 실패:', e); return false;}
  }
};

// ============ 상태 ============
let S = {
  members:[], assessments:{}, sessions:{}, deleteRequests:{},
  activityLog:[], auditLog:[], lastSeen:{},
  mediaUrls:{}, // {mediaId: objectURL} — IndexedDB에서 로드된 blob의 ObjectURL 캐시
  selectedMember:null, assessOpen:false, filterAuthor:'all',
  showAddSession:false, showAddMember:false, showActivityLog:false,
  editSessionId:null,
  currentRole:null, currentUser:null,
  newSession:{date:today(), author:'', content:'', media:[], mediaUrls:['','']},
  uploading:0, uploadMsg:'', // 진행 중인 파일 업로드 수 / 상태 메시지
  exercisePicker:{open:false, query:'', category:'all', selected:[]},
  newMember:{name:'',phone:'',email:'',registeredDate:'',golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',golfLessonExpiry:'',golfPTExpiry:'',assignedTo:[]},
  editMemberId:null,
  sidebarOpen:false,
  cloudSync:'local',
  warningBannerCollapsed:false,
  handovers:{}, // {memberId: [{date, from, to, summary}]}
  showHandover:null, // memberId to show handover card
  showReport:false,
  memberSearch:'',
  showDashboard:false,
  sidebarTab:'pt_lesson',
  showGoalEdit:false,
  showImageCard:false
};

// ============ Audit Log (관리자용 상세 감사 로그) ============
function logAudit(category, action, target, meta){
  var entry = {
    time: new Date().toISOString(),
    user: S.currentUser || 'system',
    role: S.currentRole || 'none',
    category: category,  // 'auth'|'member'|'session'|'assess'|'system'
    action: action,
    target: target || '',
    meta: meta || {}
  };
  if(!S.auditLog) S.auditLog = [];
  S.auditLog.push(entry);
  if(S.auditLog.length>1000) S.auditLog = S.auditLog.slice(-1000);
  try{save();}catch(e){}
}

// ============ Activity Log ============
function logActivity(action, memberId, detail){
  var mName='';
  var m=S.members.find(function(x){return x.id===memberId;});
  if(m) mName=m.name;
  S.activityLog.push({
    time:new Date().toISOString(),
    user:S.currentUser||'시스템',
    action:action,
    memberId:memberId||'',
    memberName:mName,
    detail:detail||''
  });
  if(S.activityLog.length>200) S.activityLog=S.activityLog.slice(-200);
}
function getUnreadCount(){
  if(!S.currentUser) return 0;
  var last=S.lastSeen[S.currentUser]||'';
  return S.activityLog.filter(function(e){
    return e.time>last && e.user!==S.currentUser;
  }).length;
}
function markSeen(){
  if(!S.currentUser)return;
  S.lastSeen[S.currentUser]=new Date().toISOString();
  save();
}

// ============ Helpers ============
function today(){return new Date().toISOString().slice(0,10);}
function daysUntilExpiry(dateStr){
  if(!dateStr)return null;
  var exp=new Date(dateStr+'T23:59:59');
  var now=new Date();
  return Math.ceil((exp-now)/(1000*60*60*24));
}
// 회원의 가장 임박한 유효기간을 반환 (레슨/PT 중 더 가까운 쪽, 없으면 통합 expiry)
function nearestExpiry(m){
  if(!m) return '';
  var dates = [];
  if(m.golfLessonExpiry) dates.push(m.golfLessonExpiry);
  if(m.golfPTExpiry) dates.push(m.golfPTExpiry);
  if(dates.length===0 && m.expiry) dates.push(m.expiry);
  if(dates.length===0) return '';
  // 가장 가까운(작은) 날짜 반환
  return dates.reduce(function(a,b){return a<b?a:b;});
}
function expiryBadge(dateStr){
  var d=daysUntilExpiry(dateStr);
  if(d===null)return '';
  if(d<0)return ' <span class="exp-badge exp-expired">만료</span>';
  if(d<=30)return ' <span class="exp-badge exp-soon">D-'+d+'</span>';
  return '';
}
function uid(){return 'm'+Date.now()+Math.random().toString(36).slice(2,5);}
function suid(){return 's'+Date.now()+Math.random().toString(36).slice(2,5);}
function initials(name){
  if(!name) return '?';
  const p = name.trim().split(/\s+/);
  if(p.length>=2) return p[0][0]+p[1][0];
  return name.slice(0,2);
}
function save(){
  try{
    localStorage.setItem('golf_pt_v2', JSON.stringify({
      members:S.members, assessments:S.assessments, sessions:S.sessions,
      deleteRequests:S.deleteRequests, activityLog:S.activityLog, auditLog:S.auditLog, lastSeen:S.lastSeen,
      handovers:S.handovers
    }));
    return true;
  }catch(e){
    console.error('[save] failed:', e);
    alert('저장 실패 — 브라우저 저장 공간이 부족합니다.\n\n' +
          '원인: 영상/사진이 저장 한도(약 5MB)를 초과했습니다.\n' +
          '해결: 용량이 큰 영상은 유튜브/드라이브에 올린 뒤 URL 입력을 사용해주세요.');
    return false;
  }
}

function estimateStorageSize(){
  try{return JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,lastSeen:S.lastSeen}).length;}catch(e){return 0;}
}

function loadLocal(){
  try{
    const d = localStorage.getItem('golf_pt_v2');
    if(d){
      const p = JSON.parse(d);
      S.members = p.members || SAMPLE_DATA.members;
      S.assessments = p.assessments || SAMPLE_DATA.assessments;
      S.sessions = p.sessions || SAMPLE_DATA.sessions;
      S.deleteRequests = p.deleteRequests || {};
      S.activityLog = p.activityLog || [];
      S.auditLog = p.auditLog || [];
      S.lastSeen = p.lastSeen || {};
      S.handovers = p.handovers || {};
    } else {
      S.members = SAMPLE_DATA.members;
      S.assessments = SAMPLE_DATA.assessments;
      S.sessions = SAMPLE_DATA.sessions;
    }
  }catch(e){
    S.members = SAMPLE_DATA.members;
    S.assessments = SAMPLE_DATA.assessments;
    S.sessions = SAMPLE_DATA.sessions;
  }
  if(S.members.length>0 && !S.selectedMember) S.selectedMember = S.members[0].id;
}

function readHash(){
  var h=location.hash.replace('#','');
  if(!h)return;
  var parts=h.split('-');
  var role=parts[0];
  var user=decodeURIComponent(parts.slice(1).join('-'));
  // URL 직접 입력해도 비밀번호 필요 — 세션 내 인증만 허용
  var authed=sessionStorage.getItem('golf_pt_auth');
  if(!authed){location.hash='';return;}
  if(role==='infodesk'){S.currentRole='infodesk';S.currentUser='인포데스크';}
  else if(role==='admin'){S.currentRole='admin';S.currentUser='관리자';}
  else if(role==='pro'&&user){S.currentRole='pro';S.currentUser=user;}
  else if(role==='trainer'&&user){S.currentRole='trainer';S.currentUser=user;}
}
function setRole(role,user){
  var key = role==='infodesk' ? 'infodesk' : (role==='admin' ? '관리자' : user);
  var pw=getPassword(key);
  if(pw){
    S.pendingRole={role:role,user:user};
    S.showPwModal=true;S.pwError=false;S.pwInput='';
    render();
    return;
  }
  activateRole(role,user);
}
function activateRole(role,user){
  S.currentRole=role;S.currentUser=user;S.showPwModal=false;S.pwError=false;
  try{sessionStorage.setItem('golf_pt_auth',role+':'+user);}catch(e){}
  location.hash=role+(role!=='infodesk'?'-'+encodeURIComponent(user):'');
  if(role==='pro'||role==='trainer') S.newSession.author=user;
  // 접근 불가한 회원이 선택돼있으면 초기화 (pro/trainer는 배정된 회원만)
  if(role==='pro'||role==='trainer'){
    var accessible = S.members.filter(function(m){
      return m.assignedTo && m.assignedTo.indexOf(user)!==-1;
    });
    var stillAccessible = S.selectedMember && accessible.some(function(m){return m.id===S.selectedMember;});
    if(!stillAccessible){
      S.selectedMember = accessible.length>0 ? accessible[0].id : null;
    }
  }
  render();
}
function submitPassword(){
  var p=S.pendingRole;if(!p)return;
  var key=p.role==='infodesk'?'infodesk':(p.role==='admin'?'관리자':p.user);
  if(S.pwInput===getPassword(key)){
    logAudit('auth','로그인',p.user||key,{role:p.role});
    activateRole(p.role,p.user);
  } else {
    S.pwError=true;render();
  }
}
function cancelPassword(){S.showPwModal=false;S.pendingRole=null;S.pwError=false;render();}
function switchRole(){
  if(S.currentUser) logAudit('auth','로그아웃',S.currentUser,{});
  S.currentRole=null;S.currentUser=null;location.hash='';
  try{sessionStorage.removeItem('golf_pt_auth');}catch(e){}
  render();
}

async function init(){
  loadLocal();
  readHash();
  render();

  // 영속 저장 요청 (iOS Safari eviction 방지)
  if(navigator.storage && navigator.storage.persist){
    try{await navigator.storage.persist();}catch(e){}
  }
  // IndexedDB 미디어 로드 → ObjectURL 캐시
  await mediaDB.init();
  var allMedia = await mediaDB.getAll();
  allMedia.forEach(function(rec){
    try{S.mediaUrls[rec.id] = URL.createObjectURL(rec.blob);}catch(e){}
  });
  // 세션의 mediaId가 IndexedDB에 없으면 콘솔 경고
  Object.keys(S.sessions).forEach(function(mid){
    (S.sessions[mid]||[]).forEach(function(s){
      if(s.media) s.media.forEach(function(m){
        if(m.mediaId && !S.mediaUrls[m.mediaId]){
          console.warn('[media] 누락:',s.id,m.name,m.mediaId);
        }
      });
    });
  });
  if(allMedia.length>0) render();

  // R2 미디어 스토리지 초기화 (있으면 활성화)
  r2.init();

  // 2) Supabase 가 설정되어 있으면 원격 동기화 시도 (머지 방식 — 데이터 손실 방지)
  if(cloud.init()){
    S.cloudSync = 'loading';
    render();

    // 병합 전 로컬 스냅샷 — 원격에 없는 로컬 전용 항목을 업로드하기 위함
    const localSnap = {
      members: S.members.map(m=>({...m})),
      assessments: JSON.parse(JSON.stringify(S.assessments||{})),
      sessions: JSON.parse(JSON.stringify(S.sessions||{}))
    };

    const remote = await cloud.loadAll();
    if(remote){
      if(remote.members.length > 0){
        // 로컬 미디어 보존 — Supabase는 media 필드를 저장 안함
        var localMediaMap = {};
        Object.keys(S.sessions).forEach(function(mid){
          (S.sessions[mid]||[]).forEach(function(s){
            if(s.media) localMediaMap[s.id] = s.media;
          });
        });
        S.members = remote.members;
        S.assessments = remote.assessments;
        S.sessions = remote.sessions;
        Object.keys(S.sessions).forEach(function(mid){
          (S.sessions[mid]||[]).forEach(function(s){
            if(localMediaMap[s.id]) s.media = localMediaMap[s.id];
          });
        });

        // 로컬 전용 항목 업로드 — 원격에 없는 회원/세션/평가를 추가 업로드
        const remoteMemberIds = new Set(S.members.map(m=>m.id));
        for(const m of localSnap.members){
          if(!remoteMemberIds.has(m.id)){
            await cloud.upsertMember(m);
            S.members.push(m);
            remoteMemberIds.add(m.id);
          }
        }
        const remoteSessionIds = new Set();
        Object.keys(S.sessions).forEach(function(mid){
          (S.sessions[mid]||[]).forEach(function(s){ remoteSessionIds.add(s.id); });
        });
        for(const mid in localSnap.sessions){
          for(const s of localSnap.sessions[mid]){
            if(!remoteSessionIds.has(s.id)){
              await cloud.upsertSession(mid, s);
              if(!S.sessions[mid]) S.sessions[mid] = [];
              // 로컬에만 있는 세션은 media 필드도 그대로 유지
              S.sessions[mid].push(s);
              remoteSessionIds.add(s.id);
            }
          }
        }
        for(const mid in localSnap.assessments){
          for(const key in localSnap.assessments[mid]){
            // 메타(_date, _history) 는 업로드 대상 아님
            if(key.indexOf('_')===0) continue;
            const hasRemote = S.assessments[mid] && S.assessments[mid][key];
            if(!hasRemote){
              const v = localSnap.assessments[mid][key];
              await cloud.upsertAssessment(mid, key, v.result, v.note);
              if(!S.assessments[mid]) S.assessments[mid] = {};
              S.assessments[mid][key] = v;
            }
          }
        }

        if(!S.members.find(m => m.id === S.selectedMember)){
          S.selectedMember = S.members[0] ? S.members[0].id : null;
        }
      } else {
        // 원격이 비어있으면 현재 로컬 데이터를 초기 업로드
        await seedRemote();
      }
      save();
      S.cloudSync = 'connected';
    } else {
      S.cloudSync = 'error';
    }
    render();
  } else {
    S.cloudSync = 'local';
  }
}

async function seedRemote(){
  try{
    for(const m of S.members) await cloud.upsertMember(m);
    for(const mid in S.assessments){
      for(const key in S.assessments[mid]){
        const v = S.assessments[mid][key];
        await cloud.upsertAssessment(mid, key, v.result, v.note);
      }
    }
    for(const mid in S.sessions){
      for(const s of S.sessions[mid]){
        await cloud.upsertSession(mid, s);
      }
    }
  }catch(e){console.warn('[cloud] seedRemote 실패:',e);}
}

async function refreshFromCloud(){
  if(!cloud.enabled) return;
  S.cloudSync = 'loading'; render();
  const remote = await cloud.loadAll();
  if(remote){
    var localMediaMap = {};
    Object.keys(S.sessions).forEach(function(mid){
      (S.sessions[mid]||[]).forEach(function(s){
        if(s.media) localMediaMap[s.id] = s.media;
      });
    });
    S.members = remote.members;
    S.assessments = remote.assessments;
    S.sessions = remote.sessions;
    Object.keys(S.sessions).forEach(function(mid){
      (S.sessions[mid]||[]).forEach(function(s){
        if(localMediaMap[s.id]) s.media = localMediaMap[s.id];
      });
    });
    if(S.members.length>0 && !S.members.find(m => m.id === S.selectedMember)){
      S.selectedMember = S.members[0].id;
    }
    save();
    S.cloudSync = 'connected';
  } else {
    S.cloudSync = 'error';
  }
  render();
}

function stats(mid){
  const sess = S.sessions[mid] || [];
  return {
    total: sess.length,
    pro: sess.filter(s => getRole(s.author)==='pro').length,
    trainer: sess.filter(s => getRole(s.author)==='trainer').length
  };
}

function calcFitness(assess){
  var PTS = {'정상':7,'경미한 제한':5,'주의 필요':2,'제한':0,'미검사':0};
  var total = 0, untested = 0;
  for(var i=0;i<ASSESSMENT_ITEMS.length;i++){
    var v = assess[ASSESSMENT_ITEMS[i].key];
    if(!v || !v.result || v.result==='미검사'){ untested++; }
    else { total += (PTS[v.result]||0); }
  }
  var score = Math.round((total/98)*100);
  var cls = score>=85?'fit-good':score>=60?'fit-warn':'fit-danger';
  return {score:score, cls:cls, untested:untested};
}

function syncBadge(){
  const map = {
    local:    {cls:'local',     label:'로컬 모드'},
    loading:  {cls:'loading',   label:'동기화 중...'},
    connected:{cls:'connected', label:'Supabase 동기화됨'},
    error:    {cls:'error',     label:'동기화 오류'}
  };
  const s = map[S.cloudSync] || map.local;
  const refresh = (S.cloudSync==='connected' || S.cloudSync==='error')
    ? `<button class="sync-refresh" onclick="refreshFromCloud()">새로고침</button>` : '';
  return `<div class="sync-indicator ${s.cls}">
    <div class="sync-dot"></div>
    <div>${s.label}</div>
    ${refresh}
  </div>`;
}

// ============ Render ============
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
    <div class="manual-link">
      <a href="manual.html" target="_blank">직원 사용 매뉴얼</a>
    </div>
  </div>${S.showPwModal?'<div class="modal-overlay" onclick="if(event.target===this)cancelPassword()"><div class="modal" style="width:340px"><div class="modal-title" style="text-align:center">🔒 '+(S.pendingRole?S.pendingRole.user:'')+'</div><div class="form-group"><label class="form-label">비밀번호</label><input class="form-input" type="password" placeholder="비밀번호를 입력하세요" oninput="S.pwInput=this.value" onkeydown="if(event.key===\'Enter\')submitPassword()" autofocus></div>'+(S.pwError?'<div style="color:#993c1d;font-size:12px;margin-bottom:10px;text-align:center">비밀번호가 일치하지 않습니다</div>':'')+'<div class="modal-actions"><button class="btn" onclick="cancelPassword()">취소</button><button class="btn primary" onclick="submitPassword()">확인</button></div></div></div>':''}`;
}

function render(){
