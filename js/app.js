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
  version:'v2.1',
  date:'2026-04-11',
  changes:[
    '🛡 초기 동기화 머지 방식으로 변경 — 로컬에만 있던 세션/회원/평가가 원격 덮어쓰기로 손실되던 버그 수정',
    '☁ Supabase 클라우드 동기화 활성화 — 회원/세션/체형평가 데이터가 모든 기기에서 실시간 공유',
    '🆕 사이드바 하단 동기화 상태 배지 — 연결/로딩/오류 상태 시각화 + 새로고침 버튼',
    '🎯 스켈레톤 정확도 개선 — MediaPipe Full 모델로 업그레이드 (Lite→Full, modelComplexity 1)',
    '♻ 재분석 버튼 추가 — 플레이어 툴바에서 바로 캐시 무효화 + 재분석',
    '🛠 구버전 분석 캐시 자동 무효화 — 버전 태그 기반',
    '🎨 플레이어 레이아웃 개선 — 전체 너비 스크럽바 + 아래 버튼 행, 영상 크기 확대',
    '🛠 영상 종횡비 자동 반영 — 가로/세로 영상에 따라 캔버스 자동 매칭 (스켈레톤 정렬 정확도 개선)',
    '🆕 기기간 영상 누락 안내 — 다른 기기에서 업로드된 영상은 "찾을 수 없음" 플레이스홀더 표시',
    '🆕 인라인 커스텀 비디오 플레이어 — 세션 카드에 직접 박힘, 별도 모달 없음',
    '🆕 Pseudo 전체화면 — iOS Safari에서도 스켈레톤 오버레이 유지 (⛶ 버튼)',
    '🆕 스켈레톤/가이드/지표 인라인 토글 — 플레이어 툴바에서 바로 제어',
    '🆕 자동 백그라운드 사전 분석 — 영상 로드 시 프레임 분석 자동 시작',
    '🆕 트랙맨 방식 프레임 캐싱 — 스크러빙해도 스켈레톤이 영상과 정확히 동기화',
    '🆕 정면/측면 영상 업로드 분리 — 뷰별 전용 슬롯',
    '🆕 뷰별 체크리스트 — 정면은 X-Factor·무릎·리드암, 측면은 척추각·힙벤드·헤드업·C/S-Posture',
    '🆕 분석 결과 영구 캐시 — 한 번 분석하면 재분석 없이 즉시 표시 (재분석 버튼 제공)',
    '🆕 다중 가이드라인 오버레이 — 척추선·어깨선·골반선·수직기준선',
    '🆕 회원 CRM 확장 — 연락처 · 이메일 · 등록일 필드 추가',
    '🆕 유효기간 D-day 배지 — 30일 이내 만료 회원 자동 경고',
    '🆕 마이페이지 섹션 — 사이드바에서 비밀번호 변경 가능',
    '🛠 영상 업로드 race condition 해결 (업로드 중 저장 차단)',
    '🛠 iOS Safari 저장소 영속화 요청 (IndexedDB eviction 방지)',
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
  db:null, DB_NAME:'golf_pt_media', STORE:'media', ANALYSIS_STORE:'analysis',
  init:function(){
    return new Promise(function(resolve){
      if(!window.indexedDB){resolve(false);return;}
      var req = indexedDB.open(mediaDB.DB_NAME, 2);
      req.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains(mediaDB.STORE)){
          db.createObjectStore(mediaDB.STORE, {keyPath:'id'});
        }
        if(!db.objectStoreNames.contains(mediaDB.ANALYSIS_STORE)){
          db.createObjectStore(mediaDB.ANALYSIS_STORE, {keyPath:'id'});
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
  },
  putAnalysis:function(id, data){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve(false);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.ANALYSIS_STORE,'readwrite');
        var store = tx.objectStore(mediaDB.ANALYSIS_STORE);
        var req = store.put({id:id, data:data, savedAt:Date.now()});
        req.onsuccess = function(){resolve(true);};
        req.onerror = function(){resolve(false);};
      }catch(e){resolve(false);}
    });
  },
  getAnalysis:function(id){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve(null);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.ANALYSIS_STORE,'readonly');
        var req = tx.objectStore(mediaDB.ANALYSIS_STORE).get(id);
        req.onsuccess = function(e){resolve(e.target.result?e.target.result.data:null);};
        req.onerror = function(){resolve(null);};
      }catch(e){resolve(null);}
    });
  },
  delAnalysis:function(id){
    return new Promise(function(resolve){
      if(!mediaDB.db){resolve(false);return;}
      try{
        var tx = mediaDB.db.transaction(mediaDB.ANALYSIS_STORE,'readwrite');
        var req = tx.objectStore(mediaDB.ANALYSIS_STORE).delete(id);
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
  uploading:0, // 진행 중인 파일 업로드 수
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
          <div class="role-icon">🔐</div><div class="role-card-title">관리자</div><div class="role-card-desc">관리자 모드 접속</div>
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
                  if(m.type==='file' && src && isVideo){
                    return renderSwingPlayer(s.id, mi, m, src);
                  }
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
        <label class="form-label">📹 스윙 영상 첨부</label>
        <div class="media-input-box">
          <div class="video-slot-grid">
            <div class="video-slot">
              <div class="vs-label">🎯 정면 영상</div>
              ${(function(){
                var f = (S.newSession.media||[]).find(function(x){return x.view==='front';});
                var idx = (S.newSession.media||[]).findIndex(function(x){return x.view==='front';});
                if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';
                return '<label class="media-upload-btn">+ 정면 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'front\')" style="display:none"></label>';
              })()}
            </div>
            <div class="video-slot">
              <div class="vs-label">📐 측면 영상</div>
              ${(function(){
                var f = (S.newSession.media||[]).find(function(x){return x.view==='side';});
                var idx = (S.newSession.media||[]).findIndex(function(x){return x.view==='side';});
                if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';
                return '<label class="media-upload-btn">+ 측면 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'side\')" style="display:none"></label>';
              })()}
            </div>
          </div>
          <div class="media-sub-label" style="margin-top:10px">또는 URL 직접 입력 (유튜브/드라이브)</div>
          <input class="form-input media-url" placeholder="영상 링크 붙여넣기" value="${(S.newSession.mediaUrls[0]||'').replace(/"/g,'&quot;')}" oninput="updateMediaUrl(0,this.value)" style="margin-bottom:6px">
          <input class="form-input media-url" placeholder="영상 링크 붙여넣기" value="${(S.newSession.mediaUrls[1]||'').replace(/"/g,'&quot;')}" oninput="updateMediaUrl(1,this.value)">
          <div class="media-hint">파일당 최대 100MB · 영상은 사전 자동 분석 후 스켈레톤이 고정 표시됩니다</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn primary" ${S.uploading>0?'disabled title="업로드 중..."':''} onclick="addSession()">${S.uploading>0?'⏳ 업로드 중 ('+S.uploading+')':'기록 저장'}</button>
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

  ${S.showAuditLog ? (function(){
    var allUsers = ['인포데스크'].concat(INSTRUCTORS.map(function(i){return i.name;}));
    var userCounts = {};
    allUsers.forEach(function(u){userCounts[u]=0;});
    S.auditLog.forEach(function(e){if(userCounts.hasOwnProperty(e.user)) userCounts[e.user]++;});
    if(!S.auditUserSelected){
      // 1단계: 계정 선택 화면
      return `<div class="modal-overlay" onclick="if(event.target===this){S.showAuditLog=false;render()}">
        <div class="modal" style="width:520px">
          <div class="modal-title">🔍 감사 로그 — 계정 선택</div>
          <div class="audit-user-grid">
            ${allUsers.map(function(u){
              var role = u==='인포데스크'?'infodesk':(INSTRUCTORS.find(function(i){return i.name===u;})||{}).role||'';
              var icon = u==='인포데스크'?'🖥':(role==='pro'?'⛳':'💪');
              return '<div class="audit-user-card au-'+role+'" onclick="S.auditUserSelected=\''+u+'\';render()"><div class="auc-icon">'+icon+'</div><div class="auc-name">'+u+'</div><div class="auc-count">'+userCounts[u]+'건</div></div>';
            }).join('')}
          </div>
          <div class="modal-actions"><button class="btn" onclick="S.showAuditLog=false;render()">닫기</button></div>
        </div>
      </div>`;
    }
    // 2단계: 선택한 계정의 로그
    var filtered = S.auditLog.filter(function(e){return e.user===S.auditUserSelected;});
    if(S.auditFilter&&S.auditFilter!=='all') filtered = filtered.filter(function(e){return e.category===S.auditFilter;});
    return `<div class="modal-overlay" onclick="if(event.target===this){S.showAuditLog=false;S.auditUserSelected=null;render()}">
      <div class="modal" style="width:780px;max-width:96vw">
        <div class="modal-title">
          <button class="btn" style="font-size:10px;padding:4px 8px;margin-right:8px" onclick="S.auditUserSelected=null;render()">← 뒤로</button>
          🔍 ${S.auditUserSelected} 감사 로그
          <span style="font-size:11px;font-weight:400;color:#9ca89e;margin-left:8px">(${filtered.length}건)</span>
        </div>
        <div class="audit-filter">
          ${['all','auth','member','session','assess','system'].map(function(c){
            return '<button class="audit-filter-btn'+(S.auditFilter===c?' active':'')+'" onclick="S.auditFilter=\''+c+'\';render()">'+(c==='all'?'전체':c==='auth'?'인증':c==='member'?'회원':c==='session'?'세션':c==='assess'?'평가':'시스템')+'</button>';
          }).join('')}
          <button class="btn" style="font-size:10px;padding:4px 8px;margin-left:auto" onclick="exportAuditLog('${S.auditUserSelected}')">📥 CSV</button>
        </div>
        <div class="audit-log-list">
          ${filtered.slice().reverse().slice(0,200).map(function(e){
            var d=new Date(e.time);
            var ts=d.getFullYear().toString().slice(2)+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
            var catLabel = {auth:'🔐',member:'👤',session:'📝',assess:'📊',system:'⚙'}[e.category]||e.category;
            var metaStr = '';
            try{metaStr=JSON.stringify(e.meta).slice(0,200);}catch(err){metaStr='';}
            return '<div class="audit-row audit-'+e.category+'"><div class="au-time">'+ts+'</div><div class="au-cat">'+catLabel+'</div><div class="au-action">'+e.action+'</div><div class="au-target">'+(e.target||'')+'</div><div class="au-meta">'+metaStr+'</div></div>';
          }).join('')||'<div class="empty-state">로그가 없습니다</div>'}
        </div>
        <div class="modal-actions"><button class="btn" onclick="S.showAuditLog=false;S.auditUserSelected=null;render()">닫기</button></div>
      </div>
    </div>`;
  })() : ''}
  `;
  // 커스텀 플레이어 초기화 (세션 카드의 영상)
  setTimeout(initSwingPlayers, 0);
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
function openAuditLog(){S.showAuditLog=true; S.auditFilter=S.auditFilter||'all'; S.auditUserSelected=null; render();}
function exportAuditLog(user){
  var entries = user ? S.auditLog.filter(function(e){return e.user===user;}) : S.auditLog;
  var rows = [['시간','카테고리','사용자','역할','액션','대상','메타']];
  entries.forEach(function(e){
    rows.push([e.time, e.category, e.user, e.role||'', e.action, e.target||'', JSON.stringify(e.meta||{})]);
  });
  var csv = rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'audit_'+(user||'all')+'_'+today()+'.csv';
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
      alert('저장 공간 부족: 남은 용량 '+(remaining/1024/1024).toFixed(0)+'MB');
      input.value=''; return;
    }
  }
  input.value='';
  for(var i=0;i<files.length;i++){
    var file = files[i];
    if(file.size > MAX_FILE_SIZE){
      alert(file.name+' : '+(file.size/1024/1024).toFixed(1)+'MB\n파일당 최대 100MB까지 가능합니다.');
      continue;
    }
    S.uploading++;
    render();
    var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    var saved = await mediaDB.put(mediaId, file, {mimeType:file.type, name:file.name});
    S.uploading--;
    if(!saved){
      alert(file.name+' 저장 실패');
      render();
      continue;
    }
    var verify = await mediaDB.get(mediaId);
    if(!verify || !verify.blob){
      alert(file.name+' 저장 검증 실패 — 다시 시도해주세요');
      render();
      continue;
    }
    try{S.mediaUrls[mediaId] = URL.createObjectURL(file);}catch(e){}
    S.newSession.media.push({type:'file', view:view||'other', name:file.name, mimeType:file.type, size:file.size, mediaId:mediaId});
    render();
    if(view) break; // view별 1개만
  }
}
async function removeMediaFile(idx){
  var m = S.newSession.media[idx];
  if(m && m.mediaId){
    await mediaDB.del(m.mediaId);
    await mediaDB.delAnalysis(m.mediaId);
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
  var shoulderLineAngle = lineAngle(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  var hipLineAngle = lineAngle(lm[LM.L_HIP], lm[LM.R_HIP]);
  var xFactor = Math.abs(shoulderLineAngle - hipLineAngle);
  if(xFactor>90) xFactor = 180-xFactor;

  var midHip = {x:(lm[LM.L_HIP].x+lm[LM.R_HIP].x)/2, y:(lm[LM.L_HIP].y+lm[LM.R_HIP].y)/2};
  var midSh = {x:(lm[LM.L_SHOULDER].x+lm[LM.R_SHOULDER].x)/2, y:(lm[LM.L_SHOULDER].y+lm[LM.R_SHOULDER].y)/2};
  var spineAngle = Math.atan2(midSh.x-midHip.x, midHip.y-midSh.y)*180/Math.PI;

  // 힙 벤드 (측면 뷰 — 둔부 굴곡): 수직선-미드숄더-미드힙-미드앵클
  var midKnee = {x:(lm[LM.L_KNEE].x+lm[LM.R_KNEE].x)/2, y:(lm[LM.L_KNEE].y+lm[LM.R_KNEE].y)/2};
  var hipBend = angleAt(midSh, midHip, midKnee);

  var lKnee = angleAt(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]);
  var rKnee = angleAt(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]);

  var lArm = angleAt(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]);
  var rArm = angleAt(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]);

  var bodyCenterX = (midHip.x + midSh.x)/2;
  var headOffsetX = (lm[LM.NOSE].x - bodyCenterX);
  var headY = lm[LM.NOSE].y;

  var wristY = Math.min(lm[LM.L_WRIST].y, lm[LM.R_WRIST].y);

  // 무릎 간격 (정면 뷰 — 무릎 무너짐 체크)
  var kneeDistance = Math.abs(lm[LM.L_KNEE].x - lm[LM.R_KNEE].x);
  var ankleDistance = Math.abs(lm[LM.L_ANKLE].x - lm[LM.R_ANKLE].x);
  var kneeRatio = ankleDistance>0 ? kneeDistance/ankleDistance : 1;

  return {
    shoulderTilt:shoulderLineAngle, hipTilt:hipLineAngle, xFactor:xFactor,
    spineAngle:spineAngle, hipBend:hipBend,
    lKnee:lKnee, rKnee:rKnee, lArm:lArm, rArm:rArm,
    headOffsetX:headOffsetX, headY:headY,
    kneeRatio:kneeRatio, wristY:wristY,
    midHip:midHip, midSh:midSh, midKnee:midKnee
  };
}

// 뷰별 표시할 지표 정의
const VIEW_METRICS = {
  front: [
    {key:'xFactor', label:'X-Factor (상하체 분리)', unit:'°', fix:1},
    {key:'shoulderTilt', label:'어깨 틸트', unit:'°', fix:1},
    {key:'hipTilt', label:'골반 틸트', unit:'°', fix:1},
    {key:'headOffsetX', label:'머리 좌우 편차', unit:'', fix:3, scale:1},
    {key:'lArm', label:'좌팔 각도', unit:'°', fix:0},
    {key:'rArm', label:'우팔 각도', unit:'°', fix:0},
    {key:'kneeRatio', label:'무릎 간격/발폭', unit:'', fix:2}
  ],
  side: [
    {key:'spineAngle', label:'척추 각도', unit:'°', fix:1},
    {key:'hipBend', label:'힙 벤드', unit:'°', fix:0},
    {key:'headY', label:'머리 수직 위치', unit:'', fix:3},
    {key:'lKnee', label:'좌무릎 굴곡', unit:'°', fix:0},
    {key:'rKnee', label:'우무릎 굴곡', unit:'°', fix:0}
  ]
};

// 뷰별 체크리스트 정의
function getChecklist(view, frames, currentIdx){
  if(!frames || !frames.length) return [];
  var cur = frames[currentIdx] || frames[0];
  var first = frames[0];
  var checks = [];
  if(view==='front'){
    // X-Factor 피크 — 전체 프레임 중 최대값
    var maxXF = frames.reduce(function(a,f){return Math.max(a,f.metrics.xFactor||0);},0);
    checks.push({ok:maxXF>=30, text:'X-Factor 피크 '+maxXF.toFixed(0)+'° '+(maxXF>=30?'(양호)':'(30° 권장)')});
    // 머리 좌우 이동
    var headXRange = frames.reduce(function(a,f){return {min:Math.min(a.min,f.metrics.headOffsetX),max:Math.max(a.max,f.metrics.headOffsetX)};},{min:1,max:0});
    var headXDelta = Math.abs(headXRange.max-headXRange.min);
    checks.push({ok:headXDelta<0.05, text:'머리 좌우 이동 '+(headXDelta*100).toFixed(1)+'cm '+(headXDelta<0.05?'(양호)':'(과다)')});
    // 리드암 최대
    var maxLArm = frames.reduce(function(a,f){return Math.max(a,f.metrics.lArm||0);},0);
    checks.push({ok:maxLArm>=160, text:'리드암 최대 '+maxLArm.toFixed(0)+'° '+(maxLArm>=160?'(직선 유지)':'(굽힘)')});
    // 무릎 간격 유지
    var kneeMin = frames.reduce(function(a,f){return Math.min(a,f.metrics.kneeRatio||1);},2);
    checks.push({ok:kneeMin>0.7, text:'무릎 간격 최소 '+(kneeMin*100).toFixed(0)+'% '+(kneeMin>0.7?'(양호)':'(무릎 무너짐)')});
    // 어깨 수평 (어드레스 기준)
    checks.push({ok:Math.abs(first.metrics.shoulderTilt)<15, text:'어드레스 어깨 수평 '+first.metrics.shoulderTilt.toFixed(0)+'°'});
  } else if(view==='side'){
    // 척추각 유지 (얼리 익스텐션 체크)
    var spineDelta = frames.reduce(function(a,f){return Math.max(a,Math.abs((f.metrics.spineAngle||0)-first.metrics.spineAngle));},0);
    checks.push({ok:spineDelta<8, text:'척추각 변화 최대 '+spineDelta.toFixed(0)+'° '+(spineDelta<8?'(양호)':'(얼리 익스텐션)')});
    // 힙 벤드 유지
    var hipBendDelta = frames.reduce(function(a,f){return Math.max(a,Math.abs((f.metrics.hipBend||0)-first.metrics.hipBend));},0);
    checks.push({ok:hipBendDelta<15, text:'힙 벤드 변화 '+hipBendDelta.toFixed(0)+'° '+(hipBendDelta<15?'(양호)':'(자세 무너짐)')});
    // 머리 상하 이동
    var headYRange = frames.reduce(function(a,f){return {min:Math.min(a.min,f.metrics.headY),max:Math.max(a.max,f.metrics.headY)};},{min:1,max:0});
    var headYDelta = headYRange.max-headYRange.min;
    checks.push({ok:headYDelta<0.05, text:'머리 상하 이동 '+(headYDelta*100).toFixed(1)+'cm '+(headYDelta<0.05?'(안정)':'(헤드업)')});
    // 무릎 굴곡 유지 (우측 기준)
    var rKneeDelta = frames.reduce(function(a,f){return Math.max(a,Math.abs((f.metrics.rKnee||0)-first.metrics.rKnee));},0);
    checks.push({ok:rKneeDelta<12, text:'우무릎 굴곡 변화 '+rKneeDelta.toFixed(0)+'° '+(rKneeDelta<12?'(안정)':'(무릎 무너짐)')});
    // C-Posture / S-Posture 판별 (어드레스)
    var addrSpine = first.metrics.spineAngle;
    var posture = addrSpine<-5 ? 'C-Posture 경향' : (addrSpine>5 ? 'S-Posture 경향' : '중립 (양호)');
    checks.push({ok:Math.abs(addrSpine)<5, text:'어드레스 자세: '+posture});
  }
  return checks;
}

// 사전 분석 — 전체 프레임을 미리 처리해서 캐싱
async function preAnalyzeVideo(video, pose, progressCb){
  var duration = video.duration;
  if(!duration || !isFinite(duration)) return null;
  var sampleRate = 15; // 15 fps
  var step = 1/sampleRate;
  var frames = [];

  // Promise 기반 onResults
  var resolveResults = null;
  pose.onResults(function(r){ if(resolveResults){ var f=resolveResults; resolveResults=null; f(r); } });

  video.pause();
  var t = 0;
  while(t < duration){
    // Seek
    await new Promise(function(resolve){
      var handler = function(){video.removeEventListener('seeked', handler); resolve();};
      video.addEventListener('seeked', handler);
      try{video.currentTime = t;}catch(e){resolve();}
    });
    // 프레임 렌더 대기
    await new Promise(function(r){setTimeout(r, 30);});
    // 자세 추출
    var results = await new Promise(function(resolve){
      resolveResults = resolve;
      try{pose.send({image: video});}catch(e){resolve({});}
      // timeout
      setTimeout(function(){if(resolveResults){resolveResults({});resolveResults=null;}}, 2000);
    });
    if(results && results.poseLandmarks){
      var metrics = analyzeSwing(results.poseLandmarks);
      if(metrics){
        // 렌더 최소화: 주요 랜드마크만 저장 (33개 → 필요한 것만)
        var lmSlim = results.poseLandmarks.map(function(p){
          return {x:Number(p.x.toFixed(4)), y:Number(p.y.toFixed(4)), v:Number((p.visibility||1).toFixed(2))};
        });
        // midHip/midSh/midKnee는 저장 안함 (공간 절약 — 재계산 가능)
        var slimMetrics = {
          shoulderTilt:Number(metrics.shoulderTilt.toFixed(2)),
          hipTilt:Number(metrics.hipTilt.toFixed(2)),
          xFactor:Number(metrics.xFactor.toFixed(2)),
          spineAngle:Number(metrics.spineAngle.toFixed(2)),
          hipBend:Number(metrics.hipBend.toFixed(2)),
          lKnee:Number(metrics.lKnee.toFixed(2)),
          rKnee:Number(metrics.rKnee.toFixed(2)),
          lArm:Number(metrics.lArm.toFixed(2)),
          rArm:Number(metrics.rArm.toFixed(2)),
          headOffsetX:Number(metrics.headOffsetX.toFixed(4)),
          headY:Number(metrics.headY.toFixed(4)),
          kneeRatio:Number(metrics.kneeRatio.toFixed(3)),
          wristY:Number(metrics.wristY.toFixed(4))
        };
        frames.push({t:Number(t.toFixed(3)), landmarks:lmSlim, metrics:slimMetrics});
      }
    }
    if(progressCb) progressCb(t/duration);
    t += step;
  }
  return {frames:frames, duration:duration, sampleRate:sampleRate, version:'v2-complexity1'};
}

// 분석 캐시의 버전 체크 — 구버전이면 무효
function isAnalysisValid(analysis){
  return analysis && analysis.version==='v2-complexity1' && analysis.frames && analysis.frames.length>0;
}

function findNearestFrame(frames, t){
  if(!frames || !frames.length) return null;
  var lo=0, hi=frames.length-1;
  while(lo<hi){
    var mid=(lo+hi)>>1;
    if(frames[mid].t < t) lo=mid+1; else hi=mid;
  }
  if(lo>0 && Math.abs(frames[lo-1].t-t) < Math.abs(frames[lo].t-t)) lo--;
  return frames[lo];
}

// ============ Inline Swing Player ============
// 세션 카드에 인라인으로 박히는 커스텀 비디오 플레이어
// - 기본 비디오 컨트롤 대신 커스텀 컨트롤
// - 캔버스 스켈레톤 오버레이 영구 부착
// - Pseudo-fullscreen (CSS 클래스 토글) — iOS Safari 호환
// - 자동 사전 분석 + 캐시

// 공유 Pose 인스턴스 (한 번만 로드)
var _sharedPose = null;
function getSharedPose(){
  if(_sharedPose) return _sharedPose;
  if(typeof Pose==='undefined') return null;
  _sharedPose = new Pose({locateFile:function(file){return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/'+file;}});
  _sharedPose.setOptions({modelComplexity:1, smoothLandmarks:true, enableSegmentation:false, minDetectionConfidence:.6, minTrackingConfidence:.6});
  return _sharedPose;
}

// 동시 분석 방지 큐
var _analysisQueue = [];
var _analyzing = false;
function queueAnalysis(video, mediaId, onProgress){
  return new Promise(function(resolve){
    _analysisQueue.push({video:video, mediaId:mediaId, onProgress:onProgress, resolve:resolve});
    processAnalysisQueue();
  });
}
async function processAnalysisQueue(){
  if(_analyzing || !_analysisQueue.length) return;
  _analyzing = true;
  var task = _analysisQueue.shift();
  var pose = getSharedPose();
  if(!pose){task.resolve(null); _analyzing=false; return;}
  try{
    var analysis = await preAnalyzeVideo(task.video, pose, task.onProgress);
    if(analysis && analysis.frames.length>0){
      await mediaDB.putAnalysis(task.mediaId, analysis);
    }
    task.resolve(analysis);
  }catch(e){
    console.error('[analysis] failed',e);
    task.resolve(null);
  }
  _analyzing = false;
  setTimeout(processAnalysisQueue, 100);
}

function renderSwingPlayer(sessionId, mediaIdx, m, src){
  var viewTag = '';
  if(m.view==='front') viewTag = '<div class="sp-view-tag tag-front">🎯 정면</div>';
  else if(m.view==='side') viewTag = '<div class="sp-view-tag tag-side">📐 측면</div>';
  if(!src){
    return '<div class="swing-player-missing">'+viewTag.replace('sp-view-tag','spm-tag')+
      '<div class="spm-icon">📹</div>'+
      '<div class="spm-text">이 기기에서 영상을 찾을 수 없습니다</div>'+
      '<div class="spm-sub">영상은 업로드한 기기의 브라우저에만 저장됩니다</div>'+
    '</div>';
  }
  return '<div class="swing-player" data-sid="'+sessionId+'" data-mi="'+mediaIdx+'" data-mediaid="'+(m.mediaId||'')+'">'+
    '<div class="sp-screen">'+
      '<video class="sp-video" src="'+src+'" playsinline webkit-playsinline preload="metadata"></video>'+
      '<canvas class="sp-canvas"></canvas>'+
      viewTag+
      '<div class="sp-loading"><div class="sp-loading-inner"><div class="sp-spinner"></div><div class="sp-loading-text">분석 준비...</div><div class="sp-progress-track"><div class="sp-progress-fill"></div></div></div></div>'+
    '</div>'+
    '<div class="sp-toolbar">'+
      '<div class="sp-scrub-row">'+
        '<input type="range" class="sp-scrub" min="0" max="1000" value="0" step="1">'+
        '<span class="sp-time">0:00 / 0:00</span>'+
      '</div>'+
      '<div class="sp-btn-row">'+
        '<button class="sp-btn sp-play" type="button">▶</button>'+
        '<div class="sp-btn-spacer"></div>'+
        '<button class="sp-btn sp-tgl-skel active" type="button" title="스켈레톤">🦴</button>'+
        '<button class="sp-btn sp-tgl-guide active" type="button" title="가이드라인">📐</button>'+
        '<button class="sp-btn sp-tgl-metrics" type="button" title="지표/체크리스트">📊</button>'+
        '<button class="sp-btn sp-reanalyze" type="button" title="재분석">♻</button>'+
        '<button class="sp-btn sp-fs" type="button" title="전체화면">⛶</button>'+
      '</div>'+
    '</div>'+
    '<div class="sp-metrics-box" style="display:none">'+
      '<div class="sp-metrics-live"></div>'+
      '<div class="sp-metrics-checklist"></div>'+
    '</div>'+
  '</div>';
}

function initSwingPlayers(){
  document.querySelectorAll('.swing-player:not([data-init])').forEach(function(el){
    el.setAttribute('data-init','1');
    setupSwingPlayer(el);
  });
}

function setupSwingPlayer(el){
  var mediaId = el.getAttribute('data-mediaid');
  var sessionId = el.getAttribute('data-sid');
  var mediaIdx = parseInt(el.getAttribute('data-mi'));
  var video = el.querySelector('.sp-video');
  var canvas = el.querySelector('.sp-canvas');
  var ctx = canvas.getContext('2d', {desynchronized:true});
  var playBtn = el.querySelector('.sp-play');
  var scrub = el.querySelector('.sp-scrub');
  var timeEl = el.querySelector('.sp-time');
  var loadingEl = el.querySelector('.sp-loading');
  var loadingText = el.querySelector('.sp-loading-text');
  var progressFill = el.querySelector('.sp-progress-fill');
  var metricsBox = el.querySelector('.sp-metrics-box');
  var metricsLive = el.querySelector('.sp-metrics-live');
  var metricsCheck = el.querySelector('.sp-metrics-checklist');

  if(!S.playerStates) S.playerStates = {};
  if(!S.playerStates[mediaId]){
    S.playerStates[mediaId] = {
      analysis:null, analyzing:false,
      showSkel:true, showGuide:true, showMetrics:false
    };
  }
  var state = S.playerStates[mediaId];

  // 세션/미디어 찾기
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(x){return x.id===sessionId;});
  var m = sess && sess.media ? sess.media[mediaIdx] : null;
  if(!m) return;

  function fmtTime(s){
    if(!isFinite(s)||s<0)return '0:00';
    var mm=Math.floor(s/60), ss=Math.floor(s%60);
    return mm+':'+(ss<10?'0':'')+ss;
  }

  function draw(){
    if(!state.analysis || !state.analysis.frames.length){
      // 분석 전 — 캔버스만 클리어
      if(canvas.width!==video.videoWidth) canvas.width = video.videoWidth||640;
      if(canvas.height!==video.videoHeight) canvas.height = video.videoHeight||480;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      return;
    }
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    var frame = findNearestFrame(state.analysis.frames, video.currentTime);
    if(!frame) return;
    if(state.showSkel && typeof drawConnectors!=='undefined'){
      drawConnectors(ctx, frame.landmarks, POSE_CONNECTIONS, {color:'#00ff7f', lineWidth:3});
      drawLandmarks(ctx, frame.landmarks, {color:'#ff4081', lineWidth:1, radius:3});
    }
    if(state.showGuide && frame.landmarks){
      var lm = frame.landmarks;
      var midHip = {x:(lm[LM.L_HIP].x+lm[LM.R_HIP].x)/2, y:(lm[LM.L_HIP].y+lm[LM.R_HIP].y)/2};
      var midSh = {x:(lm[LM.L_SHOULDER].x+lm[LM.R_SHOULDER].x)/2, y:(lm[LM.L_SHOULDER].y+lm[LM.R_SHOULDER].y)/2};
      // 척추선
      ctx.strokeStyle='rgba(255,64,129,.85)'; ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(midHip.x*canvas.width, midHip.y*canvas.height);
      ctx.lineTo(midSh.x*canvas.width, midSh.y*canvas.height);
      ctx.stroke();
      // 어깨선
      ctx.strokeStyle='rgba(64,200,255,.85)'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(lm[LM.L_SHOULDER].x*canvas.width, lm[LM.L_SHOULDER].y*canvas.height);
      ctx.lineTo(lm[LM.R_SHOULDER].x*canvas.width, lm[LM.R_SHOULDER].y*canvas.height);
      ctx.stroke();
      // 골반선
      ctx.strokeStyle='rgba(255,200,64,.85)'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(lm[LM.L_HIP].x*canvas.width, lm[LM.L_HIP].y*canvas.height);
      ctx.lineTo(lm[LM.R_HIP].x*canvas.width, lm[LM.R_HIP].y*canvas.height);
      ctx.stroke();
      // 수직 기준선
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.setLineDash([5,5]); ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(midHip.x*canvas.width, 0);
      ctx.lineTo(midHip.x*canvas.width, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if(state.showMetrics){
      // 지표 패널 업데이트
      var defs = VIEW_METRICS[m.view||'front'] || VIEW_METRICS.front;
      metricsLive.innerHTML = defs.map(function(d){
        var v = frame.metrics ? frame.metrics[d.key] : null;
        var display = (v===null||v===undefined) ? '—' : Number(v).toFixed(d.fix)+(d.unit||'');
        return '<div class="sp-metric"><span class="spm-lbl">'+d.label+'</span><span class="spm-val">'+display+'</span></div>';
      }).join('');
    }
  }

  // 컨트롤 이벤트
  playBtn.addEventListener('click', function(){
    if(video.paused) video.play(); else video.pause();
  });
  video.addEventListener('play', function(){playBtn.textContent='⏸';});
  video.addEventListener('pause', function(){playBtn.textContent='▶';});
  video.addEventListener('loadedmetadata', function(){
    timeEl.textContent = '0:00 / '+fmtTime(video.duration);
    // 컨테이너 종횡비를 실제 영상에 맞춤 (letterbox 제거)
    var screen = el.querySelector('.sp-screen');
    if(video.videoWidth && video.videoHeight){
      screen.style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
    }
    draw();
    tryLoadOrAnalyze();
  });
  video.addEventListener('timeupdate', function(){
    var pct = video.duration>0 ? (video.currentTime/video.duration)*1000 : 0;
    scrub.value = pct;
    timeEl.textContent = fmtTime(video.currentTime)+' / '+fmtTime(video.duration);
    draw();
  });
  video.addEventListener('seeked', draw);
  scrub.addEventListener('input', function(){
    if(video.duration>0) video.currentTime = (scrub.value/1000)*video.duration;
  });

  // 토글 버튼
  el.querySelector('.sp-tgl-skel').addEventListener('click', function(){
    state.showSkel = !state.showSkel;
    this.classList.toggle('active', state.showSkel);
    draw();
  });
  el.querySelector('.sp-tgl-guide').addEventListener('click', function(){
    state.showGuide = !state.showGuide;
    this.classList.toggle('active', state.showGuide);
    draw();
  });
  el.querySelector('.sp-tgl-metrics').addEventListener('click', function(){
    state.showMetrics = !state.showMetrics;
    this.classList.toggle('active', state.showMetrics);
    metricsBox.style.display = state.showMetrics ? 'block' : 'none';
    draw();
    if(state.showMetrics && state.analysis) renderCheckList();
  });
  el.querySelector('.sp-fs').addEventListener('click', function(){
    el.classList.toggle('sp-fs-active');
    document.body.classList.toggle('sp-fs-lock', el.classList.contains('sp-fs-active'));
    setTimeout(draw, 100);
  });
  el.querySelector('.sp-reanalyze').addEventListener('click', async function(){
    if(state.analyzing) return;
    if(!confirm('기존 분석을 삭제하고 다시 분석하시겠습니까?\n(정확도가 더 높은 모델로 재분석됩니다)')) return;
    if(mediaId) await mediaDB.delAnalysis(mediaId);
    state.analysis = null;
    canvas.width=canvas.width; // clear
    tryLoadOrAnalyze();
  });

  function renderCheckList(){
    if(!state.analysis || !state.analysis.frames) return;
    var checks = getChecklist(m.view||'front', state.analysis.frames, 0);
    metricsCheck.innerHTML = checks.map(function(c){
      return '<div class="sp-check '+(c.ok?'ok':'warn')+'">'+(c.ok?'✓':'⚠')+' '+c.text+'</div>';
    }).join('') || '<div class="sp-check-empty">데이터 부족</div>';
  }

  async function tryLoadOrAnalyze(){
    if(!mediaId) return;
    // 1. 캐시 확인
    if(!state.analysis){
      var cached = await mediaDB.getAnalysis(mediaId);
      if(isAnalysisValid(cached)){
        state.analysis = cached;
        loadingEl.style.display = 'none';
        draw();
        if(state.showMetrics) renderCheckList();
        return;
      }
    } else {
      loadingEl.style.display = 'none';
      draw();
      return;
    }
    // 2. 자동 사전 분석
    if(state.analyzing) return;
    state.analyzing = true;
    loadingEl.style.display = 'flex';
    loadingText.textContent = '분석 대기 중...';
    progressFill.style.width = '0%';
    var analysis = await queueAnalysis(video, mediaId, function(p){
      var pct = Math.floor(p*100);
      loadingText.textContent = '분석 중 '+pct+'%';
      progressFill.style.width = pct+'%';
    });
    state.analyzing = false;
    if(analysis && analysis.frames.length>0){
      state.analysis = analysis;
      loadingText.textContent = '✓ 완료';
      progressFill.style.width = '100%';
      setTimeout(function(){loadingEl.style.display='none';},800);
      draw();
      if(state.showMetrics) renderCheckList();
    } else {
      loadingText.textContent = '분석 실패 (사람 감지 불가)';
    }
  }

  // 캔버스 크기 맞추기
  if(video.readyState >= 1){
    timeEl.textContent = '0:00 / '+fmtTime(video.duration);
    tryLoadOrAnalyze();
  }
}

// (deprecated) 레거시 모달 분석기 — 현재는 인라인 플레이어가 사용됨, reAnalyze에서만 호출
async function openPoseAnalyzer(sessionId, mediaIdx){
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
  var view = m.view || 'front';
  var viewLabel = view==='front' ? '정면' : (view==='side' ? '측면' : '기타');

  var overlay=document.createElement('div');
  overlay.className='pose-overlay';
  overlay.innerHTML =
    '<div class="pose-box">'+
      '<div class="pose-title">🦴 골프 스윙 분석 · '+viewLabel+' 뷰 <button class="pose-close" onclick="closePoseAnalyzer(this)">✕</button></div>'+
      '<div class="pose-body">'+
        '<div class="pose-canvas-wrap">'+
          '<video class="pose-video" src="'+src+'" controls playsinline crossorigin="anonymous"></video>'+
          '<canvas class="pose-canvas"></canvas>'+
          '<div class="pose-progress" style="display:none"><div class="pose-progress-track"><div class="pose-progress-fill"></div></div><div class="pose-progress-text">분석 중 0%</div></div>'+
        '</div>'+
        '<div class="pose-metrics-panel">'+
          '<div class="metric-section-title">📊 '+viewLabel+' 뷰 지표</div>'+
          '<div id="metrics-live"></div>'+
          '<div class="metric-section-title">✅ 체크리스트</div>'+
          '<div class="checklist" id="checklist"><div class="check-empty">분석 대기 중...</div></div>'+
          '<div class="metric-section-title">🎛 설정</div>'+
          '<label class="toggle-row"><input type="checkbox" id="toggle-guide" checked> 가이드라인 표시</label>'+
          '<label class="toggle-row"><input type="checkbox" id="toggle-skeleton" checked> 스켈레톤 표시</label>'+
          (m.mediaId ? '<button class="btn" style="font-size:10px;padding:4px 8px;margin-top:6px" onclick="reAnalyzeVideo(\''+sessionId+'\','+mediaIdx+')">🔄 재분석</button>' : '')+
        '</div>'+
      '</div>'+
      '<div class="pose-status">초기화 중...</div>'+
    '</div>';
  document.body.appendChild(overlay);

  var video=overlay.querySelector('.pose-video');
  var canvas=overlay.querySelector('.pose-canvas');
  var status=overlay.querySelector('.pose-status');
  var progressBox=overlay.querySelector('.pose-progress');
  var progressBar=overlay.querySelector('.pose-progress-fill');
  var progressText=overlay.querySelector('.pose-progress-text');
  var ctx=canvas.getContext('2d',{desynchronized:true});
  var toggleGuide=overlay.querySelector('#toggle-guide');
  var toggleSkel=overlay.querySelector('#toggle-skeleton');

  var pose=new Pose({locateFile:function(file){return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/'+file;}});
  pose.setOptions({modelComplexity:1, smoothLandmarks:true, enableSegmentation:false, minDetectionConfidence:.6, minTrackingConfidence:.6});

  var analysis = null;

  function renderMetricsPanel(metrics){
    var defs = VIEW_METRICS[view] || VIEW_METRICS.front;
    var html = defs.map(function(d){
      var v = metrics ? metrics[d.key] : null;
      var display = '—';
      if(v!==null && v!==undefined){
        var num = Number(v);
        display = num.toFixed(d.fix) + (d.unit||'');
      }
      return '<div class="metric"><span class="m-lbl">'+d.label+'</span><span class="m-val">'+display+'</span></div>';
    }).join('');
    var el = overlay.querySelector('#metrics-live');
    if(el) el.innerHTML = html;
  }

  function renderChecklist(){
    if(!analysis || !analysis.frames) return;
    var checks = getChecklist(view, analysis.frames, 0);
    var clEl = overlay.querySelector('#checklist');
    if(clEl){
      clEl.innerHTML = checks.map(function(c){
        return '<div class="check-item '+(c.ok?'ok':'warn')+'">'+(c.ok?'✓':'⚠')+' '+c.text+'</div>';
      }).join('') || '<div class="check-empty">데이터 부족</div>';
    }
  }

  function drawFrame(frame){
    canvas.width = video.videoWidth||640;
    canvas.height = video.videoHeight||480;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!frame || !frame.landmarks) return;
    if(toggleSkel.checked && typeof drawConnectors!=='undefined'){
      drawConnectors(ctx, frame.landmarks, POSE_CONNECTIONS, {color:'#00ff7f', lineWidth:3});
      drawLandmarks(ctx, frame.landmarks, {color:'#ff4081', lineWidth:1, radius:3});
    }
    if(toggleGuide.checked && frame.metrics){
      var lm = frame.landmarks;
      var midHip = {x:(lm[LM.L_HIP].x+lm[LM.R_HIP].x)/2, y:(lm[LM.L_HIP].y+lm[LM.R_HIP].y)/2};
      var midSh = {x:(lm[LM.L_SHOULDER].x+lm[LM.R_SHOULDER].x)/2, y:(lm[LM.L_SHOULDER].y+lm[LM.R_SHOULDER].y)/2};
      // 척추선
      ctx.strokeStyle='rgba(255,64,129,.85)'; ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(midHip.x*canvas.width, midHip.y*canvas.height);
      ctx.lineTo(midSh.x*canvas.width, midSh.y*canvas.height);
      ctx.stroke();
      // 어깨선
      ctx.strokeStyle='rgba(64,200,255,.85)'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(lm[LM.L_SHOULDER].x*canvas.width, lm[LM.L_SHOULDER].y*canvas.height);
      ctx.lineTo(lm[LM.R_SHOULDER].x*canvas.width, lm[LM.R_SHOULDER].y*canvas.height);
      ctx.stroke();
      // 골반선
      ctx.strokeStyle='rgba(255,200,64,.85)'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(lm[LM.L_HIP].x*canvas.width, lm[LM.L_HIP].y*canvas.height);
      ctx.lineTo(lm[LM.R_HIP].x*canvas.width, lm[LM.R_HIP].y*canvas.height);
      ctx.stroke();
      // 수직 기준선
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.setLineDash([5,5]); ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(midHip.x*canvas.width, 0);
      ctx.lineTo(midHip.x*canvas.width, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function syncToVideoTime(){
    if(!analysis || !analysis.frames) return;
    var f = findNearestFrame(analysis.frames, video.currentTime);
    if(f){
      drawFrame(f);
      renderMetricsPanel(f.metrics);
    }
  }

  video.addEventListener('loadedmetadata', async function(){
    status.textContent = '분석 데이터 확인 중...';
    // 1. 캐시 확인
    if(m.mediaId){
      analysis = await mediaDB.getAnalysis(m.mediaId);
    }
    if(analysis && analysis.frames && analysis.frames.length>0){
      status.textContent = '✓ 캐시된 분석 ('+analysis.frames.length+' 프레임 · '+analysis.sampleRate+'fps)';
      renderChecklist();
      syncToVideoTime();
      return;
    }
    // 2. 사전 분석 실행
    progressBox.style.display = 'flex';
    status.textContent = '스윙 사전 분석 중...';
    try{
      analysis = await preAnalyzeVideo(video, pose, function(p){
        var pct = Math.floor(p*100);
        progressBar.style.width = pct+'%';
        progressText.textContent = '분석 중 '+pct+'%';
      });
    }catch(e){
      console.error(e);
      status.textContent = '분석 실패: '+e.message;
      return;
    }
    progressBox.style.display = 'none';
    if(!analysis || !analysis.frames.length){
      status.textContent = '분석 데이터 없음 (영상에서 사람을 감지하지 못함)';
      return;
    }
    // 캐시 저장
    if(m.mediaId){
      await mediaDB.putAnalysis(m.mediaId, analysis);
    }
    status.textContent = '✓ 분석 완료 — '+analysis.frames.length+' 프레임';
    video.currentTime = 0;
    renderChecklist();
    syncToVideoTime();
  });

  // 재생/스크러빙 모두에서 동기화
  video.addEventListener('timeupdate', syncToVideoTime);
  video.addEventListener('seeked', syncToVideoTime);
  toggleGuide.addEventListener('change', syncToVideoTime);
  toggleSkel.addEventListener('change', syncToVideoTime);

  overlay._pose = pose;
  overlay.addEventListener('click',function(e){if(e.target===overlay){closePoseAnalyzer(overlay);}});
}

async function reAnalyzeVideo(sessionId, mediaIdx){
  var mid=S.selectedMember;
  var sess=(S.sessions[mid]||[]).find(function(x){return x.id===sessionId;});
  if(!sess||!sess.media||!sess.media[mediaIdx])return;
  var m=sess.media[mediaIdx];
  if(!m.mediaId)return;
  if(!confirm('기존 분석 데이터를 삭제하고 다시 분석하시겠습니까?')) return;
  await mediaDB.delAnalysis(m.mediaId);
  // 현재 모달 닫고 재오픈
  document.querySelectorAll('.pose-overlay').forEach(function(el){closePoseAnalyzer(el);});
  setTimeout(function(){openPoseAnalyzer(sessionId, mediaIdx);}, 100);
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
    await mediaDB.delAnalysis(m.mediaId);
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
