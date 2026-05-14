// 내셔널짐 전자계약서 — 환경 설정 샘플
// 사용법:
//   1) 이 파일을 같은 폴더에 'config.js'로 복사
//   2) 아래 값을 실제 값으로 채워 저장
//   3) config.js 는 .gitignore 에 등록되어 git 에 올라가지 않음
window.NG_CONTRACT_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',

  // 사업자(개인사업자) 정보
  BUSINESS: {
    name: '내셔널짐',
    owner: '대표자명',                 // 사업주 성함
    registration_no: '000-00-00000',   // 사업자등록번호
    address: '서울특별시 ...',          // 사업장 주소
    phone: '02-0000-0000'              // 대표 연락처
  },

  // 지점 목록 (관리자 발송 화면에서 선택)
  BRANCHES: ['1호점', '2호점', '3호점'],

  // 서명 페이지 절대 URL (배포 후 채움)
  // 카카오톡 메시지에 들어갈 링크의 베이스
  SIGN_BASE_URL: 'https://YOUR-DOMAIN/contract/sign.html'
};
