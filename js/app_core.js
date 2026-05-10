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
  version:'v2.7',
  date:'2026-04-12',
  changes:[
    '인수인계 시스템 — 담당 지도자 변경 시 AI 자동 요약 카드 생성 (최근 10세션, 체형평가, Body-Swing 경고, 스윙 영상)',
    '회원 리포트 — HTML 인쇄/PDF 출력 (회원정보, 체형평가, 세션기록 최근 20건)',
    '운동 DB 1000개 — 웨이트 350 + 골프 피트니스(TPI) 345 + 골프 스킬 305, 별도 파일 분리',
    '운동 DB 100여 개 내장 — 웨이트/골프 피트니스(TPI)/골프 스킬 카테고리, 초성 검색 지원',
    '세션 기록 빠른추가 — 운동 빠른추가 버튼으로 모달에서 다중 선택 + 세트/횟수 입력',
    'Trackman 스타일 A-F 변화량 카드',
    '기준선 두께 가독성 대폭 개선',
    '힙 헤드 수직선 고정화',
    '영상 자동 분석 시작',
    'iOS Safari 디코더 Kick',
    '뷰별 전용 기준선',
    'Address Finish 유령 기준선',
    '지표 변화량 표시',
    'R2 영상 CORS 문제 수정',
    '분석 속도 10배 개선',
    '어두운 실내 영상 감지력 향상',
    '업로드 전 자동 영상 압축',
    '플레이어 툴바 전면 재설계',
    '모바일 터치 영역 확대',
    'Cloudflare R2 영상 스토리지 연동',
    '영상 로컬 캐시 전략',
    '초기 동기화 머지 방식으로 변경',
    'Supabase 클라우드 동기화 활성화',
    '사이드바 하단 동기화 상태 배지',
    '스켈레톤 정확도 개선 — MediaPipe Full 모델로 업그레이드',
    '재분석 버튼 추가',
    '구버전 분석 캐시 자동 무효화',
    '플레이어 레이아웃 개선',
    '영상 종횡비 자동 반영',
    '기기간 영상 누락 안내',
    '인라인 커스텀 비디오 플레이어',
    'Pseudo 전체화면',
    '스켈레톤/가이드/지표 인라인 토글',
    '자동 백그라운드 사전 분석',
    '트랙맨 방식 프레임 캐싱',
    '정면/측면 영상 업로드 분리',
    '뷰별 체크리스트',
    '분석 결과 영구 캐시',
    '다중 가이드라인 오버레이',
    '회원 CRM 확장',
    '유효기간 D-day 배지',
    '마이페이지 섹션',
    '영상 업로드 race condition 해결',
    'iOS Safari 저장소 영속화 요청',
    '골프 스윙 종합 분석',
    '스윙 페이즈 자동 감지',
    '체크리스트 자동 피드백',
    '가이드라인 오버레이',
    '스켈레톤 분석 속도 2-3배 개선',
    'IndexedDB 대용량 미디어 저장',
    'MediaPipe 스켈레톤 분석',
    '체형평가 히스토리',
    '활동 로그 & 알림',
    '비밀번호 잠금',
    '인포데스크 읽기 전용',
    '회원 배정 시스템',
    '회원 삭제 시 운동지도자 승인 필요',
    '골프레슨 골프PT 등록횟수/금액 분리 관리',
    'Body-Swing Connection 매핑 14개 항목 자동 경고',
    '세션 기록에 스윙 영상/사진 첨부 + URL 링크',
    'iPhone 노치/다이나믹 아일랜드 safe-area 대응',
    '전환 버튼을 사이드바 상단 아이콘으로 이동',
    '체형 점수(Golf Fit) 카드 제거 보완요청 기능 제거'
  ]
};

// ============ 운동 DB ============
function getChosung(str){
  if(!str) return '';
  const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  let result = '';
  for(let i=0;i<str.length;i++){
    const code = str.charCodeAt(i);
    if(code >= 0xAC00 && code <= 0xD7A3){
      result += CHO[Math.floor((code - 0xAC00) / 588)];
    } else {
      result += str[i];
    }
  }
  return result;
}

function matchExercise(ex, query){
  if(!query) return true;
  const q = query.trim().toLowerCase();
  if(!q) return true;
  if(ex.n.toLowerCase().indexOf(q)!==-1) return true;
  if((ex.e||'').toLowerCase().indexOf(q)!==-1) return true;
  if((ex.f||'').toLowerCase().indexOf(q)!==-1) return true;
  if((ex.s||'').toLowerCase().indexOf(q)!==-1) return true;
  const qCho = getChosung(q);
  const nCho = getChosung(ex.n);
  if(nCho.indexOf(qCho)!==-1) return true;
  if(getChosung(ex.f||'').indexOf(qCho)!==-1) return true;
  if(getChosung(ex.s||'').indexOf(qCho)!==-1) return true;
  var qNoSpace = q.replace(/\s/g,'');
  if(ex.n.replace(/\s/g,'').toLowerCase().indexOf(qNoSpace)!==-1) return true;
  if((ex.e||'').replace(/\s/g,'').toLowerCase().indexOf(qNoSpace)!==-1) return true;
  return false;
}

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
const mediaDB = {
  db:null, DB_NAME:'golf_pt_media', STORE:'media', ANALYSIS_STORE:'analysis',
  init:function(){
    return new Promise(function(resolve){
      if(!window.indexedDB){resolve(false);return;}
      var req = indexedDB.open(mediaDB.DB_NAME, 2);
      req.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains(mediaDB.STORE)) db.createObjectStore(mediaDB.STORE, {keyPath:'id'});
        if(!db.objectStoreNames.contains(mediaDB.ANALYSIS_STORE)) db.createObjectStore(mediaDB.ANALYSIS_STORE, {keyPath:'id'});
      };
      req.onsuccess = function(e){mediaDB.db = e.target.result; resolve(true);};
      req.onerror = function(){console.warn('[mediaDB] init failed'); resolve(false);};
    });
  },
  put:function(id, blob, meta){return new Promise(function(resolve){if(!mediaDB.db){resolve(false);return;}try{var tx=mediaDB.db.transaction(mediaDB.STORE,'readwrite');tx.objectStore(mediaDB.STORE).put({id:id,blob:blob,mimeType:meta.mimeType||'',name:meta.name||'',size:blob.size,createdAt:Date.now()}).onsuccess=function(){resolve(true);};tx.onerror=function(e){console.warn('[mediaDB] put failed',e);resolve(false);};}catch(e){console.warn(e);resolve(false);}});},
  get:function(id){return new Promise(function(resolve){if(!mediaDB.db){resolve(null);return;}try{var tx=mediaDB.db.transaction(mediaDB.STORE,'readonly');tx.objectStore(mediaDB.STORE).get(id).onsuccess=function(e){resolve(e.target.result||null);};tx.onerror=function(){resolve(null);};}catch(e){resolve(null);}});},
  getAll:function(){return new Promise(function(resolve){if(!mediaDB.db){resolve([]);return;}try{var tx=mediaDB.db.transaction(mediaDB.STORE,'readonly');tx.objectStore(mediaDB.STORE).getAll().onsuccess=function(e){resolve(e.target.result||[]);};tx.onerror=function(){resolve([]);};}catch(e){resolve([]);}});},
  del:function(id){return new Promise(function(resolve){if(!mediaDB.db){resolve(false);return;}try{var tx=mediaDB.db.transaction(mediaDB.STORE,'readwrite');tx.objectStore(mediaDB.STORE).delete(id).onsuccess=function(){resolve(true);};tx.onerror=function(){resolve(false);};}catch(e){resolve(false);}});},
  putAnalysis:function(id, data){return new Promise(function(resolve){if(!mediaDB.db){resolve(false);return;}try{var tx=mediaDB.db.transaction(mediaDB.ANALYSIS_STORE,'readwrite');tx.objectStore(mediaDB.ANALYSIS_STORE).put({id:id,data:data,savedAt:Date.now()}).onsuccess=function(){resolve(true);};tx.onerror=function(){resolve(false);};}catch(e){resolve(false);}});},
  getAnalysis:function(id){return new Promise(function(resolve){if(!mediaDB.db){resolve(null);return;}try{var tx=mediaDB.db.transaction(mediaDB.ANALYSIS_STORE,'readonly');tx.objectStore(mediaDB.ANALYSIS_STORE).get(id).onsuccess=function(e){resolve(e.target.result?e.target.result.data:null);};tx.onerror=function(){resolve(null);};}catch(e){resolve(null);}});},
  delAnalysis:function(id){return new Promise(function(resolve){if(!mediaDB.db){resolve(false);return;}try{var tx=mediaDB.db.transaction(mediaDB.ANALYSIS_STORE,'readwrite');tx.objectStore(mediaDB.ANALYSIS_STORE).delete(id).onsuccess=function(){resolve(true);};tx.onerror=function(){resolve(false);};}catch(e){resolve(false);}});}
};

async function getStorageEstimate(){
  if(!navigator.storage||!navigator.storage.estimate) return null;
  try{var est = await navigator.storage.estimate();return {usage:est.usage||0, quota:est.quota||0};}catch(e){return null;}
}

// ============ Supabase 연동 모듈 ============
const cloud = {
  client:null, enabled:false,
  init(){try{const cfg=window.APP_CONFIG||{};if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return false;if(typeof window.supabase==='undefined'||!window.supabase.createClient){console.warn('[cloud] supabase-js SDK missing');return false;}this.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);this.enabled=true;return true;}catch(e){console.warn('[cloud] init fail:',e);return false;}},
  async loadAll(){if(!this.enabled) return null;try{const [mRes,aRes,sRes]=await Promise.all([this.client.from('members').select('*').order('created_at',{ascending:true}),this.client.from('assessments').select('*'),this.client.from('sessions').select('*').order('date',{ascending:true})]);if(mRes.error) throw mRes.error;if(aRes.error) throw aRes.error;if(sRes.error) throw sRes.error;const members=(mRes.data||[]).map(r=>{var extra=r.data||{};return Object.assign({id:r.id,name:r.name,color:r.color||'av-green'},extra);});const assessments={};(aRes.data||[]).forEach(r=>{if(!assessments[r.member_id]) assessments[r.member_id]={};assessments[r.member_id][r.item_key]={result:r.result||'미검사',note:r.note||''};});const sessions={};(sRes.data||[]).forEach(r=>{if(!sessions[r.member_id]) sessions[r.member_id]=[];sessions[r.member_id].push({id:r.id,date:r.date,author:r.author,content:r.content||'',supplement:r.supplement||'',media:Array.isArray(r.media)?r.media:(r.media?r.media:[])});});return {members,assessments,sessions};}catch(e){console.warn('[cloud] loadAll fail:',e);return null;}},
  async upsertMember(m){if(!this.enabled) return;try{var extra={phone:m.phone||'',email:m.email||'',registeredDate:m.registeredDate||'',golfLessonCount:m.golfLessonCount||'',golfPTCount:m.golfPTCount||'',golfLessonAmount:m.golfLessonAmount||'',golfPTAmount:m.golfPTAmount||'',expiry:m.expiry||'',golfLessonExpiry:m.golfLessonExpiry||'',golfPTExpiry:m.golfPTExpiry||'',assignedTo:m.assignedTo||[],memberType:m.memberType||'pt_lesson',handicap:m.handicap||'',avgScore:m.avgScore||'',goal:m.goal||'',focusPoints:m.focusPoints||''};var payload={id:m.id,name:m.name,color:m.color,data:extra};var {error}=await this.client.from('members').upsert(payload);if(error){if(String(error.message||'').toLowerCase().indexOf('data')!==-1){console.warn('[cloud] members.data column missing');var fallback=await this.client.from('members').upsert({id:m.id,name:m.name,color:m.color});if(fallback.error) throw fallback.error;return;}throw error;}}catch(e){console.warn('[cloud] upsertMember fail:',e);}},
  async upsertAssessment(memberId,itemKey,result,note){if(!this.enabled) return;try{const {error}=await this.client.from('assessments').upsert({member_id:memberId,item_key:itemKey,result:result||'미검사',note:note||'',updated_at:new Date().toISOString()});if(error) throw error;}catch(e){console.warn('[cloud] upsertAssessment fail:',e);}},
  async upsertSession(memberId,s){if(!this.enabled) return;try{const mediaMeta=(s.media||[]).map(function(m){return {type:m.type,view:m.view||'other',name:m.name||'',mimeType:m.mimeType||'',size:m.size||0,mediaId:m.mediaId||null,r2Key:m.r2Key||m.mediaId||null,data:(m.type==='url'?(m.data||''):undefined)};});const {error}=await this.client.from('sessions').upsert({id:s.id,member_id:memberId,date:s.date,author:s.author,content:s.content||'',supplement:s.supplement||'',media:mediaMeta});if(error) throw error;}catch(e){console.warn('[cloud] upsertSession fail:',e);}},
  async deleteSession(id){if(!this.enabled) return;try{const {error}=await this.client.from('sessions').delete().eq('id',id);if(error) throw error;}catch(e){console.warn('[cloud] deleteSession fail:',e);}}
};

// ============ Cloudflare R2 미디어 스토리지 ============
const r2 = {
  workerUrl:'', apiKey:'', enabled:false,
  init(){const cfg=window.APP_CONFIG||{};if(!cfg.R2_WORKER_URL||!cfg.R2_API_KEY) return false;this.workerUrl=String(cfg.R2_WORKER_URL).replace(/\/+$/,'');this.apiKey=cfg.R2_API_KEY;this.enabled=true;return true;},
  url(key){if(!this.enabled||!key) return '';return this.workerUrl+'/'+encodeURIComponent(key);},
  async upload(key,blob){if(!this.enabled) return false;try{const res=await fetch(this.url(key),{method:'PUT',headers:{'X-API-Key':this.apiKey,'Content-Type':(blob&&blob.type)||'application/octet-stream'},body:blob});if(!res.ok){console.warn('[r2] upload http',res.status);return false;}return true;}catch(e){console.warn('[r2] upload fail:',e);return false;}},
  async download(key){if(!this.enabled) return null;try{const res=await fetch(this.url(key));if(!res.ok) return null;return await res.blob();}catch(e){console.warn('[r2] download fail:',e);return null;}},
  async remove(key){if(!this.enabled) return false;try{const res=await fetch(this.url(key),{method:'DELETE',headers:{'X-API-Key':this.apiKey}});return res.ok;}catch(e){console.warn('[r2] delete fail:',e);return false;}}
};

// ============ 상태 ============
let S = {
  members:[], assessments:{}, sessions:{}, deleteRequests:{},
  activityLog:[], auditLog:[], lastSeen:{},
  mediaUrls:{},
  selectedMember:null, assessOpen:false, filterAuthor:'all',
  showAddSession:false, showAddMember:false, showActivityLog:false,
  editSessionId:null, currentRole:null, currentUser:null,
  newSession:{date:today(), author:'', content:'', media:[], mediaUrls:['','']},
  uploading:0, uploadMsg:'',
  exercisePicker:{open:false, query:'', category:'all', selected:[]},
  golfLessonPicker:{open:false, query:'', category:'all', selected:[]},
  newMember:{name:'',phone:'',email:'',registeredDate:'',golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',golfLessonExpiry:'',golfPTExpiry:'',assignedTo:[]},
  editMemberId:null, sidebarOpen:false, cloudSync:'local',
  warningBannerCollapsed:false,
  handovers:{}, showHandover:null, showReport:false,
  memberSearch:'', showDashboard:false, sidebarTab:'pt_lesson',
  showGoalEdit:false, showImageCard:false
};

// ============ Audit Log ============
function logAudit(category, action, target, meta){
  var entry = {time:new Date().toISOString(),user:S.currentUser||'system',role:S.currentRole||'none',category:category,action:action,target:target||'',meta:meta||{}};
  if(!S.auditLog) S.auditLog = [];
  S.auditLog.push(entry);
  if(S.auditLog.length>1000) S.auditLog = S.auditLog.slice(-1000);
  try{save();}catch(e){}
}

// ============ Activity Log ============
function logActivity(action, memberId, detail){
  var mName='';var m=S.members.find(function(x){return x.id===memberId;});if(m) mName=m.name;
  S.activityLog.push({time:new Date().toISOString(),user:S.currentUser||'시스템',action:action,memberId:memberId||'',memberName:mName,detail:detail||''});
  if(S.activityLog.length>200) S.activityLog=S.activityLog.slice(-200);
}
function getUnreadCount(){if(!S.currentUser) return 0;var last=S.lastSeen[S.currentUser]||'';return S.activityLog.filter(function(e){return e.time>last&&e.user!==S.currentUser;}).length;}
function markSeen(){if(!S.currentUser)return;S.lastSeen[S.currentUser]=new Date().toISOString();save();}

// ============ Helpers ============
function today(){return new Date().toISOString().slice(0,10);}
function daysUntilExpiry(dateStr){if(!dateStr)return null;var exp=new Date(dateStr+'T23:59:59');var now=new Date();return Math.ceil((exp-now)/(1000*60*60*24));}
function nearestExpiry(m){if(!m) return '';var dates=[];if(m.golfLessonExpiry) dates.push(m.golfLessonExpiry);if(m.golfPTExpiry) dates.push(m.golfPTExpiry);if(dates.length===0&&m.expiry) dates.push(m.expiry);if(dates.length===0) return '';return dates.reduce(function(a,b){return a<b?a:b;});}
function expiryBadge(dateStr){var d=daysUntilExpiry(dateStr);if(d===null)return '';if(d<0)return ' <span class="exp-badge exp-expired">만료</span>';if(d<=30)return ' <span class="exp-badge exp-soon">D-'+d+'</span>';return '';}
function uid(){return 'm'+Date.now()+Math.random().toString(36).slice(2,5);}
function suid(){return 's'+Date.now()+Math.random().toString(36).slice(2,5);}
function initials(name){if(!name) return '?';const p=name.trim().split(/\s+/);if(p.length>=2) return p[0][0]+p[1][0];return name.slice(0,2);}
function save(){
  if(S.activityLog&&S.activityLog.length>50) S.activityLog=S.activityLog.slice(-50);
  if(S.auditLog&&S.auditLog.length>100) S.auditLog=S.auditLog.slice(-100);
  try{var data={members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers};var str=JSON.stringify(data,function(k,v){if(k==='data'&&typeof v==='string'&&v.length>1000) return undefined;return v;});localStorage.setItem('golf_pt_v2',str);return true;}catch(e){try{S.activityLog=[];S.auditLog=S.auditLog?S.auditLog.slice(-20):[];S.handovers={};localStorage.setItem('golf_pt_v2',JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers}));return true;}catch(e2){console.warn('[save] localStorage full');return false;}}
}
function estimateStorageSize(){try{return JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,lastSeen:S.lastSeen}).length;}catch(e){return 0;}}
function loadLocal(){try{const d=localStorage.getItem('golf_pt_v2');if(d){const p=JSON.parse(d);S.members=p.members||SAMPLE_DATA.members;S.assessments=p.assessments||SAMPLE_DATA.assessments;S.sessions=p.sessions||SAMPLE_DATA.sessions;S.deleteRequests=p.deleteRequests||{};S.activityLog=p.activityLog||[];S.auditLog=p.auditLog||[];S.lastSeen=p.lastSeen||{};S.handovers=p.handovers||{};}else{S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}}catch(e){S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}if(S.members.length>0&&!S.selectedMember) S.selectedMember=S.members[0].id;}
function readHash(){var h=location.hash.replace('#','');if(!h)return;var parts=h.split('-');var role=parts[0];var user=decodeURIComponent(parts.slice(1).join('-'));var authed=sessionStorage.getItem('golf_pt_auth');if(!authed){location.hash='';return;}if(role==='infodesk'){S.currentRole='infodesk';S.currentUser='인포데스크';}else if(role==='admin'){S.currentRole='admin';S.currentUser='관리자';}else if(role==='pro'&&user){S.currentRole='pro';S.currentUser=user;}else if(role==='trainer'&&user){S.currentRole='trainer';S.currentUser=user;}}
function setRole(role,user){var key=role==='infodesk'?'infodesk':(role==='admin'?'관리자':user);var pw=getPassword(key);if(pw){S.pendingRole={role:role,user:user};S.showPwModal=true;S.pwError=false;S.pwInput='';render();return;}activateRole(role,user);}
function activateRole(role,user){S.currentRole=role;S.currentUser=user;S.showPwModal=false;S.pwError=false;try{sessionStorage.setItem('golf_pt_auth',role+':'+user);}catch(e){}location.hash=role+(role!=='infodesk'?'-'+encodeURIComponent(user):'');if(role==='pro'||role==='trainer') S.newSession.author=user;if(role==='pro'||role==='trainer'){var accessible=S.members.filter(function(m){return m.assignedTo&&m.assignedTo.indexOf(user)!==-1;});var stillAccessible=S.selectedMember&&accessible.some(function(m){return m.id===S.selectedMember;});if(!stillAccessible){S.selectedMember=accessible.length>0?accessible[0].id:null;}}render();}
function submitPassword(){var p=S.pendingRole;if(!p)return;var key=p.role==='infodesk'?'infodesk':(p.role==='admin'?'관리자':p.user);if(S.pwInput===getPassword(key)){logAudit('auth','로그인',p.user||key,{role:p.role});activateRole(p.role,p.user);}else{S.pwError=true;render();}}
function cancelPassword(){S.showPwModal=false;S.pendingRole=null;S.pwError=false;render();}
function switchRole(){if(S.currentUser) logAudit('auth','로그아웃',S.currentUser,{});S.currentRole=null;S.currentUser=null;location.hash='';try{sessionStorage.removeItem('golf_pt_auth');}catch(e){}render();}

async function init(){
  loadLocal();readHash();render();
  if(navigator.storage&&navigator.storage.persist){try{await navigator.storage.persist();}catch(e){}}
  await mediaDB.init();
  var allMedia=await mediaDB.getAll();
  allMedia.forEach(function(rec){try{S.mediaUrls[rec.id]=URL.createObjectURL(rec.blob);}catch(e){}});
  Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) s.media.forEach(function(m){if(m.mediaId&&!S.mediaUrls[m.mediaId]) console.warn('[media] missing:',s.id,m.name,m.mediaId);});});});
  if(allMedia.length>0) render();
  r2.init();
  if(cloud.init()){
    S.cloudSync='loading';render();
    const localSnap={members:S.members.map(m=>({...m})),assessments:JSON.parse(JSON.stringify(S.assessments||{})),sessions:JSON.parse(JSON.stringify(S.sessions||{}))};
    const remote=await cloud.loadAll();
    if(remote){
      if(remote.members.length>0){
        var localMediaMap={};Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) localMediaMap[s.id]=s.media;});});
        S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;
        Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(localMediaMap[s.id]) s.media=localMediaMap[s.id];});});
        const remoteMemberIds=new Set(S.members.map(m=>m.id));
        for(const m of localSnap.members){if(!remoteMemberIds.has(m.id)){await cloud.upsertMember(m);S.members.push(m);remoteMemberIds.add(m.id);}}
        const remoteSessionIds=new Set();Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){remoteSessionIds.add(s.id);});});
        for(const mid in localSnap.sessions){for(const s of localSnap.sessions[mid]){if(!remoteSessionIds.has(s.id)){await cloud.upsertSession(mid,s);if(!S.sessions[mid]) S.sessions[mid]=[];S.sessions[mid].push(s);remoteSessionIds.add(s.id);}}}
        for(const mid in localSnap.assessments){for(const key in localSnap.assessments[mid]){if(key.indexOf('_')===0) continue;const hasRemote=S.assessments[mid]&&S.assessments[mid][key];if(!hasRemote){const v=localSnap.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);if(!S.assessments[mid]) S.assessments[mid]={};S.assessments[mid][key]=v;}}}
        if(!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=S.members[0]?S.members[0].id:null;}
      } else {await seedRemote();}
      save();S.cloudSync='connected';
    } else {S.cloudSync='error';}
    render();
  } else {S.cloudSync='local';}
}

async function seedRemote(){try{for(const m of S.members) await cloud.upsertMember(m);for(const mid in S.assessments){for(const key in S.assessments[mid]){const v=S.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);}}for(const mid in S.sessions){for(const s of S.sessions[mid]) await cloud.upsertSession(mid,s);}}catch(e){console.warn('[cloud] seedRemote fail:',e);}}

async function refreshFromCloud(){
  if(!cloud.enabled) return;S.cloudSync='loading';render();
  const remote=await cloud.loadAll();
  if(remote){var localMediaMap={};Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) localMediaMap[s.id]=s.media;});});S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(localMediaMap[s.id]) s.media=localMediaMap[s.id];});});if(S.members.length>0&&!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=S.members[0].id;}save();S.cloudSync='connected';}else{S.cloudSync='error';}
  render();
}

function stats(mid){const sess=S.sessions[mid]||[];return {total:sess.length,pro:sess.filter(s=>getRole(s.author)==='pro').length,trainer:sess.filter(s=>getRole(s.author)==='trainer').length};}
function calcFitness(assess){var PTS={'정상':7,'경미한 제한':5,'주의 필요':2,'제한':0,'미검사':0};var total=0,untested=0;for(var i=0;i<ASSESSMENT_ITEMS.length;i++){var v=assess[ASSESSMENT_ITEMS[i].key];if(!v||!v.result||v.result==='미검사'){untested++;}else{total+=(PTS[v.result]||0);}}var score=Math.round((total/98)*100);var cls=score>=85?'fit-good':score>=60?'fit-warn':'fit-danger';return {score:score,cls:cls,untested:untested};}

function syncBadge(){
  const map={local:{cls:'local',label:'로컬 모드'},loading:{cls:'loading',label:'동기화 중...'},connected:{cls:'connected',label:'Supabase 동기화됨'},error:{cls:'error',label:'동기화 오류'}};
  const s=map[S.cloudSync]||map.local;
  const refresh=(S.cloudSync==='connected'||S.cloudSync==='error')?`<button class="sync-refresh" onclick="refreshFromCloud()">새로고침</button>`:'';
  return `<div class="sync-indicator ${s.cls}"><div class="sync-dot"></div><div>${s.label}</div>${refresh}</div>`;
}

// ============ Render ============
