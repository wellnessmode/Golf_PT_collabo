// Golf PT Collaboration — 내셔널짐
// 정P(골프 프로) ↔ 최T(PT 트레이너) 동일 회원 세션 협업 웹앱
//
// 저장 모드:
//  - config.js 에 Supabase URL/KEY 가 채워져 있으면: Supabase 에 동기화 (정P/최T 실시간 공유)
//  - 비어 있거나 네트워크 실패 시: localStorage 기반 로컬 모드 (file:// 로도 동작)

// ============ 상수 ============
const ASSESSMENT_ITEMS = [
  {key:'static_posture',name:'Static Posture Assessment',cp:'Anterior / L-Lateral / Posterior / R-Lateral'},
  {key:'overhead_squat',name:'Overhead Squat',cp:'Ankle Inversion / Pelvic Rotation'},
  {key:'pelvic_tilt',name:'Pelvic Tilt',cp:'Anterior / Posterior Tilt'},
  {key:'pelvic_rotation',name:'Pelvic Rotation',cp:'Lt. / Rt.'},
  {key:'thoracic_rotation',name:'Thoracic Rotation',cp:'Lt. / Rt.'},
  {key:'slr_test',name:'SLR Test',cp:'Lt. / Rt. O.A / Shortness'},
  {key:'90_90_standing',name:'90/90 Test - Standing',cp:'Lt. / Rt.'},
  {key:'90_90_address',name:'90/90 Test - Address',cp:'Lt. / Rt.'},
  {key:'patrick_test',name:'Patrick Test',cp:'Ant. / Post.'},
  {key:'hip_extension',name:'Hip Extension Test',cp:'Ant. Tilt / Post. Tilt'},
  {key:'ql_palpation',name:'Q.L Palpation',cp:'Lt. / Rt.'},
  {key:'one_leg_bridge',name:'One Leg Bridge',cp:'Under 10s / 30s / Over 60s'},
  {key:'neck_palpation',name:'Neck Palpation',cp:'Cervical Curve / S.C.M / Scalene / U.Trap (Lt./Rt.)'},
  {key:'calf_palpation',name:'Calf Palpation',cp:'Bump / Achilles / Calf Palpation (Lt./Rt.)'}
];

const RESULT_OPTIONS = ['미검사','정상','경미한 제한','주의 필요','제한'];
const AVATAR_COLORS = ['av-green','av-blue','av-amber','av-coral'];

// 기본 비밀번호 — 최초 설정값, localStorage에 저장된 값이 우선
const DEFAULT_PASSWORDS = {
  'infodesk':'ng2026',
  '정우진 프로':'jung00',
  '홍태양 프로':'hong00',
  '최현승 트레이너':'choi00',
  '이상렬 트레이너':'lee000',
  '관리자':'admin0000'
};
function getPassword(key){
  try{
    var stored = JSON.parse(localStorage.getItem('golf_pt_passwords')||'{}');
    return stored[key] || DEFAULT_PASSWORDS[key];
  }catch(e){return DEFAULT_PASSWORDS[key];}
}
function setPassword(key, newPw){
  try{
    var stored = JSON.parse(localStorage.getItem('golf_pt_passwords')||'{}');
    var oldPw = stored[key] || DEFAULT_PASSWORDS[key];
    stored[key] = newPw;
    localStorage.setItem('golf_pt_passwords', JSON.stringify(stored));
    logAudit('auth','비밀번호 변경', key, {before:oldPw, after:newPw});
    return true;
  }catch(e){return false;}
}

const APP_VERSION = {
  version:'v1.5',
  date:'2026-04-11',
  changes:[
    '🆕 관리자 계정 추가 — 전체 감사 로그 · 비밀번호 변경 · 로그인 이력 추적',
    '🆕 회원 CRM 확장 — 연락처 · 이메일 · 등록일 필드 추가',
    '🆕 유효기간 D-day 배지 — 30일 이내 만료 회원 자동 경고',
    '🆕 마이페이지 섹션 — 사이드바에서 비밀번호 변경 가능',
    '🆕 감사 로그 CSV 내보내기 — 관리자용 전체 이력 다운로드',
    '🆕 골프 스윙 종합 분석 — X-Factor, 척추각, 리드암, 무릎굴곡, 머리이동 실시간 측정',
    '🆕 스윙 페이즈 자동 감지 (어드레스→백스윙→탑→다운스윙→임팩트→팔로스루→피니시)',
    '🆕 체크리스트 자동 피드백 (얼리 익스텐션, 헤드 무브먼트, 리드암 직선 등)',
    '🆕 가이드라인 오버레이 (척추선, 수직 기준선)',
    '⚡ 스켈레톤 분석 속도 2~3배 개선 (modelComplexity lite 적용)',
    '🆕 IndexedDB 대용량 미디어 저장 — 파일당 100MB까지 (기존 3MB 한도 해제)',
    '🆕 MediaPipe 스켈레톤 분석 — 스윙 영상에서 관절 자동 추출',
    '🆕 체형평가 히스토리 — 평가일 기록 + 애프터 평가 스냅샷',
    '🆕 활동 로그 & 알림 — 사이드바 🔔 배지로 변경사항 확인',
    '🆕 비밀번호 잠금 — 역할별 접근 제한 (세션 기반 인증)',
    '🔒 인포데스크 읽기 전용 — 세션/평가 수정 불가, 세션 삭제 불가',
    '📋 회원 배정 시스템 — 담당 지도자만 해당 회원 열람',
    '🗑 회원 삭제 시 운동지도자 승인 필요',
    '💰 골프레슨 · 골프PT 등록횟수/금액 분리 관리',
    '🦴 Body-Swing Connection 매핑 14개 항목 자동 경고',
    '📹 세션 기록에 스윙 영상/사진 첨부 + URL 링크',
    '📱 iPhone 노치/다이나믹 아일랜드 safe-area 대응',
    '🏠 전환 버튼을 사이드바 상단 🏠 아이콘으로 이동',
    '❌ 체형 점수(Golf Fit) 카드 제거 · 보완요청 기능 제거'
  ]
};

const INSTRUCTORS = [
  {name:'정우진 프로', role:'pro'},
  {name:'홍태양 프로', role:'pro'},
  {name:'최현승 트레이너', role:'trainer'},
  {name:'이상렬 트레이너', role:'trainer'}
];
function getRole(author){
  var inst = INSTRUCTORS.find(function(i){return i.name===author;});
  if(inst) return inst.role;
  return (author && author.indexOf('프로')!==-1) ? 'pro' : 'trainer';
}

const BODY_SWING_MAP = {
  static_posture:'정적 자세 불균형 — 어드레스 셋업 일관성 저하',
  overhead_squat:'어드레스 하체 균형 불안정 — 발목/무릎 보상동작 유발',
  pelvic_tilt:'어드레스 척추각도 불안정 — S/C-Posture 위험',
  pelvic_rotation:'다운스윙 골반 회전 감소 — X-Factor 감소, 비거리 손실',
  thoracic_rotation:'백스윙 상체 회전 부족 — 팔로만 올리는 동작 유발',
  slr_test:'팔로스루 시 하체 안정성 저하 — 체중이동 불완전',
  '90_90_standing':'백스윙 탑 포지션 제한 — 어깨 회전 범위 감소',
  '90_90_address':'어드레스 어깨 가동성 부족 — 플라잉 엘보 연관',
  patrick_test:'다운스윙 골반 회전 제한 — 스웨이/슬라이드 발생 가능',
  hip_extension:'임팩트 후 얼리 익스텐션(Early Extension) 위험',
  ql_palpation:'요방형근 긴장 — 스윙 시 옆구리 제한',
  one_leg_bridge:'고관절 신전근 약화 — 지면반력 감소, 하체 드라이브 부족',
  neck_palpation:'경추/승모근 긴장 — 헤드업 경향, 임팩트 시선 불안정',
  calf_palpation:'종아리/아킬레스 긴장 — 체중이동 시 발뒤꿈치 들림'
};

const SAMPLE_DATA = {
  members:[
    {id:'m1',name:'로버트',color:'av-green',phone:'010-1234-5678',email:'robert@example.com',registeredDate:'2025-06-01',golfLessonCount:'12',golfPTCount:'12',golfLessonAmount:'480,000',golfPTAmount:'480,000',expiry:'2025-12-31',assignedTo:['정우진 프로','최현승 트레이너']},
    {id:'m2',name:'윤명숙',color:'av-blue',phone:'010-9876-5432',email:'yoon@example.com',registeredDate:'2025-06-15',golfLessonCount:'12',golfPTCount:'12',golfLessonAmount:'480,000',golfPTAmount:'480,000',expiry:'2025-12-31',assignedTo:['정우진 프로','최현승 트레이너']}
  ],
  assessments:{
    m1:{static_posture:{result:'정상',note:''},overhead_squat:{result:'정상',note:''},pelvic_tilt:{result:'정상',note:''},pelvic_rotation:{result:'정상',note:''},thoracic_rotation:{result:'경미한 제한',note:'우측 회전 제한'},slr_test:{result:'정상',note:''},'90_90_standing':{result:'정상',note:''},'90_90_address':{result:'경미한 제한',note:'어드레스 시 좌측 제한'},patrick_test:{result:'경미한 제한',note:''},hip_extension:{result:'정상',note:''},ql_palpation:{result:'정상',note:''},one_leg_bridge:{result:'정상',note:''},neck_palpation:{result:'정상',note:''},calf_palpation:{result:'정상',note:''}},
    m2:{static_posture:{result:'정상',note:''},overhead_squat:{result:'경미한 제한',note:'발목 내번'},pelvic_tilt:{result:'정상',note:''},pelvic_rotation:{result:'경미한 제한',note:''},thoracic_rotation:{result:'정상',note:''},slr_test:{result:'정상',note:''},'90_90_standing':{result:'정상',note:''},'90_90_address':{result:'정상',note:''},patrick_test:{result:'정상',note:''},hip_extension:{result:'정상',note:''},ql_palpation:{result:'정상',note:''},one_leg_bridge:{result:'정상',note:''},neck_palpation:{result:'정상',note:''},calf_palpation:{result:'정상',note:''}}
  },
  sessions:{
    m1:[
      {id:'s1',date:'2025-06-16',author:'정우진 프로',content:'스윙 중에 팔만 내리면서 몸회전을 안해서 문제 발생'},
      {id:'s2',date:'2025-06-17',author:'최현승 트레이너',content:'상하체 분리운동, 코어운동 진행'},
      {id:'s3',date:'2025-06-23',author:'정우진 프로',content:'볼 포지션 수정 집중'},
      {id:'s4',date:'2025-06-27',author:'최현승 트레이너',content:'스텝박스 리듬트레이닝, 플라이오메트릭 점프순발력트레이닝, 상체 푸쉬운동'},
      {id:'s5',date:'2025-07-01',author:'최현승 트레이너',content:'발가락, 햄스트링 및 엉덩이 트레이닝'},
      {id:'s6',date:'2025-07-08',author:'최현승 트레이너',content:'회전근개, 코어, 견갑골 안정화 및 어깨근육운동'},
      {id:'s7',date:'2025-08-04',author:'정우진 프로',content:'하체랑 코어 연결시켜서 움직여주기'}
    ],
    m2:[
      {id:'s8',date:'2025-06-25',author:'최현승 트레이너',content:'삼두근, 흉근, 코어근육 위주로 진행'},
      {id:'s9',date:'2025-07-01',author:'정우진 프로',content:'팔로우에서 넘어오는 힘을 만들어주는 동작'},
      {id:'s10',date:'2025-07-05',author:'최현승 트레이너',content:'상체 코어운동, 어깨, 가슴, 삼두 기능성운동'},
      {id:'s11',date:'2025-07-07',author:'정우진 프로',content:'템포 맞추면서 오른팔 내리는 공간 확보'},
      {id:'s12',date:'2025-07-09',author:'최현승 트레이너',content:'전완, 이두, 등 근비대 견갑골 안정화운동'},
      {id:'s13',date:'2025-07-14',author:'정우진 프로',content:'하체랑 상체 팔 싱크가 떨어져서 싱크에 집중'},
      {id:'s14',date:'2025-07-22',author:'정우진 프로',content:'등이랑 팔안쪽 힘 강조하고 상하체 분리'},
      {id:'s15',date:'2025-07-23',author:'최현승 트레이너',content:'상체 근력운동, 상하체 분리 훈련(케이블)'},
      {id:'s16',date:'2025-07-29',author:'정우진 프로',content:'상하체 분리 동작 강조'}
    ]
  }
};

// ============ Media DB (IndexedDB) ============
// 영상/사진 같은 대용량 파일은 localStorage(5MB) 한도 때문에 IndexedDB에 저장
// localStorage 에는 mediaId 참조만 남김. 렌더 시 ObjectURL로 변환.
const mediaDB = {
  db:null, DB_NAME:'golf_pt_media', STORE:'media',
  init:function(){
    return new Promise(function(resolve){
      if(!window.indexedDB){resolve(false);return;}
      var req = indexedDB.open(mediaDB.DB_NAME, 1);
      req.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains(mediaDB.STORE)){
          db.createObjectStore(mediaDB.STORE, {keyPath:'id'});
        }
      };
      req.onsuccess = function(e){mediaDB.db = e.target.result; resolve(true);};
      req.onerror = function(){console.warn('[mediaDB] init failed'); resolve(false);};
    });
  },
  put:function(id, blob, meta){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve(false);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.STORE,'readwrite');
        var store = tx.objectStore(mediaDB.STORE);
        var req = store.put({id:id, blob:blob, mimeType:meta.mimeType||'', name:meta.name||'', size:blob.size, createdAt:Date.now()});
        req.onsuccess = function(){resolve(true);};
        req.onerror = function(e){console.warn('[mediaDB] put failed',e); resolve(false);};
      }catch(e){console.warn(e);resolve(false);}
    });
  },
  get:function(id){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve(null);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.STORE,'readonly');
        var req = tx.objectStore(mediaDB.STORE).get(id);
        req.onsuccess = function(e){resolve(e.target.result||null);};
        req.onerror = function(){resolve(null);};
      }catch(e){resolve(null);}
    });
  },
  getAll:function(){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve([]);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.STORE,'readonly');
        var req = tx.objectStore(mediaDB.STORE).getAll();
        req.onsuccess = function(e){resolve(e.target.result||[]);};
        req.onerror = function(){resolve([]);};
      }catch(e){resolve([]);}
    });
  },
  del:function(id){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve(false);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.STORE,'readwrite');
        var req = tx.objectStore(mediaDB.STORE).delete(id);
        req.onsuccess = function(){resolve(true);};
        req.onerror = function(){resolve(false);};
      }catch(e){resolve(false);}
    });
  }
};

async function getStorageEstimate(){
  if(!navigator.storage||!navigator.storage.estimate) return null;
  try{
    var est = await navigator.storage.estimate();
    return {usage:est.usage||0, quota:est.quota||0};
  }catch(e){return null;}
}

// ============ Supabase 연동 모듈 ============
const cloud = {
  client:null,
  enabled:false,
  init(){
    try{
      const cfg = window.APP_CONFIG || {};
      if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return false;
      if(typeof window.supabase === 'undefined' || !window.supabase.createClient){
        console.warn('[cloud] supabase-js SDK 를 로드하지 못했습니다. 로컬 모드로 동작합니다.');
        return false;
      }
      this.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      this.enabled = true;
      return true;
    }catch(e){console.warn('[cloud] init 실패:',e);return false;}
  },
  async loadAll(){
    if(!this.enabled) return null;
    try{
      const [mRes, aRes, sRes] = await Promise.all([
        this.client.from('members').select('*').order('created_at',{ascending:true}),
        this.client.from('assessments').select('*'),
        this.client.from('sessions').select('*').order('date',{ascending:true})
      ]);
      if(mRes.error) throw mRes.error;
      if(aRes.error) throw aRes.error;
      if(sRes.error) throw sRes.error;
      const members = (mRes.data||[]).map(r=>({id:r.id,name:r.name,color:r.color||'av-green'}));
      const assessments = {};
      (aRes.data||[]).forEach(r=>{
        if(!assessments[r.member_id]) assessments[r.member_id] = {};
        assessments[r.member_id][r.item_key] = {result:r.result||'미검사', note:r.note||''};
      });
      const sessions = {};
      (sRes.data||[]).forEach(r=>{
        if(!sessions[r.member_id]) sessions[r.member_id] = [];
        sessions[r.member_id].push({
          id:r.id, date:r.date, author:r.author,
          content:r.content||'', supplement:r.supplement||''
        });
      });
      return {members, assessments, sessions};
    }catch(e){console.warn('[cloud] loadAll 실패:',e);return null;}
  },
  async upsertMember(m){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('members').upsert({id:m.id,name:m.name,color:m.color});
      if(error) throw error;
    }catch(e){console.warn('[cloud] upsertMember 실패:',e);}
  },
  async upsertAssessment(memberId, itemKey, result, note){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('assessments').upsert({
        member_id: memberId,
        item_key: itemKey,
        result: result||'미검사',
        note: note||'',
        updated_at: new Date().toISOString()
      });
      if(error) throw error;
    }catch(e){console.warn('[cloud] upsertAssessment 실패:',e);}
  },
  async upsertSession(memberId, s){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('sessions').upsert({
        id: s.id,
        member_id: memberId,
        date: s.date,
        author: s.author,
        content: s.content||'',
        supplement: s.supplement||''
      });
      if(error) throw error;
    }catch(e){console.warn('[cloud] upsertSession 실패:',e);}
  },
  async deleteSession(id){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('sessions').delete().eq('id',id);
      if(error) throw error;
    }catch(e){console.warn('[cloud] deleteSession 실패:',e);}
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
  newMember:{name:'',phone:'',email:'',registeredDate:'',golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',assignedTo:[]},
  editMemberId:null,
  sidebarOpen:false,
  cloudSync:'local',
  warningBannerCollapsed:false
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
      deleteRequests:S.deleteRequests, activityLog:S.activityLog, auditLog:S.auditLog, lastSeen:S.lastSeen
    }));
    return true;
  }catch(e){
    console.error('[save] failed:', e);
    alert('⚠️ 저장 실패 — 브라우저 저장 공간이 부족합니다.\n\n' +
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

  // IndexedDB 미디어 로드 → ObjectURL 캐시
  await mediaDB.init();
  var allMedia = await mediaDB.getAll();
  allMedia.forEach(function(rec){
    try{S.mediaUrls[rec.id] = URL.createObjectURL(rec.blob);}catch(e){}
  });
  if(allMedia.length>0) render();

  // 2) Supabase 가 설정되어 있으면 원격 동기화 시도
  if(cloud.init()){
    S.cloudSync = 'loading';
    render();
    const remote = await cloud.loadAll();
    if(remote){
      if(remote.members.length > 0){
        // 원격 데이터로 덮어씀
        S.members = remote.members;
        S.assessments = remote.assessments;
        S.sessions = remote.sessions;
        if(!S.members.find(m => m.id === S.selectedMember)){
          S.selectedMember = S.members[0].id;
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
    S.members = remote.members;
    S.assessments = remote.assessments;
    S.sessions = remote.sessions;
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
      <p class="role-sub">Golf PT 협업 시스템</p>
    </div>
    <div class="role-section">
      <div class="role-section-label">센터 관리</div>
      <div class="role-row">
        <div class="role-card rc-infodesk" onclick="setRole('infodesk','인포데스크')">
          <div class="role-icon">🖥️</div><div class="role-card-title">인포데스크</div><div class="role-card-desc">회원 등록 · 관리</div>
        </div>
      </div>
    </div>
    <div class="role-section">
      <div class="role-section-label">골프 프로</div>
      <div class="role-row">${pros.map(function(inst){
        return '<div class="role-card rc-pro" onclick="setRole(\'pro\',\''+inst.name+'\')"><div class="role-icon">⛳</div><div class="role-card-title">'+inst.name+'</div><div class="role-card-desc">골프 레슨 기록</div></div>';
      }).join('')}</div>
    </div>
    <div class="role-section">
      <div class="role-section-label">골프 PT</div>
      <div class="role-row">${trainers.map(function(inst){
        return '<div class="role-card rc-trainer" onclick="setRole(\'trainer\',\''+inst.name+'\')"><div class="role-icon">💪</div><div class="role-card-title">'+inst.name+'</div><div class="role-card-desc">골프 PT 기록</div></div>';
      }).join('')}</div>
    </div>
    <div class="role-section">
      <div class="role-section-label">시스템 관리</div>
      <div class="role-row">
        <div class="role-card rc-admin" onclick="setRole('admin','관리자')">
          <div class="role-icon">🔐</div><div class="role-card-title">관리자</div><div class="role-card-desc">전체 로그 · 감사</div>
        </div>
      </div>
    </div>
    <div class="update-notice">
      <div class="update-head" onclick="this.parentElement.classList.toggle('collapsed')">
        <span>📋 ${APP_VERSION.version} 업데이트 · ${APP_VERSION.date}</span>
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
  const isInfo = S.currentRole==='infodesk' || isAdmin; // admin도 읽기전용 (모든 회원 조회)
  const mid = S.selectedMember;
  const member = mid ? S.members.find(m => m.id===mid) : null;
  const allSess = mid ? (S.sessions[mid]||[]).slice().sort((a,b) => b.date.localeCompare(a.date)) : [];
  const sessions = S.filterAuthor==='all' ? allSess : allSess.filter(s => getRole(s.author)===S.filterAuthor);
  const assess = mid ? (S.assessments[mid]||{}) : {};
  const st = mid ? stats(mid) : null;
  const warnings = mid ? ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && (v.result==='제한'||v.result==='주의 필요');
  }).map(function(item){ return {name:item.name, result:assess[item.key].result, impact:BODY_SWING_MAP[item.key]||''}; }) : [];

  root.innerHTML = `
  <div class="sidebar-backdrop${S.sidebarOpen?' show':''}" onclick="toggleSidebar()"></div>
  <div class="sidebar${S.sidebarOpen?' open':''}">
    <div class="sidebar-logo">
      <img class="sidebar-logo-img" src="assets/logo.png" alt="내셔널짐">
      <div class="sidebar-top-actions">
        <button class="sidebar-bell" onclick="event.stopPropagation();openActivityLog()">${getUnreadCount()>0?'<span class="bell-badge">'+getUnreadCount()+'</span>':''}🔔</button>
        <button class="sidebar-home-btn" onclick="event.stopPropagation();switchRole()">🏠</button>
      </div>
    </div>
    <div class="sidebar-section-label">회원 목록${!isInfo?' (배정)':''}</div>
    <div class="member-list">
      ${S.members.filter(function(m){
        if(isInfo) return true;
        return m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1;
      }).map(m => `
        <div class="member-item${m.id===mid?' active':''}" onclick="selectMember('${m.id}')">
          <div class="member-avatar ${m.color}">${initials(m.name)}</div>
          <div class="member-name">${m.name}${expiryBadge(m.expiry)}</div>
          <div class="session-badge">${(S.sessions[m.id]||[]).length}</div>
          <div class="member-actions">
            ${(isInfo&&!isAdmin)?'<button class="member-edit-btn" onclick="event.stopPropagation();openEditMember(\''+m.id+'\')">수정</button>':''}
            ${(isInfo&&!isAdmin)&&!S.deleteRequests[m.id]?'<button class="member-del-btn" onclick="event.stopPropagation();requestDelete(\''+m.id+'\')">삭제</button>':''}
            ${S.deleteRequests[m.id]?'<span class="del-pending-badge">삭제대기</span>':''}
          </div>
        </div>`).join('')}
    </div>
    ${(isInfo&&!isAdmin)?'<div class="add-member-btn" onclick="openAddMember()">+ 새 회원 등록</div>':''}
    <div class="sidebar-mypage">
      <div class="mp-label">마이페이지</div>
      ${S.currentRole!=='admin'?'<button class="mp-btn" onclick="openPasswordChange()">🔑 비밀번호 변경</button>':''}
      ${S.currentRole==='admin'?'<button class="mp-btn" onclick="openAuditLog()">🔍 전체 감사 로그</button>':''}
    </div>
  </div>
  <button class="mobile-toggle" onclick="toggleSidebar()">☰</button>

  <div class="main">
    ${member ? `
    <div class="topbar">
      <div class="member-title-wrap">
        <div class="topbar-avatar ${member.color}">${initials(member.name)}</div>
        <div>
          <div class="member-title">${member.name} 회원님</div>
          <div class="member-subtitle">레슨 ${st?st.pro:0}/${member.golfLessonCount||'0'}회 · PT ${st?st.trainer:0}/${member.golfPTCount||'0'}회${member.expiry?' · ~'+member.expiry+expiryBadge(member.expiry):''}</div>
          ${(member.phone||member.email||member.registeredDate)?`<div class="member-detail-line">${member.phone?'📞 '+member.phone:''}${member.email?' · ✉ '+member.email:''}${member.registeredDate?' · 가입일 '+member.registeredDate:''}</div>`:''}
        </div>
      </div>
      <div class="topbar-actions">
        ${!isInfo?'<button class="btn primary" onclick="openAddSession()">+ 세션 기록</button>':''}
        ${S.deleteRequests[mid]&&!isInfo?'<button class="btn danger" onclick="approveDelete(\''+mid+'\')">삭제 승인</button><button class="btn" onclick="rejectDelete(\''+mid+'\')">거절</button>':''}
      </div>
    </div>
    <div class="content">
      ${st ? `
      <div class="stat-row">
        <div class="stat"><div class="stat-val">${st.total}</div><div class="stat-lbl">총 세션</div></div>
        <div class="stat"><div class="stat-val blue">${st.pro}</div><div class="stat-lbl">골프 프로</div></div>
        <div class="stat"><div class="stat-val green">${st.trainer}</div><div class="stat-lbl">골프 PT</div></div>
      </div>` : ''}

      <div class="section-card">
        <div class="section-header${S.assessOpen?' open':''}" onclick="toggleAssess()">
          <div class="section-label">
            <div class="dot dot-green"></div>
            체형 기능 평가
            <span class="sec-count">(${ASSESSMENT_ITEMS.filter(i=>{const v=assess[i.key];return v&&v.result&&v.result!=='미검사'}).length}/${ASSESSMENT_ITEMS.length})${assess._date?' · '+assess._date:''}${assess._history&&assess._history.length>0?' · 히스토리 '+assess._history.length+'회':''}</span>
          </div>
          <div class="chevron">▼</div>
        </div>
        ${S.assessOpen ? `
        <div class="assess-meta">
          <label class="assess-date-label">평가일</label>
          <input type="date" class="assess-date-input" value="${assess._date||''}" ${isInfo?'disabled':''} onchange="updateAssessDate(this.value)">
          ${!isInfo?'<button class="btn" style="font-size:11px;padding:5px 10px" onclick="snapshotAssessment()">📸 애프터 평가 시작</button>':''}
        </div>
        ${assess._history&&assess._history.length>0?'<div class="assess-history">'+assess._history.map(function(h,i){return '<div class="history-item"><strong>'+h.date+'</strong> <span>('+ASSESSMENT_ITEMS.filter(function(it){var v=h.items[it.key];return v&&v.result&&v.result!=='미검사';}).length+'/'+ASSESSMENT_ITEMS.length+')</span></div>';}).join('')+'</div>':''}
        <div class="assessment-grid">
          ${ASSESSMENT_ITEMS.map(item => {
            const v = assess[item.key] || {result:'미검사', note:''};
            const warn = v.result && v.result!=='정상' && v.result!=='미검사';
            return `<div class="assess-item${warn?' warn':''}">
              <div class="assess-name">${item.name}</div>
              <div class="assess-cp">${item.cp}</div>
              <div class="assess-row">
                <select class="assess-select" ${isInfo?'disabled ':''} onchange="updateAssess('${item.key}','result',this.value)">
                  ${RESULT_OPTIONS.map(o => `<option value="${o}"${v.result===o?' selected':''}>${o}</option>`).join('')}
                </select>
              </div>
              <input class="assess-note-input" placeholder="특이사항" value="${(v.note||'').replace(/"/g,'&quot;')}" ${isInfo?'disabled ':''} onchange="updateAssess('${item.key}','note',this.value)" />
              ${warn && BODY_SWING_MAP[item.key] ? `<div class="body-swing-alert"><span class="bsa-icon">⚠</span> ${BODY_SWING_MAP[item.key]}</div>` : ''}
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>

      <div class="section-card">
        <div class="section-header open" style="cursor:default">
          <div class="section-label">
            <div class="dot dot-amber"></div>
            세션 기록
            <span class="sec-count">(${sessions.length}건)</span>
          </div>
          <div class="section-right">
            <div class="filter-btn${S.filterAuthor==='all'?' active':''}" onclick="setFilter('all')">전체</div>
            <div class="filter-btn${S.filterAuthor==='pro'?' pro-active':''}" onclick="setFilter('pro')">프로</div>
            <div class="filter-btn${S.filterAuthor==='trainer'?' trainer-active':''}" onclick="setFilter('trainer')">트레이너</div>
          </div>
        </div>
        ${warnings.length>0 ? `<div class="warning-banner${S.warningBannerCollapsed?' collapsed':''}">
          <div class="wb-head" onclick="toggleWarningBanner()"><span>⚠ 체형 제한 ${warnings.length}개 확인 — 레슨/운동 전 검토 필요</span><span class="wb-chevron">▼</span></div>
          <div class="wb-body">${warnings.map(function(w){ return '<div class="wb-item"><strong>'+w.name+'</strong> ('+w.result+'): '+w.impact+'</div>'; }).join('')}</div>
        </div>` : ''}
        <div class="sessions-list">
          ${sessions.length===0 ? `<div class="empty-state">기록된 세션이 없습니다<br><span style="font-size:11px">상단 '+ 세션 기록' 버튼으로 추가하세요</span></div>` :
          sessions.map(s => `
            <div class="session-card">
              <div class="session-hd ${getRole(s.author)==='pro'?'pro':'trainer'}">
                <div class="role-tag ${getRole(s.author)==='pro'?'pro':'trainer'}">${getRole(s.author)==='pro'?'GOLF PRO':'GOLF PT'}</div>
                <div class="session-author">${s.author}</div>
                <div class="session-date">${s.date}</div>
              </div>
              <div class="session-bd">
                <div class="session-content">${s.content}</div>
                ${s.media&&s.media.length>0?'<div class="session-media">'+s.media.map(function(m,mi){
                  var src = m.mediaId ? (S.mediaUrls[m.mediaId]||'') : (m.data||'');
                  var mime = m.mimeType || (m.data||'').slice(5, 30) || '';
                  var isImg = mime.indexOf('image/')!==-1 || (m.data&&m.data.indexOf('image/')!==-1);
                  var isVideo = mime.indexOf('video/')!==-1 || (m.data&&m.data.indexOf('video/')!==-1);
                  if(m.type==='file' && src && isImg) return '<img class="sm-thumb" src="'+src+'" onclick="openMediaView(this.src)" alt="'+((m.name||'').replace(/"/g,'&quot;'))+'">';
                  if(m.type==='file' && src && isVideo) return '<div class="sm-video-wrap"><video class="sm-video" src="'+src+'" controls playsinline></video><button class="sm-pose-btn" onclick="openPoseAnalyzer(\''+s.id+'\','+mi+')">🦴 스켈레톤 분석</button></div>';
                  if(m.type==='file' && !src) return '<div class="sm-missing">⚠ 미디어 로딩 중...</div>';
                  if(m.type==='url') return '<a class="sm-link" href="'+((m.data||'').replace(/"/g,'&quot;'))+'" target="_blank" rel="noopener">▶ 영상 보기</a>';
                  return '';
                }).join('')+'</div>':''}
                <div class="session-actions">
                  ${!isInfo?'<button class="small-btn del" onclick="deleteSession(\''+s.id+'\')">삭제</button>':''}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    ` : `
    <div class="no-member">
      <div class="no-member-icon">⛳</div>
      <div style="font-size:14px;font-weight:600;color:#6b7a70">회원을 선택하세요</div>
      <div style="font-size:12px">좌측에서 회원을 클릭하거나 새 회원을 등록하세요</div>
    </div>`}
  </div>

  ${S.showAddSession ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">세션 기록 추가 — ${member?member.name+' 회원님':''}</div>
      <div class="form-group">
        <label class="form-label">날짜</label>
        <input type="date" class="form-input" value="${S.newSession.date}" onchange="updateNS('date',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">담당자</label>
        <div class="radio-group">
          ${INSTRUCTORS.map(function(inst){
            var sel = S.newSession.author===inst.name ? (inst.role==='pro'?' sel-pro':' sel-trainer') : '';
            return '<div class="radio-opt'+sel+'" onclick="updateNS(\'author\',\''+inst.name+'\')">'+inst.name+'</div>';
          }).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">운동 / 레슨 내용</label>
        <textarea class="form-textarea" placeholder="오늘 진행한 내용을 입력하세요" oninput="updateNS('content',this.value)">${S.newSession.content}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">스윙 영상 / 사진 첨부</label>
        <div class="media-input-box">
          <div class="media-sub-label">파일 업로드 (최대 2개)</div>
          <div class="media-file-list">${S.newSession.media.map(function(m,i){
            return '<div class="media-file-item"><span>'+(m.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+i+')">×</span></div>';
          }).join('')}</div>
          ${S.newSession.media.length<2?'<label class="media-upload-btn">+ 파일 선택<input type="file" accept="video/*,image/*" onchange="handleFileUpload(this)" style="display:none"></label>':''}
          <div class="media-sub-label" style="margin-top:10px">또는 URL 직접 입력 (최대 2개)</div>
          <input class="form-input media-url" placeholder="영상 링크 붙여넣기 (유튜브, 드라이브 등)" value="${(S.newSession.mediaUrls[0]||'').replace(/"/g,'&quot;')}" oninput="updateMediaUrl(0,this.value)" style="margin-bottom:6px">
          <input class="form-input media-url" placeholder="영상 링크 붙여넣기 (유튜브, 드라이브 등)" value="${(S.newSession.mediaUrls[1]||'').replace(/"/g,'&quot;')}" oninput="updateMediaUrl(1,this.value)">
          <div class="media-hint">파일당 최대 100MB · 브라우저 IndexedDB에 저장됩니다</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn primary" onclick="addSession()">기록 저장</button>
      </div>
    </div>
  </div>` : ''}

  ${S.showAddMember ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">${S.editMemberId?'회원 정보 수정':'새 회원 등록'}</div>
      <div class="form-group">
        <label class="form-label">회원 이름</label>
        <input class="form-input" placeholder="예: 김민수" value="${(S.newMember.name||'').replace(/"/g,'&quot;')}" oninput="S.newMember.name=this.value" autofocus>
      </div>
      <div class="member-info-row">
        <div class="form-group">
          <label class="form-label">연락처</label>
          <input class="form-input" type="tel" placeholder="010-0000-0000" value="${(S.newMember.phone||'').replace(/"/g,'&quot;')}" oninput="S.newMember.phone=this.value">
        </div>
        <div class="form-group">
          <label class="form-label">이메일</label>
          <input class="form-input" type="email" placeholder="example@email.com" value="${(S.newMember.email||'').replace(/"/g,'&quot;')}" oninput="S.newMember.email=this.value">
        </div>
      </div>
      <div class="member-info-row">
        <div class="form-group">
          <label class="form-label">등록일</label>
          <input type="date" class="form-input" value="${S.newMember.registeredDate||''}" oninput="S.newMember.registeredDate=this.value">
        </div>
        <div class="form-group">
          <label class="form-label">유효기간</label>
          <input type="date" class="form-input" value="${S.newMember.expiry||''}" oninput="S.newMember.expiry=this.value">
        </div>
      </div>
      <div class="form-section-label">골프 레슨</div>
      <div class="member-info-row">
        <div class="form-group">
          <label class="form-label">등록 횟수</label>
          <input class="form-input" type="number" placeholder="예: 12" value="${S.newMember.golfLessonCount||''}" oninput="S.newMember.golfLessonCount=this.value">
        </div>
        <div class="form-group">
          <label class="form-label">등록 금액 (원)</label>
          <input class="form-input" placeholder="예: 480,000" value="${(S.newMember.golfLessonAmount||'').replace(/"/g,'&quot;')}" oninput="S.newMember.golfLessonAmount=this.value">
        </div>
      </div>
      <div class="form-section-label">골프 PT</div>
      <div class="member-info-row">
        <div class="form-group">
          <label class="form-label">등록 횟수</label>
          <input class="form-input" type="number" placeholder="예: 12" value="${S.newMember.golfPTCount||''}" oninput="S.newMember.golfPTCount=this.value">
        </div>
        <div class="form-group">
          <label class="form-label">등록 금액 (원)</label>
          <input class="form-input" placeholder="예: 480,000" value="${(S.newMember.golfPTAmount||'').replace(/"/g,'&quot;')}" oninput="S.newMember.golfPTAmount=this.value">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">담당 지도자 배정</label>
        <div class="assign-grid">${INSTRUCTORS.map(function(inst){
          var checked=(S.newMember.assignedTo||[]).indexOf(inst.name)!==-1;
          var cls=inst.role==='pro'?'assign-pro':'assign-trainer';
          return '<label class="assign-opt '+cls+(checked?' checked':'')+'"><input type="checkbox" '+(checked?'checked ':'')+' onchange="toggleAssign(\''+inst.name+'\')"> '+inst.name+'</label>';
        }).join('')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn primary" onclick="${S.editMemberId?'saveMemberEdit()':'addMember()'}">${S.editMemberId?'저장':'등록'}</button>
      </div>
    </div>
  </div>` : ''}

  ${S.showActivityLog ? `
  <div class="modal-overlay" onclick="if(event.target===this){S.showActivityLog=false;render()}">
    <div class="modal" style="width:520px">
      <div class="modal-title">📋 활동 로그</div>
      <div class="activity-log-list">
        ${S.activityLog.slice().reverse().slice(0,50).map(function(e){
          var d=new Date(e.time);
          var ts=(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
          return '<div class="log-item"><div class="log-time">'+ts+'</div><div class="log-body"><strong>'+e.user+'</strong> — '+(e.memberName||'')+' '+e.action+(e.detail?' : '+e.detail:'')+'</div></div>';
        }).join('')||'<div class="empty-state">아직 활동 기록이 없습니다</div>'}
      </div>
      <div class="modal-actions"><button class="btn" onclick="S.showActivityLog=false;render()">닫기</button></div>
    </div>
  </div>` : ''}

  ${S.showPwChange ? `
  <div class="modal-overlay" onclick="if(event.target===this){S.showPwChange=false;render()}">
    <div class="modal" style="width:380px">
      <div class="modal-title">🔑 비밀번호 변경</div>
      <div class="form-group">
        <label class="form-label">현재 비밀번호</label>
        <input type="password" class="form-input" oninput="S.pwChange.current=this.value" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">새 비밀번호 (4자 이상)</label>
        <input type="password" class="form-input" oninput="S.pwChange.newPw=this.value">
      </div>
      <div class="form-group">
        <label class="form-label">새 비밀번호 확인</label>
        <input type="password" class="form-input" oninput="S.pwChange.confirm=this.value" onkeydown="if(event.key==='Enter')submitPasswordChange()">
      </div>
      ${S.pwChangeError?'<div style="color:#993c1d;font-size:12px;margin-bottom:10px;text-align:center">'+S.pwChangeError+'</div>':''}
      <div class="modal-actions">
        <button class="btn" onclick="S.showPwChange=false;render()">취소</button>
        <button class="btn primary" onclick="submitPasswordChange()">변경</button>
      </div>
    </div>
  </div>` : ''}

  ${S.showAuditLog ? `
  <div class="modal-overlay" onclick="if(event.target===this){S.showAuditLog=false;render()}">
    <div class="modal" style="width:780px;max-width:96vw">
      <div class="modal-title">🔍 관리자 감사 로그 <span style="font-size:11px;font-weight:400;color:#9ca89e;margin-left:8px">(최근 ${Math.min(200, S.auditLog.length)}건 / 총 ${S.auditLog.length}건)</span></div>
      <div class="audit-filter">
        ${['all','auth','member','session','assess','system'].map(function(c){
          return '<button class="audit-filter-btn '+(S.auditFilter===c?' active':'')+'" onclick="S.auditFilter=\''+c+'\';render()">'+(c==='all'?'전체':c==='auth'?'인증':c==='member'?'회원':c==='session'?'세션':c==='assess'?'평가':'시스템')+'</button>';
        }).join('')}
        <button class="btn" style="font-size:10px;padding:4px 8px;margin-left:auto" onclick="exportAuditLog()">📥 CSV 내보내기</button>
      </div>
      <div class="audit-log-list">
        ${S.auditLog.slice().reverse().filter(function(e){return S.auditFilter==='all'||e.category===S.auditFilter;}).slice(0,200).map(function(e){
          var d=new Date(e.time);
          var ts=d.getFullYear().toString().slice(2)+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
          var catLabel = {auth:'🔐 인증',member:'👤 회원',session:'📝 세션',assess:'📊 평가',system:'⚙ 시스템'}[e.category]||e.category;
          var metaStr = '';
          try{metaStr=JSON.stringify(e.meta).slice(0,200);}catch(err){metaStr='';}
          return '<div class="audit-row audit-'+e.category+'"><div class="au-time">'+ts+'</div><div class="au-cat">'+catLabel+'</div><div class="au-user">'+e.user+'</div><div class="au-action">'+e.action+'</div><div class="au-target">'+(e.target||'')+'</div><div class="au-meta">'+metaStr+'</div></div>';
        }).join('')||'<div class="empty-state">감사 로그가 없습니다</div>'}
      </div>
      <div class="modal-actions"><button class="btn" onclick="S.showAuditLog=false;render()">닫기</button></div>
    </div>
  </div>` : ''}
  `;
}

// ============ 이벤트 핸들러 ============
function selectMember(id){S.selectedMember=id; S.filterAuthor='all'; S.sidebarOpen=false; render();}
function toggleAssess(){S.assessOpen=!S.assessOpen; render();}
function toggleWarningBanner(){S.warningBannerCollapsed=!S.warningBannerCollapsed; render();}
function setFilter(f){S.filterAuthor=f; render();}
function openAddSession(){S.newSession={date:today(),author:S.currentUser||'',content:'',media:[],mediaUrls:['','']}; S.showAddSession=true; render();}
function openAddMember(){S.newMember={name:'',phone:'',email:'',registeredDate:today(),golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',assignedTo:[]}; S.editMemberId=null; S.showAddMember=true; render();}
function toggleAssign(name){
  var arr=S.newMember.assignedTo||[];
  var idx=arr.indexOf(name);
  if(idx===-1) arr.push(name); else arr.splice(idx,1);
  S.newMember.assignedTo=arr; render();
}
function openEditMember(id){
  var m=S.members.find(function(x){return x.id===id;});
  if(!m)return;
  S.newMember={
    name:m.name, phone:m.phone||'', email:m.email||'',
    registeredDate:m.registeredDate||'',
    golfLessonCount:m.golfLessonCount||'', golfPTCount:m.golfPTCount||'',
    golfLessonAmount:m.golfLessonAmount||'', golfPTAmount:m.golfPTAmount||'',
    expiry:m.expiry||'', assignedTo:(m.assignedTo||[]).slice()
  };
  S.editMemberId=id; S.showAddMember=true; render();
}
function saveMemberEdit(){
  var nm=S.newMember.name.trim();if(!nm){alert('이름을 입력하세요');return;}
  var m=S.members.find(function(x){return x.id===S.editMemberId;});
  if(!m)return;
  var before={name:m.name,phone:m.phone,email:m.email,expiry:m.expiry};
  m.name=nm;m.phone=S.newMember.phone;m.email=S.newMember.email;
  m.registeredDate=S.newMember.registeredDate;
  m.golfLessonCount=S.newMember.golfLessonCount;m.golfPTCount=S.newMember.golfPTCount;
  m.golfLessonAmount=S.newMember.golfLessonAmount;m.golfPTAmount=S.newMember.golfPTAmount;
  m.expiry=S.newMember.expiry;m.assignedTo=S.newMember.assignedTo||[];
  var editId = S.editMemberId;
  S.editMemberId=null; S.showAddMember=false;
  logActivity('회원 수정', editId, nm);
  logAudit('member','회원 수정',nm,{before:before,after:{name:m.name,phone:m.phone,email:m.email,expiry:m.expiry}});
  save(); render(); cloud.upsertMember(m);
}
function requestDelete(id){
  if(!confirm('이 회원의 삭제를 요청하시겠습니까? 운동지도자 승인 후 삭제됩니다.'))return;
  S.deleteRequests[id]={requestedBy:S.currentUser||'인포데스크',requestedAt:today()};
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
  logAudit('member','삭제 요청',mName,{id:id});
  save(); render();
}
function approveDelete(id){
  if(!confirm('삭제를 승인하시겠습니까? 모든 세션과 평가 데이터가 영구 삭제됩니다.'))return;
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
  S.members=S.members.filter(function(x){return x.id!==id;});
  delete S.assessments[id];delete S.sessions[id];delete S.deleteRequests[id];
  if(S.selectedMember===id) S.selectedMember=S.members.length>0?S.members[0].id:null;
  logAudit('member','삭제 승인',mName,{id:id});
  save(); render();
}
function rejectDelete(id){
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
  delete S.deleteRequests[id];
  logAudit('member','삭제 거절',mName,{id:id});
  save(); render();
}
function toggleSidebar(){S.sidebarOpen=!S.sidebarOpen; render();}
function closeModal(){S.showAddSession=false; S.showAddMember=false; S.showActivityLog=false; S.editMemberId=null; render();}
function openActivityLog(){markSeen(); S.showActivityLog=true; render();}
function openPasswordChange(){S.pwChange={current:'',newPw:'',confirm:''}; S.pwChangeError=''; S.showPwChange=true; render();}
function submitPasswordChange(){
  var key = S.currentRole==='infodesk' ? 'infodesk' : (S.currentRole==='admin' ? '관리자' : S.currentUser);
  if(S.pwChange.current !== getPassword(key)){S.pwChangeError='현재 비밀번호가 일치하지 않습니다'; render(); return;}
  if(!S.pwChange.newPw || S.pwChange.newPw.length<4){S.pwChangeError='새 비밀번호는 4자 이상이어야 합니다'; render(); return;}
  if(S.pwChange.newPw !== S.pwChange.confirm){S.pwChangeError='새 비밀번호가 일치하지 않습니다'; render(); return;}
  setPassword(key, S.pwChange.newPw);
  S.showPwChange=false; S.pwChangeError='';
  alert('비밀번호가 변경되었습니다');
  render();
}
function openAuditLog(){S.showAuditLog=true; S.auditFilter=S.auditFilter||'all'; render();}
function exportAuditLog(){
  var rows = [['시간','카테고리','사용자','역할','액션','대상','메타']];
  S.auditLog.forEach(function(e){
    rows.push([e.time, e.category, e.user, e.role||'', e.action, e.target||'', JSON.stringify(e.meta||{})]);
  });
  var csv = rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'audit_log_'+today()+'.csv';
  a.click();
  setTimeout(function(){URL.revokeObjectURL(url);}, 100);
}
function updateNS(k,v){S.newSession[k]=v; if(k==='author'||k==='date') render();}

function updateAssess(key, field, val){
  const mid = S.selectedMember;
  if(!S.assessments[mid]) S.assessments[mid] = {};
  if(!S.assessments[mid][key]) S.assessments[mid][key] = {result:'미검사', note:''};
  S.assessments[mid][key][field] = val;
  if(!S.assessments[mid]._date) S.assessments[mid]._date = today();
  save();
  const v = S.assessments[mid][key];
  var itemName=(ASSESSMENT_ITEMS.find(function(i){return i.key===key;})||{}).name||key;
  logActivity('평가 수정', mid, itemName+': '+v.result);
  logAudit('assess','평가 수정', (S.members.find(function(m){return m.id===mid;})||{}).name||'', {item:itemName, field:field, value:val});
  cloud.upsertAssessment(mid, key, v.result, v.note);
}

function snapshotAssessment(){
  const mid = S.selectedMember;
  if(!mid || !S.assessments[mid]) return;
  if(!confirm('현재 평가를 히스토리에 저장하고 새 평가를 시작하시겠습니까?\n(초기 평가 → 애프터 평가 기록용)')) return;
  var cur = S.assessments[mid];
  var snapshot = {date: cur._date||today(), items:{}};
  for(var k in cur){
    if(k==='_date'||k==='_history') continue;
    snapshot.items[k] = {result:cur[k].result, note:cur[k].note};
  }
  if(!cur._history) cur._history = [];
  cur._history.push(snapshot);
  // 현재 평가 초기화 (날짜는 오늘로)
  var newAssess = {_date: today(), _history: cur._history};
  ASSESSMENT_ITEMS.forEach(function(item){
    newAssess[item.key] = {result:'미검사', note:''};
  });
  S.assessments[mid] = newAssess;
  logActivity('평가 스냅샷', mid, snapshot.date+' 기록 저장');
  save(); render();
}

function updateAssessDate(val){
  const mid = S.selectedMember;
  if(!S.assessments[mid]) S.assessments[mid] = {};
  S.assessments[mid]._date = val;
  save();
}

function addSession(){
  const ns = S.newSession;
  if(!ns.content.trim()){alert('운동/레슨 내용을 입력하세요'); return;}
  const mid = S.selectedMember;
  if(!S.sessions[mid]) S.sessions[mid] = [];
  var media = (ns.media||[]).slice();
  (ns.mediaUrls||[]).forEach(function(u){ u=(u||'').trim(); if(u) media.push({type:'url',name:u,data:u}); });
  const s = {
    id: suid(),
    date: ns.date,
    author: ns.author,
    content: ns.content.trim(),
    media: media.length>0 ? media : undefined
  };
  S.sessions[mid].push(s);
  logActivity('세션 추가', mid, s.content.slice(0,40));
  logAudit('session','세션 기록', (S.members.find(function(x){return x.id===mid;})||{}).name||'', {date:s.date, author:s.author, content:s.content.slice(0,80), mediaCount:(s.media||[]).length});
  if(!save()){
    // 저장 실패 시 롤백
    S.sessions[mid].pop();
    S.activityLog.pop();
    render();
    return;
  }
  S.showAddSession = false;
  render();
  cloud.upsertSession(mid, s);
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
    expiry:S.newMember.expiry,
    assignedTo:S.newMember.assignedTo||[]
  };
  S.members.push(m);
  S.assessments[id] = {};
  S.sessions[id] = [];
  S.selectedMember = id;
  S.showAddMember = false;
  logActivity('회원 등록', id, name);
  logAudit('member','회원 등록',name,{phone:m.phone,email:m.email,registeredDate:m.registeredDate,expiry:m.expiry});
  save(); render();
  cloud.upsertMember(m);
}

async function handleFileUpload(input){
  var files=Array.from(input.files||[]);
  var existing=S.newSession.media||[];
  if(existing.length+files.length>2){alert('파일은 최대 2개까지 첨부 가능합니다');input.value='';return;}
  // IndexedDB 사용 — 개별 파일 최대 100MB (브라우저 quota 내)
  var MAX_FILE_SIZE = 100*1024*1024;
  if(!mediaDB.db){
    var ok = await mediaDB.init();
    if(!ok){
      alert('브라우저가 IndexedDB를 지원하지 않습니다.\n영상 업로드 대신 URL 입력을 사용해주세요.');
      input.value=''; return;
    }
  }
  // Quota 체크
  var est = await getStorageEstimate();
  if(est && est.quota){
    var totalWanted = files.reduce(function(a,f){return a+f.size;},0);
    var remaining = est.quota - est.usage;
    if(totalWanted > remaining * 0.8){
      alert('저장 공간 부족: 남은 용량 ' + (remaining/1024/1024).toFixed(0) + 'MB\n\n오래된 영상을 삭제하거나 URL 입력을 사용하세요.');
      input.value=''; return;
    }
  }
  for(var i=0;i<files.length;i++){
    var file = files[i];
    if(file.size > MAX_FILE_SIZE){
      alert(file.name + ' : ' + (file.size/1024/1024).toFixed(1) + 'MB\n\n파일당 최대 100MB까지 업로드 가능합니다.');
      continue;
    }
    var mediaId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    var saved = await mediaDB.put(mediaId, file, {mimeType:file.type, name:file.name});
    if(!saved){
      alert(file.name + ' 저장 실패');
      continue;
    }
    try{S.mediaUrls[mediaId] = URL.createObjectURL(file);}catch(e){}
    S.newSession.media.push({type:'file', name:file.name, mimeType:file.type, size:file.size, mediaId:mediaId});
    render();
  }
  input.value='';
}
async function removeMediaFile(idx){
  var m = S.newSession.media[idx];
  if(m && m.mediaId){
    await mediaDB.del(m.mediaId);
    if(S.mediaUrls[m.mediaId]){URL.revokeObjectURL(S.mediaUrls[m.mediaId]); delete S.mediaUrls[m.mediaId];}
  }
  S.newSession.media.splice(idx,1);
  render();
}
function updateMediaUrl(idx,val){S.newSession.mediaUrls[idx]=val;}
function openMediaView(src){
  var d=document.createElement('div');d.className='media-overlay';
  d.onclick=function(){d.remove();};
  d.innerHTML='<img src="'+src+'" style="max-width:92vw;max-height:92vh;border-radius:8px">';
  document.body.appendChild(d);
}

// MediaPipe Pose 스켈레톤 분석
// ============ Golf Swing Analysis ============
// MediaPipe Pose 랜드마크 인덱스 (https://google.github.io/mediapipe/solutions/pose.html)
const LM = {
  NOSE:0, L_EYE:2, R_EYE:5,
  L_SHOULDER:11, R_SHOULDER:12,
  L_ELBOW:13, R_ELBOW:14,
  L_WRIST:15, R_WRIST:16,
  L_HIP:23, R_HIP:24,
  L_KNEE:25, R_KNEE:26,
  L_ANKLE:27, R_ANKLE:28
};

function angleAt(a,b,c){
  // b를 꼭짓점으로 하는 각도 (도 단위)
  var ab={x:a.x-b.x,y:a.y-b.y};
  var cb={x:c.x-b.x,y:c.y-b.y};
  var dot=ab.x*cb.x+ab.y*cb.y;
  var mag=Math.sqrt(ab.x*ab.x+ab.y*ab.y)*Math.sqrt(cb.x*cb.x+cb.y*cb.y);
  if(mag===0) return 0;
  return Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180/Math.PI;
}
function lineAngle(a,b){
  // 수평선 대비 각도 (-180~180)
  return Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI;
}

function analyzeSwing(lm){
  if(!lm || !lm[LM.L_SHOULDER]) return null;
  // 어깨/골반 회전 (수평 각도)
  var shoulderLineAngle = lineAngle(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  var hipLineAngle = lineAngle(lm[LM.L_HIP], lm[LM.R_HIP]);
  var xFactor = Math.abs(shoulderLineAngle - hipLineAngle);
  if(xFactor>90) xFactor = 180-xFactor;

  // 척추각 (미드힙→미드숄더 vector vs 수직)
  var midHip = {x:(lm[LM.L_HIP].x+lm[LM.R_HIP].x)/2, y:(lm[LM.L_HIP].y+lm[LM.R_HIP].y)/2};
  var midSh = {x:(lm[LM.L_SHOULDER].x+lm[LM.R_SHOULDER].x)/2, y:(lm[LM.L_SHOULDER].y+lm[LM.R_SHOULDER].y)/2};
  var spineAngle = Math.atan2(midSh.x-midHip.x, midHip.y-midSh.y)*180/Math.PI;

  // 무릎 굴곡 (작을수록 많이 굽힘, 180=곧게 폄)
  var lKnee = angleAt(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]);
  var rKnee = angleAt(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]);

  // 팔 각도 (팔꿈치에서의 각도, 180=곧게 폄)
  var lArm = angleAt(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]);
  var rArm = angleAt(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]);

  // 머리-중심 편차 (x 좌표 기준)
  var bodyCenterX = (midHip.x + midSh.x)/2;
  var headOffset = (lm[LM.NOSE].x - bodyCenterX);

  // 손목 높이 (스윙 페이즈 감지용)
  var wristY = Math.min(lm[LM.L_WRIST].y, lm[LM.R_WRIST].y);

  return {
    shoulderTilt:shoulderLineAngle, hipTilt:hipLineAngle, xFactor:xFactor,
    spineAngle:spineAngle, lKnee:lKnee, rKnee:rKnee, lArm:lArm, rArm:rArm,
    headOffset:headOffset, wristY:wristY,
    midHip:midHip, midSh:midSh
  };
}

function openPoseAnalyzer(sessionId, mediaIdx){
  var mid=S.selectedMember;
  var sess=(S.sessions[mid]||[]).find(function(x){return x.id===sessionId;});
  if(!sess||!sess.media||!sess.media[mediaIdx])return;
  var m = sess.media[mediaIdx];
  var src = m.mediaId ? S.mediaUrls[m.mediaId] : m.data;
  if(!src){alert('영상을 불러올 수 없습니다'); return;}
  if(typeof Pose==='undefined'){
    alert('MediaPipe 로딩 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  var overlay=document.createElement('div');
  overlay.className='pose-overlay';
  overlay.innerHTML =
    '<div class="pose-box">'+
      '<div class="pose-title">🦴 골프 스윙 분석 <button class="pose-close" onclick="closePoseAnalyzer(this)">✕</button></div>'+
      '<div class="pose-body">'+
        '<div class="pose-canvas-wrap">'+
          '<video class="pose-video" src="'+src+'" controls playsinline crossorigin="anonymous"></video>'+
          '<canvas class="pose-canvas"></canvas>'+
        '</div>'+
        '<div class="pose-metrics-panel">'+
          '<div class="metric-section-title">실시간 지표</div>'+
          '<div class="metric"><span class="m-lbl">X-Factor (상하체 분리)</span><span class="m-val" id="m-xfactor">—</span></div>'+
          '<div class="metric"><span class="m-lbl">어깨 틸트</span><span class="m-val" id="m-shoulder">—</span></div>'+
          '<div class="metric"><span class="m-lbl">골반 틸트</span><span class="m-val" id="m-hip">—</span></div>'+
          '<div class="metric"><span class="m-lbl">척추 각도</span><span class="m-val" id="m-spine">—</span></div>'+
          '<div class="metric"><span class="m-lbl">리드 암 (좌/우)</span><span class="m-val" id="m-arm">—</span></div>'+
          '<div class="metric"><span class="m-lbl">무릎 굴곡 (좌/우)</span><span class="m-val" id="m-knee">—</span></div>'+
          '<div class="metric"><span class="m-lbl">머리 이동</span><span class="m-val" id="m-head">—</span></div>'+
          '<div class="metric-section-title">스윙 페이즈</div>'+
          '<div class="phase-display" id="phase-display">대기</div>'+
          '<div class="metric-section-title">체크리스트</div>'+
          '<div class="checklist" id="checklist"></div>'+
          '<div class="metric-section-title">설정</div>'+
          '<label class="toggle-row"><input type="checkbox" id="toggle-guide" checked> 가이드라인 표시</label>'+
          '<label class="toggle-row"><input type="checkbox" id="toggle-smooth" checked> 스무딩</label>'+
        '</div>'+
      '</div>'+
      '<div class="pose-status">로딩 중...</div>'+
    '</div>';
  document.body.appendChild(overlay);

  var video=overlay.querySelector('.pose-video');
  var canvas=overlay.querySelector('.pose-canvas');
  var status=overlay.querySelector('.pose-status');
  var ctx=canvas.getContext('2d',{desynchronized:true});
  var toggleGuide=overlay.querySelector('#toggle-guide');

  // 속도 최적화: modelComplexity 0 (lite, 2~3배 빠름)
  var pose=new Pose({locateFile:function(file){return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/'+file;}});
  pose.setOptions({modelComplexity:0, smoothLandmarks:true, enableSegmentation:false, minDetectionConfidence:.5, minTrackingConfidence:.5});

  // 스윙 페이즈 트래킹
  var phaseHistory = [];  // {t, wristY, metrics}
  var phaseStartMetrics = null;
  var currentPhase = '대기';
  var initialHeadX = null;

  function detectPhase(metrics){
    // 손목 Y 기반 간단 페이즈 감지 (wristY가 작을수록 위쪽)
    if(phaseHistory.length<5) return currentPhase;
    var recent = phaseHistory.slice(-5);
    var dy = recent[4].wristY - recent[0].wristY;
    var absY = metrics.wristY;
    // 손목이 어깨보다 낮고 안정: 어드레스
    var shoulderY = (metrics.midSh ? metrics.midSh.y : 0.5);
    if(Math.abs(dy)<0.01 && absY>shoulderY){
      if(currentPhase==='팔로스루'||currentPhase==='임팩트') return '피니시';
      return '어드레스';
    }
    // 손목이 올라가는 중: 백스윙
    if(dy<-0.015) return currentPhase==='어드레스'||currentPhase==='대기'||currentPhase==='백스윙' ? '백스윙' : currentPhase;
    // 손목이 내려가는 중: 다운스윙
    if(dy>0.015 && currentPhase==='백스윙') return '다운스윙';
    if(dy>0.015 && currentPhase==='탑') return '다운스윙';
    // 손목이 최고점 근처에서 정지: 탑
    if(Math.abs(dy)<0.008 && absY<shoulderY && currentPhase==='백스윙') return '탑';
    // 손목이 허리 높이 통과 (내려가는 중): 임팩트
    if(currentPhase==='다운스윙' && absY>shoulderY) return '임팩트';
    if(currentPhase==='임팩트') return '팔로스루';
    return currentPhase;
  }

  function updateMetricsUI(metrics, phase){
    function setEl(id,val){var el=overlay.querySelector('#'+id);if(el)el.textContent=val;}
    setEl('m-xfactor', metrics.xFactor.toFixed(1)+'°');
    setEl('m-shoulder', metrics.shoulderTilt.toFixed(1)+'°');
    setEl('m-hip', metrics.hipTilt.toFixed(1)+'°');
    setEl('m-spine', metrics.spineAngle.toFixed(1)+'°');
    setEl('m-arm', metrics.lArm.toFixed(0)+'° / '+metrics.rArm.toFixed(0)+'°');
    setEl('m-knee', metrics.lKnee.toFixed(0)+'° / '+metrics.rKnee.toFixed(0)+'°');
    var headDelta = initialHeadX===null ? 0 : (metrics.headOffset - initialHeadX);
    setEl('m-head', (headDelta*100).toFixed(1)+' cm');
    var phaseEl = overlay.querySelector('#phase-display');
    if(phaseEl){phaseEl.textContent = phase; phaseEl.className='phase-display phase-'+phase;}

    // 체크리스트 업데이트
    var checks = [];
    // X-Factor 체크 (탑에서 30도 이상 권장)
    if(phase==='탑' || phase==='다운스윙'){
      if(metrics.xFactor >= 30) checks.push({ok:true, text:'X-Factor 양호 ('+metrics.xFactor.toFixed(0)+'°)'});
      else checks.push({ok:false, text:'X-Factor 부족 — 상체 회전 늘리기'});
    }
    // 척추 각도 유지
    if(phaseStartMetrics && Math.abs(metrics.spineAngle - phaseStartMetrics.spineAngle) > 8){
      checks.push({ok:false, text:'얼리 익스텐션 의심 — 척추각 변화 '+Math.abs(metrics.spineAngle-phaseStartMetrics.spineAngle).toFixed(0)+'°'});
    } else if(phaseStartMetrics) {
      checks.push({ok:true, text:'척추 각도 유지 양호'});
    }
    // 머리 이동
    if(Math.abs(headDelta) > 0.05){
      checks.push({ok:false, text:'헤드 무브먼트 과다 — '+(headDelta*100).toFixed(0)+'cm'});
    } else if(initialHeadX!==null){
      checks.push({ok:true, text:'헤드 위치 안정'});
    }
    // 리드 암 (백스윙 탑에서 거의 펴져있어야)
    if(phase==='탑' || phase==='다운스윙'){
      if(metrics.lArm > 160) checks.push({ok:true, text:'리드 암 직선 유지'});
      else checks.push({ok:false, text:'리드 암 굽힘 — '+metrics.lArm.toFixed(0)+'°'});
    }
    // 오른쪽 무릎 각도 유지 (백스윙 중 무너지면 안됨)
    if(phase==='백스윙' || phase==='탑'){
      if(phaseStartMetrics && Math.abs(metrics.rKnee - phaseStartMetrics.rKnee) < 10){
        checks.push({ok:true, text:'우측 무릎 안정'});
      } else if(phaseStartMetrics) {
        checks.push({ok:false, text:'우측 무릎 무너짐 의심'});
      }
    }
    var clEl=overlay.querySelector('#checklist');
    if(clEl){
      clEl.innerHTML = checks.map(function(c){
        return '<div class="check-item '+(c.ok?'ok':'warn')+'">'+(c.ok?'✓':'⚠')+' '+c.text+'</div>';
      }).join('') || '<div class="check-empty">분석 중...</div>';
    }
  }

  function drawGuidelines(metrics){
    if(!toggleGuide.checked) return;
    // 척추선 (빨간색)
    ctx.strokeStyle='rgba(255,64,129,.7)'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(metrics.midHip.x*canvas.width, metrics.midHip.y*canvas.height);
    ctx.lineTo(metrics.midSh.x*canvas.width, metrics.midSh.y*canvas.height);
    ctx.stroke();
    // 수직 기준선 (점선, 하양)
    ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(metrics.midHip.x*canvas.width, 0);
    ctx.lineTo(metrics.midHip.x*canvas.width, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
    // X-Factor 각도 표시 (어깨선 초록, 골반선 주황)
    // Already drawn via drawConnectors, but add visual markers
  }

  pose.onResults(function(results){
    canvas.width=video.videoWidth||640;
    canvas.height=video.videoHeight||480;
    ctx.save();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(results.poseLandmarks){
      if(typeof drawConnectors!=='undefined'){
        drawConnectors(ctx,results.poseLandmarks,POSE_CONNECTIONS,{color:'#00ff7f',lineWidth:3});
        drawLandmarks(ctx,results.poseLandmarks,{color:'#ff4081',lineWidth:1,radius:3});
      }
      var metrics = analyzeSwing(results.poseLandmarks);
      if(metrics){
        if(initialHeadX===null) initialHeadX = metrics.headOffset;
        phaseHistory.push({t:Date.now(), wristY:metrics.wristY});
        if(phaseHistory.length>20) phaseHistory.shift();
        var newPhase = detectPhase(metrics);
        if(newPhase!==currentPhase){
          currentPhase = newPhase;
          phaseStartMetrics = metrics;
        }
        drawGuidelines(metrics);
        updateMetricsUI(metrics, currentPhase);
      }
    }
    ctx.restore();
  });

  var rafId=null;
  var processing=false;
  function loop(){
    if(video.paused||video.ended){rafId=requestAnimationFrame(loop);return;}
    if(!processing){
      processing=true;
      pose.send({image:video}).then(function(){processing=false;}).catch(function(){processing=false;});
    }
    rafId=requestAnimationFrame(loop);
  }
  video.addEventListener('loadeddata',function(){
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    status.textContent='▶ 재생하면 분석이 시작됩니다';
  });
  video.addEventListener('play',function(){
    status.textContent='분석 중...';
    initialHeadX=null; phaseHistory=[]; currentPhase='대기'; phaseStartMetrics=null;
    loop();
  });
  video.addEventListener('pause',function(){status.textContent='일시정지';});
  overlay._pose = pose;
  overlay._rafId = rafId;
  overlay.addEventListener('click',function(e){if(e.target===overlay){closePoseAnalyzer(overlay);}});
}

function closePoseAnalyzer(el){
  var overlay = el.classList && el.classList.contains('pose-overlay') ? el : el.closest('.pose-overlay');
  if(!overlay) return;
  if(overlay._rafId) cancelAnimationFrame(overlay._rafId);
  try{if(overlay._pose && overlay._pose.close) overlay._pose.close();}catch(e){}
  overlay.remove();
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
        if(S.mediaUrls[m.mediaId]){URL.revokeObjectURL(S.mediaUrls[m.mediaId]); delete S.mediaUrls[m.mediaId];}
      }
    }
  }
  S.sessions[mid] = (S.sessions[mid]||[]).filter(s => s.id!==id);
  logActivity('세션 삭제', mid, '');
  logAudit('session','세션 삭제', (S.members.find(function(x){return x.id===mid;})||{}).name||'', {sessionId:id, date:sess&&sess.date, author:sess&&sess.author});
  save(); render();
  cloud.deleteSession(id);
}

// ============ 시작 ============
init();
