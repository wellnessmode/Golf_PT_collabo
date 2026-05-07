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
  version:'v2.7',
  date:'2026-04-12',
  changes:[
    '📋 인수인계 시스템 — 담당 지도자 변경 시 AI 자동 요약 카드 생성 (최근 10세션, 체형평가, Body-Swing 경고, 스윙 영상)',
    '📄 회원 리포트 — HTML → 인쇄/PDF 출력 (회원정보, 체형평가, 세션기록 최근 20건)',
    '🏋️ 운동 DB 1000개 — 웨이트 350 + 골프 피트니스(TPI) 345 + 골프 스킬 305, 별도 파일 분리',
    '🏋️ 운동 DB 100여 개 내장 — 웨이트/골프 피트니스(TPI)/골프 스킬 카테고리, 초성 검색 지원 (예: "ㅅㅋㅌ" → 스쿼트)',
    '⚡ 세션 기록 빠른추가 — "+ 운동 빠른추가" 버튼으로 모달에서 다중 선택 + 세트/횟수 입력 → 자동 포맷으로 내용 추가',
    '📊 Trackman 스타일 A→F 변화량 카드 — 좌/우 힙 이동, 힙 센터 스웨이, 어깨/힙 회전, 최대 X-팩터, 헤드 최대 측면/수직 이동을 한눈에',
    '🎯 기준선 두께·가독성 대폭 개선 — 고정 위치 수직선(A: 노랑 점선 / F: 하늘 실선, 4px) + 라운드 배경 라벨로 화면 비율 따라 자동 크기',
    '⚓ 힙·헤드 수직선 고정화 — 프레임마다 흔들리던 수직선을 Address/Finish 두 시점에만 고정 표시, 중간 움직임 무시',
    '▶ 영상 자동 분석 시작 — 재생 버튼 누르지 않아도 로드되면 바로 분석 (preload=auto + canplay 트리거)',
    '📱 iOS Safari 디코더 Kick — muted play/pause 로 seek 동작 활성화, 모바일에서 스켈레톤 미표시 버그 수정',
    '🎯 뷰별 전용 기준선 — 정면: 척추/어깨/골반/좌우 힙 수직/헤드 수직, 측면: 척추/헤드/힙/무릎 수직',
    '👻 Address · Finish 유령 기준선 — 노란(Address)/하늘(Finish) 참조선을 오버레이해 스윙 전반의 움직임 변화 추적',
    '📊 지표 변화량(Δ) 표시 — 현재값 옆에 Address 대비 차이(+/-)를 색상 태그로 표시, 한계치 초과 시 경고색',
    '🛡 R2 영상 CORS 문제 수정 — crossorigin=anonymous 로 Tainted canvas 에러 해결',
    '⚡ 분석 속도 10배 개선 — Lite 모델 + 10fps 샘플링 + 다운샘플 캔버스 + rVFC 프레임 동기화 (5초 영상 기준 3분 → 15초)',
    '🌓 어두운 실내 영상 감지력 향상 — 밝기/대비 보정 + 감지 임계값 완화 (0.6 → 0.3)',
    '📦 업로드 전 자동 영상 압축 — 1280px / 2.5Mbps 재인코딩으로 원본 15MB → 2~4MB (R2 저장/전송 효율 개선)',
    '🎨 플레이어 툴바 전면 재설계 — SVG 아이콘 + 한글 라벨(관절/기준선/지표/재분석/확대) + 도움말 버튼',
    '📱 모바일 터치 영역 확대 — 48×46px 탭 타겟 + touch-action:manipulation 으로 즉시 반응',
    '🎥 Cloudflare R2 영상 스토리지 연동 — 스윙 영상도 모든 기기에서 공유, 원본 화질 유지',
    '⚡ 영상 로컬 캐시 전략 — IndexedDB 캐시 우선, 없으면 R2 스트리밍, 분석 시 자동 캐시',
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

// ============ 운동 DB ============
// exercises_data.js 에서 EXERCISES 배열(1000개)을 로드합니다.
// index.html 에서 exercises_data.js 를 app.js 보다 먼저 불러옵니다.

// 한글 초성 추출 (검색용)
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
  // 한글 이름 부분 매칭
  if(ex.n.toLowerCase().indexOf(q)!==-1) return true;
  // 영문 이름 매칭
  if((ex.e||'').toLowerCase().indexOf(q)!==-1) return true;
  // 타겟 부위 매칭
  if((ex.f||'').toLowerCase().indexOf(q)!==-1) return true;
  // 서브카테고리 매칭
  if((ex.s||'').toLowerCase().indexOf(q)!==-1) return true;
  // 초성 매칭 (ㅅㅋㅌ → 스쿼트)
  const qCho = getChosung(q);
  const nCho = getChosung(ex.n);
  if(nCho.indexOf(qCho)!==-1) return true;
  // 타겟·서브에 대해서도 초성 매칭
  if(getChosung(ex.f||'').indexOf(qCho)!==-1) return true;
  if(getChosung(ex.s||'').indexOf(qCho)!==-1) return true;
  // 띄어쓰기 무시 매칭 (스쿼트 vs 스 쿼 트)
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
      const members = (mRes.data||[]).map(r=>{
        // data JSONB 컬럼에서 확장 필드 복원. 없으면 기본 필드만.
        var extra = r.data || {};
        return Object.assign(
          {id:r.id, name:r.name, color:r.color||'av-green'},
          extra
        );
      });
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
          content:r.content||'', supplement:r.supplement||'',
          media: Array.isArray(r.media) ? r.media : (r.media ? r.media : [])
        });
      });
      return {members, assessments, sessions};
    }catch(e){console.warn('[cloud] loadAll 실패:',e);return null;}
  },
  async upsertMember(m){
    if(!this.enabled) return;
    try{
      // 기본 필드 + 확장 필드 전체를 data JSONB 에 저장 (기기간 동기화 보장)
      var extra = {
        phone:m.phone||'', email:m.email||'',
        registeredDate:m.registeredDate||'',
        golfLessonCount:m.golfLessonCount||'', golfPTCount:m.golfPTCount||'',
        golfLessonAmount:m.golfLessonAmount||'', golfPTAmount:m.golfPTAmount||'',
        expiry:m.expiry||'',
        golfLessonExpiry:m.golfLessonExpiry||'',
        golfPTExpiry:m.golfPTExpiry||'',
        assignedTo:m.assignedTo||[],
        memberType:m.memberType||'pt_lesson',
        handicap:m.handicap||'', avgScore:m.avgScore||'',
        goal:m.goal||'', focusPoints:m.focusPoints||''
      };
      var payload = {id:m.id, name:m.name, color:m.color, data:extra};
      var {error} = await this.client.from('members').upsert(payload);
      if(error){
        // data 컬럼이 없는 경우 기본 필드만 다시 시도 (하위호환)
        if(String(error.message||'').toLowerCase().indexOf('data')!==-1){
          console.warn('[cloud] members.data 컬럼이 없습니다. Supabase에 추가해주세요.');
          var fallback = await this.client.from('members').upsert({id:m.id,name:m.name,color:m.color});
          if(fallback.error) throw fallback.error;
          return;
        }
        throw error;
      }
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
      // blob/url 캐시는 제외하고 클라우드 공유 가능한 메타데이터만 직렬화
      const mediaMeta = (s.media||[]).map(function(m){
        return {
          type: m.type,
          view: m.view||'other',
          name: m.name||'',
          mimeType: m.mimeType||'',
          size: m.size||0,
          mediaId: m.mediaId||null,
          r2Key: m.r2Key||m.mediaId||null,
          data: (m.type==='url' ? (m.data||'') : undefined)
        };
      });
      const {error} = await this.client.from('sessions').upsert({
        id: s.id,
        member_id: memberId,
        date: s.date,
        author: s.author,
        content: s.content||'',
        supplement: s.supplement||'',
        media: mediaMeta
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

// ============ Cloudflare R2 미디어 스토리지 ============
// config.js 의 R2_WORKER_URL / R2_API_KEY 가 있으면 활성화.
// 업로드한 영상을 R2 에 올려 모든 기기에서 공유 가능.
const r2 = {
  workerUrl:'', apiKey:'', enabled:false,
  init(){
    const cfg = window.APP_CONFIG || {};
    if(!cfg.R2_WORKER_URL || !cfg.R2_API_KEY) return false;
    this.workerUrl = String(cfg.R2_WORKER_URL).replace(/\/+$/,'');
    this.apiKey = cfg.R2_API_KEY;
    this.enabled = true;
    return true;
  },
  url(key){
    if(!this.enabled || !key) return '';
    return this.workerUrl + '/' + encodeURIComponent(key);
  },
  async upload(key, blob){
    if(!this.enabled) return false;
    try{
      const res = await fetch(this.url(key), {
        method:'PUT',
        headers:{
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
    <div class="manual-link">
      <a href="manual.html" target="_blank">📖 직원 사용 매뉴얼 보기</a>
    </div>
  </div>${S.showPwModal?'<div class="modal-overlay" onclick="if(event.target===this)cancelPassword()"><div class="modal" style="width:340px"><div class="modal-title" style="text-align:center">🔒 '+(S.pendingRole?S.pendingRole.user:'')+'</div><div class="form-group"><label class="form-label">비밀번호</label><input class="form-input" type="password" placeholder="비밀번호를 입력하세요" oninput="S.pwInput=this.value" onkeydown="if(event.key===\'Enter\')submitPassword()" autofocus></div>'+(S.pwError?'<div style="color:#993c1d;font-size:12px;margin-bottom:10px;text-align:center">비밀번호가 일치하지 않습니다</div>':'')+'<div class="modal-actions"><button class="btn" onclick="cancelPassword()">취소</button><button class="btn primary" onclick="submitPassword()">확인</button></div></div></div>':''}`;
}

function render(){
  if(!S.currentRole){document.body.classList.add('role-select');renderRoleSelector();return;}
  document.body.classList.remove('role-select');
  const root = document.getElementById('root');
  const isAdmin = S.currentRole==='admin';
  const isInfo = S.currentRole==='infodesk' || isAdmin; // admin도 읽기전용 (모든 회원 조회)
  // 프로/트레이너가 배정되지 않은 회원이 선택된 경우 차단
  if(!isInfo && S.selectedMember){
    var _sel = S.members.find(function(m){return m.id===S.selectedMember;});
    if(!_sel || !_sel.assignedTo || _sel.assignedTo.indexOf(S.currentUser)===-1){
      S.selectedMember = null;
    }
  }
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
    ${isInfo ? `
    <div class="sidebar-section-label">전체 회원 관리</div>
    <div class="infodesk-tools">
      <button class="mp-btn" onclick="event.stopPropagation();openDashboard()">📊 대시보드</button>
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
      ${S.members.filter(function(m){
        var mType = m.memberType||'pt_lesson';
        if(!isInfo){
          if(mType!==S.sidebarTab) return false;
          if(!(m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1)) return false;
        }
        if(S.memberSearch){
          var q=S.memberSearch.trim().toLowerCase();
          if(q && m.name.toLowerCase().indexOf(q)===-1 && getChosung(m.name).indexOf(getChosung(q))===-1) return false;
        }
        return true;
      }).map(m => `
        <div class="member-item${m.id===mid?' active':''}" onclick="selectMember('${m.id}')">
          <div class="member-avatar ${m.color}">${initials(m.name)}</div>
          <div class="member-name">${m.name}${expiryBadge(nearestExpiry(m))}${(m.memberType||'pt_lesson')==='lesson'?'<span class="type-tag lesson-tag">골프</span>':''}</div>
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
      ${!isInfo?'<button class="mp-btn dash-btn" onclick="event.stopPropagation();openDashboard()">📊 대시보드</button>':''}
      <div class="mp-label">마이페이지</div>
      ${S.currentRole!=='admin'?'<button class="mp-btn" onclick="openPasswordChange()">🔑 비밀번호 변경</button>':''}
      ${S.currentRole==='admin'?'<button class="mp-btn" onclick="openAuditLog()">🔍 전체 감사 로그</button>':''}
      <button class="mp-btn" onclick="event.stopPropagation();window.open('manual.html','_blank')">📖 사용 매뉴얼</button>
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
          <div class="member-subtitle">${(function(){
            var lessonExp = member.golfLessonExpiry || member.expiry || '';
            var ptExp = member.golfPTExpiry || '';
            if((member.memberType||'pt_lesson')==='lesson'){
              return '레슨 '+(st?st.pro+st.trainer:0)+'/'+(member.golfLessonCount||'0')+'회'+(lessonExp?' · ~'+lessonExp+expiryBadge(lessonExp):'');
            }
            return '레슨 '+(st?st.pro:0)+'/'+(member.golfLessonCount||'0')+'회'+(lessonExp?' (~'+lessonExp+expiryBadge(lessonExp)+')':'')+' · PT '+(st?st.trainer:0)+'/'+(member.golfPTCount||'0')+'회'+(ptExp?' (~'+ptExp+expiryBadge(ptExp)+')':'');
          })()}</div>
          ${(member.phone||member.email||member.registeredDate)?`<div class="member-detail-line">${member.phone?'📞 '+member.phone:''}${member.email?' · ✉ '+member.email:''}${member.registeredDate?' · 가입일 '+member.registeredDate:''}</div>`:''}
          ${(member.handicap||member.avgScore||member.focusPoints)?`<div class="member-detail-line golf-profile">${member.handicap?'HC '+member.handicap:''}${member.avgScore?' · 평균 '+member.avgScore+'타':''}${member.focusPoints?' · 🎯 '+member.focusPoints:''}</div>`:''}
          ${member.goal?`<div class="member-detail-line goal-line">🏁 목표: ${member.goal}</div>`:''}
        </div>
      </div>
      <div class="topbar-actions">
        <button class="btn" onclick="openImageCard()" title="이미지 카드">🖼️ 카드</button>
        <button class="btn" onclick="openReport()" title="회원 리포트">📄 리포트</button>
        ${(S.handovers[mid]&&S.handovers[mid].length>0)?'<button class="btn ho-btn" onclick="openHandover(\''+mid+'\')" title="인수인계 기록">📋 인수인계 <span class="ho-count">'+S.handovers[mid].length+'</span></button>':''}
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
                ${s.author!==S.currentUser && s._addedAt && s._addedAt>(S.lastSeen[S.currentUser]||'') ? '<span class="new-badge">NEW</span>' : ''}
              </div>
              <div class="session-bd">
                <div class="session-content">${s.content}</div>
                ${s.media&&s.media.length>0?'<div class="session-media">'+s.media.map(function(m,mi){
                  // 우선순위: 로컬 ObjectURL > R2 원격 URL > data URL
                  var localSrc = m.mediaId ? (S.mediaUrls[m.mediaId]||'') : '';
                  var remoteSrc = (r2.enabled && (m.r2Key||m.mediaId)) ? r2.url(m.r2Key||m.mediaId) : '';
                  var src = localSrc || remoteSrc || (m.data||'');
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
                  ${!isInfo?'<button class="small-btn edit" onclick="openEditSession(\''+s.id+'\')">수정</button>':''}
                  ${!isInfo?'<button class="small-btn del" onclick="deleteSession(\''+s.id+'\')">삭제</button>':''}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    ` : `
    ${S.showDashboard ? renderDashboard() : `<div class="no-member">
      <div class="no-member-icon">⛳</div>
      <div style="font-size:14px;font-weight:600;color:#6b7a70">회원을 선택하세요</div>
      <div style="font-size:12px">좌측에서 회원을 클릭하거나 새 회원을 등록하세요</div>
    </div>`}`}
  </div>

  ${S.showAddSession ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">${S.editSessionId?'세션 기록 수정':'세션 기록 추가'} — ${member?member.name+' 회원님':''}</div>
      <div class="form-group">
        <label class="form-label">날짜</label>
        <input type="date" class="form-input" value="${S.newSession.date}" onchange="updateNS('date',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">담당자</label>
        <div class="radio-group">
          ${INSTRUCTORS.map(function(inst){
            var isMe = inst.name===S.currentUser;
            var sel = S.newSession.author===inst.name ? (inst.role==='pro'?' sel-pro':' sel-trainer') : '';
            if(!isMe) return '<div class="radio-opt disabled" style="opacity:0.4;pointer-events:none">'+inst.name+'</div>';
            return '<div class="radio-opt'+sel+'" onclick="updateNS(\'author\',\''+inst.name+'\')">'+inst.name+'</div>';
          }).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">운동 / 레슨 내용
          <button type="button" class="ex-add-btn" onclick="openExercisePicker()">+ 운동 빠른추가</button>
        </label>
        <textarea class="form-textarea" placeholder="오늘 진행한 내용을 입력하세요" oninput="updateNS('content',this.value)">${S.newSession.content}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">🏌️ 스윙 영상</label>
        <div class="media-input-box">
          <div class="video-slot-grid">
            <div class="video-slot">
              <div class="vs-label">정면</div>
              ${(function(){
                var f = (S.newSession.media||[]).find(function(x){return x.view==='front';});
                var idx = (S.newSession.media||[]).findIndex(function(x){return x.view==='front';});
                if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';
                return '<label class="media-upload-btn">+ 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'front\')" style="display:none"></label>';
              })()}
            </div>
            <div class="video-slot">
              <div class="vs-label">측면</div>
              ${(function(){
                var f = (S.newSession.media||[]).find(function(x){return x.view==='side';});
                var idx = (S.newSession.media||[]).findIndex(function(x){return x.view==='side';});
                if(f) return '<div class="media-file-item"><span>'+(f.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';
                return '<label class="media-upload-btn">+ 선택<input type="file" accept="video/*" onchange="handleFileUpload(this,\'side\')" style="display:none"></label>';
              })()}
            </div>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">📎 사진 · 영상 첨부</label>
        <div class="media-input-box">
          <div class="exercise-video-list">
            ${(S.newSession.media||[]).filter(function(x){return x.view==='exercise'||x.view==='photo';}).map(function(x,i){
              var idx = (S.newSession.media||[]).findIndex(function(m){return m===x;});
              var icon = (x.mimeType||'').indexOf('image/')!==-1?'🖼':'🎬';
              return '<div class="media-file-item"><span>'+icon+' '+(x.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+idx+')">×</span></div>';
            }).join('')}
          </div>
          <div class="media-upload-row">
            <label class="media-upload-btn">+ 사진 추가<input type="file" accept="image/*" multiple onchange="handleExerciseVideoUpload(this)" style="display:none"></label>
            <label class="media-upload-btn">+ 영상 추가<input type="file" accept="video/*" multiple onchange="handleExerciseVideoUpload(this)" style="display:none"></label>
          </div>
          <div class="media-hint">여러 장 선택 가능 · 파일당 최대 100MB</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn primary" ${S.uploading>0?'disabled title="업로드 중..."':''} onclick="${S.editSessionId?'saveEditSession()':'addSession()'}">${S.uploading>0?'⏳ '+(S.uploadMsg||'업로드 중 ('+S.uploading+')'):(S.editSessionId?'수정 저장':'기록 저장')}</button>
      </div>
    </div>
  </div>` : ''}

  ${S.showAddMember ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">${S.editMemberId?'회원 정보 수정':'새 회원 등록'}</div>
      <div class="form-group">
        <label class="form-label">회원 유형</label>
        <div class="radio-group">
          <div class="radio-opt${S.newMember.memberType==='pt_lesson'?' sel-pro':''}" onclick="S.newMember.memberType='pt_lesson';render()">💪 PT+골프</div>
          <div class="radio-opt${S.newMember.memberType==='lesson'?' sel-trainer':''}" onclick="S.newMember.memberType='lesson';render()">🏌️ 골프</div>
        </div>
      </div>
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
      <div class="form-group">
        <label class="form-label">등록일</label>
        <input type="date" class="form-input" value="${S.newMember.registeredDate||''}" oninput="S.newMember.registeredDate=this.value">
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
      <div class="form-group">
        <label class="form-label">레슨 유효기간</label>
        <input type="date" class="form-input" value="${S.newMember.golfLessonExpiry||S.newMember.expiry||''}" oninput="S.newMember.golfLessonExpiry=this.value">
      </div>
      ${S.newMember.memberType==='pt_lesson'?`<div class="form-section-label">골프 PT</div>
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
        <label class="form-label">PT 유효기간</label>
        <input type="date" class="form-input" value="${S.newMember.golfPTExpiry||''}" oninput="S.newMember.golfPTExpiry=this.value">
      </div>`:``}
      <div class="form-section-label">골프 프로필</div>
      <div class="member-info-row">
        <div class="form-group">
          <label class="form-label">핸디캡</label>
          <input class="form-input" type="number" placeholder="예: 18" value="${S.newMember.handicap||''}" oninput="S.newMember.handicap=this.value">
        </div>
        <div class="form-group">
          <label class="form-label">평균 타수</label>
          <input class="form-input" type="number" placeholder="예: 95" value="${S.newMember.avgScore||''}" oninput="S.newMember.avgScore=this.value">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">목표</label>
        <input class="form-input" placeholder="예: 3개월 내 100타 깨기" value="${(S.newMember.goal||'').replace(/"/g,'&quot;')}" oninput="S.newMember.goal=this.value">
      </div>
      <div class="form-group">
        <label class="form-label">주력 교정 포인트</label>
        <input class="form-input" placeholder="예: 슬라이스, 힙 슬라이드" value="${(S.newMember.focusPoints||'').replace(/"/g,'&quot;')}" oninput="S.newMember.focusPoints=this.value">
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

  ${renderExercisePicker()}

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

  ${renderHandoverModal()}
  ${renderReportModal()}
  ${renderImageCardModal()}
  `;
  // 커스텀 플레이어 초기화 (세션 카드의 영상)
  setTimeout(initSwingPlayers, 0);
  // 검색 입력 중이면 포커스 복원 (키보드 유지)
  setTimeout(function(){
    if(S.memberSearch){
      var el = document.querySelector('.sidebar-search');
      if(el){el.focus();el.setSelectionRange(S.memberSearch.length,S.memberSearch.length);}
    }
    if(S.exercisePicker && S.exercisePicker.open && S.exercisePicker.query){
      var el2 = document.querySelector('.ex-picker-search input');
      if(el2){el2.focus();el2.setSelectionRange(S.exercisePicker.query.length,S.exercisePicker.query.length);}
    }
  },0);
}

// ============ 이벤트 핸들러 ============
function selectMember(id){S.selectedMember=id; S.filterAuthor='all'; S.sidebarOpen=false; render();}
function toggleAssess(){S.assessOpen=!S.assessOpen; render();}
function toggleWarningBanner(){S.warningBannerCollapsed=!S.warningBannerCollapsed; render();}
function setFilter(f){S.filterAuthor=f; render();}
function openAddSession(){S.newSession={date:today(),author:S.currentUser||'',content:'',media:[],mediaUrls:['','']}; S.showAddSession=true; render();}

// ============ 운동 빠른추가 픽커 ============
function openExercisePicker(){
  S.exercisePicker = {open:true, query:'', category:'all', selected:[]};
  render();
  setTimeout(function(){
    var inp = document.querySelector('.ex-picker-search input');
    if(inp) inp.focus();
  }, 50);
}
function closeExercisePicker(){
  S.exercisePicker.open = false;
  render();
}
function updateExerciseQuery(v){
  S.exercisePicker.query = v;
  render();
  setTimeout(function(){
    var inp = document.querySelector('.ex-picker-search input');
    if(inp){ inp.focus(); var l=inp.value.length; try{inp.setSelectionRange(l,l);}catch(e){} }
  }, 10);
}
function setExerciseCategory(c){
  S.exercisePicker.category = c;
  render();
}
function toggleExerciseSelect(idx){
  var ex = EXERCISES[idx];
  if(!ex) return;
  var list = S.exercisePicker.selected;
  var found = list.findIndex(function(x){return x.n===ex.n;});
  if(found >= 0){
    list.splice(found, 1);
  } else {
    list.push({n:ex.n, s:ex.s, sets:ex.ds, reps:ex.dr, u:ex.u});
  }
  render();
}
function updateSelectedEx(i, key, v){
  var item = S.exercisePicker.selected[i];
  if(!item) return;
  var n = parseInt(v, 10);
  if(isFinite(n) && n>0) item[key] = n;
  // 재렌더 없이 값만 업데이트 — 입력 포커스 유지 위해
}
function removeSelectedEx(i){
  S.exercisePicker.selected.splice(i, 1);
  render();
}
function applyExercisePicker(){
  var sel = S.exercisePicker.selected;
  if(!sel.length){ closeExercisePicker(); return; }
  var lines = sel.map(function(x){
    var unit = x.u==='sec'?'초':x.u==='min'?'분':'회';
    return '• '+x.n+' ('+x.s+') '+x.sets+'×'+x.reps+unit;
  });
  var existing = (S.newSession.content||'').trim();
  S.newSession.content = existing ? (existing + '\n' + lines.join('\n')) : lines.join('\n');
  closeExercisePicker();
}

function renderExercisePicker(){
  if(!S.exercisePicker || !S.exercisePicker.open) return '';
  var p = S.exercisePicker;
  var filtered = EXERCISES.map(function(ex, i){return {ex:ex, i:i};}).filter(function(x){
    if(p.category!=='all' && x.ex.c!==p.category) return false;
    return matchExercise(x.ex, p.query);
  });
  var catCounts = {all:EXERCISES.length, weight:0, golf_fit:0, golf_skill:0};
  EXERCISES.forEach(function(e){ catCounts[e.c] = (catCounts[e.c]||0)+1; });
  return '<div class="modal-overlay ex-picker-overlay" onclick="if(event.target===this)closeExercisePicker()">'+
    '<div class="modal ex-picker">'+
      '<div class="ex-picker-hd">'+
        '<div class="ex-picker-title">운동 빠른추가</div>'+
        '<button class="modal-close" onclick="closeExercisePicker()">×</button>'+
      '</div>'+
      '<div class="ex-picker-search">'+
        '<input class="form-input" placeholder="이름/부위/영문 검색 (예: 스쿼트, 하체, squat, ㅅㅋㅌ)" value="'+(p.query||'').replace(/"/g,'&quot;')+'" oninput="updateExerciseQuery(this.value)">'+
      '</div>'+
      '<div class="ex-picker-tabs">'+
        '<button class="ex-tab '+(p.category==='all'?'active':'')+'" onclick="setExerciseCategory(\'all\')">전체 <span>'+catCounts.all+'</span></button>'+
        '<button class="ex-tab '+(p.category==='weight'?'active':'')+'" onclick="setExerciseCategory(\'weight\')">💪 웨이트 <span>'+catCounts.weight+'</span></button>'+
        '<button class="ex-tab '+(p.category==='golf_fit'?'active':'')+'" onclick="setExerciseCategory(\'golf_fit\')">🏌️ 골프피트 <span>'+catCounts.golf_fit+'</span></button>'+
        '<button class="ex-tab '+(p.category==='golf_skill'?'active':'')+'" onclick="setExerciseCategory(\'golf_skill\')">⛳ 골프스킬 <span>'+catCounts.golf_skill+'</span></button>'+
      '</div>'+
      '<div class="ex-picker-list">'+
        (filtered.length===0 ?
          '<div class="ex-empty">검색 결과가 없습니다</div>' :
          filtered.map(function(o){
            var ex = o.ex;
            var sel = p.selected.find(function(x){return x.n===ex.n;});
            var diff = ['', '초급', '중급', '고급'][ex.d||1];
            return '<div class="ex-item'+(sel?' selected':'')+'" onclick="toggleExerciseSelect('+o.i+')">'+
              '<div class="ex-col">'+
                '<div class="ex-name">'+ex.n+'</div>'+
                '<div class="ex-meta"><span class="ex-sub">'+ex.s+'</span> · '+ex.f+'</div>'+
              '</div>'+
              '<div class="ex-right">'+
                '<div class="ex-diff d'+(ex.d||1)+'">'+diff+'</div>'+
                (sel ? '<div class="ex-check">✓</div>' : '')+
              '</div>'+
            '</div>';
          }).join('')
        )+
      '</div>'+
      (p.selected.length>0 ?
        '<div class="ex-selected-box">'+
          '<div class="ex-selected-title">선택된 '+p.selected.length+'개</div>'+
          p.selected.map(function(s, i){
            var unit = s.u==='sec'?'초':s.u==='min'?'분':'회';
            return '<div class="ex-sel-row">'+
              '<span class="ex-sel-name">'+s.n+'</span>'+
              '<input class="ex-sel-num" type="number" value="'+s.sets+'" min="1" max="99" onchange="updateSelectedEx('+i+',\'sets\',this.value)">'+
              '<span class="ex-sel-x">세트 ×</span>'+
              '<input class="ex-sel-num" type="number" value="'+s.reps+'" min="1" max="999" onchange="updateSelectedEx('+i+',\'reps\',this.value)">'+
              '<span class="ex-sel-x">'+unit+'</span>'+
              '<button class="ex-sel-rm" onclick="event.stopPropagation();removeSelectedEx('+i+')">×</button>'+
            '</div>';
          }).join('')+
        '</div>' : ''
      )+
      '<div class="ex-picker-ft">'+
        '<button class="btn" onclick="closeExercisePicker()">취소</button>'+
        '<button class="btn primary"'+(p.selected.length===0?' disabled':'')+' onclick="applyExercisePicker()">선택 '+p.selected.length+'개 추가</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function openAddMember(){S.newMember={name:'',phone:'',email:'',registeredDate:today(),golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',golfLessonExpiry:'',golfPTExpiry:'',assignedTo:[],memberType:S.sidebarTab||'pt_lesson',handicap:'',avgScore:'',goal:'',focusPoints:''}; S.editMemberId=null; S.showAddMember=true; render();}
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
    expiry:m.expiry||'',
    golfLessonExpiry:m.golfLessonExpiry||m.expiry||'',
    golfPTExpiry:m.golfPTExpiry||'',
    assignedTo:(m.assignedTo||[]).slice(),
    memberType:m.memberType||'pt_lesson',
    handicap:m.handicap||'', avgScore:m.avgScore||'',
    goal:m.goal||'', focusPoints:m.focusPoints||''
  };
  S.editMemberId=id; S.showAddMember=true; render();
}
function saveMemberEdit(){
  var nm=S.newMember.name.trim();if(!nm){alert('이름을 입력하세요');return;}
  var m=S.members.find(function(x){return x.id===S.editMemberId;});
  if(!m)return;
  var before={name:m.name,phone:m.phone,email:m.email,expiry:m.expiry};
  var oldAssigned = (m.assignedTo||[]).slice();
  m.name=nm;m.phone=S.newMember.phone;m.email=S.newMember.email;
  m.registeredDate=S.newMember.registeredDate;
  m.golfLessonCount=S.newMember.golfLessonCount;m.golfPTCount=S.newMember.golfPTCount;
  m.golfLessonAmount=S.newMember.golfLessonAmount;m.golfPTAmount=S.newMember.golfPTAmount;
  m.expiry=S.newMember.expiry;
  m.golfLessonExpiry=S.newMember.golfLessonExpiry||'';
  m.golfPTExpiry=S.newMember.golfPTExpiry||'';
  m.assignedTo=S.newMember.assignedTo||[];
  m.memberType=S.newMember.memberType||'pt_lesson';
  m.handicap=S.newMember.handicap;m.avgScore=S.newMember.avgScore;
  m.goal=S.newMember.goal;m.focusPoints=S.newMember.focusPoints;
  // 담당자 변경 감지 → 인수인계 자동 생성
  var newAssigned = m.assignedTo;
  var removed = oldAssigned.filter(function(n){return newAssigned.indexOf(n)===-1;});
  var added = newAssigned.filter(function(n){return oldAssigned.indexOf(n)===-1;});
  if(removed.length>0 || added.length>0){
    generateHandover(S.editMemberId, removed.length>0?removed:oldAssigned, added.length>0?added:newAssigned);
  }
  var editId = S.editMemberId;
  S.editMemberId=null; S.showAddMember=false;
  logActivity('회원 수정', editId, nm);
  logAudit('member','회원 수정',nm,{before:before,after:{name:m.name,phone:m.phone,email:m.email,expiry:m.expiry}});
  save(); render(); cloud.upsertMember(m);
}
// ============ 인수인계 시스템 ============
function generateHandover(memberId, removedInstructors, addedInstructors){
  var m = S.members.find(function(x){return x.id===memberId;});
  if(!m) return;
  var allSess = (S.sessions[memberId]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var assess = S.assessments[memberId]||{};
  // 최근 10개 세션 요약
  var recentSessions = allSess.slice(0,10).map(function(s){
    return s.date+' ('+s.author+'): '+s.content.slice(0,80)+(s.content.length>80?'…':'');
  });
  // 체형평가 경고 항목
  var warnings = ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && (v.result==='제한'||v.result==='주의 필요');
  }).map(function(item){
    return item.name+' ['+assess[item.key].result+'] → '+(BODY_SWING_MAP[item.key]||'');
  });
  // 체형평가 요약 (비정상 항목만)
  var assessSummary = ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && v.result && v.result!=='미검사' && v.result!=='정상';
  }).map(function(item){
    var v = assess[item.key];
    return item.name+': '+v.result+(v.note?' ('+v.note+')':'');
  });
  // 스윙 영상 링크 (최근 세션에서 영상 포함된 것)
  var videoSessions = allSess.filter(function(s){return s.media && s.media.length>0;}).slice(0,5);
  var videoLinks = videoSessions.map(function(s){
    return s.date+' ('+s.author+') — 영상 '+s.media.length+'개';
  });
  var summary = {
    memberName: m.name,
    date: today(),
    from: removedInstructors,
    to: addedInstructors,
    totalSessions: allSess.length,
    proSessions: allSess.filter(function(s){return getRole(s.author)==='pro';}).length,
    trainerSessions: allSess.filter(function(s){return getRole(s.author)==='trainer';}).length,
    recentSessions: recentSessions,
    assessDate: assess._date||'미기록',
    assessSummary: assessSummary,
    warnings: warnings,
    videoLinks: videoLinks
  };
  if(!S.handovers[memberId]) S.handovers[memberId] = [];
  S.handovers[memberId].push(summary);
  logActivity('인수인계 생성', memberId, removedInstructors.join(',')+' → '+addedInstructors.join(','));
  save();
}
function openHandover(memberId){S.showHandover=memberId; render();}
function closeHandover(){S.showHandover=null; render();}
function renderHandoverModal(){
  var mid = S.showHandover;
  if(!mid) return '';
  var list = (S.handovers[mid]||[]).slice().reverse();
  if(list.length===0) return '';
  return `<div class="modal-overlay" onclick="if(event.target===this)closeHandover()">
    <div class="modal" style="width:600px;max-height:90vh;overflow-y:auto">
      <div class="modal-title">📋 인수인계 기록 — ${list[0].memberName}</div>
      ${list.map(function(h,i){
        return '<div class="handover-card'+(i===0?' latest':'')+'">'+
          '<div class="ho-header">'+
            '<span class="ho-date">'+h.date+'</span>'+
            '<span class="ho-badge">'+h.from.join(', ')+' → '+h.to.join(', ')+'</span>'+
          '</div>'+
          '<div class="ho-section"><strong>세션 현황:</strong> 총 '+h.totalSessions+'회 (프로 '+h.proSessions+' / PT '+h.trainerSessions+')</div>'+
          (h.warnings.length>0?'<div class="ho-section ho-warn"><strong>⚠ Body-Swing 주의 항목:</strong><ul>'+h.warnings.map(function(w){return '<li>'+w+'</li>';}).join('')+'</ul></div>':'')+
          (h.assessSummary.length>0?'<div class="ho-section"><strong>체형평가 이상 소견 ('+h.assessDate+'):</strong><ul>'+h.assessSummary.map(function(a){return '<li>'+a+'</li>';}).join('')+'</ul></div>':'')+
          '<div class="ho-section"><strong>최근 세션 (최대 10개):</strong><ol>'+h.recentSessions.map(function(s){return '<li>'+s+'</li>';}).join('')+'</ol></div>'+
          (h.videoLinks.length>0?'<div class="ho-section"><strong>최근 스윙 영상:</strong><ul>'+h.videoLinks.map(function(v){return '<li>'+v+'</li>';}).join('')+'</ul></div>':'')+
        '</div>';
      }).join('<hr style="border:none;border-top:1px dashed #ddd;margin:16px 0">')}
      <div class="modal-actions"><button class="btn" onclick="closeHandover()">닫기</button></div>
    </div>
  </div>`;
}

// ============ 회원 리포트 (HTML → 인쇄/PDF) ============
// ============ 간편 레슨 노트 ============
const LESSON_TAGS = ['드라이버','우드','아이언','웨지','퍼팅','숏게임','벙커','어프로치','그립','셋업','백스윙','다운스윙','임팩트','피니시','템포','멘탈'];
function openQuickNote(){
  S.showQuickNote=true;
  S.quickNote={date:today(),memo:'',tags:[],author:S.currentUser||''};
  render();
}
function closeQuickNote(){S.showQuickNote=false;render();}
function toggleQTag(tag){
  var idx=S.quickNote.tags.indexOf(tag);
  if(idx===-1) S.quickNote.tags.push(tag); else S.quickNote.tags.splice(idx,1);
  render();
}
function saveQuickNote(){
  if(!S.quickNote.memo.trim()){alert('메모를 입력하세요');return;}
  var mid=S.selectedMember;
  if(!S.sessions[mid]) S.sessions[mid]=[];
  var tagStr=S.quickNote.tags.length>0?' #'+S.quickNote.tags.join(' #'):'';
  var s={
    id:suid(), date:S.quickNote.date, author:S.quickNote.author,
    content:S.quickNote.memo.trim()+tagStr,
    _addedAt:new Date().toISOString(), _quickNote:true
  };
  S.sessions[mid].push(s);
  logActivity('레슨 노트',mid,s.content.slice(0,40));
  save(); S.showQuickNote=false; render();
  cloud.upsertSession(mid,s);
}
function renderQuickNoteModal(){
  if(!S.showQuickNote) return '';
  var m=S.members.find(function(x){return x.id===S.selectedMember;});
  return `<div class="modal-overlay" onclick="if(event.target===this)closeQuickNote()">
    <div class="modal" style="width:440px">
      <div class="modal-title">📝 레슨 노트 — ${m?m.name+' 회원님':''}</div>
      <div class="form-group">
        <label class="form-label">날짜</label>
        <input type="date" class="form-input" value="${S.quickNote.date}" onchange="S.quickNote.date=this.value">
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" rows="3" placeholder="오늘 레슨 내용을 간단히..." oninput="S.quickNote.memo=this.value" autofocus>${S.quickNote.memo}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">태그</label>
        <div class="qtag-grid">${LESSON_TAGS.map(function(t){
          var sel=S.quickNote.tags.indexOf(t)!==-1;
          return '<span class="qtag'+(sel?' sel':'')+'" onclick="toggleQTag(\''+t+'\')">'+t+'</span>';
        }).join('')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeQuickNote()">취소</button>
        <button class="btn primary" onclick="saveQuickNote()">저장</button>
      </div>
    </div>
  </div>`;
}

// ============ 이미지 카드 (카카오톡 공유용) ============
function openImageCard(){S.showImageCard=true;render();}
function closeImageCard(){S.showImageCard=false;render();}
function generateImageCard(){
  var mid=S.selectedMember;
  var m=S.members.find(function(x){return x.id===mid;});
  if(!m) return;
  var allSess=(S.sessions[mid]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var thisMonth=today().slice(0,7);
  var monthSess=allSess.filter(function(s){return s.date.slice(0,7)===thisMonth;});
  var canvas=document.createElement('canvas');
  canvas.width=720; canvas.height=960;
  var ctx=canvas.getContext('2d');
  // 배경
  ctx.fillStyle='#f5f5f0'; ctx.fillRect(0,0,720,960);
  // 상단 바
  ctx.fillStyle='#1a3d2b'; ctx.fillRect(0,0,720,120);
  ctx.fillStyle='#fff'; ctx.font='bold 28px -apple-system,sans-serif';
  ctx.fillText('내셔널짐 Golf Lesson',40,50);
  ctx.font='16px -apple-system,sans-serif';
  ctx.fillText('월간 레슨 리포트 · '+today(),40,85);
  // 회원 정보
  var y=160;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 32px -apple-system,sans-serif';
  ctx.fillText(m.name+' 회원님',40,y); y+=45;
  ctx.fillStyle='#555'; ctx.font='18px -apple-system,sans-serif';
  if(m.handicap||m.avgScore){
    ctx.fillText('HC '+(m.handicap||'-')+' · 평균 '+(m.avgScore||'-')+'타',40,y); y+=35;
  }
  if(m.goal){
    ctx.fillText('🏁 목표: '+m.goal,40,y); y+=35;
  }
  if(m.focusPoints){
    ctx.fillText('🎯 교정: '+m.focusPoints,40,y); y+=35;
  }
  // 구분선
  y+=10;
  ctx.strokeStyle='#d4cfc4'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(680,y); ctx.stroke(); y+=30;
  // 이번 달 레슨
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 22px -apple-system,sans-serif';
  ctx.fillText('이번 달 레슨: '+monthSess.length+'회',40,y); y+=35;
  ctx.fillStyle='#333'; ctx.font='16px -apple-system,sans-serif';
  var shownSess=monthSess.slice(0,6);
  shownSess.forEach(function(s){
    var line=s.date.slice(5)+' — '+s.content.slice(0,40)+(s.content.length>40?'…':'');
    ctx.fillText(line,50,y); y+=28;
  });
  if(monthSess.length>6){ctx.fillText('... 외 '+(monthSess.length-6)+'건',50,y); y+=28;}
  // 구분선
  y+=10;
  ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(680,y); ctx.stroke(); y+=30;
  // 전체 레슨 현황
  var totalUsed=allSess.length;
  var totalReg=parseInt(m.golfLessonCount)||0;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 20px -apple-system,sans-serif';
  ctx.fillText('전체 진행: '+totalUsed+' / '+totalReg+'회',40,y); y+=30;
  // 진행률 바
  var pct=totalReg>0?Math.min(1,totalUsed/totalReg):0;
  ctx.fillStyle='#e0ddc8'; roundRect(ctx,40,y,640,20,10); ctx.fill();
  ctx.fillStyle='#2d7a4f'; roundRect(ctx,40,y,Math.max(20,640*pct),20,10); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 12px -apple-system,sans-serif';
  ctx.fillText(Math.round(pct*100)+'%',40+640*pct/2-10,y+15); y+=45;
  // 하단
  ctx.fillStyle='#999'; ctx.font='13px -apple-system,sans-serif';
  ctx.fillText('내셔널짐 Golf PT Collaboration · '+today(),40,920);
  // 다운로드
  canvas.toBlob(function(blob){
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download=m.name+'_레슨카드_'+today()+'.png';
    a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},200);
  },'image/png');
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function renderImageCardModal(){
  if(!S.showImageCard) return '';
  var m=S.members.find(function(x){return x.id===S.selectedMember;});
  if(!m) return '';
  return `<div class="modal-overlay" onclick="if(event.target===this)closeImageCard()">
    <div class="modal" style="width:400px">
      <div class="modal-title">🖼️ 이미지 카드 생성</div>
      <p style="font-size:13px;color:#555;margin-bottom:16px">${m.name} 회원님의 월간 레슨 리포트를 이미지로 다운로드합니다.<br>길게 눌러 카카오톡으로 공유하세요.</p>
      <div class="modal-actions">
        <button class="btn" onclick="closeImageCard()">취소</button>
        <button class="btn primary" onclick="generateImageCard();closeImageCard()">📥 이미지 다운로드</button>
      </div>
    </div>
  </div>`;
}

function openReport(){S.showReport=true; render();}
function closeReport(){S.showReport=false; render();}
function printReport(){
  var el = document.getElementById('report-print-area');
  if(!el) return;
  var win = window.open('','_blank','width=800,height=1100');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>회원 리포트</title>');
  win.document.write('<style>');
  win.document.write('*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;padding:30px;color:#222;font-size:13px;line-height:1.6}');
  win.document.write('.rpt-header{text-align:center;border-bottom:2px solid #2d5016;padding-bottom:15px;margin-bottom:20px}');
  win.document.write('.rpt-header h1{font-size:20px;color:#2d5016}.rpt-header p{font-size:12px;color:#666}');
  win.document.write('.rpt-member-info{background:#f5f5f0;padding:14px;border-radius:8px;margin-bottom:18px}');
  win.document.write('.rpt-member-info td{padding:3px 12px 3px 0;font-size:13px}');
  win.document.write('.rpt-section{margin-bottom:18px}.rpt-section h2{font-size:15px;color:#2d5016;border-bottom:1px solid #ccc;padding-bottom:5px;margin-bottom:8px}');
  win.document.write('table.rpt-table{width:100%;border-collapse:collapse;font-size:12px}');
  win.document.write('table.rpt-table th,table.rpt-table td{border:1px solid #ddd;padding:5px 8px;text-align:left}');
  win.document.write('table.rpt-table th{background:#eee8d5;font-weight:600}');
  win.document.write('.warn-row{background:#fff3e0}.rpt-footer{margin-top:30px;text-align:center;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:10px}');
  win.document.write('@media print{body{padding:15px}@page{margin:15mm}}');
  win.document.write('</style></head><body>');
  win.document.write(el.innerHTML);
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.print();},300);
}
function renderReportModal(){
  if(!S.showReport) return '';
  var mid = S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m) return '';
  var allSess = (S.sessions[mid]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var assess = S.assessments[mid]||{};
  var st = stats(mid);
  var recentSess = allSess.slice(0,20);
  var assessRows = ASSESSMENT_ITEMS.map(function(item){
    var v = assess[item.key]||{result:'미검사',note:''};
    var isWarn = v.result!=='정상'&&v.result!=='미검사';
    return '<tr class="'+(isWarn?'warn-row':'')+'"><td>'+item.name+'</td><td>'+v.result+'</td><td>'+(v.note||'-')+'</td>'+(isWarn&&BODY_SWING_MAP[item.key]?'<td style="font-size:11px;color:#993c1d">'+BODY_SWING_MAP[item.key]+'</td>':'<td>-</td>')+'</tr>';
  }).join('');
  var sessionRows = recentSess.map(function(s){
    return '<tr><td>'+s.date+'</td><td><span style="font-weight:600;color:'+(getRole(s.author)==='pro'?'#3a72c0':'#2d7a4f')+'">'+(getRole(s.author)==='pro'?'프로':'PT')+'</span> '+s.author+'</td><td>'+s.content.replace(/</g,'&lt;').slice(0,120)+(s.content.length>120?'…':'')+'</td></tr>';
  }).join('');

  return `<div class="modal-overlay" onclick="if(event.target===this)closeReport()">
    <div class="modal" style="width:720px;max-height:90vh;overflow-y:auto">
      <div class="modal-title">📄 회원 리포트 미리보기</div>
      <div id="report-print-area">
        <div class="rpt-header">
          <h1>내셔널짐 Golf PT 회원 리포트</h1>
          <p>출력일: ${today()} | 담당: ${(m.assignedTo||[]).join(', ')||'미배정'}</p>
        </div>
        <div class="rpt-member-info">
          <table><tr><td><strong>회원명</strong></td><td>${m.name}</td><td><strong>연락처</strong></td><td>${m.phone||'-'}</td></tr>
          <tr><td><strong>등록일</strong></td><td>${m.registeredDate||'-'}</td><td><strong>레슨 유효기간</strong></td><td>${m.golfLessonExpiry||m.expiry||'-'}</td></tr>
          ${(m.memberType||'pt_lesson')==='pt_lesson'?'<tr><td></td><td></td><td><strong>PT 유효기간</strong></td><td>'+(m.golfPTExpiry||'-')+'</td></tr>':''}
          <tr><td><strong>골프 레슨</strong></td><td>${st?st.pro:0}/${m.golfLessonCount||0}회</td><td><strong>골프 PT</strong></td><td>${st?st.trainer:0}/${m.golfPTCount||0}회</td></tr></table>
        </div>
        <div class="rpt-section">
          <h2>체형 기능 평가${assess._date?' ('+assess._date+')':''}</h2>
          <table class="rpt-table"><thead><tr><th>항목</th><th>결과</th><th>특이사항</th><th>스윙 연관성</th></tr></thead><tbody>${assessRows}</tbody></table>
        </div>
        <div class="rpt-section">
          <h2>세션 기록 (최근 ${recentSess.length}건 / 총 ${allSess.length}건)</h2>
          <table class="rpt-table"><thead><tr><th style="width:90px">날짜</th><th style="width:130px">담당</th><th>내용</th></tr></thead><tbody>${sessionRows}</tbody></table>
        </div>
        <div class="rpt-footer">본 리포트는 내셔널짐 Golf PT Collaboration 시스템에서 자동 생성되었습니다.</div>
      </div>
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn" onclick="closeReport()">닫기</button>
        <button class="btn primary" onclick="printReport()">🖨️ 인쇄 / PDF 저장</button>
      </div>
    </div>
  </div>`;
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
function closeModal(){S.showAddSession=false; S.showAddMember=false; S.showActivityLog=false; S.editMemberId=null; S.editSessionId=null; render();}
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
    media: media.length>0 ? media : undefined,
    _addedAt: new Date().toISOString()
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

// ============ 세션 수정 ============
function openEditSession(sid){
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(s){return s.id===sid;});
  if(!sess) return;
  S.editSessionId = sid;
  S.newSession = {
    date: sess.date,
    author: sess.author,
    content: sess.content,
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
  sess.content = S.newSession.content.trim();
  sess.media = (S.newSession.media||[]).slice();
  logActivity('세션 수정', mid, sess.content.slice(0,40));
  logAudit('session','세션 수정',(S.members.find(function(x){return x.id===mid;})||{}).name||'',{date:sess.date,content:sess.content.slice(0,80)});
  S.editSessionId = null;
  S.showAddSession = false;
  save(); render();
  cloud.upsertSession(mid, sess);
}

// ============ 대시보드 ============
function openDashboard(){S.showDashboard=true;S.selectedMember=null;render();}
function closeDashboard(){S.showDashboard=false;render();}
function renderDashboard(){
  if(!S.showDashboard) return '';
  var isInfo = S.currentRole==='infodesk'||S.currentRole==='admin';
  var visibleMembers = S.members.filter(function(m){
    if(isInfo) return true;
    return m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1;
  });
  var totalMembers = visibleMembers.length;
  var totalSessions = 0;
  var proSessions = 0;
  var trainerSessions = 0;
  var thisMonthSessions = 0;
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
      recentActivity.push({member:m.name, date:s.date, author:s.author, content:s.content});
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
  recentActivity.sort(function(a,b){return b.date.localeCompare(a.date);});
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

  return `
  <div class="dashboard">
    <div class="dash-header">
      <h2>📊 대시보드</h2>
      <button class="btn" onclick="closeDashboard()">닫기</button>
    </div>
    <div class="dash-stats">
      <div class="dash-stat"><div class="ds-val">${totalMembers}</div><div class="ds-lbl">회원</div></div>
      <div class="dash-stat"><div class="ds-val">${totalSessions}</div><div class="ds-lbl">총 세션</div></div>
      <div class="dash-stat"><div class="ds-val blue">${thisMonthSessions}</div><div class="ds-lbl">이번 달</div></div>
      <div class="dash-stat"><div class="ds-val green">${proSessions}</div><div class="ds-lbl">프로 세션</div></div>
      <div class="dash-stat"><div class="ds-val amber">${trainerSessions}</div><div class="ds-lbl">PT 세션</div></div>
    </div>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>지도자별 세션</h3>
        <div class="dash-bar-list">${Object.keys(instructorStats).map(function(name){
          var cnt = instructorStats[name];
          var pct = totalSessions>0?Math.round(cnt/totalSessions*100):0;
          return '<div class="dash-bar-row"><span class="dbr-name">'+name+'</span><div class="dbr-bar-wrap"><div class="dbr-bar '+(name.indexOf('프로')!==-1?'pro':'trainer')+'" style="width:'+pct+'%"></div></div><span class="dbr-cnt">'+cnt+'</span></div>';
        }).join('')}</div>
      </div>
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
          return '<div class="dash-recent-item"><span class="dr-date">'+a.date+'</span><span class="dr-member">'+a.member+'</span><span class="dr-author role-tag '+(getRole(a.author)==='pro'?'pro':'trainer')+'">'+(getRole(a.author)==='pro'?'PRO':'PT')+'</span><span class="dr-content">'+a.content.slice(0,50)+(a.content.length>50?'…':'')+'</span></div>';
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
  cloud.upsertMember(m);
}

// ============ 영상 압축 (업로드 전 재인코딩) ============
// 원본 영상을 canvas 기반으로 재인코딩해 파일 크기를 줄입니다.
// 목표: 최대 1280px, 2.5Mbps → 일반적으로 10-20MB → 2-4MB.
// 실패하거나 지원 안되면 원본을 그대로 반환합니다.
async function compressVideo(file, opts, onProgress){
  try{
    if(typeof MediaRecorder === 'undefined') return file;
    opts = opts || {};
    var maxWidth = opts.maxWidth || 1280;
    var bitrate = opts.bitrate || 2500000;

    // MediaRecorder 지원 MIME 탐색
    var mimes = ['video/mp4;codecs=h264','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    var mime = null;
    for(var i=0;i<mimes.length;i++){
      if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mimes[i])){ mime = mimes[i]; break; }
    }
    if(!mime) return file;

    var url = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline','');
    video.setAttribute('webkit-playsinline','');
    video.preload = 'auto';

    await new Promise(function(resolve, reject){
      var to = setTimeout(function(){reject(new Error('meta timeout'));}, 15000);
      video.onloadedmetadata = function(){ clearTimeout(to); resolve(); };
      video.onerror = function(){ clearTimeout(to); reject(new Error('meta error')); };
    });

    var vw = video.videoWidth||0, vh = video.videoHeight||0;
    if(!vw || !vh){ URL.revokeObjectURL(url); return file; }
    var scale = Math.min(1, maxWidth/Math.max(vw,vh));
    var w = Math.max(2, Math.round(vw*scale));
    var h = Math.max(2, Math.round(vh*scale));
    if(w%2) w++; if(h%2) h++;

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', {alpha:false});

    if(!canvas.captureStream){ URL.revokeObjectURL(url); return file; }
    var stream = canvas.captureStream(30);
    var recorder = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond:bitrate});
    var chunks = [];
    recorder.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
    var done = new Promise(function(r){ recorder.onstop = r; });
    recorder.start();

    try{ await video.play(); }catch(e){ URL.revokeObjectURL(url); return file; }

    var duration = video.duration || 0;
    await new Promise(function(resolve){
      var raf = function(){
        if(video.ended || video.paused){ resolve(); return; }
        try{ ctx.drawImage(video, 0, 0, w, h); }catch(e){}
        if(onProgress && duration>0) onProgress(Math.min(1, video.currentTime/duration));
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });

    try{ recorder.stop(); }catch(e){}
    await done;
    URL.revokeObjectURL(url);

    var out = new Blob(chunks, {type: mime});
    if(!out.size || out.size >= file.size) return file; // 압축 실패 시 원본 유지
    // 파일 확장자 조정
    var ext = mime.indexOf('mp4')!==-1 ? '.mp4' : '.webm';
    var base = (file.name||'video').replace(/\.[^.]+$/,'');
    return new File([out], base+ext, {type: mime});
  }catch(e){
    console.warn('[compress] 실패 — 원본 사용:', e);
    return file;
  }
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
    var origFile = files[i];
    if(origFile.size > MAX_FILE_SIZE){
      alert(origFile.name+' : '+(origFile.size/1024/1024).toFixed(1)+'MB\n파일당 최대 100MB까지 가능합니다.');
      continue;
    }
    S.uploading++;
    S.uploadMsg = '영상 압축 중...';
    render();
    // 1) 영상 압축 (비디오일 때만). 이미지/작은 파일/미지원 브라우저면 원본 유지
    var file = origFile;
    if((origFile.type||'').indexOf('video/')===0 && origFile.size > 1*1024*1024){
      try{
        file = await compressVideo(origFile, {maxWidth:1280, bitrate:2500000}, function(p){
          S.uploadMsg = '영상 압축 중... '+Math.floor(p*100)+'%';
          render();
        });
      }catch(e){ file = origFile; }
    }
    S.uploadMsg = '저장 중...';
    render();
    var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    var saved = await mediaDB.put(mediaId, file, {mimeType:file.type, name:file.name});
    S.uploading--;
    S.uploadMsg = '';
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
    var mediaItem = {type:'file', view:view||'other', name:file.name, mimeType:file.type, size:file.size, mediaId:mediaId};
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
            if(stored) cloud.upsertSession(sid, stored);
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
  S.uploadMsg = '영상 압축 중...';
  render();
  var processed = file;
  if((file.type||'').indexOf('video/')===0 && file.size > 1*1024*1024){
    try{
      processed = await compressVideo(file, {maxWidth:1280, bitrate:2500000}, function(p){
        S.uploadMsg = '영상 압축 중... '+Math.floor(p*100)+'%';
        render();
      });
    }catch(e){ processed = file; }
  }
  S.uploadMsg = '저장 중...';
  render();
  var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  var saved = await mediaDB.put(mediaId, processed, {mimeType:processed.type, name:file.name});
  S.uploading--;
  S.uploadMsg = '';
  if(!saved){alert(file.name+' 저장 실패'); render(); return;}
  try{S.mediaUrls[mediaId] = URL.createObjectURL(processed);}catch(e){}
  var mediaItem = {type:'file', view:view, name:file.name, mimeType:processed.type, size:processed.size, mediaId:mediaId};
  if(r2.enabled){
    mediaItem.r2Key = mediaId;
    mediaItem.r2Status = 'uploading';
    (function(item, blob){
      r2.upload(mediaId, blob).then(function(ok){
        item.r2Status = ok ? 'synced' : 'failed';
        render();
      });
    })(mediaItem, processed);
  }
  S.newSession.media.push(mediaItem);
  render();
}
async function removeMediaFile(idx){
  var m = S.newSession.media[idx];
  if(m && m.mediaId){
    await mediaDB.del(m.mediaId);
    await mediaDB.delAnalysis(m.mediaId);
    if(m.r2Key || m.mediaId) r2.remove(m.r2Key||m.mediaId);
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
  var sampleRate = 10; // 10 fps (속도 우선)
  var step = 1/sampleRate;
  var frames = [];

  // 다운샘플 분석용 캔버스 — 원본이 클수록 추론이 느려지므로 480px 폭으로 축소
  var maxW = 480;
  var vw = video.videoWidth || 640;
  var vh = video.videoHeight || 360;
  var scale = Math.min(1, maxW/vw);
  var cw = Math.max(1, Math.round(vw*scale));
  var ch = Math.max(1, Math.round(vh*scale));
  var analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = cw;
  analysisCanvas.height = ch;
  var actx = analysisCanvas.getContext('2d', {willReadFrequently:true});
  // 어두운 영상 대응 — 밝기/대비 약간 증가
  try{ actx.filter = 'brightness(1.18) contrast(1.08) saturate(1.0)'; }catch(e){}

  // Promise 기반 onResults
  var resolveResults = null;
  pose.onResults(function(r){ if(resolveResults){ var f=resolveResults; resolveResults=null; f(r); } });

  video.pause();
  var t = 0;
  var frameWaitMs = (typeof video.requestVideoFrameCallback === 'function') ? 0 : 50;
  while(t < duration){
    // Seek
    await new Promise(function(resolve){
      var handler = function(){video.removeEventListener('seeked', handler); resolve();};
      video.addEventListener('seeked', handler);
      try{video.currentTime = t;}catch(e){resolve();}
    });
    // 프레임이 실제로 디코딩 될 때까지 대기 (rVFC 있으면 정확히 다음 페인트 프레임)
    if(video.requestVideoFrameCallback){
      await new Promise(function(r){ video.requestVideoFrameCallback(function(){r();}); });
    } else {
      await new Promise(function(r){setTimeout(r, frameWaitMs);});
    }
    // 다운샘플 캔버스에 그리기 (+ 밝기 보정)
    try{ actx.drawImage(video, 0, 0, cw, ch); }catch(e){}
    // 자세 추출
    var results = await new Promise(function(resolve){
      resolveResults = resolve;
      try{pose.send({image: analysisCanvas});}catch(e){resolve({});}
      // timeout — 짧게 (800ms)
      setTimeout(function(){if(resolveResults){resolveResults({});resolveResults=null;}}, 800);
    });
    if(results && results.poseLandmarks){
      var metrics = analyzeSwing(results.poseLandmarks);
      if(metrics){
        var lmSlim = results.poseLandmarks.map(function(p){
          return {x:Number(p.x.toFixed(4)), y:Number(p.y.toFixed(4)), v:Number((p.visibility||1).toFixed(2))};
        });
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
  return {frames:frames, duration:duration, sampleRate:sampleRate, version:'v3-fast-lite'};
}

// 분석 캐시의 버전 체크 — 구버전이면 무효
function isAnalysisValid(analysis){
  return analysis && (analysis.version==='v3-fast-lite' || analysis.version==='v2-complexity1') && analysis.frames && analysis.frames.length>0;
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
  // 성능 우선: Lite 모델 + 낮은 감지 임계값 (어두운 영상 / 실내 조명 대응)
  _sharedPose.setOptions({modelComplexity:0, smoothLandmarks:true, enableSegmentation:false, minDetectionConfidence:.3, minTrackingConfidence:.3});
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

// SVG 아이콘 팩토리 — 모든 툴바 버튼에 일관된 스트로크 아이콘 사용
var SP_ICONS = {
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  skeleton:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><line x1="12" y1="6" x2="12" y2="14"/><line x1="6" y1="9" x2="18" y2="9"/><line x1="12" y1="14" x2="7" y2="21"/><line x1="12" y1="14" x2="17" y2="21"/></svg>',
  guide:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="4"/></svg>',
  metrics:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="3" height="7" rx="0.5"/><rect x="10.5" y="8" width="3" height="12" rx="0.5"/><rect x="17" y="4" width="3" height="16" rx="0.5"/></svg>',
  reanalyze:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><polyline points="21 4 21 10 15 10"/></svg>',
  fullscreen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 9 4 4 9 4"/><polyline points="20 9 20 4 15 4"/><polyline points="4 15 4 20 9 20"/><polyline points="20 15 20 20 15 20"/></svg>',
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>'
};

function spBtn(cls, iconKey, label, desc, active){
  return '<button class="sp-btn '+cls+(active?' active':'')+'" type="button" title="'+desc.replace(/"/g,'&quot;')+'" aria-label="'+label+'">'+
    '<span class="sp-ico">'+SP_ICONS[iconKey]+'</span>'+
    '<span class="sp-lbl">'+label+'</span>'+
  '</button>';
}

function renderSwingPlayer(sessionId, mediaIdx, m, src){
  var viewTag = '';
  if(m.view==='front') viewTag = '<div class="sp-view-tag tag-front">정면</div>';
  else if(m.view==='side') viewTag = '<div class="sp-view-tag tag-side">측면</div>';
  if(!src){
    return '<div class="swing-player-missing">'+viewTag.replace('sp-view-tag','spm-tag')+
      '<div class="spm-icon">📹</div>'+
      '<div class="spm-text">이 기기에서 영상을 찾을 수 없습니다</div>'+
      '<div class="spm-sub">영상은 업로드한 기기의 브라우저에만 저장됩니다</div>'+
    '</div>';
  }
  return '<div class="swing-player" data-sid="'+sessionId+'" data-mi="'+mediaIdx+'" data-mediaid="'+(m.mediaId||'')+'">'+
    '<div class="sp-screen">'+
      '<video class="sp-video" src="'+src+'" playsinline webkit-playsinline preload="auto" muted crossorigin="anonymous"></video>'+
      '<canvas class="sp-canvas"></canvas>'+
      viewTag+
      '<div class="sp-loading"><div class="sp-loading-inner"><div class="sp-spinner"></div><div class="sp-loading-text">분석 준비...</div><div class="sp-progress-track"><div class="sp-progress-fill"></div></div></div></div>'+
    '</div>'+
    '<div class="sp-toolbar">'+
      '<div class="sp-scrub-row">'+
        '<input type="range" class="sp-scrub" min="0" max="1000" value="0" step="1" aria-label="재생 위치">'+
        '<span class="sp-time">0:00 / 0:00</span>'+
      '</div>'+
      '<div class="sp-btn-row">'+
        spBtn('sp-play', 'play', '재생', '영상을 재생하거나 일시정지합니다.', false)+
        '<div class="sp-btn-spacer"></div>'+
        spBtn('sp-tgl-skel', 'skeleton', '관절', '관절과 뼈대를 영상 위에 표시합니다. 자세 분석의 기본이 됩니다.', true)+
        spBtn('sp-tgl-guide', 'guide', '기준선', '척추·어깨·골반·수직선을 표시합니다. 체형 정렬 확인에 사용합니다.', true)+
        spBtn('sp-tgl-metrics', 'metrics', '지표', 'X-팩터·척추각·머리이동 등 스윙 지표를 수치로 보여줍니다.', false)+
        spBtn('sp-reanalyze', 'reanalyze', '재분석', '기존 분석을 지우고 처음부터 다시 분석합니다.', false)+
        spBtn('sp-fs', 'fullscreen', '확대', '플레이어를 전체 화면으로 확대합니다.', false)+
        spBtn('sp-help', 'help', '도움', '각 버튼의 기능 설명을 봅니다.', false)+
      '</div>'+
    '</div>'+
    '<div class="sp-metrics-box" style="display:none">'+
      '<div class="sp-metrics-live"></div>'+
      '<div class="sp-metrics-checklist"></div>'+
    '</div>'+
    '<div class="sp-help-box" style="display:none">'+
      '<div class="sp-help-title">버튼 설명</div>'+
      '<div class="sp-help-item"><span class="sp-help-ico">'+SP_ICONS.skeleton+'</span><div><strong>관절</strong>— MediaPipe Pose가 감지한 관절 33개와 연결선을 실시간으로 오버레이합니다. 자세 분석의 기본 레이어입니다.</div></div>'+
      '<div class="sp-help-item"><span class="sp-help-ico">'+SP_ICONS.guide+'</span><div><strong>기준선</strong>— 척추선(분홍), 어깨선(하늘), 골반선(노랑), 수직 기준선(흰 점선)을 추가로 그려 스윙 정렬을 비교할 수 있게 합니다.</div></div>'+
      '<div class="sp-help-item"><span class="sp-help-ico">'+SP_ICONS.metrics+'</span><div><strong>지표</strong>— X-팩터(상/하체 회전차), 척추각, 리드암 각도, 무릎 굴곡, 머리 이동 등 스윙 핵심 수치를 수치 카드로 보여줍니다.</div></div>'+
      '<div class="sp-help-item"><span class="sp-help-ico">'+SP_ICONS.reanalyze+'</span><div><strong>재분석</strong>— 저장된 분석 결과를 삭제하고 전체 영상을 다시 분석합니다. 조명이 어두워 감지에 실패한 경우 다시 시도할 수 있습니다.</div></div>'+
      '<div class="sp-help-item"><span class="sp-help-ico">'+SP_ICONS.fullscreen+'</span><div><strong>확대</strong>— 플레이어를 화면 전체로 확대합니다. 모바일에서는 기본 재생 대신 현재 플레이어를 사용해 스켈레톤 오버레이가 유지됩니다.</div></div>'+
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

  // ===== 보조 드로잉 헬퍼 =====
  function vLine(x, color, dash, width){
    ctx.strokeStyle=color; ctx.lineWidth=width||1.5;
    ctx.setLineDash(dash||[]);
    ctx.beginPath();
    ctx.moveTo(x*canvas.width, 0);
    ctx.lineTo(x*canvas.width, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function hLine(y, color, dash, width){
    ctx.strokeStyle=color; ctx.lineWidth=width||1.5;
    ctx.setLineDash(dash||[]);
    ctx.beginPath();
    ctx.moveTo(0, y*canvas.height);
    ctx.lineTo(canvas.width, y*canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function segLine(a, b, color, dash, width){
    ctx.strokeStyle=color; ctx.lineWidth=width||2;
    ctx.setLineDash(dash||[]);
    ctx.beginPath();
    ctx.moveTo(a.x*canvas.width, a.y*canvas.height);
    ctx.lineTo(b.x*canvas.width, b.y*canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function labelPill(text, cx, y, color){
    // 가운데 정렬 둥근 라벨 (가독성 우선)
    var fontSize = Math.max(13, Math.round(canvas.width/48));
    ctx.font='800 '+fontSize+'px -apple-system,system-ui,sans-serif';
    var pad = Math.round(fontSize*0.55);
    var w = ctx.measureText(text).width + pad*2;
    var h = Math.round(fontSize*1.65);
    var x = cx - w/2;
    // 화면 밖으로 튀어나가지 않게 클램프
    if(x<2) x=2;
    if(x+w>canvas.width-2) x=canvas.width-w-2;
    // 배경
    ctx.fillStyle = 'rgba(0,0,0,.88)';
    if(ctx.roundRect){
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h/2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
    // 테두리
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if(ctx.roundRect){
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h/2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    // 텍스트
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x+pad, y+h/2+1);
    ctx.textBaseline = 'alphabetic';
  }

  // 현재 프레임의 회전 라인 (척추/어깨/힙 세그먼트만 — 수직선 X)
  function drawLiveRotational(lm, view){
    var midHip = {x:(lm[LM.L_HIP].x+lm[LM.R_HIP].x)/2, y:(lm[LM.L_HIP].y+lm[LM.R_HIP].y)/2};
    var midSh = {x:(lm[LM.L_SHOULDER].x+lm[LM.R_SHOULDER].x)/2, y:(lm[LM.L_SHOULDER].y+lm[LM.R_SHOULDER].y)/2};
    // 척추선
    segLine(midHip, midSh, 'rgba(255,64,129,.95)', null, 5);
    // 어깨선
    segLine(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER], 'rgba(64,200,255,.95)', null, 4);
    // 골반선
    segLine(lm[LM.L_HIP], lm[LM.R_HIP], 'rgba(255,200,64,.95)', null, 4);
  }

  // Address + Finish 고정 참조선 — 프레임마다 변하지 않음
  function drawFixedReferences(addrLm, finLm, view){
    var YELLOW = '#ffcc33';
    var CYAN = '#33d9ff';
    var vw = canvas.width;
    var fs = Math.max(13, Math.round(vw/48));
    var topA = 10;
    var topF = topA + Math.round(fs*1.95);
    var topBottom = canvas.height - Math.round(fs*1.95) - 8;
    var topBottomF = topBottom - Math.round(fs*1.95);

    // === ADDRESS 기준선 (노란, 두꺼운 점선) ===
    ctx.save();
    ctx.globalAlpha = 0.82;
    vLine(addrLm[LM.L_HIP].x, YELLOW, [10,5], 4);
    vLine(addrLm[LM.R_HIP].x, YELLOW, [10,5], 4);
    if(view!=='side'){
      vLine(addrLm[LM.NOSE].x, YELLOW, [6,5], 3);
    } else {
      // 측면: 헤드 + 힙 중앙 + 무릎 중앙
      vLine(addrLm[LM.NOSE].x, YELLOW, [6,5], 3);
      var addrMidKnee = (addrLm[LM.L_KNEE].x+addrLm[LM.R_KNEE].x)/2;
      vLine(addrMidKnee, YELLOW, [4,5], 2);
    }
    ctx.restore();

    // === FINISH 기준선 (하늘색, 실선 두꺼움) ===
    ctx.save();
    ctx.globalAlpha = 0.82;
    vLine(finLm[LM.L_HIP].x, CYAN, null, 4);
    vLine(finLm[LM.R_HIP].x, CYAN, null, 4);
    if(view!=='side'){
      vLine(finLm[LM.NOSE].x, CYAN, null, 3);
    } else {
      vLine(finLm[LM.NOSE].x, CYAN, null, 3);
      var finMidKnee = (finLm[LM.L_KNEE].x+finLm[LM.R_KNEE].x)/2;
      vLine(finMidKnee, CYAN, null, 2);
    }
    ctx.restore();

    // === 라벨 (큰 pill — 상단 Address, 하단 Finish) ===
    // Address 라벨 — 상단
    labelPill('L힙 A', addrLm[LM.L_HIP].x*vw, topA, YELLOW);
    labelPill('R힙 A', addrLm[LM.R_HIP].x*vw, topA, YELLOW);
    labelPill('헤드 A', addrLm[LM.NOSE].x*vw, topF, YELLOW);

    // Finish 라벨 — 하단 (영상 내 겹침 방지)
    labelPill('L힙 F', finLm[LM.L_HIP].x*vw, topBottomF, CYAN);
    labelPill('R힙 F', finLm[LM.R_HIP].x*vw, topBottomF, CYAN);
    labelPill('헤드 F', finLm[LM.NOSE].x*vw, topBottom, CYAN);
  }

  function draw(){
    if(!state.analysis || !state.analysis.frames.length){
      if(canvas.width!==video.videoWidth) canvas.width = video.videoWidth||640;
      if(canvas.height!==video.videoHeight) canvas.height = video.videoHeight||480;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      return;
    }
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    var frames = state.analysis.frames;
    var frame = findNearestFrame(frames, video.currentTime);
    if(!frame) return;
    var view = m.view||'front';

    // 1) Address/Finish 고정 참조선 (가이드 ON, 프레임 3개 이상)
    if(state.showGuide && frames.length>3){
      var addrFrame = frames[0];
      var finFrame = frames[frames.length-1];
      if(addrFrame && addrFrame.landmarks && finFrame && finFrame.landmarks){
        drawFixedReferences(addrFrame.landmarks, finFrame.landmarks, view);
      }
    }
    // 2) 현재 프레임 회전 라인 (척추/어깨/골반 세그먼트)
    if(state.showGuide && frame.landmarks){
      drawLiveRotational(frame.landmarks, view);
    }
    // 3) 스켈레톤 (위에 덮어씀)
    if(state.showSkel && typeof drawConnectors!=='undefined'){
      drawConnectors(ctx, frame.landmarks, POSE_CONNECTIONS, {color:'#00ff7f', lineWidth:3});
      drawLandmarks(ctx, frame.landmarks, {color:'#ff4081', lineWidth:1, radius:3});
    }
    if(state.showMetrics){
      // 지표 패널 업데이트 — 현재값 + Address 대비 변화량
      var defs = VIEW_METRICS[m.view||'front'] || VIEW_METRICS.front;
      var addrM = frames[0] && frames[0].metrics ? frames[0].metrics : null;
      metricsLive.innerHTML = defs.map(function(d){
        var v = frame.metrics ? frame.metrics[d.key] : null;
        var display = (v===null||v===undefined) ? '—' : Number(v).toFixed(d.fix)+(d.unit||'');
        var delta = '';
        if(addrM && v!==null && v!==undefined && addrM[d.key]!==null && addrM[d.key]!==undefined){
          var dv = v - addrM[d.key];
          if(Math.abs(dv) >= Math.pow(10, -(d.fix||0))-1e-9){
            var sign = dv>=0?'+':'';
            var cls = Math.abs(dv) > (d.warnDelta||999) ? 'warn' : 'ok';
            delta = ' <span class="spm-delta '+cls+'">'+sign+Number(dv).toFixed(d.fix)+(d.unit||'')+'</span>';
          }
        }
        return '<div class="sp-metric"><span class="spm-lbl">'+d.label+'</span><span class="spm-val">'+display+delta+'</span></div>';
      }).join('');
    }
  }

  // Trackman 스타일 A→F 요약 지표 계산
  function computeTrackmanSummary(){
    if(!state.analysis || !state.analysis.frames || state.analysis.frames.length<3) return null;
    var frames = state.analysis.frames;
    var addr = frames[0];
    var fin = frames[frames.length-1];
    if(!addr.landmarks || !fin.landmarks) return null;
    var aLm = addr.landmarks, fLm = fin.landmarks;
    var view = m.view||'front';

    // 핵심 계산 — 정규화된 좌표계 (화면 비율 %)
    var lHipDx = (fLm[LM.L_HIP].x - aLm[LM.L_HIP].x) * 100;
    var rHipDx = (fLm[LM.R_HIP].x - aLm[LM.R_HIP].x) * 100;
    var headDx = (fLm[LM.NOSE].x - aLm[LM.NOSE].x) * 100;
    var headDy = (fLm[LM.NOSE].y - aLm[LM.NOSE].y) * 100;
    // 힙 센터 이동
    var aHipCx = (aLm[LM.L_HIP].x + aLm[LM.R_HIP].x) / 2;
    var fHipCx = (fLm[LM.L_HIP].x + fLm[LM.R_HIP].x) / 2;
    var hipCenterDx = (fHipCx - aHipCx) * 100;
    // 어깨 회전 차이 (shoulderTilt = asin((Ly-Ry)/dist))
    var aShT = addr.metrics ? addr.metrics.shoulderTilt : null;
    var fShT = fin.metrics ? fin.metrics.shoulderTilt : null;
    var shoulderRot = (aShT!==null && fShT!==null) ? (fShT - aShT) : null;
    // 힙 회전 차이
    var aHipT = addr.metrics ? addr.metrics.hipTilt : null;
    var fHipT = fin.metrics ? fin.metrics.hipTilt : null;
    var hipRot = (aHipT!==null && fHipT!==null) ? (fHipT - aHipT) : null;
    // X-factor 최대값 (상하체 회전차의 피크)
    var maxXFactor = 0;
    var xFactorT = 0;
    frames.forEach(function(f){
      if(f.metrics && f.metrics.xFactor!==null && f.metrics.xFactor!==undefined){
        if(Math.abs(f.metrics.xFactor) > Math.abs(maxXFactor)){
          maxXFactor = f.metrics.xFactor;
          xFactorT = f.t;
        }
      }
    });
    // 척추각 변화
    var aSpine = addr.metrics ? addr.metrics.spineAngle : null;
    var fSpine = fin.metrics ? fin.metrics.spineAngle : null;
    var spineChange = (aSpine!==null && fSpine!==null) ? (fSpine - aSpine) : null;
    // 헤드 최대 변동 (전체 프레임 동안)
    var aNoseX = aLm[LM.NOSE].x, aNoseY = aLm[LM.NOSE].y;
    var maxHeadDx = 0, maxHeadDy = 0;
    frames.forEach(function(f){
      if(!f.landmarks || !f.landmarks[LM.NOSE]) return;
      var dx = (f.landmarks[LM.NOSE].x - aNoseX) * 100;
      var dy = (f.landmarks[LM.NOSE].y - aNoseY) * 100;
      if(Math.abs(dx) > Math.abs(maxHeadDx)) maxHeadDx = dx;
      if(Math.abs(dy) > Math.abs(maxHeadDy)) maxHeadDy = dy;
    });

    return {
      view: view,
      lHipDx: lHipDx, rHipDx: rHipDx, hipCenterDx: hipCenterDx,
      headDx: headDx, headDy: headDy,
      maxHeadDx: maxHeadDx, maxHeadDy: maxHeadDy,
      shoulderRot: shoulderRot, hipRot: hipRot,
      maxXFactor: maxXFactor, xFactorT: xFactorT,
      spineChange: spineChange
    };
  }

  // 요약 카드 HTML 생성
  function renderTrackmanSummary(){
    var s = computeTrackmanSummary();
    if(!s) return '';
    function row(label, v, unit, warnAbs, hint){
      if(v===null || v===undefined) return '';
      var sign = v>=0?'+':'';
      var abs = Math.abs(v);
      var cls = (warnAbs && abs > warnAbs) ? 'warn' : (abs < (warnAbs||999)*0.4 ? 'ok' : 'mid');
      var arrow = '';
      if(hint==='lateral'){
        arrow = v>0 ? ' ▶' : ' ◀';
      } else if(hint==='vert'){
        arrow = v>0 ? ' ▼' : ' ▲';
      }
      return '<div class="tm-row '+cls+'"><span class="tm-lbl">'+label+'</span><span class="tm-val">'+sign+v.toFixed(1)+unit+arrow+'</span></div>';
    }
    var isSide = s.view==='side';
    var html = '<div class="tm-sum">';
    html += '<div class="tm-sum-title">A→F 스윙 변화량 <span class="tm-sum-sub">(Trackman 스타일)</span></div>';
    html += '<div class="tm-grid">';
    // 하체
    html += '<div class="tm-section"><div class="tm-sec-lbl">하체 · 힙</div>';
    html += row('좌측 힙 이동', s.lHipDx, '%', 4, 'lateral');
    html += row('우측 힙 이동', s.rHipDx, '%', 4, 'lateral');
    html += row('힙 센터 스웨이', s.hipCenterDx, '%', 3, 'lateral');
    if(s.hipRot!==null) html += row('힙 회전', s.hipRot, '°', 50);
    html += '</div>';
    // 상체
    html += '<div class="tm-section"><div class="tm-sec-lbl">상체 · 회전</div>';
    if(s.shoulderRot!==null) html += row('어깨 회전', s.shoulderRot, '°', 90);
    html += row('최대 X-팩터', s.maxXFactor, '°', 60);
    if(s.spineChange!==null) html += row('척추각 변화', s.spineChange, '°', 15);
    html += '</div>';
    // 헤드
    html += '<div class="tm-section"><div class="tm-sec-lbl">헤드 이동</div>';
    html += row('A→F 측면', s.headDx, '%', 3, 'lateral');
    html += row('A→F 수직', s.headDy, '%', 3, 'vert');
    html += row('최대 측면', s.maxHeadDx, '%', 4, 'lateral');
    html += row('최대 수직', s.maxHeadDy, '%', 4, 'vert');
    html += '</div>';
    html += '</div>';
    html += '<div class="tm-legend">● 초록 = 정상, ● 노랑 = 주의, ● 빨강 = 과도</div>';
    html += '</div>';
    return html;
  }

  // 컨트롤 이벤트
  var playIcoEl = playBtn.querySelector('.sp-ico');
  var playLblEl = playBtn.querySelector('.sp-lbl');
  playBtn.addEventListener('click', function(e){
    e.preventDefault();
    if(video.paused) video.play(); else video.pause();
  });
  video.addEventListener('play', function(){ if(playIcoEl) playIcoEl.innerHTML = SP_ICONS.pause; if(playLblEl) playLblEl.textContent='일시정지'; });
  video.addEventListener('pause', function(){ if(playIcoEl) playIcoEl.innerHTML = SP_ICONS.play; if(playLblEl) playLblEl.textContent='재생'; });
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
  // 모바일에서 loadedmetadata 가 늦게 오는 경우 대비 — canplay 에도 트리거
  var _autoTriggered = false;
  function _autoTrigger(){
    if(_autoTriggered) return;
    _autoTriggered = true;
    tryLoadOrAnalyze();
  }
  video.addEventListener('canplay', _autoTrigger);
  video.addEventListener('loadeddata', _autoTrigger);
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
  var helpBox = el.querySelector('.sp-help-box');
  el.querySelector('.sp-help').addEventListener('click', function(){
    var isOn = helpBox.style.display !== 'none';
    helpBox.style.display = isOn ? 'none' : 'block';
    this.classList.toggle('active', !isOn);
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
    var checksHtml = checks.map(function(c){
      return '<div class="sp-check '+(c.ok?'ok':'warn')+'">'+(c.ok?'✓':'⚠')+' '+c.text+'</div>';
    }).join('') || '<div class="sp-check-empty">데이터 부족</div>';
    // Trackman 요약 + 체크리스트
    metricsCheck.innerHTML = renderTrackmanSummary() + checksHtml;
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
    loadingText.textContent = '영상 로드 중...';
    progressFill.style.width = '0%';

    // 2-a. 영상이 seek 가능한 상태가 될 때까지 대기
    // (readyState >= 2 = HAVE_CURRENT_DATA, seeking 가능)
    try{ video.load(); }catch(e){}
    if(video.readyState < 2){
      await new Promise(function(resolve){
        var settled = false;
        var onReady = function(){
          if(settled) return;
          settled = true;
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('canplaythrough', onReady);
          resolve();
        };
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('canplay', onReady);
        video.addEventListener('canplaythrough', onReady);
        setTimeout(onReady, 5000); // max wait
      });
    }

    // 2-b. iOS Safari 디코더 Kick — muted play/pause 로 seek 동작 활성화
    try{
      video.muted = true;
      var playP = video.play();
      if(playP && playP.then){ await playP; }
      video.pause();
      try{ video.currentTime = 0; }catch(e){}
    }catch(e){ /* autoplay 차단은 무시 */ }

    loadingText.textContent = '분석 대기 중...';
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
  // 로컬 캐시 없으면 R2에서 다운로드 후 IndexedDB에 저장
  if(!src && r2.enabled && (m.r2Key || m.mediaId)){
    var key = m.r2Key || m.mediaId;
    var blob = await r2.download(key);
    if(blob){
      if(m.mediaId){
        await mediaDB.put(m.mediaId, blob, {mimeType:m.mimeType||blob.type, name:m.name||''});
        try{S.mediaUrls[m.mediaId] = URL.createObjectURL(blob); src = S.mediaUrls[m.mediaId];}catch(e){}
      }
    }
  }
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
  pose.setOptions({modelComplexity:0, smoothLandmarks:true, enableSegmentation:false, minDetectionConfidence:.3, minTrackingConfidence:.3});

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
        if(m.r2Key || m.mediaId) r2.remove(m.r2Key||m.mediaId);
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
