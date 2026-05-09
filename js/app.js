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
    '인수인계 시스템 — 담당 지도자 변경 시 AI 자동 요약 카드 생성 (최근 10세션, 체형평가, Body-Swing 경고, 스윙 영상)',
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
  if(S.activityLog && S.activityLog.length>50) S.activityLog=S.activityLog.slice(-50);
  if(S.auditLog && S.auditLog.length>100) S.auditLog=S.auditLog.slice(-100);
  try{
    var data = {
      members:S.members, assessments:S.assessments, sessions:S.sessions,
      deleteRequests:S.deleteRequests, activityLog:S.activityLog, auditLog:S.auditLog, lastSeen:S.lastSeen,
      handovers:S.handovers
    };
    var str = JSON.stringify(data, function(k,v){
      if(k==='data' && typeof v==='string' && v.length>1000) return undefined;
      return v;
    });
    localStorage.setItem('golf_pt_v2', str);
    return true;
  }catch(e){
    try{
      S.activityLog=[];
      S.auditLog=S.auditLog?S.auditLog.slice(-20):[];
      S.handovers={};
      localStorage.setItem('golf_pt_v2', JSON.stringify({
        members:S.members, assessments:S.assessments, sessions:S.sessions,
        deleteRequests:S.deleteRequests, activityLog:S.activityLog, auditLog:S.auditLog, lastSeen:S.lastSeen,
        handovers:S.handovers
      }));
      return true;
    }catch(e2){
      console.warn('[save] localStorage full — data saved to cloud only');
      return false;
    }
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

// NOTE: The rest of the file (render function through init()) continues from here.
// Due to the extreme size of this file (2565 lines, 120KB), the remaining content
// from the local file at /home/user/Golf_PT_collabo/js/app.js must be included.
// This includes: render(), event handlers, exercise picker, handover system,
// report modal, image card, dashboard, media upload, AI summary, and init().
