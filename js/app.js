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
