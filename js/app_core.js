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

// ============ B2B 화이트라벨 (config.js 오버라이드) ============
// 브랜드/지도자/베이/초기비번은 config.js 값이 있으면 그걸 쓰고, 없으면 기본값.
const APP_BRAND = Object.assign({
  name:'NATIONAL GYM', nameKo:'내셔널짐', sub:'GOLF & PT',
  tagline:'COLLABORATIVE COACHING PLATFORM',
  reportSub:'GOLF PT · PERFORMANCE', measuredBy:'TRACKMAN iO',
  heroImages:[], heroCopy:'골프와 피트니스가 만나는 곳 · 데이터로 증명하는 코칭'
}, (window.APP_CONFIG && window.APP_CONFIG.BRAND) || {});

const INSTRUCTORS = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.INSTRUCTORS) && window.APP_CONFIG.INSTRUCTORS.length)
  ? window.APP_CONFIG.INSTRUCTORS
  : [
    {name:'정우진 프로', role:'pro'},
    {name:'홍태양 프로', role:'pro'},
    {name:'최현승 트레이너', role:'trainer'},
    {name:'이상렬 트레이너', role:'trainer'}
  ];

const DEFAULT_PASSWORDS = (function(){
  var d = {
    'infodesk':'ng2026',
    '정우진 프로':'jung00',
    '홍태양 프로':'hong00',
    '최현승 트레이너':'choi00',
    '이상렬 트레이너':'lee000',
    '관리자':'admin0000'
  };
  Object.assign(d, (window.APP_CONFIG && window.APP_CONFIG.PASSWORDS) || {});
  // 화이트라벨 안전장치 — config 로 지도자 명단을 교체했는데 PASSWORDS 를 안 채우면
  // getPassword 가 undefined 를 돌려줘 비번 모달 없이 로그인되는 구멍이 생긴다.
  // 명단의 모든 이름에 초기 비밀번호를 강제 시드 (배포 후 앱에서 변경).
  INSTRUCTORS.forEach(function(i){ if(!d[i.name]) d[i.name]='0000'; });
  return d;
})();
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
    logAudit('auth','비밀번호 변경', key, {});   // 비밀번호 값은 로그에 남기지 않는다
    return true;
  }catch(e){return false;}
}

const APP_VERSION = {
  version:'v9.48',
  date:'2026-08-02',
  changes:[
    '리포트 글씨 배율 전면 적용 — 함께한 시간·섹션 제목·필터 칩·안내 문구 등 돋보기를 눌러도 안 커지던 90곳을 전부 배율 반응형으로 전환. 이제 🔍 누르면 리포트 전체가 커짐',
    '리포트 상단 정리 — [🤖 리포트]·글씨(가/가+/가++, 돋보기와 중복)·[CSV]·[프린트] 제거. 단위·속도 전환과 [닫기]만 유지',
    '클럽 딜리버리 궤적 오버레이 제거 — 인식 품질이 고르지 못하고 클럽을 가려서 삭제. 영상은 깨끗하게, 분석은 아래 다이어그램 패널(패스·페이스 부채꼴 + 수치 그리드)로 일원화',
    '클럽 무지개 리본 복구 — 헤드 윗면/아랫면 데이터가 곡선 피팅 직전에 유실되던 회귀 + 선두 픽셀 조건 과다로 점이 모자라면 통째로 실패하던 문제(부족 시 전체 픽셀 폴백). 프레임 시각도 정확한 mediaTime 사용, 인식 실패 시 좌상단에 "궤적 인식 실패" 표시',
    '모든 스윙 영상 선명 스크럽 — 측면·정면도 기본 컨트롤(중앙 ▶·±10초·화면 어두워짐)을 끄고 자체 시크바를 상시 표시. 스크롤 중 화면이 가려지지 않고 선명하게 보임. 조작은 시크바·▶/⏸ 버튼·화면 탭',
    '성과 리포트 시니어 친화 개편 — 베스트 샷·클럽별 평균의 영문 지표(Carry/Ball Speed 등) 전부 한글화, 기본 글씨부터 크게(숫자 30px·표 17px). 우측 하단 🔍 돋보기 버튼: 누를 때마다 가→가+→가++→가+++ 단계 확대(최대 숫자 50px), 표·타일이 실제로 배율에 반응하도록 구조 수정(기존엔 px 고정이라 가+ 눌러도 표가 안 커졌음)',
    '클럽 궤적을 헤드 기준으로 재보정 — 움직인 픽셀 전체 평균(샤프트·블러에 끌림) 대신 진행 방향 선두의 헤드 부분만 추적하고, 헤드 윗면·아랫면 높이를 각각 곡선 피팅해 그 사이를 채운 무지개 리본으로 표시. 어느 프레임에서든 헤드가 리본 안에 들어옴',
    '영상 스크롤 전면 개선 — 모든 시크바(클럽·비교재생·고객 리포트)가 드래그 시작하면 자동 일시정지되고 놓으면 재생 복귀(재생과 안 싸움). 클럽 뷰에 재생/정지 버튼(▶/⏸) 추가',
    '클럽 궤적 곡선 매끈하게 — 추적 점을 그대로 이어 흔들리던 선을 2차 곡선(무지개 아크) 수학 피팅으로 교체: 이상점 자동 제거 후 최소제곱 피팅이라 항상 부드러운 호. 판독도 0.5배 슬로우로 촘촘히 샘플링',
    '클럽 뷰 시크바 — 기본 컨트롤이 없는 클럽 딜리버리 화면에 전용 스크롤바 추가(임팩트 프레임 정지 관찰). 라이브·리포트 동일',
    '고객 리포트 다듬기(GDR 연습장 모드 기준) — 비포·애프터에 공용 시크바(두 영상 동시 탐색) 추가, KPI 를 측정 데이터 중심으로(총 레슨 제거 → 베스트 캐리·평균 캐리·측정 샷), 성장 문구를 "비거리가 Nm 증가했어요! (캐리 기준)" 로 교체',
    '클럽헤드 실측 궤적 추적 — TPS 임팩트 비디오처럼 영상 프레임을 분석해 클럽헤드의 실제 이동 궤적을 찾아 영상 위에 곡선으로 표시 (분석 중 표시 → 수 초 내 완료, 기기·영상 상태로 실패하면 자동 생략)',
    '딜리버리 다이어그램 대형화·정밀화 — 영상 위 작은 인셋 대신 영상 아래 큰 패널로 이동. 패스·페이스 각도에 비례해 커지는 부채꼴로 1° 차이도 시각적으로 구분, 페이스 투 패스·구질 성향(드로우/페이드) 자동 해석, 트랙맨 스타일 수치 그리드(클럽 스피드·어택 앵글·클럽 패스·페이스 앵글·페이스 투 패스·스핀량)',
    '고객용 공유 리포트 신설 — [리포트 공유]가 텍스트 몇 줄 대신 회원 전용 웹 리포트 링크를 만들어 공유. 링크만 열면 측정 데이터·비포/애프터 동시 재생(배속)·스윙 영상·레슨 일지를 GDR 스타일 화면으로 봄 (관리자 화면과 분리, 녹음 원문 미포함)',
    '샷 상세 한글화·시인성 — 캐리/토탈/볼 스피드/스매시·클럽 스피드/발사각/스핀량/클럽 패스/페이스 앵글/어택 앵글/낙하 각도 등 전부 한글, 숫자 크게(20px)·굵게, [영상 저장] 버튼 부연설명 제거',
    '클럽 패스 다이어그램 방향 수정 — 영상과 동일하게 오른쪽→왼쪽 진행(오른손 기준)으로 가로형 재구성. 타깃 밴드는 왼쪽, 패스 궤적·화살표가 우측에서 들어와 볼을 지나감',
    '클럽 패스 그림 정리 — 영상 전체에 겹쳐 그리던 타깃라인·곡선이 실제 볼 위치(카메라마다 다름)와 어긋나 엉망으로 보이던 문제. 방송 그래픽처럼 우측 하단 미니 다이어그램 인셋으로 분리 — 영상은 깨끗하게, 패스·페이스는 작은 패널에 정확하게',
    '클럽 딜리버리 회전 수정 — 좌우만 뒤집어 재생버튼까지 반전되던 문제. 이제 180° 회전(샤프트 아래·진행 우→좌)이고, 클럽 뷰는 기본 컨트롤 대신 화면 탭으로 재생/정지 + 1초 클립 자동 반복이라 컨트롤이 뒤집힐 일이 없음',
    'TPS 스타일 클럽 패스 오버레이 — 클럽 딜리버리 화면 위에 점선 타깃라인·파란 타깃 밴드·클럽 패스 곡선(측정 Club Path 각도 반영, 인투아웃/아웃투인 표기)·페이스 각 라인 + PATH/FACE 수치 배지. 라이브·리포트 모두',
    '비포 샷에 측면·정면이 누락되던 원인 수정 — 클럽 영상은 즉시 저장되지만 아이폰(측면·정면) 영상은 30~90초 늦게 저장되는데, 에이전트가 클럽만 찾고 작업을 끝내버렸음. 이제 찾은 것부터 붙이고 측면·정면은 3분까지 보충 수집해 도착하는 대로 추가·대표영상 승격 (에이전트 교체 필요)',
    '클럽 딜리버리 좌우 반전 — 클럽이 오른쪽→왼쪽으로(실제 스윙 방향) 지나가도록 반전 표시. 라이브·리포트·비교 재생 모두 적용',
    '클럽 딜리버리 확대 + 전용 슬로우 — 화면 더 크게(68vh), 기본 0.5× 슬로우 시작, [.125×/.25×/.5×/1×] 배속 칩으로 초슬로우 선택 (모든 앵글에서 사용 가능)',
    '실시간 샷 저장 개편 — [＋저장] 제거, [📌 비포로 저장]/[✅ 애프터로 저장] 둘 중 선택. 저장해도 카드가 사라지지 않고 "✓ 저장됨" 상태로 남으며 [저장 취소]로 즉시 복구, 나머지 버튼은 비활성화',
    '애프터 영상이 안 붙던 버그 수정 — 영상 중복배정 방지가 너무 엄격해 후보가 전부 다른 샷에 배정된 경우 영상이 아예 안 붙던(굶는) 문제. 안 겹치는 영상 우선, 없으면 공유라도 붙임 (에이전트 교체 필요)',
    '영상 오류 원인 표시 — "만료·정리" 뭉뚱그림 대신 실제 사유를 확인해 표시: 서버에 파일 없음(404·업로드 실패) / 재생 불가 형식(코덱) / 네트워크. 클럽 영상 문제 진단용',
    '비교 재생기에 앵글 전환 — [측면]/[정면]/[클럽] 탭으로 두 영상을 같은 앵글로 동시 전환(두 샷 모두 있는 앵글만 활성). 영상 없는 쪽이 있으면 버튼 대신 안내 문구',
    '"변화의 증거" → "비포 · 애프터" 로 문구 정리',
    '버튼 인터랙션 업그레이드 — 전역 버튼에 눌림 스케일·글로우 애니메이션, 저장 확정 배지 팝 효과 (동작 줄이기 설정 시 자동 비활성)',
    '트레이너도 타석 레슨 — 이상렬·최현승 트레이너 회원 화면에 [🏌️ 타석 레슨] 버튼 추가(프로와 동일 기능), 기존 일지 버튼은 [📝 피티레슨일지]로 명칭 변경',
    '클럽 딜리버리 탭 안 뜨던 버그 수정 — DL 아이폰 영상이 없으면 클럽 카메라 영상이 "측면" 자리를 차지해 클럽 탭이 안 생기던 매핑 오류. 이제 클럽 영상은 항상 [클럽] 탭, 측면은 DL 아이폰 전용 (에이전트 교체 필요)',
    '비교 재생 업그레이드 — 공용 시크바(두 영상 동시 탐색·프레임 비교), 0.125× 초슬로우 추가, 각 영상에 클럽·날짜·캐리 캡션 표시',
    '같은 영상 중복 배정 방지 — 한 영상 파일이 두 샷에 붙어 "비교인데 두 영상이 똑같은" 문제. 에이전트가 배정된 영상을 기록해 다른 샷이 못 가져가게 차단 + 같은 영상이면 비교 화면에 경고 표시 (에이전트 교체 필요)',
    '정면(FO) 영상 매칭 창 확대 — 아이폰 영상 저장이 늦게 끝나는 경우를 위해 매칭 창 90초→150초 (그래도 안 붙으면 TPS의 아이폰 카메라 녹화가 꺼진 것이니 카메라 화면 확인)',
    '리포트 샷 영상 모달 수리 — 다운로드 버튼이 잘려 보이던 레이아웃 수정 + 측면/정면/클럽 앵글 전환 탭 추가',
    '영상 진짜 다운로드 — 예전엔 다운로드를 누르면 앱이 밖으로 튕겨 재시작됐음. 이제 아이폰은 공유시트에서 [비디오 저장]으로 사진앱에, 갤럭시는 다운로드 폴더로 완전 저장(진행률 % 표시)',
    '비포/애프터 영상 지정 — 라이브 샷 저장 시 [비포]/[애프터] 버튼으로 프로가 직접 지정. 캐리 거리 기준 자동 BEST 배지는 제거(교정 전 나쁜 습관 예시가 "베스트"로 보이는 오해 방지)',
    '비포·애프터 나란히 비교 재생 — 리포트 "변화의 증거"에서 두 영상 동시 재생, 기본 슬로우(0.5×) + 배속 조절(0.25/0.5/1×), 처음부터 동기 재생',
    '클럽 딜리버리 앵글 추가 — 트랙맨 클럽 카메라(임팩트 클로즈업) 영상을 세 번째 앵글로 저장·재생 (에이전트 교체 필요)',
    '음성 변환·AI 정리 남은시간 표시 — "마지막 조각 변환 중"과 "AI 정리 중" 배너에 남은 초를 실시간 카운트다운 (프로가 기다릴 수 있게)',
    '로그인 화면 상단 문구 잘림 수정 — "POWERED BY TRACKMAN iO"에서 장비명이 다음 줄로 떨어져 "IO"만 홀로 잘려 보이던 문제. 화면 폭에 맞춰 자간·크기를 조절해 한 줄로 넣고, 아주 좁은 화면에서도 장비명은 통째로 함께 줄바꿈',
    '"마지막 조각 변환 중" 무한 대기 수리 — 음성 변환 요청에 35초 타임아웃+1회 재시도, 종료 마무리는 최대 45초 후 강제 확정. 90초 넘게 걸린 "변환 중" 표시는 자동 해제되고 세션 종료 버튼 차단도 풀림',
    '녹음 문제를 이제 화면에서 보여줌 — 변환 실패 시 사유(시간 초과·서버 오류 등)를 실시간 표시하고, 마이크 소리가 빈 채로 들어오면 2회 연속 시 마이크를 자동 재연결(예전엔 조용히 버려져 "2분 녹음했는데 글이 하나도 없는" 침묵 상태)',
    '샷 영상 즉시 재생 — 업로드 직후 서버가 엣지 캐시에 영상을 미리 적재하고, 앱도 [🎬 보기] 칩이 뜨는 순간 몰래 예열. 라이브에서 첫 재생이 원본 저장소까지 안 가고 근처 캐시에서 바로 시작(워커 재배포 필요)',
    '세션 순서 정상화 — 같은 날 레슨이 거꾸로(오전 레슨이 오후 레슨 위에) 뜨던 문제 수정. 이제 목록·리포트·보관함·최근활동 어디서나 "가장 최근 기록이 항상 맨 위". 시간 미지정 기록은 그 날 맨 아래, 날짜·시간이 같으면 나중에 쓴 일지가 위로 올라옵니다',
    '시간 없는 옛 기록도 순서 고정 — 예전에 시간이 유실된 일지는 순서가 그때그때 달라졌지만, 이제 그 날의 맨 아래에 기록을 만든 순서대로 고정됩니다(시간을 직접 채워 넣으면 그 시간 순서로 올라감)',
    '리포트·최근활동에도 레슨 시간 표시 — 성과 리포트의 레슨 기록·스윙 영상 라벨, 대시보드 최근 활동에 날짜와 함께 시간 노출',
    '정렬 자동 검증 장치 — 앱 주소 뒤에 ?selftest=1 을 붙여 열면 정렬 규칙 7가지를 자동 점검. 규칙이 다시 뒤집히면 즉시 잡히도록 회귀 방지',
    '녹음 받아쓰기 품질 근본 개선 — 프로 실수업 녹음이 "생명선·포기어져" 같은 헛인식 조각으로 나오던 문제. ①직전 조각의 (깨진) 텍스트를 다음 조각 프롬프트로 넘겨 오류가 눈덩이처럼 증폭되던 "오염 되먹임" 제거 ②15초→20초로 늘려 단어 중간 절단·헛인식 감소 ③워커에서 Whisper 조각별 신뢰도(무음확률·logprob·반복압축비)로 지어낸 파편 자동 제거 ④녹음 음질 32k→48k. 워커 재배포 필요',
    '모바일 회원 목록 짓눌림 수정 — 관리자 사이드바에서 위/아래 버튼들에 밀려 회원 목록이 한 줄만 보이던 문제. 모바일에선 사이드바 전체가 스크롤되도록 바꿔 목록이 온전히 보임',
    '[🤖 AI로 다시 정리] 버튼 항상 노출 — 녹음 원문이 기기에 없어도(원문 미로드) 현재 메모 내용으로 AI 정리 가능하도록 개선. 관리자·프로 어디서든 조각 일지를 정리',
    '관리자 세션 수정 복구 — 관리자로 로그인해도 세션 카드에 [수정]/[삭제]가 안 뜨던 문제 수정',
    '모바일 회원 목록 정리 — 이름 말줄임·카운트 배지 줄바꿈 방지·사이드바 폭 확대',
    '녹음 일지 AI 정리 자동화 — 프로가 AI 정리(약 15초)가 끝나기 전에 저장을 눌러도, 저장된 일지를 백그라운드에서 자동으로 AI 정리해 교체(원문 조각 상태로 남던 문제 해결). 프로가 기다릴 필요 없음',
    '샷 영상 측면·정면 동시 지원 — 다운더라인(측면)·정면(FO) 두 각도를 각각 저장하고, 영상 재생창 상단 [측면]/[정면] 탭으로 전환. (트랙맨 고장 우회 중에도 Videos 폴더의 아이폰 영상을 시각 매칭해 붙임)',
    '타석 레슨 게이트 — "타석 레슨"을 켠 베이의 샷만 저장(연습 샷은 저장 안 함). 에이전트 교체 필요',
    '레슨 시간 유실 수정 — DB에 time 컬럼이 없으면 저장할 때마다 시간이 조용히 버려지고 동기화 때 사라지던 문제. 시간을 media JSON 에 함께 백업해 어떤 DB 상태에서도 보존(같은 날 골프→PT 정렬도 유지)',
    '[🏌️ 타석 레슨] 버튼 가독성 — 초록 배경에 초록 글자로 안 보이던 것을 흰 글자로 수정',
    'UI 전면 리프레시 v10 — 딥그린 액센트·쿨뉴트럴 표면·라운드 확대·레이어드 그림자, 모바일 모달은 바텀시트(그랩바), 버튼 press 피드백, 입력 16px+포커스 링, 수치 탭룰러 정렬, 다크 토스트, 접근성(포커스 링·reduced-motion) 강화',
    '샷 영상 진행 표시 — 샷 직후 "🎞 업로드중 N%" 칩이 뜨고, 완료되면 [🎬 보기]로 바뀌어 그 자리에서 바로 재생(라이브·샷 목록). 리포트도 "업로드 중" 안내',
    '영상 준비 시간 절반 — 에이전트가 mkv(23MB) 업로드→삭제 낭비 없이 mp4만 바로 업로드(에이전트 교체 필요)',
    '샷 실시간화 — 에이전트가 데이터를 먼저 보내고(수 초) 영상은 뒤에 붙이는 구조로 재설계(기존엔 영상 업로드·변환 20~30초 후에야 샷이 떠서 "다음 샷 쳐야 이전 샷이 뜨던" 원인). 에이전트 교체 필요',
    '백로그 유입 차단 — 에이전트 재시작 시 밀려 들어오는 "세션 시작 이전" 옛 샷은 현재 레슨에 귀속·표시하지 않음',
    '에이전트 로그 한국시간(KST) 표기 + 미완성 파일 20분까지 재시도(늦게 완성되는 샷 유실 방지)',
    '클럽 오인식 수정 — 레이더 추측(DetectedClubCategory) 대신 TPS에서 선택한 클럽을 우선 사용(에이전트 교체 필요). 클럽/거리 후보를 agent.log 에 진단 출력',
    '영상 오삭제 방지 — 스토리지 정리 직전 샷 목록을 서버에서 최신화 + 최근 업로드 파일 무조건 보호(워커 재배포 필요). 정리 진행 중엔 자동 업데이트 리로드 보류',
    '리포트 영상 — 정리·만료된 영상은 깨진 플레이어 대신 안내 문구 표시',
    '타석 세션 2시간 자동 종료 — 종료를 잊어도 다음 이용자의 샷이 계속 귀속되지 않게. 받아쓴 녹음이 있으면 담당자 기기에서 일지 초안으로 복구',
    '영상 보관 정책 도입 — 앱에서 저장(선별)한 샷 영상만 영구 보관. 연습 중 자동으로 쌓인 미보관 샷 영상은 3일 후 자동 삭제(측정 수치·성과 그래프는 유지). 스토리지 진단에 [미저장 샷 영상 정리] 일괄 버튼 추가',
    '레슨 모드 [버림] 버그 수정 — 버린 샷의 영상이 R2에 남던 것을 함께 삭제',
    '스토리지 정리 속도 개선 — 중복 mkv 삭제를 병렬(청크 8)로 처리해 수천 개도 몇 분 내 완료. 중간에 끊겨도 다시 실행하면 이어짐',
    '로그인 시 자동 최신화 — 프로가 앱을 껐다 켜지 않아도 로그인하는 순간 대기 중인 새 버전이 자동 적용(리로드). 일지 작성 중엔 미루고, 세션은 그대로 복원',
    '저장된 일지 AI 재정리 — 급하게 저장돼 조각으로 남은 녹음 일지를, 보관된 원문으로 다시 AI 정리(수정 화면의 [🤖 AI로 다시 정리]). 원문 보유한 관리자 기기에서 가능',
    'AI 정리 실패 원인 표시 — 실패 시 정확한 사유(워커 상태코드·API 오류 메시지)를 화면에 노출, 관리자 [🤖 AI 정리 연결 테스트] 버튼으로 즉시 진단',
    '녹음 일지 품질 수리 — Whisper 환각 문장("자막 제공..." 등) 자동 필터, 받아쓰기 조각 병합·필러 제거, 가짜 [AI 자동 정리] 라벨 제거(→[레슨 녹음 메모 · AI 정리 대기])',
    'AI 정리 실패가 이제 눈에 보임 — 실패 배너 + [AI 정리 다시 시도] 버튼, AI 진행 중 저장 시 경고, 수정 중엔 AI 결과 덮어쓰기 방지(버튼으로 교체)',
    '역할별 레슨 기록 버튼 정리 — 트레이너는 [📝 레슨일지 작성] 하나로(타석 버튼 제거), 프로는 [🏌️ 타석 레슨] + [✏️ 일지만 기록] 별도. "라이브 수업" 명칭을 "타석 레슨"으로 변경',
    '세션 기록에 레슨 시간 드롭다운 추가 — 같은 날 골프·PT를 순서대로(먼저 한 레슨이 위로) 정렬. 세션카드에 시각 표시, 라이브 세션은 현재 시각 자동 입력',
    '랜딩 인트로 배경 — 데스크탑·태블릿 가로에서 세로 컷이 잘려 빈 화면처럼 보이던 것 수정: 블러 배경 위에 원본 전체를 중앙 표시(프리미엄 레터박스). 세로(모바일)는 기존 풀블리드 유지',
    'R2 저장비 절감 — 삭제 시 mkv 원본+mp4 변환본을 함께 제거(고아 누수 차단), 저장된 샷 삭제가 실제로 영상을 지우도록 수정, 회원 삭제 시 영상까지 정리',
    'R2 저장비 절감 — 에이전트가 mp4 변환 성공 시 용량 2배인 mkv 원본을 자동 삭제(신규 스윙 약 절반)',
    '관리자 🧹 스토리지 진단·정리 — 버킷 구성(mkv/mp4/음성/첨부) 분석 + mp4 재생본이 있는 중복 mkv 원본 안전 정리(수백 GB 회수)',
    '립 트레이너 컷 — 실제 TRX 제품 사진을 레퍼런스로 직접 첨부해 재생성 (포즈·장비 배치가 원본과 동일)',
    '인트로 타이밍 조정 — 1·2번째 사진 1.5초씩, 마지막 사진 3초 후 로그인 버튼들이 2초에 걸쳐 페이드 인',
    '첫 사진이 너무 빨리 넘어가던 문제 수정 — 스플래시가 사라지고 첫 사진 로딩이 끝난 뒤에야 노출시간 카운트 시작(로딩시간에 잠식되지 않음)',
    '랜딩 인트로 몬타주 — 점 인디케이터 제거, 사진이 한 장씩 페이드로 지나가고(그동안 터치 불가·로그인 숨김) 마지막 사진 후 로그인 화면이 페이드 인',
    '립 트레이너 컷 재교정 — TRX 실제 제품(직선 바 + 한쪽 끝 번지코드) 구조를 명시 프롬프트로 재생성, 골프채 헤드 오류 제거. 립트레이너는 첫 0.5초만 스쳐가고 골프스윙이 로그인 배경',
    '립 트레이너 컷 교정 — 실제 제품(끝단 번지코드 저항 바) 구조·골프모자 반영',
    '랜딩 슬라이드 개선 — 2.8초로 빠르게 + 점 인디케이터(탭 이동) 추가, 여러 장임을 바로 인지',
    '랜딩 사진 전면 교체 — 타사 로고 제거, 골프복 착용 TRX 립 트레이너·케틀벨·골프스윙 3컷 로테이션',
    '랜딩 타이포 상단 배치 — 헤드라인을 위로 올려 사진이 화면 중앙에 온전히 보이게, 하단은 [입장하기]만',
    '시작 시 랜딩을 먼저 보여줌 — 부팅 자동로그인(Face ID/자동입장) 제거, [입장하기] 탭 후 로그인. 힘들게 만든 랜딩이 안 보이던 문제 해결',
    '랜딩 히어로에 시네마틱 캠페인 사진 적용(골프 스윙 + 골프 피트니스, 5초 크로스페이드 + 켄번즈) — 로드 실패 시 시네마틱 배경 자동 유지',
    '시작 화면 리뉴얼 — 브랜드 스플래시(KREAM 스타일) 후 나이키 앱풍 풀블리드 랜딩(골프×피트니스). config 로 스튜디오 실제 사진 교체 가능',
    '대시보드 상단이 아이폰 상태바/노치에 가려지던 문제 수정(safe-area) + 세로 스크롤',
    '버전 정보를 마이페이지·대시보드 상단에 상시 표시(탭하면 새로고침)',
    '영상 재생 — R2 Range 스트리밍 + 엣지 캐싱(워커 재배포 필요)',
    '성과 리포트 — 측정 샷 없는 회원(레슨/PT만)도 리포트 표시: 레슨 기록 타임라인 · 세션 스윙영상 · 체형평가 점수 추이',
    '녹음 원문 저장 분리 — 트레이너·프로 기기엔 원문 미저장, 관리자 기기에만 보관',
    '녹음 원문 프라이버시 — 지도자·회원 화면에서 숨김, 관리자 전용 🎙 원문 보관함 신설',
    '관리자 모드 비밀번호 변경 지원',
    '성과 리포트 실데이터 완성 — 데모 수치·가짜 예측 제거, 회원 목표+실측 기반 목표진척, 성장 그래프(캐리 추이) 신설',
    '탄착군 산점도 — 클럽별 좌우 분산 시각화 + 자동 해석 (GDR 벤치마킹)',
    '클럽별 평균 캐리 갭 차트 · 비포/애프터 탭하면 샷 영상·전지표 모달',
    '공유 리포트에 트랙맨 측정 섹션(베스트샷·추이·클럽표·샷 영상) 포함',
    '샷 데이터 CSV 내보내기 (데이터 소유권)',
    '리포트 공유·인쇄 버튼 실동작 (OS 공유시트/클립보드)',
    '영상 업로드 안정성 — 3회 자동 재시도 + 실패 배지 + 수동 재업로드',
    '성과 화면 기본 단위 미터(m·㎧)',
    'B2B 화이트라벨 — 브랜드/지도자/베이/비밀번호 config.js 분리',
    '수업 녹음 — 실시간 받아쓰기(15초 단위) + 종료 시 자동 저장, 텍스트 유실 방지 2중 방어',
    'AI 골프 특화 정리 — 오늘의 핵심/교정 포인트/드릴/과제/특이사항 구조화, 녹음 원문 전체 보존',
    '라이브 세션 — 베이별(1·2번타석/3번룸) 활성세션 + 샷 저장 + 관리자 재할당/삭제',
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
  // 자모(ㄱ,ㄴ,ㄷ...)도 그대로 통과시켜 초성검색 시 매칭됨
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

// 검색 — iOS 한글 입력기 깨짐("김"→"ㄱㅣㅁ") 근본 해결.
// 원인: 타이핑마다 render()로 화면 전체를 다시 그려 input DOM 이 교체 → IME 조합 끊김.
// 해결: 검색 중엔 render() 를 절대 호출하지 않는다. 이미 그려진 행의 display 만 토글.
// (input DOM 이 그대로 살아있어 한글 조합이 안 깨지고, 초성검색도 정상)
function _searchMatch(name, cho, qq, qcho){
  if(!qq) return true;
  return name.indexOf(qq)!==-1 || (qcho && cho.indexOf(qcho)!==-1);
}
function filterMemberRows(q){
  S.memberSearch = q;   // 상태만 저장 (render 안 함)
  var qq=(q||'').trim().toLowerCase(), qcho=getChosung(qq);
  var rows=document.querySelectorAll('.sidebar .member-item');
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    r.style.display=_searchMatch(r.getAttribute('data-name')||'', r.getAttribute('data-cho')||'', qq, qcho)?'':'none';
  }
}
// 라이브/수업/재할당 픽커 공통 — render 없이 .live-member 행 display 토글
function filterPickRows(q, stateKey){
  S[stateKey]=q;
  var qq=(q||'').trim().toLowerCase(), qcho=getChosung(qq);
  var rows=document.querySelectorAll('.live-member-list .live-member');
  var shown=0;
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    var ok=_searchMatch(r.getAttribute('data-name')||'', r.getAttribute('data-cho')||'', qq, qcho);
    r.style.display=ok?'':'none'; if(ok) shown++;
  }
  var empty=document.querySelector('.live-member-list .pick-empty');
  if(empty) empty.style.display=shown?'none':'';
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

function getRole(author){
  var inst = INSTRUCTORS.find(function(i){return i.name===author;});
  if(inst) return inst.role;
  if(author==='관리자' || author==='인포데스크') return 'admin';   // 미지정 작성자를 PT로 오표기하던 문제
  return (author && author.indexOf('프로')!==-1) ? 'pro' : 'trainer';
}

// ============ 라이브 세션: 베이(타석) 마스터 ============
// 1번타석/2번타석 = 연습+레슨 겸용, 3번룸 = 레슨 전용.
// 각 베이는 트랙맨 유닛/PC와 1:1로 물리 고정되며, 모든 매칭은 bay_id 기준.
// config.BAYS 가 명시되면 그것이 단일 진실 소스 — localStorage/서버에 남은 옛 구성이
// 이기면 "config만 바꾸면 된다"는 배포 가이드가 조용히 거짓이 된다 (증설 베이 미표시).
const CONFIG_BAYS_SET = !!(window.APP_CONFIG && Array.isArray(window.APP_CONFIG.BAYS) && window.APP_CONFIG.BAYS.length);
const BAYS_DEFAULT = CONFIG_BAYS_SET
  ? window.APP_CONFIG.BAYS
  : [
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
  client:null, enabled:false, dbProxy:'', dbKey:'',
  init(){try{const cfg=window.APP_CONFIG||{};if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return false;if(typeof window.supabase==='undefined'||!window.supabase.createClient){console.warn('[cloud] supabase-js SDK missing');return false;}this.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    // 쓰기 프록시(선택) — 설정되면 모든 쓰기를 워커 /db 경유(서비스키·RLS 우회).
    // 미설정이면 기존처럼 anon 직접 쓰기(하위호환). RLS 를 읽기전용으로 조인 뒤 켠다.
    if(cfg.DB_PROXY_URL && cfg.R2_API_KEY){ this.dbProxy=String(cfg.DB_PROXY_URL).replace(/\/+$/,''); this.dbKey=cfg.R2_API_KEY; }
    this.enabled=true;return true;}catch(e){console.warn('[cloud] init fail:',e);return false;}},
  // 쓰기 실행기 — 프록시 켜져 있으면 워커 /db, 아니면 supabase-js 직접(하위호환).
  async _w(op, table, opts){
    opts = opts || {};
    var wantErr = opts._returnError; if(wantErr){ opts=Object.assign({},opts); delete opts._returnError; }
    if(this.dbProxy){
      try{
        var res=await fetch(this.dbProxy+'/db',{method:'POST',headers:{'X-API-Key':this.dbKey,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({op:op,table:table},opts))});
        if(!res.ok){ var t=''; try{t=await res.text();}catch(e){} console.warn('[cloud] proxy '+op+' '+table+' fail',res.status,t.slice(0,150)); return wantErr?(t||('http '+res.status)):false; }
        return true;
      }catch(e){ console.warn('[cloud] proxy '+op+' '+table+' err',e&&e.message); return wantErr?String(e&&e.message||e):false; }
    }
    try{
      var q=this.client.from(table);
      if(op==='upsert'){ var r0=await q.upsert(opts.rows); if(r0.error) throw r0.error; }
      else if(op==='update'){ var qq=q.update(opts.values); (opts.filters||[]).forEach(function(f){ qq=qq[f.op||'eq'](f.col,f.val); }); var r1=await qq; if(r1.error) throw r1.error; }
      else if(op==='delete'){ var qd=q.delete(); (opts.filters||[]).forEach(function(f){ qd=qd[f.op||'eq'](f.col,f.val); }); var r2=await qd; if(r2.error) throw r2.error; }
      return true;
    }catch(e){ console.warn('[cloud] '+op+' '+table+' fail',e&&e.message); return wantErr?String(e&&e.message||e):false; }
  },
  async loadAll(){if(!this.enabled) return null;try{const [mRes,aRes,sRes]=await Promise.all([this.client.from('members').select('*').order('created_at',{ascending:true}),this.client.from('assessments').select('*'),this.client.from('sessions').select('*').order('date',{ascending:true})]);if(mRes.error) throw mRes.error;if(aRes.error) throw aRes.error;if(sRes.error) throw sRes.error;const members=(mRes.data||[]).map(r=>{var extra=r.data||{};return Object.assign({id:r.id,name:r.name,color:r.color||'av-green'},extra);});const assessments={};(aRes.data||[]).forEach(r=>{if(!assessments[r.member_id]) assessments[r.member_id]={};assessments[r.member_id][r.item_key]={result:r.result||'미검사',note:r.note||''};});// 녹음 원문(supplement 컬럼)은 관리자 기기에만 내려받는다.
// 트레이너·프로 기기에는 원문을 아예 싣지 않아, 본인 레슨 대화가 남지 않는다.
var _admRaw=(S.currentRole==='admin');
const sessions={};(sRes.data||[]).forEach(r=>{if(!sessions[r.member_id]) sessions[r.member_id]=[];
// 레슨 시간: time 컬럼(있으면 우선) → media JSON 에 백업된 _meta 항목에서 복원.
// (_meta 는 화면에 첨부파일로 안 보이게 media 목록에서 걸러낸다)
var _mArr=Array.isArray(r.media)?r.media:(r.media?r.media:[]);var _tMeta='';_mArr=_mArr.filter(function(m){if(m&&m.type==='_meta'){if(m.time)_tMeta=m.time;return false;}return true;});
sessions[r.member_id].push({id:r.id,date:r.date,time:r.time||_tMeta||undefined,author:r.author,content:r.content||'',supplement:_admRaw?(r.supplement||''):'',rawTranscript:_admRaw?(r.supplement||''):undefined,media:_mArr});});return {members,assessments,sessions};}catch(e){console.warn('[cloud] loadAll fail:',e);return null;}},
  async upsertMember(m){if(!this.enabled) return false;var extra={phone:m.phone||'',email:m.email||'',registeredDate:m.registeredDate||'',golfLessonCount:m.golfLessonCount||'',golfPTCount:m.golfPTCount||'',golfLessonAmount:m.golfLessonAmount||'',golfPTAmount:m.golfPTAmount||'',expiry:m.expiry||'',golfLessonExpiry:m.golfLessonExpiry||'',golfPTExpiry:m.golfPTExpiry||'',assignedTo:m.assignedTo||[],memberType:m.memberType||'pt_lesson',handicap:m.handicap||'',avgScore:m.avgScore||'',goal:m.goal||'',focusPoints:m.focusPoints||''};return await this._w('upsert','members',{rows:[{id:m.id,name:m.name,color:m.color,data:extra}]});},
  async upsertAssessment(memberId,itemKey,result,note){if(!this.enabled) return false;return await this._w('upsert','assessments',{rows:[{member_id:memberId,item_key:itemKey,result:result||'미검사',note:note||'',updated_at:new Date().toISOString()}]});},
  async upsertSession(memberId,s){if(!this.enabled) return false;var mediaMeta=(s.media||[]).map(function(m){return {type:m.type,view:m.view||'other',name:m.name||'',mimeType:m.mimeType||'',size:m.size||0,mediaId:m.mediaId||null,r2Key:m.r2Key||m.mediaId||null,data:(m.type==='url'?(m.data||''):undefined)};});
    // 레슨 시간을 media JSON 에도 백업 — sessions.time 컬럼이 없는 DB(마이그레이션 전)는
    // 아래 폴백이 time 만 빼고 재전송해 시간이 조용히 유실됐다("저장해도 사라짐"의 원인).
    // media 컬럼은 확실히 존재하므로 여기 실으면 어느 DB에서든 시간이 보존된다.
    if(s.time) mediaMeta.push({type:'_meta', time:s.time});
    var row={id:s.id,member_id:memberId,date:s.date,author:s.author,content:s.content||'',supplement:s.rawTranscript||s.supplement||'',media:mediaMeta};
    if(s.time) row.time=s.time;
    if(!row.time) return await this._w('upsert','sessions',{rows:[row]});
    // time 컬럼이 아직 없는 배포(마이그레이션 전)에서도 세션 동기화가 끊기지 않게:
    // 실패 사유가 time 컬럼 문제면 time 만 빼고 재시도한다.
    var r=await this._w('upsert','sessions',{rows:[row], _returnError:true});
    if(r===true) return true;
    if(typeof r==='string' && /time/i.test(r) && (/PGRST204/i.test(r)||/column/i.test(r)||/schema cache/i.test(r))){
      delete row.time; return await this._w('upsert','sessions',{rows:[row]});
    }
    return false;},
  async deleteSession(id){if(!this.enabled) return;await this._w('delete','sessions',{filters:[{col:'id',op:'eq',val:id}]});},
  // 회원 영구 삭제 — 서버에서 회원 + 연관 데이터(세션·평가·샷) 함께 제거. 성공 여부 반환.
  async deleteMember(id){if(!this.enabled) return false;
    await this._w('delete','sessions',{filters:[{col:'member_id',op:'eq',val:id}]});
    await this._w('delete','assessments',{filters:[{col:'member_id',op:'eq',val:id}]});
    await this._w('delete','shot_events',{filters:[{col:'member_id',op:'eq',val:id}]});
    return await this._w('delete','members',{filters:[{col:'id',op:'eq',val:id}]});
  },
  // ----- 라이브 세션 (베이/활성세션/굿샷) -----
  async loadLive(){if(!this.enabled) return null;
    // 🔇 수신 일시정지 — 관리자가 토글했으면 빈 라이브 데이터 반환(샷 부활 차단)
    try{ if(localStorage.getItem('golf_pt_shotpause')==='1') return {bays:[], activeSessions:{}, shotEvents:[]}; }catch(e){}
    try{const [bRes,aRes,sRes]=await Promise.all([this.client.from('bays').select('*'),this.client.from('active_sessions').select('*'),this.client.from('shot_events').select('*').order('ts',{ascending:false}).limit(1000)]);if(bRes.error) throw bRes.error;if(aRes.error) throw aRes.error;if(sRes.error) throw sRes.error;const bays=(bRes.data||[]).map(r=>({id:r.id,name:r.name,color:r.color,type:r.type}));const activeSessions={};(aRes.data||[]).forEach(r=>{activeSessions[r.bay_id]={memberId:r.member_id,memberName:r.member_name,author:r.author,startedAt:r.started_at,note:r.note||''};});
    // 🚫 mock 출처는 통째로 제외 — 옛 데모 데이터/잡음 부활 차단 (앱 자체는 mock 안 만듦)
    const shotEvents=(sRes.data||[]).filter(r=>r.source!=='mock').map(r=>({id:r.id,bayId:r.bay_id,memberId:r.member_id,memberName:r.member_name,author:r.author||'',ts:r.ts,data:r.data||{},videoR2Key:r.video_r2_key||null,source:r.source||'agent'})).reverse();return {bays,activeSessions,shotEvents};}catch(e){console.warn('[cloud] loadLive skip:',e&&e.message);return null;}},
  async upsertBays(bays){if(!this.enabled||!bays||!bays.length) return;await this._w('upsert','bays',{rows:bays.map(b=>({id:b.id,name:b.name,color:b.color,type:b.type}))});},
  async startActiveSession(bayId,sess){if(!this.enabled) return;await this._w('upsert','active_sessions',{rows:[{bay_id:bayId,member_id:sess.memberId,member_name:sess.memberName,author:sess.author,started_at:sess.startedAt,note:sess.note||''}]});},
  async endActiveSession(bayId){if(!this.enabled) return;await this._w('delete','active_sessions',{filters:[{col:'bay_id',op:'eq',val:bayId}]});},
  async insertShot(shot){if(!this.enabled) return;await this._w('upsert','shot_events',{rows:[{id:shot.id,bay_id:shot.bayId,member_id:shot.memberId,member_name:shot.memberName,author:shot.author||'',ts:shot.ts,data:shot.data||{},video_r2_key:shot.videoR2Key||null,source:shot.source||'mock'}]});},
  async reassignShot(shotId,memberId,memberName){if(!this.enabled) return;await this._w('update','shot_events',{values:{member_id:memberId,member_name:memberName},filters:[{col:'id',op:'eq',val:shotId}]});},
  // 샷 data 갱신 (보관 플래그 _kept 등) — 다른 기기에도 전파되도록 서버 반영
  async updateShotData(shot){if(!this.enabled||!shot) return;await this._w('update','shot_events',{values:{data:shot.data||{}},filters:[{col:'id',op:'eq',val:shot.id}]});},
  // 샷 영상 키 해제 — 영상은 삭제했지만 측정 데이터(행·그래프)는 유지
  async clearShotVideo(shot){if(!this.enabled||!shot) return;await this._w('update','shot_events',{values:{video_r2_key:null,data:shot.data||{}},filters:[{col:'id',op:'eq',val:shot.id}]});},
  async deleteShot(id){if(!this.enabled) return;await this._w('delete','shot_events',{filters:[{col:'id',op:'eq',val:id}]});},
  // 샷 전체 삭제 (DB만 — 트랙맨 PC 영상 원본과 무관)
  async deleteAllShots(){if(!this.enabled) return false;return await this._w('delete','shot_events',{filters:[{col:'id',op:'neq',val:'00000000-0000-0000-0000-000000000000'}]});},
  // 일괄 삭제 — 80개씩 청크로. IN 절에 수백 개 ID 를 한 번에 넣으면 URL 길이
  // 초과(414)로 삭제가 조용히 실패 → 폴링이 다시 불러와 "지웠는데 다시 뜸".
  async deleteShotsBulk(ids){if(!this.enabled||!ids||!ids.length) return false;var CHUNK=80;var okAll=true;for(var i=0;i<ids.length;i+=CHUNK){var part=ids.slice(i,i+CHUNK);var ok=await this._w('delete','shot_events',{filters:[{col:'id',op:'in',val:part}]});if(!ok) okAll=false;}return okAll;}
};

// 에이전트가 넣은 샷(member 비어있음)을 같은 베이의 활성세션 회원에게 자동 귀속.
// 활성세션 없으면 _unassigned 로 마킹 (샷 로그에 접어 표시).
// 시간 비교 없음 — 활성세션 있는 베이면 무조건 매칭(시계/타임존 오차 무관).
var AGENT_EMPTY_MEMBER = '00000000-0000-0000-0000-000000000000';
// 활성세션 mode 판정 — 한 곳에서만. (act.mode > 직전 로컬 > 베이 타입 fallback)
function bayMode(bayId, act){
  act = act || (S.activeSessions && S.activeSessions[bayId]);
  if(act && act.mode) return act.mode;
  var bay = (typeof getBay==='function') ? getBay(bayId) : null;
  return (bay && bay.type==='lesson_only') ? 'lesson' : 'practice';
}
// 클라우드에서 받은 활성세션 적용 — 로컬 전용 필드 보존이 핵심.
// 서버 active_sessions 에는 mode/_transcript(받아쓰기·메모)/_sttBusy 가 없다.
// 이전 코드는 4초 폴링마다 세션 객체를 통째로 갈아끼워 받아쓴 내용이 매번 증발했다
// ("5분 말했는데 마지막 두 줄만 보이다 사라짐"의 원인). 같은 베이·같은 회원의
// 진행중 세션이면 '_' 로 시작하는 로컬 필드와 mode 를 전부 이어받는다.
// 회원이 바뀌었으면(다른 세션) 이어받지 않는다 — 남의 세션에 메모가 붙으면 안 되므로.
function applyRemoteActive(remoteActive){
  var prev = S.activeSessions || {};
  var next = remoteActive || {};
  Object.keys(next).forEach(function(b){
    var n = next[b], p = prev[b];
    if(p && p.memberId === n.memberId){
      if(!n.mode && p.mode) n.mode = p.mode;
      Object.keys(p).forEach(function(k){
        if(k.charAt(0)==='_' && n[k]===undefined) n[k]=p[k];
      });
    }
    if(!n.mode){
      var bay = (typeof getBay==='function') ? getBay(b) : null;
      n.mode = (bay && bay.type==='lesson_only') ? 'lesson' : 'practice';
    }
  });
  S.activeSessions = next;
}
function reconcileAgentShots(){
  if(!S.shotEvents || !S.shotEvents.length) return;
  var changed = false;
  var now = Date.now();
  S.shotEvents.forEach(function(s){
    // 최초 수신 시각 기록(시계 어긋남과 무관하게 "방금 수신" 표시 가능)
    if(s.source==='agent' && !s._rcvAt) s._rcvAt = now;
  });
  S.shotEvents = S.shotEvents.filter(function(s){
    var pending = (s.source==='agent') && (!s.memberId || s.memberId===AGENT_EMPTY_MEMBER || !s.memberName);
    if(!pending) return true;
    var act = S.activeSessions[s.bayId];
    if(act && !isStaleSession(act)){
      // 백로그 차단 — 세션 시작 "이전에 측정된" 샷(에이전트가 꺼져 있다 재시작하며
      // 밀어넣는 옛 샷)은 현재 세션에 귀속/대기시키지 않는다. (2분 시계 오차 허용)
      var mt = Date.parse((s.data && s.data.measuredAt) || s.ts);
      var st = Date.parse(act.startedAt);
      if(!isNaN(mt) && !isNaN(st) && mt < st - 120000){ s._unassigned = true; return true; }
      // mode 가 없으면 베이 타입으로 판정 (레슨 전용 베이는 항상 선별저장)
      if(bayMode(s.bayId, act)==='lesson'){
        s._pendingBay = s.bayId;
        return true;
      }
      s.memberId = act.memberId; s.memberName = act.memberName; s.author = act.author;
      changed = true;
      try{ cloud.reassignShot(s.id, act.memberId, act.memberName); }catch(e){}
      return true;
    }
    s._unassigned = true;
    return true;
  });
  if(changed){ try{ save(); }catch(e){} }
}
// 레슨 모드 — 특정 베이의 "미저장 최근 샷" (시간 비교 없음, 베이의 pending agent 샷 전부)
function pendingShotsForBay(bayId){
  var act = S.activeSessions[bayId];
  var st = act ? Date.parse(act.startedAt) : NaN;
  return (S.shotEvents||[]).filter(function(s){
    if(!(s.source==='agent' && s.bayId===bayId)) return false;
    if(!(!s.memberId || s.memberId===AGENT_EMPTY_MEMBER || !s.memberName)) return false;
    // 세션 시작 이전에 측정된 백로그 샷은 레슨 선별 목록에 안 띄움
    var mt = Date.parse((s.data && s.data.measuredAt) || s.ts);
    if(!isNaN(mt) && !isNaN(st) && mt < st - 120000) return false;
    return true;
  }).sort(function(a,b){
    // 수신 시각 우선(없으면 ts) — 시계 어긋나도 도착 순서 유지
    var ra = a._rcvAt||0, rb = b._rcvAt||0;
    if(ra && rb) return rb-ra;
    return String(b.ts||'').localeCompare(String(a.ts||''));
  });
}

// ============ Cloudflare R2 미디어 스토리지 ============
const r2 = {
  workerUrl:'', apiKey:'', enabled:false,
  init(){const cfg=window.APP_CONFIG||{};if(!cfg.R2_WORKER_URL||!cfg.R2_API_KEY) return false;this.workerUrl=String(cfg.R2_WORKER_URL).replace(/\/+$/,'');this.apiKey=cfg.R2_API_KEY;this.enabled=true;return true;},
  url(key){if(!this.enabled||!key) return '';return this.workerUrl+'/'+encodeURIComponent(key);},
  // 업로드 — 일시적 네트워크/5xx 실패는 3회까지 자동 재시도 (지수 백오프)
  async upload(key,blob){if(!this.enabled) return false;
    for(var attempt=0; attempt<3; attempt++){
      try{
        const res=await fetch(this.url(key),{method:'PUT',headers:{'X-API-Key':this.apiKey,'Content-Type':(blob&&blob.type)||'application/octet-stream'},body:blob});
        if(res.ok) return true;
        console.warn('[r2] upload http',res.status,'(시도 '+(attempt+1)+'/3)');
        if(res.status>=400 && res.status<500 && res.status!==429) return false;   // 인증 등 4xx는 재시도 무의미
      }catch(e){console.warn('[r2] upload fail:',e&&e.message,'(시도 '+(attempt+1)+'/3)');}
      if(attempt<2) await new Promise(function(r){setTimeout(r, 1500*(attempt+1));});
    }
    return false;
  },
  async download(key){if(!this.enabled) return null;try{const res=await fetch(this.url(key));if(!res.ok) return null;return await res.blob();}catch(e){console.warn('[r2] download fail:',e);return null;}},
  async head(key){if(!this.enabled||!key) return false;try{const res=await fetch(this.url(key),{method:'HEAD'});return res.ok;}catch(e){return false;}},
  async remove(key){if(!this.enabled) return false;try{const res=await fetch(this.url(key),{method:'DELETE',headers:{'X-API-Key':this.apiKey}});return res.ok;}catch(e){console.warn('[r2] delete fail:',e);return false;}},
  // R2 객체 목록 (관리자 스토리지 진단용) — 워커 /__list 라우트. cursor 로 페이지네이션.
  async list(cursor){if(!this.enabled) return null;try{const u=this.workerUrl+'/__list'+(cursor?('?cursor='+encodeURIComponent(cursor)):'');const res=await fetch(u,{headers:{'X-API-Key':this.apiKey}});if(!res.ok) return null;return await res.json();}catch(e){console.warn('[r2] list fail:',e);return null;}}
};
// 저장된 샷 하나의 R2 영상 파일을 모두 삭제 — mkv 원본 + mp4 변환본 둘 다.
// (기존엔 videoR2Key(mkv)만 지워 data.videoMp4R2Key(mp4)가 영구 고아로 남던 버그 수정)
function r2RemoveShotVideos(s){
  if(!s || typeof r2==='undefined' || !r2.enabled) return;
  try{ if(s.videoR2Key) r2.remove(s.videoR2Key); }catch(e){}
  try{ if(s.data && s.data.videoMp4R2Key) r2.remove(s.data.videoMp4R2Key); }catch(e){}
  try{ if(s.data && s.data.videoFO) r2.remove(s.data.videoFO); }catch(e){}   // 정면 각도도 함께 삭제(고아 방지)
  try{ if(s.data && s.data.videoDL && s.data.videoDL!==s.data.videoMp4R2Key) r2.remove(s.data.videoDL); }catch(e){}
  try{ if(s.data && s.data.videoClub) r2.remove(s.data.videoClub); }catch(e){}   // 클럽 딜리버리 각도
}

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
  classPick:null, classPickQuery:'',
  perfUnitDist:'m', perfUnitSpd:'ms', perfTextScale:1, openSessions:{}, liveBayPickFor:null,   // 기본 미터/㎧ — 트랙맨 iO 원본 단위
  bioBusy:false, bioError:'', bioEnrollFor:null, trustDevice:false,
  deletedSessionIds:{},  // 삭제된 세션 tombstone (다른 기기 캐시가 재업로드해 부활하는 것 방지)
  deletedMemberIds:{}    // 삭제 승인된 회원 tombstone (부팅/동기화 시 부활 차단)
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
  try{var data={members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers,bays:S.bays,activeSessions:S.activeSessions,shotEvents:S.shotEvents,deletedSessionIds:S.deletedSessionIds,deletedMemberIds:S.deletedMemberIds,_dirtyAssess:S._dirtyAssess,_draftSession:(S.showAddSession?S.newSession:null),_draftMember:S.selectedMember};var _isAdm=(S.currentRole==='admin');var str=JSON.stringify(data,function(k,v){if(k==='data'&&typeof v==='string'&&v.length>1000) return undefined;if((k==='rawTranscript'||k==='supplement')&&!_isAdm) return undefined;return v;});localStorage.setItem('golf_pt_v2',str);return true;}catch(e){try{S.activityLog=[];S.auditLog=S.auditLog?S.auditLog.slice(-20):[];S.handovers={};localStorage.setItem('golf_pt_v2',JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers,bays:S.bays,activeSessions:S.activeSessions,shotEvents:S.shotEvents,deletedSessionIds:S.deletedSessionIds,deletedMemberIds:S.deletedMemberIds}));return true;}catch(e2){console.warn('[save] localStorage full');return false;}}
}
function estimateStorageSize(){try{return JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,lastSeen:S.lastSeen}).length;}catch(e){return 0;}}
function loadLocal(){try{const d=localStorage.getItem('golf_pt_v2');if(d){const p=JSON.parse(d);S.members=p.members||SAMPLE_DATA.members;S.assessments=p.assessments||SAMPLE_DATA.assessments;S.sessions=p.sessions||SAMPLE_DATA.sessions;S.deleteRequests=p.deleteRequests||{};S.activityLog=p.activityLog||[];S.auditLog=p.auditLog||[];S.lastSeen=p.lastSeen||{};S.handovers=p.handovers||{};S.bays=CONFIG_BAYS_SET?BAYS_DEFAULT.slice():((p.bays&&p.bays.length)?p.bays:BAYS_DEFAULT.slice());S.activeSessions=p.activeSessions||{};S.shotEvents=p.shotEvents||[];S.deletedSessionIds=p.deletedSessionIds||{};S.deletedMemberIds=p.deletedMemberIds||{};S._dirtyAssess=p._dirtyAssess||{};S._draftSession=p._draftSession||null;S._draftMember=p._draftMember||null;}else{S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}}catch(e){S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}if(!S.bays||!S.bays.length) S.bays=BAYS_DEFAULT.slice();if(S.members.length>0&&!S.selectedMember) S.selectedMember=S.members[0].id;}
function readHash(){var h=location.hash.replace('#','');if(!h)return;var parts=h.split('-');var role=parts[0];var user=decodeURIComponent(parts.slice(1).join('-'));var authed=sessionStorage.getItem('golf_pt_auth');if(!authed){location.hash='';return;}if(role==='infodesk'){S.currentRole='infodesk';S.currentUser='인포데스크';}else if(role==='admin'){S.currentRole='admin';S.currentUser='관리자';}else if(role==='pro'&&user){S.currentRole='pro';S.currentUser=user;}else if(role==='trainer'&&user){S.currentRole='trainer';S.currentUser=user;}
  // 세션 복원(리로드/재개)도 로그인 상태 → 자동 업데이트가 계속 동작하도록 플래그 세팅
  if(S.currentRole){ try{window.__authed=true;}catch(e){} }}
function setRole(role,user){var key=role==='infodesk'?'infodesk':(role==='admin'?'관리자':user);
  // 신뢰기기(생체 미지원 + '이 기기 자동 로그인' 허용) → 랜딩에서 역할 탭 즉시 입장(비번 생략)
  if(!bio.available && deviceTrusted()){ activateRole(role,user); return; }
  var pw=getPassword(key);if(pw){S.pendingRole={role:role,user:user};S.showPwModal=true;S.pwError=false;S.pwInput='';S.bioError='';render();bioAutoTry();return;}activateRole(role,user);}
function activateRole(role,user){S.currentRole=role;S.currentUser=user;S.showPwModal=false;S.pwError=false;S.pendingRole=null;S.bioError='';try{window.__authed=true;}catch(e){}try{sessionStorage.setItem('golf_pt_auth',role+':'+user);}catch(e){}try{localStorage.setItem('golf_pt_last_user',JSON.stringify({role:role,user:user}));}catch(e){}location.hash=role+(role!=='infodesk'?'-'+encodeURIComponent(user):'');if(role==='pro'||role==='trainer') S.newSession.author=user;if(role==='pro'||role==='trainer'){var accessible=S.members.filter(function(m){return m.assignedTo&&m.assignedTo.indexOf(user)!==-1;});var stillAccessible=S.selectedMember&&accessible.some(function(m){return m.id===S.selectedMember;});if(!stillAccessible){S.selectedMember=accessible.length>0?accessible[0].id:null;}}render();
  // 로그인하는 순간 최신 버전 자동 적용 — 앱을 껐다 켜지 않아도 갱신되도록.
  // (대기 중인 새 SW가 있으면 즉시 활성→리로드. 세션은 해시+세션스토리지로 복원돼 대시보드 유지)
  try{ if(window.__checkAppUpdate) setTimeout(window.__checkAppUpdate, 500); }catch(e){}
}
// 유령 세션 강제 정리 — 삭제했는데 옛 기기/브라우저 캐시가 되살려놓은 기록.
// 발견 즉시: 로컬 제거 + tombstone + 서버 삭제. (2026-06 확인분: 로버트 회원 테스트 기록 2건)
var ZOMBIE_SESSIONS = [
  function(s, memberName){ return memberName.indexOf('로버트')!==-1 && String(s.date)==='2026-04-14' && (s.content||'').indexOf('123123')!==-1; },
  function(s, memberName){ return memberName.indexOf('로버트')!==-1 && String(s.date)==='2026-04-11' && (s.content||'').replace(/\s/g,'').indexOf('아이언스윙')!==-1; }
];
function purgeZombieSessions(){
  var killed = 0;
  Object.keys(S.sessions||{}).forEach(function(mid){
    var m = (S.members||[]).find(function(x){return x.id===mid;});
    var name = (m&&m.name)||'';
    S.sessions[mid] = (S.sessions[mid]||[]).filter(function(s){
      var isZombie = ZOMBIE_SESSIONS.some(function(match){ try{ return match(s, name); }catch(e){ return false; } });
      if(!isZombie) return true;
      if(!S.deletedSessionIds) S.deletedSessionIds = {};
      S.deletedSessionIds[s.id] = Date.now();          // tombstone — 이 기기에선 영구 차단
      try{ cloud.deleteSession(s.id); }catch(e){}       // 서버에서도 삭제
      killed++;
      return false;
    });
  });
  if(killed){ try{save();}catch(e){} console.warn('[zombie] 유령 세션 '+killed+'건 정리됨'); }
  return killed;
}

// 세션 업로드 — 성공 확인 전까지 _dirty 유지 (오프라인이어도 부팅 머지가 재시도).
// _dirty 없는 캐시 세션은 재업로드 대상이 아니므로, 타 기기에서 삭제한 기록이 부활하지 않는다.
// 회원 정보 업로드 — 성공 확인 전까지 _dirty 유지. 네트워크 실패해도 부팅 머지가 재시도.
function syncMemberUp(m){
  if(!m) return;
  m._dirty = true;
  try{save();}catch(e){}
  Promise.resolve(cloud.upsertMember(m)).then(function(ok){ if(ok){ delete m._dirty; try{save();}catch(e){} } });
}
// 체형평가 업로드 — 실패 시 _dirtyAssess 에 표시 → 머지에서 재시도.
function syncAssessUp(mid, key, v){
  if(!S._dirtyAssess) S._dirtyAssess={};
  var k=mid+'|'+key; S._dirtyAssess[k]=true;
  try{save();}catch(e){}
  Promise.resolve(cloud.upsertAssessment(mid,key,v.result,v.note)).then(function(ok){ if(ok){ delete S._dirtyAssess[k]; try{save();}catch(e){} } });
}
function syncSessionUp(mid, s){
  if(!s) return;
  s._dirty = true;
  try{save();}catch(e){}
  Promise.resolve(cloud.upsertSession(mid, s)).then(function(ok){
    if(ok){ delete s._dirty; try{save();}catch(e){} }
  });
}

// 🔇 샷 수신 일시정지 — 옛 에이전트/잡음으로 가짜 샷 들어올 때 긴급 차단
function shotPauseOn(){try{return localStorage.getItem('golf_pt_shotpause')==='1';}catch(e){return false;}}
function toggleShotPause(){
  var on = shotPauseOn();
  if(!on){
    if(!confirm('샷 수신을 일시정지합니다.\n\n• 트랙맨 에이전트가 보내는 새 샷이 이 기기에 안 들어옵니다\n• 라이브 화면의 베이/세션도 잠시 비워집니다\n• 다시 켜면 즉시 복귀합니다\n\n계속할까요?')) return;
    try{localStorage.setItem('golf_pt_shotpause','1');}catch(e){}
    // 즉시 로컬 라이브도 비워서 화면에 부활 못 함
    S.shotEvents=[]; S.activeSessions={};
    try{save();}catch(e){}
    liveToastSafe('🔇 샷 수신 일시정지');
  } else {
    try{localStorage.removeItem('golf_pt_shotpause');}catch(e){}
    liveToastSafe('▶ 샷 수신 재개');
    // 재개 즉시 한 번 동기화
    try{ if(typeof refreshFromCloud==='function') refreshFromCloud(); }catch(e){}
  }
  render();
}

// '이 기기 자동 로그인' (생체 미지원 기기용) — 켜져 있으면 다음 부팅 시 비번 없이 입장
function deviceTrusted(){try{return localStorage.getItem('golf_pt_trust_device')==='1';}catch(e){return false;}}
function setDeviceTrust(on){try{if(on)localStorage.setItem('golf_pt_trust_device','1');else localStorage.removeItem('golf_pt_trust_device');}catch(e){}}
function submitPassword(){var p=S.pendingRole;if(!p)return;var key=p.role==='infodesk'?'infodesk':(p.role==='admin'?'관리자':p.user);if(S.pwInput===getPassword(key)){logAudit('auth','로그인',p.user||key,{role:p.role,method:'password'});
  // 생체 미지원 기기에서 '자동 로그인' 체크 시 → 이 기기 신뢰 저장
  if(!bio.available && S.trustDevice){ setDeviceTrust(true); }
  if(bio.available && !bio.isRegistered(p.role,p.user)){S.bioEnrollFor={role:p.role,user:p.user};S.showPwModal=false;render();return;}activateRole(p.role,p.user);}else{S.pwError=true;render();}}
function cancelPassword(){S.showPwModal=false;S.pendingRole=null;S.pwError=false;S.bioError='';render();}

// ============ 생체 인증 (Face ID / 지문 / 홍채) — WebAuthn ============
const bio = {
  available:false,
  KEY_PREFIX:'golf_pt_bio_',
  // 모바일/태블릿(아이폰·아이패드·갤럭시폰·갤럭시탭 등)인지 판별. 데스크탑은 false.
  isMobileDevice(){
    try{
      var ua=navigator.userAgent||'';
      var uaMobile = /iPhone|iPad|iPod|Android|Mobile|Tablet|Silk|Kindle|PlayBook|BlackBerry|Windows Phone/i.test(ua);
      // 아이패드 OS 13+: MacIntel + 멀티터치로 위장 → 터치 지원 Mac은 태블릿으로 간주
      var iPadOS = (navigator.platform==='MacIntel' && (navigator.maxTouchPoints||0)>1);
      // UA-CH(최신 크롬/엣지): navigator.userAgentData.mobile
      var uaCh = (navigator.userAgentData && navigator.userAgentData.mobile===true);
      // 터치 + coarse 포인터(손가락) 동시 → 터치 1순위 기기(태블릿/폰)
      var coarseTouch = (typeof matchMedia==='function' && matchMedia('(pointer:coarse)').matches && (navigator.maxTouchPoints||0)>0);
      return uaMobile || iPadOS || uaCh || coarseTouch;
    }catch(e){ return false; }
  },
  async init(){
    try{
      if(!this.isMobileDevice()){ this.available=false; return; }   // 데스크탑/노트북 → 생체 UI 숨김
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
    if(window.__bioActive) throw new Error('인증 진행 중');   // 동시 생체창 방지
    window.__bioActive = true;
    try{
    var challenge=new Uint8Array(32); crypto.getRandomValues(challenge);
    var uid=new TextEncoder().encode(role+':'+user);
    var cred=await navigator.credentials.create({publicKey:{
      challenge:challenge.buffer,
      rp:{name:APP_BRAND.nameKo+' Golf PT',id:location.hostname},
      user:{id:uid,name:role+':'+user,displayName:user+' ('+role+')'},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{userVerification:'required',authenticatorAttachment:'platform',residentKey:'preferred'},
      timeout:60000,attestation:'none'
    }});
    if(!cred||!cred.rawId) throw new Error('등록 실패');
    localStorage.setItem(this._id(role,user), this._b64u(cred.rawId));
    return true;
    } finally { window.__bioActive = false; }
  },
  async verify(role,user){
    // 락 먼저 — 어떤 동기 검사보다 앞 (동시 호출이 둘 다 통과하는 레이스 차단)
    if(window.__bioActive) return false;
    if(S.currentRole) return false;       // 이미 로그인됐으면 verify 자체 거부 (잔여 시트 방지)
    if(!this.available) return false;
    var idStr=localStorage.getItem(this._id(role,user));
    if(!idStr) return false;
    window.__bioActive = true;
    try{
    var challenge=new Uint8Array(32); crypto.getRandomValues(challenge);
    var assertion=await navigator.credentials.get({publicKey:{
      challenge:challenge.buffer,
      allowCredentials:[{type:'public-key',id:this._fromB64u(idStr)}],
      userVerification:'required',timeout:60000
    }});
    return !!assertion;
    } finally { window.__bioActive = false; }
  }
};

// 모달 자동 시도 — 등록된 사용자면 모달 열리자마자 생체인증 트리거
// _bioTrying: 중복 방지. 자동 트리거 + 사용자 버튼 탭이 겹쳐도 Face ID 창은 1번만.
var _bioTrying = false;
async function bioAutoTry(){
  if(_bioTrying || window.__bioActive) return;   // 이미 인증창 떠 있으면 무시 (두 번 뜸 방지)
  var p=S.pendingRole; if(!p||!bio.available) return;
  if(!bio.isRegistered(p.role,p.user)) return;
  _bioTrying = true;
  S.bioBusy=true; S.bioError=''; render();
  try{
    var ok=await bio.verify(p.role,p.user);
    S.bioBusy=false;
    if(ok){logAudit('auth','로그인',p.user||p.role,{role:p.role,method:'biometric'});activateRole(p.role,p.user);return;}
    S.bioError='생체 인증 실패 — 비밀번호로 로그인하세요';
  }catch(e){
    S.bioBusy=false;
    S.bioError=(e&&e.name==='NotAllowedError')?'생체 인증 취소됨':'생체 인증 오류';
  }finally{
    _bioTrying = false;
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
function switchRole(){if(S.currentUser) logAudit('auth','로그아웃',S.currentUser,{});S.currentRole=null;S.currentUser=null;location.hash='';try{sessionStorage.removeItem('golf_pt_auth');}catch(e){}
  // 로그아웃하면 랜딩 인트로 몬타주를 다시 처음부터 재생 (로그인 페이드 인 포함)
  try{ if(window.__heroIntro && window.__heroIntro.timer) clearTimeout(window.__heroIntro.timer); }catch(e){}
  window.__heroIntro=null; window.__heroIntroPlayed=false; window.__heroLoginRevealed=false;
  // 로그아웃 시 자동 로그인 해제 → 역할 선택 화면을 쓸 수 있게 (다음 로그인 때 재설정 가능)
  setDeviceTrust(false);
  S.trustDevice=false;
  render();}

async function init(){
  loadLocal();purgeZombieSessions();readHash();render();
  if(navigator.storage&&navigator.storage.persist){try{await navigator.storage.persist();}catch(e){}}
  await mediaDB.init();
  var allMedia=await mediaDB.getAll();
  allMedia.forEach(function(rec){try{S.mediaUrls[rec.id]=URL.createObjectURL(rec.blob);}catch(e){}});
  Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) s.media.forEach(function(m){if(m.mediaId&&!S.mediaUrls[m.mediaId]) console.warn('[media] missing:',s.id,m.name,m.mediaId);});});});
  if(allMedia.length>0) render();
  r2.init();
  try{ if(typeof checkSttReady==='function') checkSttReady(); }catch(e){}   // 녹음 서버 준비 여부 미리 확인
  // 시작하자마자 Face ID/자동로그인으로 대시보드로 넘어가지 않도록 부팅 자동로그인 제거.
  // 랜딩(입장) 화면을 항상 먼저 보여주고, 생체/신뢰기기 로그인은 사용자가 랜딩에서
  // 역할을 탭하는 순간 실행된다(setRole → bioAutoTry / 신뢰기기 즉시입장).
  bio.init().then(function(){ render(); });
  if(cloud.init()){
    S.cloudSync='loading';render();
    const localSnap={members:S.members.map(m=>({...m})),assessments:JSON.parse(JSON.stringify(S.assessments||{})),sessions:JSON.parse(JSON.stringify(S.sessions||{}))};
    const remote=await cloud.loadAll();
    if(remote){
      if(remote.members.length>0){
        var localMediaMap={};Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(s.media) localMediaMap[s.id]=s.media;});});
        S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;
        // 삭제된 회원 tombstone — 서버 캐시에서 되살아난 회원을 즉시 재삭제
        var _mtomb=S.deletedMemberIds||{};
        if(Object.keys(_mtomb).length){
          S.members=S.members.filter(function(m){ if(_mtomb[m.id]){ try{cloud.deleteMember(m.id);}catch(e){} delete S.assessments[m.id]; delete S.sessions[m.id]; return false; } return true; });
        }
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
        for(const m of localSnap.members){if(_mtomb[m.id]) continue; if(!remoteMemberIds.has(m.id)){await cloud.upsertMember(m);S.members.push(m);remoteMemberIds.add(m.id);}}
        // 이 기기의 미업로드 회원 수정(_dirty) 재적용 — 새로고침 롤백으로 사라지지 않게
        for(const dm of localSnap.members){ if(!dm._dirty||_mtomb[dm.id]) continue; var _i=S.members.findIndex(function(x){return x.id===dm.id;}); if(_i>=0) S.members[_i]=dm; else { S.members.push(dm); } syncMemberUp(S.members[_i>=0?_i:S.members.length-1]); }
        // 미업로드 평가(_dirtyAssess) 재적용
        var _da=S._dirtyAssess||{}; for(const k in _da){ if(!_da[k]) continue; var _p=k.split('|'); var _mid=_p[0], _key=_p[1]; var _lv=(localSnap.assessments[_mid]||{})[_key]; if(_lv){ if(!S.assessments[_mid]) S.assessments[_mid]={}; S.assessments[_mid][_key]=_lv; syncAssessUp(_mid,_key,_lv); } }
        const remoteSessionIds=new Set();Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){remoteSessionIds.add(s.id);});});
        // 재업로드는 "이 기기가 만들었고 아직 업로드 안 끝난(_dirty)" 세션만.
        // 캐시에만 남은 세션을 무조건 복구하면, 다른 기기/브라우저에서 삭제한 기록이 부활한다.
        for(const mid in localSnap.sessions){for(const s of localSnap.sessions[mid]){if(_tomb[s.id]) continue; if(!s._dirty) continue; if(!remoteSessionIds.has(s.id)){const ok=await cloud.upsertSession(mid,s);if(ok) delete s._dirty;if(!S.sessions[mid]) S.sessions[mid]=[];S.sessions[mid].push(s);remoteSessionIds.add(s.id);}}}
        for(const mid in localSnap.assessments){for(const key in localSnap.assessments[mid]){if(key.indexOf('_')===0) continue;const hasRemote=S.assessments[mid]&&S.assessments[mid][key];if(!hasRemote){const v=localSnap.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);if(!S.assessments[mid]) S.assessments[mid]={};S.assessments[mid][key]=v;}}}
        if(!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=S.members[0]?S.members[0].id:null;}
      } else {await seedRemote();}
      purgeZombieSessions();   // 클라우드 머지 후 유령 세션 재확인(서버 삭제 포함)
      save();S.cloudSync='connected';
    } else {S.cloudSync='error';}
    // 라이브 세션(베이/활성세션/굿샷) 클라우드 로드 — 테이블 미생성 시 null 반환 → 로컬 유지
    try{const live=await cloud.loadLive();if(live){if(CONFIG_BAYS_SET){S.bays=BAYS_DEFAULT.slice();cloud.upsertBays(S.bays);}else if(live.bays&&live.bays.length){S.bays=live.bays;}else{cloud.upsertBays(S.bays);}applyRemoteActive(live.activeSessions);(function(){var om={};(S.shotEvents||[]).forEach(function(s){om[s.id]=s;});S.shotEvents=(live.shotEvents||[]).map(function(s){var o=om[s.id];if(o){if(o._rcvAt)s._rcvAt=o._rcvAt;if(o._isNew)s._isNew=o._isNew;if(o._uiSavedAt)s._uiSavedAt=o._uiSavedAt;}return s;});})();reconcileAgentShots();save();}}catch(e){console.warn('[cloud] live load skip:',e);}
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
    var ok=await r2.upload(key, rec.blob);
    if(ok){
      p.m.r2Status='synced';
      p.m.r2Key=p.m.r2Key || p.m.mediaId;
      var stored=(S.sessions[p.mid]||[]).find(function(x){return x.id===p.sid;});
      if(stored) syncSessionUp(p.mid, stored);
      fixed++;
    } else {
      p.m.r2Status='failed';
    }
  }
  if(fixed>0){console.log('[r2-sync]', fixed,'개 영상 동기화 완료'); save(); render();}
}

async function seedRemote(){try{for(const m of S.members) await cloud.upsertMember(m);for(const mid in S.assessments){for(const key in S.assessments[mid]){const v=S.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);}}for(const mid in S.sessions){for(const s of S.sessions[mid]) await cloud.upsertSession(mid,s);}}catch(e){console.warn('[cloud] seedRemote fail:',e);}}

// 새로고침 버튼 — Supabase 데이터 갱신 + SW 캐시 정리 + 페이지 리로드 (PWA에 새로고침이 없을 때)
// 새로고침 = Supabase 데이터만 다시 받아옴 (페이지 reload 안 함 → 흰 화면 원천 차단).
// SW/코드 업데이트는 index.html이 백그라운드로 처리.
async function reloadApp(){
  if(S.uploading>0){ liveToastSafe('업로드 중 — 잠시 후 다시'); return; }
  S.cloudSync='loading';
  try{ render(); }catch(e){}
  try{
    if(cloud&&cloud.enabled){
      await Promise.race([
        refreshFromCloud(),
        new Promise(function(_,rej){setTimeout(function(){rej(new Error('timeout'));},6000);})
      ]);
    } else {
      // 로컬 모드면 그냥 화면만 갱신
      try{ render(); }catch(e){}
    }
    liveToastSafe('✓ 최신 데이터로 동기화됨');
  }catch(e){
    console.warn('[reload] cloud:',e&&e.message);
    S.cloudSync='error';
    try{ render(); }catch(e2){}
    liveToastSafe('동기화 지연 — 네트워크 확인');
  }
}
function liveToastSafe(msg){ try{ if(typeof liveToast==='function') liveToast(msg,'ok'); }catch(e){} }

async function refreshFromCloud(){
  if(!cloud.enabled) return;S.cloudSync='loading';render();
  const remote=await cloud.loadAll();
  if(remote){
    var localMediaMap={}, localDirty={};
    Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){
      if(s.media) localMediaMap[s.id]=s.media;
      if(s._dirty){ if(!localDirty[mid]) localDirty[mid]=[]; localDirty[mid].push(s); }   // 업로드 미완 보존
    });});
    S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;
    var _mtomb2=S.deletedMemberIds||{};
    if(Object.keys(_mtomb2).length){ S.members=S.members.filter(function(m){ if(_mtomb2[m.id]){ try{cloud.deleteMember(m.id);}catch(e){} delete S.assessments[m.id]; delete S.sessions[m.id]; return false; } return true; }); }
    var _tomb=S.deletedSessionIds||{};
    Object.keys(S.sessions).forEach(function(mid){S.sessions[mid]=(S.sessions[mid]||[]).filter(function(s){if(_tomb[s.id]){try{cloud.deleteSession(s.id);}catch(e){}return false;}return true;});});
    Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){if(localMediaMap[s.id]) s.media=localMediaMap[s.id];});});
    // _dirty(업로드 전) 로컬 세션 재부착 + 업로드 재시도 — 새로고침으로 새 일지가 증발하지 않게
    Object.keys(localDirty).forEach(function(mid){
      var have={};(S.sessions[mid]||[]).forEach(function(s){have[s.id]=true;});
      localDirty[mid].forEach(function(s){
        if(_tomb[s.id]||have[s.id]) return;
        if(!S.sessions[mid]) S.sessions[mid]=[];
        S.sessions[mid].push(s);
        try{ syncSessionUp(mid, s); }catch(e){}
      });
    });
    if(S.members.length>0&&!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=S.members[0].id;}
    purgeZombieSessions();
    save();S.cloudSync='connected';
  }else{S.cloudSync='error';}
  try{const live=await cloud.loadLive();if(live){if(live.bays&&live.bays.length&&!CONFIG_BAYS_SET) S.bays=live.bays;applyRemoteActive(live.activeSessions);(function(){var om={};(S.shotEvents||[]).forEach(function(s){om[s.id]=s;});S.shotEvents=(live.shotEvents||[]).map(function(s){var o=om[s.id];if(o){if(o._rcvAt)s._rcvAt=o._rcvAt;if(o._isNew)s._isNew=o._isNew;if(o._uiSavedAt)s._uiSavedAt=o._uiSavedAt;}return s;});})();reconcileAgentShots();save();}}catch(e){console.warn('[cloud] live refresh skip:',e);}
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
