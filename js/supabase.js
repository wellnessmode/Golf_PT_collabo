// 공통 Supabase 클라이언트
(function () {
  const cfg = window.NG_CONTRACT_CONFIG;
  function fail(msg) {
    document.body.innerHTML =
      '<div class="container"><div class="card">' +
      '<h2 class="error">설정 필요</h2><p>' + msg + '</p></div></div>';
    throw new Error(msg);
  }
  if (!cfg) fail('config.js 가 로드되지 않았습니다. config.example.js 참고하여 같은 폴더에 config.js 를 만들어 주세요.');
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1) {
    fail('config.js 의 SUPABASE_URL 을 실제 값으로 채워 주세요.');
  }
  if (!cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY === 'YOUR-ANON-KEY') {
    fail('config.js 의 SUPABASE_ANON_KEY 을 실제 값으로 채워 주세요.');
  }
  if (typeof supabase === 'undefined') {
    fail('Supabase JS SDK 가 로드되지 않았습니다.');
  }
  window.sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
})();
