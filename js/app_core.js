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
  version:'v2.8',
  date:'2026-05-29',
  changes:[
    '라이브 세션 — 베이별(1·2번타석/3번룸) 활성세션 + 샷 저장(굿샷 트리거) + 관리자 재할당/삭제',
    '음성 받아쓰기 → AI 자동 세션카드 — 진행 중 받아쓰고 종료 시 AI가 정리, 트레이너는 확인만',
    '성과 리포트 — 라이브 세션 트랙맨 샷 자동 연결, 단위 전환(yd↔m · mph↔m/s), 글씨크기 조정, 인쇄(PDF)',
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

// ============ 라이브 세션: 베이(타석) 마스터 ============
// 1번타석/2번타석 = 연습+레슨 겸용, 3번룸 = 레슨 전용.
// 각 베이는 트랙맨 유닛/PC와 1:1로 물리 고정되며, 모든 매칭은 bay_id 기준.
const BAYS_DEFAULT = [
  {id:'bay1', name:'1번타석', color:'bay-blue',  type:'practice'},
  {id:'bay2', name:'2번타석', color:'bay-amber', type:'practice'},
  {id:'bay3', name:'3번룸',   color:'bay-green', type:'lesson_only'}
];

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

// ============ MIME 추론 (확장자 기반) ============
// iOS Safari 등에서 .mov, .heic 등은 file.type이 빈 문자열로 오는 경우가 있어
// 파일명 확장자로 보강한다. 빈 문자열 반환 시 추론 실패.
function inferMime(nameOrUrl){
  var s = String(nameOrUrl||'').toLowerCase();
  var m = s.split('?')[0].split('#')[0].match(/\.([a-z0-9]+)$/);
  var ext = m ? m[1] : '';
  var IMG = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',heic:'image/heic',heif:'image/heif',bmp:'image/bmp',svg:'image/svg+xml'};
  var VID = {mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',qt:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska','3gp':'video/3gpp','3gpp':'video/3gpp',hevc:'video/hevc',avi:'video/x-msvideo'};
  return IMG[ext] || VID[ext] || '';
}

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
  async deleteSession(id){if(!this.enabled) return;try{const {error}=await this.client.from('sessions').delete().eq('id',id);if(error) throw error;}catch(e){console.warn('[cloud] deleteSession fail:',e);}},
  // ----- 라이브 세션 (베이/활성세션/굿샷) -----
  async loadLive(){if(!this.enabled) return null;try{const [bRes,aRes,sRes]=await Promise.all([this.client.from('bays').select('*'),this.client.from('active_sessions').select('*'),this.client.from('shot_events').select('*').order('ts',{ascending:false}).limit(300)]);if(bRes.error) throw bRes.error;if(aRes.error) throw aRes.error;if(sRes.error) throw sRes.error;const bays=(bRes.data||[]).map(r=>({id:r.id,name:r.name,color:r.color,type:r.type}));const activeSessions={};(aRes.data||[]).forEach(r=>{activeSessions[r.bay_id]={memberId:r.member_id,memberName:r.member_name,author:r.author,startedAt:r.started_at,note:r.note||''};});const shotEvents=(sRes.data||[]).map(r=>({id:r.id,bayId:r.bay_id,memberId:r.member_id,memberName:r.member_name,author:r.author||'',ts:r.ts,data:r.data||{},videoR2Key:r.video_r2_key||null,source:r.source||'mock'})).reverse();return {bays,activeSessions,shotEvents};}catch(e){console.warn('[cloud] loadLive skip:',e&&e.message);return null;}},
  async upsertBays(bays){if(!this.enabled||!bays||!bays.length) return;try{const {error}=await this.client.from('bays').upsert(bays.map(b=>({id:b.id,name:b.name,color:b.color,type:b.type})));if(error) throw error;}catch(e){console.warn('[cloud] upsertBays fail:',e);}},
  async startActiveSession(bayId,sess){if(!this.enabled) return;try{const {error}=await this.client.from('active_sessions').upsert({bay_id:bayId,member_id:sess.memberId,member_name:sess.memberName,author:sess.author,started_at:sess.startedAt,note:sess.note||''});if(error) throw error;}catch(e){console.warn('[cloud] startActiveSession fail:',e);}},
  async endActiveSession(bayId){if(!this.enabled) return;try{const {error}=await this.client.from('active_sessions').delete().eq('bay_id',bayId);if(error) throw error;}catch(e){console.warn('[cloud] endActiveSession fail:',e);}},
  async insertShot(shot){if(!this.enabled) return;try{const {error}=await this.client.from('shot_events').upsert({id:shot.id,bay_id:shot.bayId,member_id:shot.memberId,member_name:shot.memberName,author:shot.author||'',ts:shot.ts,data:shot.data||{},video_r2_key:shot.videoR2Key||null,source:shot.source||'mock'});if(error) throw error;}catch(e){console.warn('[cloud] insertShot fail:',e);}},
  async reassignShot(shotId,memberId,memberName){if(!this.enabled) return;try{const {error}=await this.client.from('shot_events').update({member_id:memberId,member_name:memberName}).eq('id',shotId);if(error) throw error;}catch(e){console.warn('[cloud] reassignShot fail:',e);}},
  async deleteShot(id){if(!this.enabled) return;try{const {error}=await this.client.from('shot_events').delete().eq('id',id);if(error) throw error;}catch(e){console.warn('[cloud] deleteShot fail:',e);}}
};

// ============ Cloudflare R2 미디어 스토리지 ============
const r2 = {
  workerUrl:'', apiKey:'', enabled:false,
  init(){const cfg=window.APP_CONFIG||{};if(!cfg.R2_WORKER_URL||!cfg.R2_API_KEY) return false;this.workerUrl=String(cfg.R2_WORKER_URL).replace(/\/+$/,'');this.apiKey=cfg.R2_API_KEY;this.enabled=true;return true;},
  url(key){if(!this.enabled||!key) return '';return this.workerUrl+'/'+encodeURIComponent(key);},
  async upload(key,blob){if(!this.enabled) return false;try{const res=await fetch(this.url(key),{method:'PUT',headers:{'X-API-Key':this.apiKey,'Content-Type':(blob&&blob.type)||'application/octet-stream'},body:blob});if(!res.ok){console.warn('[r2] upload http',res.status);return false;}return true;}catch(e){console.warn('[r2] upload fail:',e);return false;}},
  async download(key){if(!this.enabled) return null;try{const res=await fetch(this.url(key));if(!res.ok) return null;return await res.blob();}catch(e){console.warn('[r2] download fail:',e);return null;}},
  async head(key){if(!this.enabled||!key) return false;try{const res=await fetch(this.url(key),{method:'HEAD'});return res.ok;}catch(e){return false;}},
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
  ocrLoading:false,
  newMember:{name:'',phone:'',email:'',registeredDate:'',golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',golfLessonExpiry:'',golfPTExpiry:'',assignedTo:[]},
  editMemberId:null, sidebarOpen:false, cloudSync:'local',
  warningBannerCollapsed:false,
  handovers:{}, showHandover:null, showReport:false,
  memberSearch:'', showDashboard:false, sidebarTab:'pt_lesson',
  showGoalEdit:false, showImageCard:false,
  showPerformance:false, perfMember:null, perfDemo:false,
  // 라이브 세션 (트랙맨 i/O 연동 기반)
  bays:[], activeSessions:{}, shotEvents:[],
  showLiveSession:false, liveStartBay:null, liveStartQuery:'',
  liveConfirm:null, liveReassignShot:null, liveToast:null, voiceBay:null,
  perfUnitDist:'yd', perfUnitSpd:'mph', perfTextScale:1, openSessions:{}, liveBayPickFor:null,
  bioBusy:false, bioError:'', bioEnrollFor:null,
  deletedSessionIds:{}   // 삭제된 세션 tombstone (다른 기기 캐시가 재업로드해 부활하는 것 방지)
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
  try{var data={members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers,bays:S.bays,activeSessions:S.activeSessions,shotEvents:S.shotEvents,deletedSessionIds:S.deletedSessionIds};var str=JSON.stringify(data,function(k,v){if(k==='data'&&typeof v==='string'&&v.length>1000) return undefined;return v;});localStorage.setItem('golf_pt_v2',str);return true;}catch(e){try{S.activityLog=[];S.auditLog=S.auditLog?S.auditLog.slice(-20):[];S.handovers={};localStorage.setItem('golf_pt_v2',JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers,bays:S.bays,activeSessions:S.activeSessions,shotEvents:S.shotEvents,deletedSessionIds:S.deletedSessionIds}));return true;}catch(e2){console.warn('[save] localStorage full');return false;}}
}
function estimateStorageSize(){try{return JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,lastSeen:S.lastSeen}).length;}catch(e){return 0;}}
function loadLocal(){try{const d=localStorage.getItem('golf_pt_v2');if(d){const p=JSON.parse(d);S.members=p.members||SAMPLE_DATA.members;S.assessments=p.assessments||SAMPLE_DATA.assessments;S.sessions=p.sessions||SAMPLE_DATA.sessions;S.deleteRequests=p.deleteRequests||{};S.activityLog=p.activityLog||[];S.auditLog=p.auditLog||[];S.lastSeen=p.lastSeen||{};S.handovers=p.handovers||{};S.bays=(p.bays&&p.bays.length)?p.bays:BAYS_DEFAULT.slice();S.activeSessions=p.activeSessions||{};S.shotEvents=p.shotEvents||[];S.deletedSessionIds=p.deletedSessionIds||{};}else{S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}}catch(e){S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}if(!S.bays||!S.bays.length) S.bays=BAYS_DEFAULT.slice();if(S.members.length>0&&!S.selectedMember) S.selectedMember=S.members[0].id;}
function readHash(){var h=location.hash.replace('#','');if(!h)return;var parts=h.split('-');var role=parts[0];var user=decodeURIComponent(parts.slice(1).join('-'));var authed=sessionStorage.getItem('golf_pt_auth');if(!authed){location.hash='';return;}if(role==='infodesk'){S.currentRole='infodesk';S.currentUser='인포데스크';}else if(role==='admin'){S.currentRole='admin';S.currentUser='관리자';}else if(role==='pro'&&user){S.currentRole='pro';S.currentUser=user;}else if(role==='trainer'&&user){S.currentRole='trainer';S.currentUser=user;}}
function setRole(role,user){var key=role==='infodesk'?'infodesk':(role==='admin'?'관리자':user);var pw=getPassword(key);if(pw){S.pendingRole={role:role,user:user};S.showPwModal=true;S.pwError=false;S.pwInput='';S.bioError='';render();bioAutoTry();return;}activateRole(role,user);}
function activateRole(role,user){S.currentRole=role;S.currentUser=user;S.showPwModal=false;S.pwError=false;S.pendingRole=null;S.bioError='';try{sessionStorage.setItem('golf_pt_auth',role+':'+user);}catch(e){}try{localStorage.setItem('golf_pt_last_user',JSON.stringify({role:role,user:user}));}catch(e){}location.hash=role+(role!=='infodesk'?'-'+encodeURIComponent(user):'');if(role==='pro'||role==='trainer') S.newSession.author=user;if(role==='pro'||role==='trainer'){var accessible=S.members.filter(function(m){return m.assignedTo&&m.assignedTo.indexOf(user)!==-1;});var stillAccessible=S.selectedMember&&accessible.some(function(m){return m.id===S.selectedMember;});if(!stillAccessible){S.selectedMember=accessible.length>0?accessible[0].id:null;}}render();}
function submitPassword(){var p=S.pendingRole;if(!p)return;var key=p.role==='infodesk'?'infodesk':(p.role==='admin'?'관리자':p.user);if(S.pwInput===getPassword(key)){logAudit('auth','로그인',p.user||key,{role:p.role,method:'password'});if(bio.available && !bio.isRegistered(p.role,p.user)){S.bioEnrollFor={role:p.role,user:p.user};S.showPwModal=false;render();return;}activateRole(p.role,p.user);}else{S.pwError=true;render();}}
function cancelPassword(){S.showPwModal=false;S.pendingRole=null;S.pwError=false;S.bioError='';render();}

// ============ 생체 인증 (Face ID / 지문 / 홍채) — WebAuthn ============
const bio = {
  available:false,
  KEY_PREFIX:'golf_pt_bio_',
  async init(){
    try{
      if(!window.PublicKeyCredential) return;
      if(typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable!=='function') return;
      this.available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }catch(e){this.available=false;}
  },
  _id(role,user){return this.KEY_PREFIX+role+'__'+user;},
  isRegistered(role,user){try{return !!localStorage.getItem(this._id(role,user));}catch(e){return false;}},
  list(){var out=[];try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(this.KEY_PREFIX)===0){var pair=k.slice(this.KEY_PREFIX.length).split('__');out.push({role:pair[0],user:pair[1]});}}}catch(e){}return out;},
  remove(role,user){try{localStorage.removeItem(this._id(role,user));}catch(e){}},
  _b64u(buf){var s=btoa(String.fromCharCode.apply(null,new Uint8Array(buf)));return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
  _fromB64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var bin=atob(s);var u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer;},
  async enroll(role,user){
    if(!this.available) throw new Error('이 기기는 생체 인증을 지원하지 않습니다');
    var challenge=new Uint8Array(32); crypto.getRandomValues(challenge);
    var uid=new TextEncoder().encode(role+':'+user);
    var cred=await navigator.credentials.create({publicKey:{
      challenge:challenge.buffer,
      rp:{name:'내셔널짐 Golf PT',id:location.hostname},
      user:{id:uid,name:role+':'+user,displayName:user+' ('+role+')'},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{userVerification:'required',authenticatorAttachment:'platform',residentKey:'preferred'},
      timeout:60000,attestation:'none'
    }});
    if(!cred||!cred.rawId) throw new Error('등록 실패');
    localStorage.setItem(this._id(role,user), this._b64u(cred.rawId));
    return true;
  },
  async verify(role,user){
    if(!this.available) return false;
    var idStr=localStorage.getItem(this._id(role,user));
    if(!idStr) return false;
    var challenge=new Uint8Array(32); crypto.getRandomValues(challenge);
    var assertion=await navigator.credentials.get({publicKey:{
      challenge:challenge.buffer,
      allowCredentials:[{type:'public-key',id:this._fromB64u(idStr)}],
      userVerification:'required',timeout:60000
    }});
    return !!assertion;
  }
};

// 모달 자동 시도 — 등록된 사용자면 모달 열리자마자 생체인증 트리거
async function bioAutoTry(){
  var p=S.pendingRole; if(!p||!bio.available) return;
  if(!bio.isRegistered(p.role,p.user)) return;
  S.bioBusy=true; S.bioError=''; render();
  try{
    var ok=await bio.verify(p.role,p.user);
    S.bioBusy=false;
    if(ok){logAudit('auth','로그인',p.user||p.role,{role:p.role,method:'biometric'});activateRole(p.role,p.user);return;}
    S.bioError='생체 인증 실패 — 비밀번호로 로그인하세요';
  }catch(e){
    S.bioBusy=false;
    S.bioError=(e&&e.name==='NotAllowedError')?'생체 인증 취소됨':'생체 인증 오류';
  }
  render();
}
// 모달에서 사용자가 직접 [Face ID/지문] 버튼 누른 경우
async function bioLoginNow(){
  var p=S.pendingRole; if(!p) return;
  await bioAutoTry();
}
// 비밀번호 후 등록 모달
async function bioEnrollNow(){
  var e=S.bioEnrollFor; if(!e) return;
  S.bioBusy=true; S.bioError=''; render();
  try{
    await bio.enroll(e.role,e.user);
    S.bioBusy=false; S.bioEnrollFor=null;
    logAudit('auth','생체인증 등록',e.user||e.role,{role:e.role});
    activateRole(e.role,e.user);
  }catch(err){
    S.bioBusy=false;
    S.bioError=(err&&err.name==='NotAllowedError')?'등록 취소됨':(err.message||'등록 실패');
    render();
  }
}
function bioEnrollSkip(){var e=S.bioEnrollFor;if(!e)return;S.bioEnrollFor=null;activateRole(e.role,e.user);}
// 마이페이지: 등록/해제
async function bioToggleSelf(){
  if(!bio.available){alert('이 기기는 생체 인증을 지원하지 않습니다');return;}
  var role=S.currentRole, user=S.currentUser; if(!role||!user) return;
  if(bio.isRegistered(role,user)){
    if(!confirm('이 기기의 생체 로그인을 해제할까요?')) return;
    bio.remove(role,user); logAudit('auth','생체인증 해제',user,{role:role});
    alert('해제되었습니다 — 다음부터 비밀번호로 로그인'); render(); return;
  }
  try{
    await bio.enroll(role,user); logAudit('auth','생체인증 등록',user,{role:role});
    alert('등록 완료 — 다음 로그인부터 Face ID / 지문으로 들어옵니다'); render();
  }catch(e){
    if(e&&e.name!=='NotAllowedError') alert('등록 실패: '+(e.message||e));
  }
}
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
  bio.init().then(function(){
    if(!bio.available){ render(); return; }
    render();
    // 앱 시작 시 자동 생체 로그인 — 마지막 사용자가 등록되어 있으면 바로 트리거
    if(S.currentRole) return; // 이미 로그인되어 있으면 스킵
    var last; try{ last=JSON.parse(localStorage.getItem('golf_pt_last_user')||'null'); }catch(e){}
    if(last && last.role && last.user && bio.isRegistered(last.role,last.user)){
      setRole(last.role, last.user); // 비밀번호 모달 + bioAutoTry 자동 실행
    }
  });
  if(cloud.init()){
    S.cloudSync='loading';render();
    const localSnap={members:S.members.map(m=>({...m})),assessments:JSON.parse(JSON.stringify(S.assessments||{})),sessions:JSON.parse(JSON.stringify(S.sessions||{}))};
    const remote=await cloud.loadAll();
    if(remote){
      if(remote.members.length>0){
        var localMediaMap={};Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) localMediaMap[s.id]=s.media;});});
        S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;
        // tombstone — 다른 기기 캐시에서 부활한 세션을 즉시 청소(remote에서도 다시 삭제)
        var _tomb=S.deletedSessionIds||{};
        Object.keys(S.sessions).forEach(function(mid){
          S.sessions[mid]=(S.sessions[mid]||[]).filter(function(s){
            if(_tomb[s.id]){ try{cloud.deleteSession(s.id);}catch(e){} return false; }
            return true;
          });
        });
        Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(localMediaMap[s.id]) s.media=localMediaMap[s.id];});});
        const remoteMemberIds=new Set(S.members.map(m=>m.id));
        for(const m of localSnap.members){if(!remoteMemberIds.has(m.id)){await cloud.upsertMember(m);S.members.push(m);remoteMemberIds.add(m.id);}}
        const remoteSessionIds=new Set();Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){remoteSessionIds.add(s.id);});});
        for(const mid in localSnap.sessions){for(const s of localSnap.sessions[mid]){if(_tomb[s.id]) continue; /* 삭제된 건 재업로드 금지 */ if(!remoteSessionIds.has(s.id)){await cloud.upsertSession(mid,s);if(!S.sessions[mid]) S.sessions[mid]=[];S.sessions[mid].push(s);remoteSessionIds.add(s.id);}}}
        for(const mid in localSnap.assessments){for(const key in localSnap.assessments[mid]){if(key.indexOf('_')===0) continue;const hasRemote=S.assessments[mid]&&S.assessments[mid][key];if(!hasRemote){const v=localSnap.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);if(!S.assessments[mid]) S.assessments[mid]={};S.assessments[mid][key]=v;}}}
        if(!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=S.members[0]?S.members[0].id:null;}
      } else {await seedRemote();}
      save();S.cloudSync='connected';
    } else {S.cloudSync='error';}
    // 라이브 세션(베이/활성세션/굿샷) 클라우드 로드 — 테이블 미생성 시 null 반환 → 로컬 유지
    try{const live=await cloud.loadLive();if(live){if(live.bays&&live.bays.length){S.bays=live.bays;}else{cloud.upsertBays(S.bays);}S.activeSessions=live.activeSessions;S.shotEvents=live.shotEvents;save();}}catch(e){console.warn('[cloud] live load skip:',e);}
    render();
  } else {S.cloudSync='local';}
  // 마지막 단계: 로컬에 있는 영상이 R2에 누락된 경우 자동 재업로드
  // (iPad 백그라운드 업로드 중단 등으로 R2 누락 → 다른 디바이스에서 안 보이는 케이스 복구)
  syncLocalMediaToR2().catch(function(e){console.warn('[r2-sync] fail:',e);});
}

// 로컬 IndexedDB에 영상은 있지만 R2엔 없는 파일을 찾아 자동 재업로드한다.
// 업로드 디바이스(예: iPad)에서 페이지 닫힘/네트워크 실패로 R2 업로드가 미완료된 경우,
// 다음 앱 실행 시 이 함수가 R2와 cloud 메타를 보정해서 다른 디바이스에서도 영상이 표시되게 한다.
async function syncLocalMediaToR2(){
  if(!r2.enabled || !mediaDB.db) return;
  var pending=[];
  Object.keys(S.sessions).forEach(function(mid){
    (S.sessions[mid]||[]).forEach(function(s){
      (s.media||[]).forEach(function(m){
        if(m.type==='file' && m.mediaId) pending.push({mid:mid, sid:s.id, m:m});
      });
    });
  });
  if(pending.length===0) return;
  var fixed=0;
  for(var i=0;i<pending.length;i++){
    var p=pending[i];
    var rec=await mediaDB.get(p.m.mediaId);
    if(!rec || !rec.blob) continue; // 로컬에 없으면 패스(다른 디바이스가 올린 영상)
    var key=p.m.r2Key || p.m.mediaId;
    var exists=await r2.head(key);
    if(exists){
      if(p.m.r2Status!=='synced'){p.m.r2Status='synced'; if(!p.m.r2Key) p.m.r2Key=p.m.mediaId; fixed++;}
      continue;
    }
    p.m.r2Status='uploading'; render();
    var ok=await r2.upload(p.m.mediaId, rec.blob);
    if(ok){
      p.m.r2Status='synced';
      p.m.r2Key=p.m.r2Key || p.m.mediaId;
      var stored=(S.sessions[p.mid]||[]).find(function(x){return x.id===p.sid;});
      if(stored) cloud.upsertSession(p.mid, stored);
      fixed++;
    } else {
      p.m.r2Status='failed';
    }
  }
  if(fixed>0){console.log('[r2-sync]', fixed,'개 영상 동기화 완료'); save(); render();}
}

async function seedRemote(){try{for(const m of S.members) await cloud.upsertMember(m);for(const mid in S.assessments){for(const key in S.assessments[mid]){const v=S.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);}}for(const mid in S.sessions){for(const s of S.sessions[mid]) await cloud.upsertSession(mid,s);}}catch(e){console.warn('[cloud] seedRemote fail:',e);}}

// 새로고침 버튼 — Supabase 데이터 갱신 + SW 캐시 정리 + 페이지 리로드 (PWA에 새로고침이 없을 때)
async function reloadApp(){
  if(S.uploading>0){ if(!confirm('업로드 중인 파일이 '+S.uploading+'개 있습니다. 그래도 새로고침할까요?')) return; }
  var btns=document.querySelectorAll('.sidebar-bell svg, .sidebar-home-btn svg');
  try{ document.querySelector('.sidebar-bell svg').classList.add('spin'); }catch(e){}
  try{ if(cloud&&cloud.enabled) await refreshFromCloud(); }catch(e){ console.warn('[reload] cloud:',e); }
  try{ if('caches' in window){ var keys=await caches.keys(); await Promise.all(keys.map(function(k){return caches.delete(k);})); } }catch(e){ console.warn('[reload] caches:',e); }
  try{ if(navigator.serviceWorker && navigator.serviceWorker.controller){ navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'}); } }catch(e){}
  location.reload();
}

async function refreshFromCloud(){
  if(!cloud.enabled) return;S.cloudSync='loading';render();
  const remote=await cloud.loadAll();
  if(remote){var localMediaMap={};Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) localMediaMap[s.id]=s.media;});});S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;var _tomb=S.deletedSessionIds||{};Object.keys(S.sessions).forEach(function(mid){S.sessions[mid]=(S.sessions[mid]||[]).filter(function(s){if(_tomb[s.id]){try{cloud.deleteSession(s.id);}catch(e){}return false;}return true;});});Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(localMediaMap[s.id]) s.media=localMediaMap[s.id];});});if(S.members.length>0&&!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=S.members[0].id;}save();S.cloudSync='connected';}else{S.cloudSync='error';}
  try{const live=await cloud.loadLive();if(live){if(live.bays&&live.bays.length) S.bays=live.bays;S.activeSessions=live.activeSessions;S.shotEvents=live.shotEvents;save();}}catch(e){console.warn('[cloud] live refresh skip:',e);}
  render();
}

function stats(mid){const sess=S.sessions[mid]||[];return {total:sess.length,pro:sess.filter(s=>getRole(s.author)==='pro').length,trainer:sess.filter(s=>getRole(s.author)==='trainer').length};}
function calcFitness(assess){var PTS={'정상':7,'경미한 제한':5,'주의 필요':2,'제한':0,'미검사':0};var total=0,untested=0;for(var i=0;i<ASSESSMENT_ITEMS.length;i++){var v=assess[ASSESSMENT_ITEMS[i].key];if(!v||!v.result||v.result==='미검사'){untested++;}else{total+=(PTS[v.result]||0);}}var score=Math.round((total/98)*100);var cls=score>=85?'fit-good':score>=60?'fit-warn':'fit-danger';return {score:score,cls:cls,untested:untested};}

function syncBadge(){
  const map={local:{cls:'local',label:'로컬 모드'},loading:{cls:'loading',label:'동기화 중...'},connected:{cls:'connected',label:'Supabase 동기화됨'},error:{cls:'error',label:'동기화 오류'}};
  const s=map[S.cloudSync]||map.local;
  const refresh=(S.cloudSync==='connected'||S.cloudSync==='error')?`<button class="sync-refresh" onclick="reloadApp()">새로고침</button>`:'';
  return `<div class="sync-indicator ${s.cls}"><div class="sync-dot"></div><div>${s.label}</div>${refresh}</div>`;
}

// ============ Render ============
