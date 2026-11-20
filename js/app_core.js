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
const BAY_COLORS = ['bay-blue','bay-amber','bay-green'];

// ============ 화면 출력 보호 (저장형 XSS 차단, v9.99) ============
// DB·기기 저장소에서 온 값(회원 이름·메모·작성자·샷 정보·알림 등)은 화면 HTML 에 넣기 전에 반드시 esc().
// onclick 같은 JS 안에 넣는 id 는 safeId() — 영문·숫자·_- 만 통과, 아니면 '' (눌러도 아무 일 없음).
// id 가 아닌 문자열을 onclick 에 넣어야 하면 jsq() (따옴표까지 안전한 JS 문자열 리터럴).
// 색상 클래스는 허용 목록만(safeColor·safeBayColor), 영상·사진 주소는 safeUrl()(http·https·blob·data 이미지/영상만).
function esc(s){ return String(s==null?'':s).replace(/[&<>"'`]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c];}); }
function safeId(id){ id=String(id==null?'':id); return /^[A-Za-z0-9_-]{1,128}$/.test(id)?id:''; }
function jsq(s){ return esc(JSON.stringify(String(s==null?'':s))); }
function safeColor(c){ return AVATAR_COLORS.indexOf(c)!==-1?c:AVATAR_COLORS[0]; }
function safeBayColor(c){ return BAY_COLORS.indexOf(c)!==-1?c:BAY_COLORS[0]; }
function safeUrl(u){ u=String(u==null?'':u).trim(); return /^(https?:|blob:|data:(image|video)\/)/i.test(u)?u:''; }

// ============ B2B 화이트라벨 (config.js 오버라이드) ============
// 브랜드/지도자/베이/초기비번은 config.js 값이 있으면 그걸 쓰고, 없으면 기본값.
const APP_BRAND = Object.assign({
  name:'NATIONAL GYM', nameKo:'내셔널짐', sub:'PT & GOLF',
  // 앱 이름 — 홈 화면·탭 제목·푸시·생체인증 RP 등 "앱"을 가리키는 모든 곳. 상호와 동일하게(레슨 회원뿐 아니라 시설 이용 회원까지 포괄).
  appName:'내셔널짐 피티앤골프',
  // 정식 상호 — 고객용 리포트 등 대외 노출 문구에 사용
  store:'내셔널짐 피티앤골프 스튜디오', storeEn:'NATIONAL GYM PT & GOLF STUDIO',
  tagline:'COLLABORATIVE COACHING PLATFORM',
  splashSub:'PT & GOLF STUDIO',             // 인트로(스플래시) 서브 — 업장 성격
  reportSub:'PERFORMANCE REPORT', measuredBy:'TRACKMAN iO',
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

// ============ 비밀번호 — 서버(Supabase) 검증 ============
// worker/supabase_passwords.sql 을 실행하면 비밀번호는 서버에 bcrypt 해시로만 저장되고 pw_login·pw_change·
// pw_admin_reset 함수로만 확인·변경한다 → 앱을 지웠다 다시 깔거나 폰을 바꿔도 비밀번호가 그대로.
// 그 SQL 을 아직 안 돌렸으면(함수 없음) 위 getPassword/setPassword 로 예전처럼 이 기기 값·초기값을 쓴다(하위호환).
// DEFAULT_PASSWORDS 는 서버로 옮기는 동안만 필요 — 모두 한 번씩 서버로 로그인한 뒤 다음 버전에서 지운다.
function pwKeyOf(role,user){ return role==='infodesk'?'infodesk':(role==='admin'?'관리자':user); }
function _legacyStoredPw(key){ try{ return (JSON.parse(localStorage.getItem('golf_pt_passwords')||'{}'))[key]||''; }catch(e){ return ''; } }
// 서버가 비밀번호를 맡은 뒤에는 이 기기의 평문 값을 지운다
function _forgetLegacyPw(key){ try{ var s=JSON.parse(localStorage.getItem('golf_pt_passwords')||'{}'); if(Object.prototype.hasOwnProperty.call(s,key)){ delete s[key]; localStorage.setItem('golf_pt_passwords', JSON.stringify(s)); } }catch(e){} }
const pwServer = {
  // 이 기기가 서버 비밀번호를 한 번이라도 확인했는지 — 그 뒤로는 오프라인이어도 초기값·옛 기기값으로 못 들어온다
  known(){ try{ return localStorage.getItem('golf_pt_pw_server')==='1'; }catch(e){ return false; } },
  // → {data} | {missing:true}(SQL 미실행·되돌림) | {offline:true}(네트워크·서버 오류)
  async call(fn, args, timeoutMs){
    if(!cloud.enabled || !cloud.client || typeof cloud.client.rpc!=='function') return {offline:true};
    try{
      // 응답이 영영 안 오면(전파는 잡히는데 패킷이 막히는 지하·음영지역) 로그인 창이 안 풀리므로 시간 제한 → 오프라인 처리
      var r=await Promise.race([cloud.client.rpc(fn, args), new Promise(function(res){ setTimeout(function(){ res({__timeout:true}); }, timeoutMs||8000); })]);
      if(r && r.__timeout) return {offline:true};
      if(r && r.error){
        var c=String(r.error.code||''), m=String(r.error.message||'');
        if(c==='PGRST202' || c==='42883' || /could not find the function/i.test(m)) return {missing:true};
        // 서버가 이유를 적어서 거절(raise exception — 예: 공개된 초기 비밀번호로 초기화) → 그 글을 그대로 보여 준다
        if(c==='P0001' && m){ try{ localStorage.setItem('golf_pt_pw_server','1'); }catch(e){} return {error:{code:c, message:m}}; }
        return {offline:true};
      }
      try{ localStorage.setItem('golf_pt_pw_server','1'); }catch(e){}
      return {data:(r && r.data) || {}};
    }catch(e){ return {offline:true}; }
  }
};
// 오프라인 로그인용 — 서버에서 맞은 비밀번호를 이 기기에 PBKDF2 해시로만 기억(평문 저장 안 함)
const pwCache = {
  K:'golf_pt_pw_cache',
  _all(){ try{ return JSON.parse(localStorage.getItem(this.K)||'{}'); }catch(e){ return {}; } },
  async _derive(pw, saltB64){
    var salt = saltB64 ? Uint8Array.from(atob(saltB64), function(c){ return c.charCodeAt(0); }) : crypto.getRandomValues(new Uint8Array(16));
    var k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    var bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', salt:salt, iterations:100000, hash:'SHA-256'}, k, 256));
    var b64 = function(u){ var s=''; for(var i=0;i<u.length;i++) s+=String.fromCharCode(u[i]); return btoa(s); };
    return {s:b64(salt), h:b64(bits)};
  },
  async put(key, pw){ try{ if(!(window.crypto && crypto.subtle)) return; var d=await this._derive(pw); var a=this._all(); a[key]=d; localStorage.setItem(this.K, JSON.stringify(a)); }catch(e){} },
  // true 맞음 / false 틀림 / null 기억 없음
  async check(key, pw){ try{ var a=this._all()[key]; if(!a || !(window.crypto && crypto.subtle)) return null; return (await this._derive(pw, a.s)).h===a.h; }catch(e){ return null; } }
};
// ============ 로그인 토큰 (보안 S1 — worker/supabase_tokens.sql 실행 뒤) ============
// 서버 비밀번호 로그인(pw_login)·비밀번호 변경(pw_change)이 성공하면 서버가 토큰을 준다(직원 30일 · 초기/임시 비밀번호면 15분).
// 이 기기에 {t,exp,u,r} 로 두고 DB 요청엔 'x-staff-token', 저장 워커 요청엔 'X-Staff-Token' 으로 붙인다 → 누가 저장했는지 서버에 남고,
// DB 를 잠그면(supabase_lock.sql) 토큰 없는 요청은 아무것도 못 읽는다. 로그아웃하면 지운다.
const tokStore = {
  K:'golf_pt_tok', _m:null, _mOnly:false,
  _decode(t){ try{ var p=String(t).split('.'); if(p.length!==3 || p[0]!=='gpt1') return null; var s=p[1].replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; var b=atob(s), u=new Uint8Array(b.length); for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i); var j=JSON.parse(new TextDecoder().decode(u)); return (j && typeof j==='object') ? j : null; }catch(e){ return null; } },
  raw(){ var o=null; try{ var s=localStorage.getItem(this.K); o=s?JSON.parse(s):null; }catch(e){ o=null; } if(!o && this._mOnly) o=this._m; return (o && o.t) ? o : null; },
  get(){ var o=this.raw(); return (o && +o.exp > Date.now()/1000+30) ? o : null; },   // 만료(30초 여유) 토큰은 안 씀
  token(){ var o=this.get(); return o ? o.t : ''; },
  forKey(key){ var o=this.get(); return (o && o.u===key) ? o : null; },
  save(t, exp, key){
    if(!t || typeof t!=='string' || t.length>2048) return false;
    var p=this._decode(t)||{};
    var o={t:t, exp:+(exp||p.exp)||0, u:String(p.u||key||''), r:String(p.r||'')};
    if(!o.exp || !o.u) return false;
    this._m=o; this._mOnly=false;
    try{ localStorage.setItem(this.K, JSON.stringify(o)); }catch(e){ this._mOnly=true; }   // 저장 못 하는 기기(시크릿 모드)는 이 화면에서만
    this._changed(); return true;
  },
  clear(){ this._m=null; this._mOnly=false; try{ localStorage.removeItem(this.K); }catch(e){} this._changed(); },
  _changed(){ try{ _who.at=0; _authLost.at=0; _sbNoTok=false; }catch(e){} }   // 토큰이 바뀌면 서버 확인 결과를 다시 받는다
};
// pw_login·pw_change 응답의 토큰 저장. 비밀번호를 바꾸면 서버가 그 계정의 예전 토큰을 모두 무효로 하므로, 새 토큰이 없으면 옛 것도 버린다
function _tokFromPw(d, key, changed){ try{ if(d && d.token) tokStore.save(d.token, d.exp, key); else if(changed){ var o=tokStore.raw(); if(o && o.u===key) tokStore.clear(); } }catch(e){} }
// supabase-js 의 모든 요청(global.fetch)에 'x-staff-token' 을 붙인다 — 토큰이 없으면 예전 요청과 똑같음.
// 안전장치: 그 헤더가 붙은 요청만 네트워크 오류(예상 밖 CORS 거절)로 거듭 실패하고 헤더 없이는 되면, 잠기지 않은 DB 에서는
// 30분 동안 헤더를 빼고 보낸다(앱이 멈추지 않게). 한 번의 실패는 대부분 잠깐 끊긴 것이라 같은 요청을 먼저 한 번 더 보낸다 — 예전엔
// 한 번 끊기면 이 화면 내내 토큰 없이 보내, 저장 기록에 누가 했는지 안 남았고 그 사이 DB 를 잠그면 유효한 토큰을 버리고 로그아웃됐다.
// 잠긴 DB 와 토큰 확인(gpt_whoami)에는 헤더를 늘 붙인다(빼면 볼 수 있는 게 없고, 확인이 '무효'로 나온다).
var _sbNoTok=false;   // 헤더를 빼고 보내는 시한(ms) — false/0 이면 붙인다
function _sbNoTokOn(){ return !!_sbNoTok && Date.now()<_sbNoTok; }
function _sbIsWhoami(input){ try{ return /\/rpc\/gpt_whoami(\?|$)/.test(String((input && input.url) || input || '')); }catch(e){ return false; } }
function _sbFetch(input, init){
  var who=_sbIsWhoami(input);
  var t=(_sbNoTokOn() && S._dbMode!=='locked' && !who) ? '' : tokStore.token(), i2;
  if(!t){
    // 잠긴 DB 에서 로그인 중인 이 기기의 토큰이 만료됨(15분 임시 토큰을 '나중에' 등) — 이대로는 아무것도 안 보이고 지우기·고치기가 오류 없이
    // 무시된다 → 빈 답을 기다리지 않고 바로 비밀번호 로그인으로 (이 요청은 그대로 보냄)
    if(S._dbMode==='locked' && S.currentRole && S.cloudSync==='connected' && !tokStore.get() && !_sbFetch._need){
      _sbFetch._need=1; setTimeout(function(){ _sbFetch._need=0; if(S._dbMode==='locked' && S.currentRole && !tokStore.get()) _authNeedLogin(); }, 0);
    }
    return fetch(input, init);
  }
  try{ i2=Object.assign({}, init||{}); var h=new Headers(i2.headers || ((typeof Request!=='undefined' && input instanceof Request) ? input.headers : undefined)); h.set('x-staff-token', t); i2.headers=h; }catch(e){ return fetch(input, init); }
  return fetch(input, i2).catch(function(e){
    if((e && e.name==='AbortError') || S._dbMode==='locked' || who) throw e;
    return fetch(input, i2).catch(function(e2){   // 잠깐 끊긴 것인지 한 번 더
      if(e2 && e2.name==='AbortError') throw e2;
      return fetch(input, init).then(function(r){ _sbNoTok=Date.now()+30*60000; try{ console.warn('[auth] x-staff-token 헤더가 막혀 30분 동안 빼고 보냅니다'); }catch(_){} return r; }, function(){ throw e; });
    });
  });
}
// DB 잠금 상태 — 'locked' | 'open' | ''(모름). 잠긴 걸 본 기기는 기억해 두고 다음 부팅 때 먼저 확인한다
function _setDbMode(m){ S._dbMode=m; try{ if(m==='locked') localStorage.setItem('golf_pt_dbmode','locked'); else localStorage.removeItem('golf_pt_dbmode'); }catch(e){} }
function _dbModeCached(){ try{ return localStorage.getItem('golf_pt_dbmode')||''; }catch(e){ return ''; } }
// 서버에 토큰·잠금 상태 묻기 (gpt_whoami → {ok,u,r,b,exp,mode}) → {data} | {missing}(토큰 SQL 전) | {offline}
var _who={at:0, r:null};
async function authWhoami(maxAgeMs){
  if(_who.r && maxAgeMs && Date.now()-_who.at < maxAgeMs) return _who.r;
  var r=await pwServer.call('gpt_whoami', {}, 8000);
  if(r.data){ var d=r.data; if(Array.isArray(d)) d=d[0]; if(d && d.gpt_whoami && typeof d.gpt_whoami==='object') d=d.gpt_whoami;
    if(d && typeof d.mode==='string'){ r={data:d}; _setDbMode(d.mode==='locked'?'locked':'open'); } else r={offline:true}; }   // 모르는 모양 → 확인 못 한 것으로
  else if(r.missing) _setDbMode('open');   // 토큰 SQL 전 = 잠글 수 없는 단계
  _who={at:Date.now(), r:r};
  return r;
}
// 부팅 때 1번 — 토큰이 있거나 config AUTH_REQUIRED 이거나 이 기기가 전에 잠긴 DB 를 봤을 때만 묻는다(그 밖엔 요청 0개 추가)
// → 'login' (DB 잠김 + 쓸 토큰 없음: 서버 자료를 불러오지도, 빈 서버로 보고 시드하지도 않고 비밀번호 로그인부터) | 'ok'
async function authBoot(){
  var cfg=window.APP_CONFIG||{};
  var raw=tokStore.raw(), tok=tokStore.get();
  if(raw && !tok) tokStore.clear();                    // 기기 시계로도 만료 → 버림 (만료된 토큰은 갱신도 안 됨)
  S._dbMode=_dbModeCached();
  if(!tok && !cfg.AUTH_REQUIRED && S._dbMode!=='locked') return 'ok';
  var w=await authWhoami();
  if(!w.data) return 'ok';                             // 토큰 SQL 전·오프라인 → 예전처럼
  if(tokStore.token()!==(tok?tok.t:'')) return 'ok';   // 묻는 사이 비밀번호로 새로 로그인함 → 새 토큰으로 진행
  if(tok && !w.data.ok) tokStore.clear();              // 서버가 무효라고 함(비밀번호 변경·분실 처리 등)
  if(w.data.mode==='locked' && !w.data.ok) return 'login';
  if(w.data.ok) setTimeout(function(){ tokMaybeRefresh(); }, 3000);
  return 'ok';
}
// 토큰이 7일 안에 끝나면 하루 한 번 gpt_refresh 로 새 30일 토큰 (비밀번호 다시 안 쳐도 됨 — 마지막 비밀번호 로그인부터 90일까지)
async function tokMaybeRefresh(){
  try{
    var o=tokStore.get(); if(!o) return;
    if(o.exp - Date.now()/1000 > 7*86400) return;
    var last=0; try{ last=+(localStorage.getItem('golf_pt_tok_rf')||0); }catch(e){}
    if(Date.now()-last < 20*3600*1000) return;
    try{ localStorage.setItem('golf_pt_tok_rf', String(Date.now())); }catch(e){}
    var r=await pwServer.call('gpt_refresh', {}, 10000);
    if(r.data && r.data.ok && r.data.token && tokStore.raw() && tokStore.raw().t===o.t) tokStore.save(r.data.token, r.data.exp, o.u);
  }catch(e){}
}
// 잠긴 DB 인데 쓸 토큰이 없음 → 비밀번호 로그인부터 (새로고침으로 복원된 로그인도 그 사람 비밀번호 창으로)
function _authNeedLogin(){
  S._authNeedLoad=true; S.cloudSync='auth';
  var role=S.currentRole, user=S.currentUser;
  if(role){
    S.currentRole=null; S.currentUser=null; S.showLiveSession=false; location.hash='';
    try{ sessionStorage.removeItem('golf_pt_auth'); }catch(e){} try{ window.__authed=false; }catch(e){}
    try{ if(typeof stopLivePolling==='function') stopLivePolling(); }catch(e){}
    S.pendingRole={role:role, user:user}; S.showPwModal=true; S.pwError=true; S.pwMsg='보안을 위해 비밀번호로 다시 로그인해 주세요'; S.pwInput='';
  }
  try{ render(); }catch(e){}
}
// 잠긴 DB 에서 결과가 텅 빔(토큰 만료·취소) → 서버에 다시 물어 정말 그렇다면 토큰 버리고 로그인부터. 서버 자료는 건드리지 않음
async function _authLost(maxAgeMs){
  if(_authLost.busy || Date.now()-(_authLost.at||0) < 10000) return;
  _authLost.busy=true; _authLost.at=Date.now();
  try{ var before=tokStore.token(); var w=await authWhoami(maxAgeMs);
    if(tokStore.token()===before && w.data && w.data.mode==='locked' && !w.data.ok){ tokStore.clear(); _authNeedLogin(); } }   // 그 사이 새 토큰이면 이 결과는 옛 것
  catch(e){} finally{ _authLost.busy=false; }
}
// 수업 센터 폴링이 '모든 결과 0행'을 받았는데 화면에서 뭔가 지워야 할 때 — 잠긴 DB 에서 토큰이 안 먹혀도 이렇게 보인다(B2 폴링엔 타석 조회가 없어 따로 확인).
// 서버에 그때마다 물어(캐시 안 씀 — 방금 취소된 토큰을 '유효'로 믿지 않게) 토큰이 유효하거나 잠기지 않은 DB 면 믿고, 잠긴 DB + 무효 토큰이면
// 토큰을 버리고 비밀번호 로그인부터(화면 자료는 그대로). 모르면 믿지 않음. 결과를 적용하면 지울 것이 없어지므로 묻는 건 수업이 끝날 때 정도
async function _emptyAnswerTrusted(){
  if(S._dbMode==='open') return true;
  var before=tokStore.token();
  var w=await authWhoami();
  if(w.missing || (w.data && (w.data.mode!=='locked' || w.data.ok))) return true;
  if(w.data && tokStore.token()===before){ tokStore.clear(); _authNeedLogin(); }
  return false;
}
// 잠긴 DB 에서 지우기(영상·행) 직전 — 이 기기 토큰이 지금도 유효한지 서버에 다시 묻는다(캐시 안 씀). 잠긴 DB 는 무효 토큰(다른 폰에서 비밀번호 변경·
// 관리자 초기화·만료)의 지우기를 오류 없이 0행으로 넘겨서, 영상만 지워지고 행은 남아 다른 기기에 영상 없는 샷으로 되살아났다.
// → true 지워도 됨(잠기지 않은 DB 포함) · false 지금은 안 됨(토큰 무효면 비밀번호 로그인부터, 확인 못 하면 다음에)
async function _lockedWriteOk(){
  if(S._dbMode!=='locked') return true;
  if(!tokStore.get()){ if(S.currentRole) _authNeedLogin(); return false; }
  var before=tokStore.token(), w=await authWhoami();
  if(w.missing || (w.data && (w.data.mode!=='locked' || w.data.ok))) return true;
  if(w.data && tokStore.token()===before){ tokStore.clear(); _authNeedLogin(); }
  return false;
}
// 회원 0명 응답 — 정말 빈 스튜디오(첫 설치)인지, 잠금 때문에 안 보이는 것인지. 모르면 빈 서버로 보지 않는다
async function _emptyServerIsReal(){
  if((window.APP_CONFIG||{}).AUTH_REQUIRED) return false;
  var w=await authWhoami();   // 캐시 안 씀 — 방금(30초 안) '잠기지 않음'이었어도 그 사이 잠그거나 토큰이 취소됐을 수 있다(빈 답을 빈 스튜디오로 믿으면 목록이 지워짐)
  if(w.missing) return true;
  return !!(w.data && w.data.mode!=='locked');
}
// 잠금 중 + 이 계정의 토큰 없음 → 생체·자동 로그인으로는 토큰을 못 받으니 비밀번호로만
function _needPwForToken(key){ return (S._dbMode==='locked' || !!(window.APP_CONFIG||{}).AUTH_REQUIRED) && !tokStore.forKey(key); }
function _bioOk(role,user){ return !!(bio.available && bio.isRegistered(role,user) && !_needPwForToken(pwKeyOf(role,user))); }   // 비밀번호 창의 생체 로그인 버튼
function _pwLockedMsg(d){ return '여러 번 틀려서 잠겼어요 — '+Math.max(1, Math.ceil(((d && d.retry_after) || 600)/60))+'분 뒤에 다시 해 주세요'; }
var _pwExpiredMsg='초기(임시) 비밀번호는 14일만 쓸 수 있어요 — 관리자에게 비밀번호 초기화를 요청해 주세요';
// 로그인 비밀번호 확인 → {ok, via:'server'|'local'|'offline', mustChange, srv(서버가 답함), msg}
async function verifyPassword(key, pw){
  var r=await pwServer.call('pw_login', {p_key:key, p_pw:pw});
  if(r.data){
    var d=r.data;
    if(d.ok){ _tokFromPw(d, key); _forgetLegacyPw(key); await pwCache.put(key, pw); return {ok:true, srv:true, via:'server', mustChange:!!d.must_change}; }
    // 잠김: 누가 일부러 틀려서 잠가 둬도, 이 기기에서 이미 맞았던 비밀번호(해시로 기억)면 들여보낸다 — 무차별 대입은 여전히 막힘
    if(d.locked){ if(await pwCache.check(key, pw)===true) return {ok:true, srv:true, via:'offline'}; return {ok:false, srv:true, msg:_pwLockedMsg(d)}; }
    if(d.busy) return {ok:false, srv:true, msg:'잠시 후 다시 시도해 주세요'};
    if(d.expired) return {ok:false, srv:true, msg:_pwExpiredMsg};
    if(d.unknown) return pw===getPassword(key) ? {ok:true, srv:true, via:'local'} : {ok:false, srv:true};   // 서버에 아직 없는 계정(새 지도자 등)
    // 이 기기에서 바꿔 쓰던 비밀번호 → 서버가 아직 초기값이면 서버로 그대로 옮긴다(계정당 1회)
    var legacy=_legacyStoredPw(key), def=DEFAULT_PASSWORDS[key];
    if(legacy && pw===legacy && def && legacy!==def){
      var m=await pwServer.call('pw_change', {p_key:key, p_old:def, p_new:pw}, 15000);
      if(m.data){
        if(m.data.ok){ _tokFromPw(m.data, key, true); _forgetLegacyPw(key); await pwCache.put(key, pw); logAudit('auth','비밀번호 서버로 이전',key,{}); return {ok:true, srv:true, via:'server'}; }
        if(m.data.locked) return {ok:false, srv:true, msg:_pwLockedMsg(m.data)};
        if(m.data.busy) return {ok:false, srv:true, msg:'잠시 후 다시 시도해 주세요'};
        if(m.data.expired) return {ok:false, srv:true, msg:_pwExpiredMsg};
        if(m.data.weak) return {ok:false, srv:true, msg:(m.data.reuse ? '이 기기에서 쓰던 비밀번호는 공개된 초기 비밀번호라 서버로 옮길 수 없어요' : '이 기기에서 쓰던 비밀번호가 짧아서 서버로 옮길 수 없어요')+' — 관리자에게 비밀번호 초기화를 요청해 주세요'};
        // 서버 비밀번호가 이미 다른 값(다른 기기에서 바꿈) → 이 기기의 옛 값은 지운다(매번 2회씩 실패로 세어 잠기는 것 방지)
        _forgetLegacyPw(key);
        return {ok:false, srv:true, msg:'이 기기에서 쓰던 비밀번호는 더 이상 안 돼요 — 다른 기기에서 바꾼 비밀번호로 들어와 주세요'};
      }
    }
    return {ok:false, srv:true};
  }
  if(r.missing) return pw===getPassword(key) ? {ok:true, via:'local'} : {ok:false};
  // 오프라인·서버 오류: 서버에서 맞았던 비밀번호(해시)로 확인
  var c=await pwCache.check(key, pw);
  if(c===true) return {ok:true, via:'offline'};
  if(!pwServer.known()) return pw===getPassword(key) ? {ok:true, via:'local'} : {ok:false};
  return {ok:false, msg:(c===false ? '' : '인터넷 연결을 확인해 주세요 — 이 기기에서 처음 들어가는 계정은 서버 확인이 필요해요')};
}
// 생체·자동 로그인으로 들어온 경우: 비밀번호를 안 쳤으니 서버로 못 옮겼다 → 이 기기가 기억하는 값으로 한 번만 서버에 '내 계정' 표시(이전·변경 요구).
// 공개된 초기값이 서버에 오래 남아 있지 않게(누가 먼저 바꿔치기할 틈을 줄임). 계정마다 한 번만 시도(실패 횟수 낭비 방지).
async function pwClaimAfterLogin(role,user){
  try{
    var key=pwKeyOf(role,user); if(!key) return;
    if(pwCache._all()[key]) return;                                   // 이 기기에서 이미 서버 비밀번호 확인됨
    var done={}; try{ done=JSON.parse(localStorage.getItem('golf_pt_pw_claimed')||'{}'); }catch(e){}
    if(done[key]) return;
    var guess=getPassword(key); if(!guess) return;
    var r=await verifyPassword(key, guess);
    if(r.srv){ done[key]=1; try{ localStorage.setItem('golf_pt_pw_claimed', JSON.stringify(done)); }catch(e){} }
    if(r.ok && r.mustChange && S.currentRole===role && S.currentUser===user && !S.showPwChange){
      S._pwForce={key:key, current:guess}; S.pwChange={current:'',newPw:'',confirm:''}; S.pwChangeError=''; S.showPwChange=true; render();
    }
  }catch(e){}
}

const APP_VERSION = {
  version:'v9.99',
  date:'2026-11-20',
  changes:[
    '수업 센터·녹음 안정화 — 다른 기기에서 시작한 레슨이 몇 초 안에 타석 카드에 뜨고, 느린 와이파이에서 방금 시작한 레슨이 사라지지 않게. 오전 9시 전에 시작한 레슨이 9시에 "어제 세션"으로 자동 종료되던 문제 수정, 녹음 중인 레슨은 자동 종료하지 않고 끝나면 일지 초안으로. 동의 기록이 있으면 🎙 녹음이 누르는 즉시 시작',
    '기록 보호 — 녹음 동의를 저장해도 인포데스크가 고친 유효기간·횟수·연락처가 되돌아가지 않게, 새로고침·다시 로그인할 때 아직 못 올린 회원·평가 수정이 사라지지 않게. 자동 정리는 다시 지우기 직전에 서버에서 다시 확인해 그 사이 저장·배정된 샷과 리포트 영상은 지우지 않음. 폰 와이파이가 끊기면 PC 신호를 빨간색 대신 "확인 안 됨"으로',
    '녹음·AI 정리 동의 기록 — 회원 등록·[수정] 화면 맨 아래와 회원 이름 옆 배지(🎙 녹음 동의 / 녹음 거부 / 녹음 동의 미기록)에서 동의(서면·구두와 날짜) 또는 거부를 기록. 동의 기록이 없는 회원의 수업 녹음을 시작하면 [오늘 구두 동의 받음 — 기록하고 녹음] · [녹음 없이 진행] · [취소]를 묻고, 거부한 회원은 녹음·AI 정리 없이 레슨·샷 저장만 진행. 인쇄용 동의서는 인포데스크·관리자 사이드바 [🖨 녹음 동의서 (인쇄용)]',
    '대시보드 점검 카드 — 🤖 AI 정리 대기 N건(하루가 지나도 정리 안 된 일지는 "⚠️ AI 정리 실패 — 눌러서 다시"), 📤 리포트 링크 없는 활성 회원(눌러서 바로 공유), 🎙 녹음 동의 미기록 활성 회원. 인포데스크·관리자는 지도자별 기록(최근 7일·30일 일지 수 · 마지막 작성 · 60일간 기록 없는 담당 회원)과 ⚠️ 만료됐는데 최근 30일 레슨 있음 · 📈 구매 횟수 초과 목록, 관리자는 🎙 원문 없는 녹음 일지 N건. 회원별 진행률은 구매 횟수를 넘으면 그대로 표시(예: 12/10)',
    '회원 리포트에 받아쓰기 조각이 나가지 않게 — 아직 "AI 정리 대기"인 일지는 회원 리포트에서 빼고, 그런 일지가 있으면 공유·검토 완료 전에 몇 건이 빠지는지 먼저 알려 줌',
    '타석 PC 상태 표시 — 수업 센터 타석 카드에 "PC 신호 n분 전 · v12 · 트랙맨 파일 n분 전 · 영상 대기 n"을 1분마다 새로 표시. 영업시간(07~23시)에 15분 넘게 신호가 없으면 빨간색, 아직 업데이트 안 한 PC는 "PC 신호 없음(구버전)". 관리자 대시보드에 🖥 타석 PC 상태 카드, 구버전 경고 기준은 v12 (⚠️ 타석 PC 에이전트 v12 업데이트 후 표시 — update.ps1)',
    '샷 저장이 영상 연결을 끊던 문제 수정 — 비포·애프터 저장·취소 때 기기에 있던 옛 샷 정보로 통째로 덮어써서, 그사이 타석 PC가 붙인 영상이 끊기고 "영상 대기"가 되살아나던 문제. 이제 바뀐 칸만 서버의 최신 값에 합쳐 저장하고, 실패하면 "저장 실패 — 다시 눌러주세요"',
    '샷 삭제 순서 수정(저장비 누수 방지) — 영상 파일을 먼저 지우고 모두 지워진 뒤에만 샷 기록을 지워, 기록 없이 남는 영상이 생기지 않게. 못 지운 영상은 이 기기에 기억해 다음에 자동으로 다시 지움. 회원을 삭제하면 그 회원의 샷 영상도 정리, 3일 지난 영상 정리는 회원 리포트에 들어간 영상을 지우지 않음. 하루 지난 미배정 샷 정리·방치 세션 종료는 앱을 열 때·30분마다·앱으로 돌아올 때 확인',
    '데이터 사용량·속도 개선 — 수업 센터는 화면이 꺼져 있거나 다른 앱을 볼 때 확인을 멈추고, 진행 중인 레슨이 없으면 30초(레슨 중 4초)마다 최근 20분 샷만 받음(5분마다 전체 확인). 앱을 열 때 녹음 원문은 받지 않아 더 빨리 열리고, 원문은 필요할 때만 서버에서(관리자 원문 보기·🎙 원문 보관함·백업). 일지가 1000건을 넘어도 모두 불러오고, 새로고침이 오래 걸리면 "백그라운드 동기화 중 — 끝나면 자동 반영"',
    '보안 — 로그인 토큰: 서버 비밀번호로 로그인하면 받은 로그인 토큰을 이 기기에 두고 자료·영상·녹음·AI 요청에 함께 보냄(만료 7일 전 자동 갱신, 로그아웃하면 삭제). 서버를 잠근 뒤에는 토큰 없는 기기가 자료를 불러오지 않고 "🔒 보안 잠금 중"으로 비밀번호 로그인부터. 새 비밀번호로 공개된 초기 비밀번호·지금 비밀번호는 못 쓰고, 직원 비밀번호 초기화가 거절되면 그 사유를 그대로 표시 (⚠️ 대표가 worker/supabase_tokens.sql 실행 후 적용 — 실행 전에는 예전처럼 동작)',
    '보안 — 화면 코드 삽입 차단: 회원 이름·메모·일지·알림·샷 정보 등에 HTML·스크립트가 들어 있어도 실행되지 않고 글자 그대로 보이게, 모든 역할의 모든 화면을 점검',
    '관리자 🧹 스토리지 진단·정리 안전하게 — 서버의 모든 기록(회원 리포트 포함)이 가리키는 파일과 올린 지 7일 안 된 파일은 보호하고, 가리키는 기록도 샷도 없는 타석 영상만 정리 후보로(녹음·원본 요청·일지 첨부·PC 신호 제외). 후보 목록(CSV)을 먼저 내려받아 확인해야 지울 수 있고, 진행률 표시, 실패가 1%를 넘으면 멈춤 (저장 워커 v2에 관리자 열쇠를 설정한 뒤에는 관리자 로그인 토큰이 없으면 열쇠를 물어봄)',
    '안정성 — 서버 연결 부품(supabase-js) 버전을 2.119.0으로 고정해 외부 새 버전이 예고 없이 들어오지 않게, 쓰지 않던 옛 리포트 생성 코드 삭제',
    '녹음 원문이 지워지던 문제 수정 — 프로·트레이너 폰에서 지난 일지를 고치거나 AI 정리가 나중에 반영될 때 서버의 녹음 원문이 빈칸으로 덮어써지던 버그(9~11월 49건). 이제 기기에 원문이 없으면 원문 칸을 아예 보내지 않아 서버 원문이 그대로 남음. 지워진 원문은 녹음 백업에서 복구',
    '오래된 "AI 정리 대기" 일지도 자동 정리 — 7일이 지나면 다시 시도하지 않아 7~8월 일지가 받아쓰기 조각으로 남던 문제. 녹음 원문이 있는 일지는 180일까지 자동으로 다시 정리',
    '관리자 기기 저장 공간 초과 방지 — 녹음 원문을 기기에 두 벌씩 저장해 저장 한도에 가까워지던 문제. 원문은 서버에만 두고(업로드 전 일지·작성 중 초안은 예외), 공간이 모자라면 샷 목록만 줄여 일지·인수인계 메모가 지워지지 않게. 그래도 모자라면 안내 표시',
    '직원 활동 알림 보관 기간 30일 → 1년 (관리자 알림함)',
    '보안 — 주소(#)만 바꿔 다른 역할 화면으로 들어가던 구멍 차단',
    '비밀번호를 서버에 저장 — 앱을 지웠다 다시 깔거나 폰을 바꿔도 비밀번호가 그대로. 초기(임시) 비밀번호로 들어오면 바로 새 비밀번호(6자 이상)를 정하는 창이 뜨고, 이 기기에서 바꿔 쓰던 비밀번호는 첫 로그인 때(Face ID 로그인이어도) 자동으로 서버로 옮겨짐. 초기·임시 비밀번호는 14일만 유효, 같은 계정 10번 틀리면 10분 잠금(이 기기에서 맞았던 비밀번호는 잠겨도 통과). 관리자는 마이페이지 [🔑 직원 비밀번호 초기화]로 잊어버린 직원에게 임시 비밀번호를 정해 줄 수 있음 (⚠️ 대표가 Supabase에서 worker/supabase_passwords.sql 한 번 실행 후 적용 — 실행 전에는 예전처럼 동작)',
    '앱 이름 변경 — "Golf PT" → "내셔널짐 피티앤골프"(상호와 동일). 레슨 회원뿐 아니라 트랙맨 시설 이용만 하는 회원까지 아우르는 이름. 홈 화면 아이콘 이름·탭 제목·푸시 알림·생체인증 등록명 모두 새 이름, 앱 아이콘도 기존 로고(N·골프공 마크) 기반 새 디자인. 인트로 서브 "PT & GOLF STUDIO", 리포트 헤더 서브 "PERFORMANCE REPORT". 회원 리포트 부제는 "측정 데이터 · 스윙 영상" 먼저, "레슨 기록"은 레슨 회차가 있을 때만 (※ 이미 홈 화면에 설치한 앱은 이름·아이콘이 바로 안 바뀔 수 있음 — 지우고 다시 추가)',
    '리포트 검토는 마지막으로 일지·영상을 올린 담당자만 — 프로가 마지막 레슨을 했으면 프로에게만, 트레이너면 트레이너에게만 검토 대기·독촉·푸시가 가고 [검토 완료] 버튼도 그 담당자에게만 보임 (회원 이름 옆 알림 점은 두 담당자 모두 유지). 회원 리포트: 폰에서 샷 수치를 표처럼 정렬, 카톡 안에서 열렸을 때 [기본 브라우저로 열기] 버튼과 뒤로가기 보호',
    '회원 리포트 전면 개편 — 첫 화면이 "OO님의 골프 성장기": 클럽 드롭다운(드라이버·우드·유틸리티·아이언·웨지)으로 그 클럽의 저장 영상과 트랙맨 수치를 전부 보고, 측면·정면·클럽 영상을 전체 화면 뷰어에서 넘겨 봄. 비포·애프터 라벨·버튼 큼직하게, 레슨 일지는 골프/PT 탭으로 나눠 바로 보이게, 글자 기본 크게 (회원 링크는 그대로 — 다음 [검토 완료]부터 새 화면)',
    '같이 맡은 회원 알림 — 프로·트레이너가 함께 담당하는 회원의 레슨 일지를 한쪽이 저장하면 다른 담당자에게 알림. 🔔 배지와 회원 이름 옆 빨간 점(미확인)으로 표시되고, 그 회원을 열면 점이 사라짐. 폰 푸시를 켜 두면 즉시 폰으로도 알림',
    '리포트 검토 독촉 — 검토 대기 리포트가 있으면 담당자가 앱을 열 때·복귀할 때·30분마다 대기 목록을 띄움(1시간 뒤 다시 가능). 폰 푸시 알림도 지원: 대시보드의 [🔔 검토 알림을 폰으로 받기]를 켜면 앱을 안 열어도 하루 몇 번 알림, 관리자는 담당자별 요약 (⚠️ 푸시는 golf-pt-push 워커 배포 후 동작 — worker/푸시-알림-배포.md)',
    '정면 영상이 느리게 재생되던 문제 수정 — 측면·정면 아이폰의 슬로모션 설정(120/240fps)이 달라도 같은 샷의 두 영상 길이를 비교해 정면 배율을 자동으로 맞춤. 짧은 클립 보정 기준 15초→10초 (⚠️ 타석 PC 에이전트 업데이트 필요 — update.ps1)',
    '생체 로그인이 갑자기 안 될 때 자동 복구 — 폰 업데이트 등으로 등록이 풀리면 비밀번호 로그인 뒤 바로 다시 등록되게, 실패 사유도 표시. 비밀번호 창에 [지문·Face ID 다시 등록] 링크 추가',
    '타석 카드 개선(정우진 프로 건의) — 회원 전화번호 표시(탭하면 전화), 🎙 수업 녹음 버튼을 회원 이름 바로 아래로 이동',
    'AI 정리 "워커 403: Request not allowed" 대응 — AI 서버 지역 차단 시 예비 경로로 자동 전환하고 사유를 알기 쉽게 표시',
    '수업 센터 샷 목록 [더 보기] — 연타 중에 완료된 샷이 30개 밖으로 밀려 못 보던 문제 (30개씩 더 펼침)',
    '영상 업로드 표시 정직화 — 90초 지나면 97%에 멈춰 있던 대신 "N분째"로 경과 시간을 보여줌 (타석 PC 대기열이 밀린 상태가 보이게)',
    '레슨 일지 AI 정리가 저장 후 자동 반영되지 않던 문제 수리 — 프로 기기에서 녹음 원문이 빠져 자동 재시도가 막히던 원인 제거, 저장 직후 자동 재시도 강화, 정리 중인 일지엔 카드에 "🤖 AI 정리 중" 표시(탭하면 즉시 재시도)',
    '일지 아래 AI 분석 박스가 정리 전 받아쓰기 기준으로 남던 문제 수정 — 정리·수정 후 자동 갱신',
    '타석 영상 재생 호환 강화 — 확장자만 보고 변환 없이 통과되던 경로를 실제 코덱 검사로 차단 (아이폰 재생 불가 영상 방지)',
    '타석 PC 에이전트가 구버전이면 수업 센터에 경고 표시 — 업데이트 누락으로 영상 수정이 적용 안 되던 문제를 눈에 보이게',
    '레슨 일지 AI 정리 누락 수리 — 저장 직후 앱을 닫으면 AI 정리가 끊겨 받아쓰기 메모로 남던 문제. 이제 앱을 다시 열면 남은 일지(최근 7일)를 자동으로 마저 정리합니다',
    '같은 타석 연속 레슨 개선 — 앞 타임 세션이 안 꺼져 있어도 시작이 막히지 않고, 확인 후 앞 세션을 종료하고 바로 새 레슨 시작 (앞 담당자의 녹음 전문은 그 기기에서 일지 초안으로 자동 복구)',
    '타석 내장 카메라 영상이 아이폰에서 재생 안 되던 문제 수정 — 특수 코덱이 변환 없이 통과되던 것을 항상 재생 호환(H.264)으로 재인코딩 (⚠️ 타석 PC 에이전트 업데이트 필요 — update.ps1)',
    '미배정 샷 자동 정리 강화 — 하루 지난 미배정 샷(영상 포함)이 프로·트레이너 기기에서도 자동 정리됨 (수백 개씩 쌓이던 문제)',
    '녹음 자동 복구 — 갤럭시 절전 등으로 앱이 죽어서 첫 화면으로 튕겨도, 다시 열면 진행 중이던 세션의 녹음이 자동으로 다시 시작됨 (이전 녹음 내용은 저장돼 있어 이어붙음)',
    '녹음 중 앱이 첫 화면으로 튕기던 원인 차단 — 새 버전 자동 적용(리로드)이 녹음·받아쓰기·음성 변환·수업 진행 중에는 절대 실행되지 않게, 레슨이 끝난 뒤에 적용',
    '녹음 중 화면 꺼짐 방지 강화 — 화면이 꺼졌다 켜지면 화면 꺼짐 방지(wakeLock)를 자동 재획득. 녹음 중에는 폰 화면을 켠 채 두는 것을 권장',
    '성과 리포트 레슨 기록 펼침 — 앱에서 보는 성과 리포트의 세션일지도 회원용 페이지처럼 눌러서 전체 내용을 펼쳐볼 수 있음 (한 줄 미리보기만 되던 문제)',
    '회원 영상 보호 강화 — 비포/애프터로 저장하지 않아도 회원별 최근 8개 샷 영상은 자동 보관(3일 정리·스토리지 정리에서 제외). 리포트의 스윙 영상이 비지 않게 (윤명숙님 리포트 영상 0개 원인 보완)',
    '대시보드 최근 활동 클릭 → 일지 열림 — 홈의 최근 활동(세션 일지) 항목을 누르면 그 회원 화면으로 이동해 해당 일지가 펼쳐진 채 열림. 미리보기의 마크다운 기호도 제거',
    '리포트 검토 대기 목록 상세화 — 홈 대시보드에서 회원마다 마지막 레슨 날짜와 며칠째 대기인지 표시, 오래 밀린 순 정렬, 3일 이상은 빨간 배지로 강조',
    '리포트 검토 완료 게이트 — 일지·영상이 바뀌어도 회원 링크에 바로 반영하지 않고, 프로가 성과 리포트에서 내용을 검토한 뒤 [✅ 검토 완료]를 눌러야 반영. 홈 대시보드에 "리포트 검토 대기" 목록 표시',
    '고객 리포트 오류 수정 — AI 일지의 마크다운 기호(##·**·-)가 그대로 보이던 것을 제목·불릿·볼드로 예쁘게 렌더, 없는 수치("볼 —㎧") 표기 제거, 갱신 리포트에 "업데이트 날짜" 표시',
    '고객 리포트 디자인 다듬기 — 헤더 아바타·KPI 카드 포인트·비거리 증가 배지·일지 타이포·푸터 정리',
    '회원 고정 리포트 링크 — [리포트 공유]가 회원마다 하나의 영구 링크를 만들고, 이후 일지 저장·수정·삭제, 비포/애프터 저장, 샷 삭제 때마다 링크 내용이 자동 최신화. 회원은 받은 링크를 즐겨찾기 해두고 아무 때나 열면 오늘 레슨까지 보임 (매번 새로 보낼 필요 없음)',
    '녹음 전문 유실 근본 수리 — 받아쓴 전문을 세그먼트마다 서버(R2)에 백업하고, 종료 시 전문이 비어 있으면 서버 백업에서 자동 복구. 다른 기기·자동 종료로 세션이 사라져도 이 기기에 남은 전문을 일지 초안으로 살려냄 (김현수님 50분 레슨 유실 사고 재발 방지)',
    '음성 변환이 끝나기 전엔 업데이트 배너를 띄우지 않음 — 녹음 종료 직후 변환 대기 중 배너를 탭해 새로고침하면 마지막 조각이 날아가던 위험 차단',
    'R2 저장비 원인 수리 — 3일 지난 미보관 샷 영상 자동 정리가 관리자 기기에서만 돌던 것을 프로·트레이너 기기(매일 수업 센터 사용)로 확대. 정면·클럽 앵글만 있는 샷도 정리 대상에 포함 (월 $2 청구의 재발 방지)',
    '로그인 첫 화면 = 홈 대시보드 — 인트로 지나면 인사말·오늘/이번달 세션·수업 센터 바로가기·만료 임박·최근 활동이 보이는 홈으로. 예전처럼 담당 첫 회원(로버트)이 자동으로 열리지 않음',
    'AI 일지가 핵심 2~3개만 담음 — 정리 내용이 너무 길던 문제. AI가 [핵심] 2~3개를 골라 일지에 싣고, 나머지 항목은 체크 리스트로 보여줘 프로·트레이너가 골라서 추가 (저장 후 백그라운드 정리도 동일)',
    '화자 구분 강화 — 지도자의 사담(예: "골프 쳤는데 더웠다")을 회원 컨디션으로 오인해 엉뚱한 처방("체력 보강")을 만들던 문제. 화자 불확실 발언 단정 금지·잡담 배제·명시되지 않은 처방 생성 금지 규칙 추가',
    '수업 녹음 중엔 업데이트 배너 숨김 — 녹음·받아쓰기 진행 중 배너를 탭해 새로고침하면 녹음이 끊기므로, 녹음 중엔 배너가 아예 안 뜨고 녹음 종료 후 다시 나타남',
    '샷 영상 화면 상단 [✕ 닫기] — 세로 영상에서 닫기가 화면 아래로 밀려 스크롤해야 하던 문제. 영상 높이도 조절해 배속·닫기까지 한 화면에 들어오게 (라이브·리포트 모두)',
    '타석 카드 이름 옆 [⏹ 종료] — 레슨 진행 중 카드 맨 아래까지 내리지 않고 회원 이름 줄에서 바로 세션 종료',
    '새 버전 자동 감지 — 앱이 10분마다(그리고 앱으로 돌아올 때마다) 새 버전이 나왔는지 확인해 하단에 "🔄 탭하면 업데이트" 배너 표시. 아이폰 홈화면 앱이 며칠씩 옛 버전(v9.52)에 머물던 문제의 근본 해결',
    '배포 정체 우회 — 깃허브 페이지즈 장애로 33시간 막혀 있던 배포 대기열을 새 큐로 우회 (static.yml concurrency 그룹 교체)',
    '리포트에서 샷 삭제 — 다른 회원의 영상이 실수로 잘못 저장된 경우, 성과 리포트의 샷 상세에서 [🗑 이 샷 삭제]로 프로·트레이너·관리자가 영상(모든 앵글)·측정 기록을 완전히 제거 (감사 로그 기록)',
    '인트로 사진 탭으로 스킵 — 가만 있으면 0.5초마다 자동으로 넘어가고, 화면을 탭하면 즉시 다음 사진으로 (마지막 장에서 탭하면 바로 로그인)',
    '앱 실행 인트로 3배 빨라짐 — 랜딩 사진 몬타주가 장당 1.5초 → 0.5초로 넘어가고 마지막 장 대기도 3초 → 1초 (실행 후 로그인까지 확 짧아짐)',
    '일지 저장이 AI를 기다리지 않음 — AI 정리 진행 중에도 [저장]을 누르면 바로 저장되고, 정리가 끝나면 저장된 일지에 자동 반영 (경고창 제거 · 25분 레슨 기준 약 20초 대기 불필요)',
    '비포/애프터를 레슨 전체 샷에서 지정 — [전체 샷 ⏮] 버튼으로 이 수업의 모든 샷을 처음 친 샷부터 펼쳐, 레슨 끝에 첫 샷을 📌 비포로 지정 가능 (레슨 중 폰을 만질 필요 없음). 종료 확인창에도 안내 추가',
    '샷 두 개씩 저장되는 문제 수정 — 트랙맨이 한 스윙을 서로 다른 측정 ID의 파일 두 개로 내보낼 때 각각 딴 샷으로 올라가던 것을, 측정값 지문(클럽·캐리·볼스피드·스핀 동일)으로 같은 스윙으로 판별해 한 샷으로 병합 (에이전트 업데이트 필요)',
    '영상 저장 속도 대폭 개선 — 변환 우선순위를 최저→보통보다 낮음(트랙맨엔 여전히 항상 양보), 스레드 2→4, 해상도를 폰 시청용 최대 1280으로 캡(변환량·업로드 절반 이하). 측정 안전은 유지하면서 저장이 수 분 → 1분 안쪽으로 (에이전트 업데이트 필요)',
    '영상 변환이 트랙맨 측정을 방해하던 문제 수정 — ffmpeg 재인코딩이 CPU를 독차지해 TPS가 샷 측정 결과를 파일에 기록하다 잘리던 사고(1번타석 "샷이 안 뜬다"의 원인). 변환을 OS 최저 우선순위 + 스레드 2개 제한으로 실행해 TPS에 항상 양보 (에이전트 업데이트 필요 — 모든 타석 PC)',
    '영상 보기 화면 안전영역 패딩 — 세로 화면에서 측면/정면/클럽 탭이 아이폰 다이나믹 아일랜드·시계에 가려 못 누르던 문제 수정 (라이브·리포트 모달 모두)',
    '트랙맨 내장 카메라(mkv) 영상 전면 재인코딩 — 아이폰 카메라 없는 타석(1·2번)의 영상이 "재생 안 되는 형식"으로 올라가고 원본이 커서 업로드가 수 분 걸리던 문제. H.264 압축 재인코딩으로 재생 호환 + 업로드 대폭 단축 (에이전트 업데이트 필요)',
    '타석 카드 샷 카운트 견고화 — 세션 시작시각 오류·시계 오차에도 샷이 0개로 고정되지 않도록 숫자 시각 비교 + 2분 허용. 이번 수업 샷이 없어도 오늘 친 샷 개수를 안내해 "샷이 사라졌나" 혼란 방지',
    '영상 업로드 진행률(%)을 90초 기준의 현실적인 속도로 조정',
    '비포·애프터 최신 태그 우선 — 같은 날 비포(또는 애프터)를 여러 번 지정했으면 마지막으로 지정한 샷을 사용. 예전(배속 수정 전) 영상이 비포로 잡히던 문제 해결 — 예시 리포트 재발행 시 적용',
    '관리자 알림함(🔔) — 프로·트레이너·인포데스크가 회원 등록·수정, 세션일지 기록·수정·삭제, 평가 수정, 삭제 요청을 하면 관리자에게만 알림. 인포데스크 상단 🔔 배지 + 알림함(최근 50건·30일 보관) + 새 알림 토스트. 관리자 본인 행동은 알리지 않음',
    '영상 슬로모션 보정 기본 ×8 로 상향 — ×4 보정 후에도 0.5배로 보이던 문제(아이폰 240fps 슬로모션 = 8배 늘어짐). 에이전트 업데이트 필요',
    '영상 슬로모션 자동 보정 — 아이폰 슬로 모션 촬영으로 4배 늘어진 영상을 에이전트가 업로드 전에 실제 속도로 복원 (15초 미만 정상 클립은 안 건드림 · 새로 올라오는 영상부터 적용 · 에이전트 업데이트 필요)',
    '비포·애프터 클럽별 드롭다운 — 날짜 안에서 클럽 칩(드라이버·아이언 등)을 눌러 그 클럽의 비포/애프터로 전환. 클럽이 다른 샷은 어떤 경우에도 한 짝으로 섞이지 않음',
    '레슨 일지 예시 8건 — 골프 프로 ↔ 트레이너가 번갈아 쓴 4주 협업 스토리로 확장 (상담용 예시 리포트 재발행 시 적용)',
    'PC에서 스윙 영상 좌우 넘김 — 마우스 환경에서 캐러셀에 ‹ › 화살표 표시',
    '비포·애프터 클럽 일치 강제 — 태그된 짝이라도 클럽이 다르면(태그를 영상 보관용으로 쓴 경우) 짝으로 묶지 않고, 태그 샷이 속한 클럽 안에서 같은 클럽 짝을 다시 구성. 짝이 안 되면 단일 표시',
    '교차 클럽 비교의 "비거리 증가" 문구 차단 — 아이언→드라이버 비교에 149m 증가 같은 왜곡 문구가 나가지 않음 (이미 발행된 리포트에도 즉시 적용)',
    '비교 재생에 2× 배속 추가 — 슬로모션으로 촬영된 영상을 실제 템포로 보정해서 볼 수 있게 (.25/.5/1/2×)',
    '비포·애프터 자동 짝은 같은 클럽끼리만 — 비포 아이언·애프터 드라이버처럼 비교가 안 되는 짝 방지. 드라이버 우선, 없으면 그 날 가장 많이 친 클럽. 프로가 직접 지정한 태그는 그대로 존중',
    '상담용 예시 발행 시 제외할 날짜 선택 — 영상 있는 날짜 목록을 보여주고 빼고 싶은 날(예: 복장이 아쉬운 날)을 입력하면 그 날 영상만 제외 (측정 수치는 유지)',
    '고객 리포트 비교 재생 기본 1배속 — 스윙 템포를 그대로 보는 게 기본, 느린 재생(.25×/.5×)은 선택',
    '고객 리포트 레슨 일지 하단에 AI 정리 안내 문구 추가 — "수업 중 음성 기록을 AI가 정리해 작성되어 실제 지도 내용과 표현이 일부 다를 수 있다"는 안내로, 정리 오차에 대한 오해를 예방',
    '상담용 예시 리포트 — 성과 리포트의 [상담 예시로 발행] 버튼으로 현재 회원(프로 본인 프로필 권장)의 실측 데이터·스윙 영상을 예시 리포트로 발행. 이름은 "홍길동", 레슨일지는 골프+PT 4주 스토리 예시 문안으로 자동 교체 (개인정보 0)',
    '예시 리포트는 항상 같은 주소(/r/rpt_demo) — 다시 발행하면 갱신. 인포데스크 [🌐 예시 리포트] 버튼으로 바로 열기. 페이지 상단에 "상담용 예시 리포트" 배지 표시',
    '고객 리포트 돋보기 — 우측 하단 🔍 버튼으로 글씨 4단계 확대(가/가+/가++/가+++). 선택한 크기는 고객 기기에 기억되어 다음에 열어도 유지',
    '고객 리포트 영상 저장 — 비포/애프터·스윙 캐러셀·레슨 일지 영상마다 저장 버튼. 아이폰은 공유시트로 사진 앱에, 갤럭시/PC는 다운로드 폴더에 저장. 진행률 % 표시',
    '카톡 공유 문구 정리 — 문구 끝 빈 줄 제거. 링크를 줄바꿈 없이 문구 끝에 붙여, 카톡이 링크를 미리보기 카드로 바꿔도 빈 줄이 남지 않음',
    '고객 리포트 전용 도메인 적용 — [리포트 공유] 링크가 report.nationalgym.kr 주소로 발급. 깃허브·워커 주소가 고객에게 보이지 않음',
    '죽은 링크 방지 — 공유 직전에 전용 도메인 응답을 확인하고, 응답이 없으면 기존 워커 주소로 자동 전환해 링크를 발급 (확인은 링크 생성과 동시에 진행돼 공유 속도에 영향 없음)',
    '고객 리포트 링크를 자체 주소로 — 공유 링크가 깃허브 주소 대신 전용 서버 주소(추후 nationalgym.kr 도메인 연결 가능)로 발급. 고객 페이지에는 어떤 키·설정도 포함되지 않아 소스를 열어봐도 가져갈 것이 없음',
    '고객 리포트 상호 정비 — 상단·하단 문구를 정식 상호 "내셔널짐 피티앤골프 스튜디오"로 표기',
    '고객 리포트 비포·애프터를 레슨 날짜별 드롭다운으로 — 날짜를 눌러 펼치면 그 날의 비포/애프터 영상·동시재생·시크바가 나옴 (프로 지정이 없으면 그 날 첫 샷 vs 마지막 샷)',
    '고객 리포트 레슨 일지 드롭다운 — 전부 펼쳐놓지 않고 최근 1건만 열어두고 나머지는 눌러서 펼침. 닫힌 항목은 한 줄 미리보기 표시',
    '리포트 링크 보안 강화 — 링크 ID를 추측 불가능한 긴 난수로 발급',
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

// sessions.time 칸이 없다고 확인한 시각 — 하루 동안 기억(그동안 일지 조회에 time 을 넣지 않음). 대표가 칸을 추가하면 하루 안에 다시 쓴다
var _noTimeAt=0;
function _sessNoTime(set){
  if(set===true){ _noTimeAt=Date.now(); try{ localStorage.setItem('golf_pt_sess_notime', String(_noTimeAt)); }catch(e){} return true; }
  var t=_noTimeAt; if(!t){ try{ t=+(localStorage.getItem('golf_pt_sess_notime')||0)||0; }catch(e){ t=0; } _noTimeAt=t; }
  return !!t && Date.now()-t < 24*3600*1000;
}
// '그런 칸(time) 없음' 오류인가 (42703 column … does not exist / PGRST204 schema cache) — 시간 초과(timeout) 같은 다른 오류와 구분
function _isTimeColErr(e){ var m=String((e&&e.message)||e||''), c=String((e&&e.code)||''); return /\btime\b/i.test(m) && (c==='42703' || c==='PGRST204' || /column|schema cache/i.test(m)); }
// 수업 센터 샷 전체(최근 1000개)를 마지막으로 받아 적용한 시각 — 그 사이 4초 폴링은 최근 20분 창만 받는다(B2)
var _liveFullAt=0;

// ============ Supabase 연동 모듈 ============
const cloud = {
  client:null, enabled:false, dbProxy:'', dbKey:'',
  init(){try{const cfg=window.APP_CONFIG||{};if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return false;if(typeof window.supabase==='undefined'||!window.supabase.createClient){console.warn('[cloud] supabase-js SDK missing');return false;}this.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{global:{fetch:_sbFetch}});   // 모든 요청에 로그인 토큰(있으면)
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
        var res=await wFetch(this.dbProxy+'/db',{method:'POST',headers:{'X-API-Key':this.dbKey,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({op:op,table:table},opts))});
        if(!res.ok){ var t=''; try{t=await res.text();}catch(e){} console.warn('[cloud] proxy '+op+' '+table+' fail',res.status,t.slice(0,150)); return wantErr?(t||('http '+res.status)):false; }
        return true;
      }catch(e){ console.warn('[cloud] proxy '+op+' '+table+' err',e&&e.message); return wantErr?String(e&&e.message||e):false; }
    }
    try{
      var q=this.client.from(table);
      // 잠긴 DB 는 무효 토큰(취소·만료)의 고치기·지우기를 오류 없이 '0행'으로 넘긴다 → 바뀐 행을 돌려받아 0행이면 토큰부터 확인(무효면 비밀번호 로그인)
      var lk=(S._dbMode==='locked'), sel=((opts.filters||[])[0]||{}).col||'*';
      if(op==='upsert'){ var r0=await q.upsert(opts.rows); if(r0.error) throw r0.error; }
      else if(op==='update'){ var qq=q.update(opts.values); (opts.filters||[]).forEach(function(f){ qq=qq[f.op||'eq'](f.col,f.val); }); if(lk) qq=qq.select(sel); var r1=await qq; if(r1.error) throw r1.error; if(lk && !(r1.data||[]).length) _authLost(); }
      else if(op==='delete'){ var qd=q.delete(); (opts.filters||[]).forEach(function(f){ qd=qd[f.op||'eq'](f.col,f.val); }); if(lk) qd=qd.select(sel); var r2=await qd; if(r2.error) throw r2.error; if(lk && !(r2.data||[]).length) _authLost(); }
      return true;
    }catch(e){ console.warn('[cloud] '+op+' '+table+' fail',e&&e.message); return wantErr?String(e&&e.message||e):false; }
  },
  // PostgREST 는 한 번에 최대 1000행(Max Rows)만 주고 나머지는 오류 없이 잘라 버린다(B6 — 일지가 1000건을 넘으면 최신 일지가 조용히 사라짐)
  // → range() 로 1000개씩, 1000개보다 적게 오는 쪽까지 받아 합친다. build() 는 매번 같은 정렬의 새 쿼리(정렬이 고정돼야 쪽끼리 겹치거나 빠지지 않음).
  async _pages(build, maxRows){
    var out=[], PAGE=1000, cap=maxRows||100000;
    for(var from=0; from<cap; from+=PAGE){
      var n=Math.min(PAGE, cap-from);
      var r=await build().range(from, from+n-1);
      if(r.error) return {error:r.error, data:out};
      var d=r.data||[]; for(var i=0;i<d.length;i++) out.push(d[i]);
      if(d.length<n) break;
    }
    return {data:out};
  },
  // 표 전체를 키 순서로 끝까지(빈 쪽이 올 때까지) — offset 이 아니라 '마지막으로 받은 키보다 큰 것'으로 이어 받는다(스토리지 정리의 보호 목록용).
  // range 로 받으면 받는 사이 다른 기기가 앞쪽 행을 지운 만큼 다음 쪽이 밀려 그 자리의 행을 못 봤다 → 저장한 샷의 영상이 '고아'로 잡힐 수 있었다.
  // cols: 유일한 키 칸(1개, 또는 assessments 처럼 2개). 최대 cap 행 · 실패하면 {error}
  async _keyset(table, cols, cap){
    var c=this.client, out=[], last=null, n=0;
    var qv=function(v){ return '"'+String(v==null?'':v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"'; };   // 논리식(or) 안의 값은 따옴표로
    for(;;){
      var q=c.from(table).select('*'); cols.forEach(function(k){ q=q.order(k,{ascending:true}); });
      if(last){ if(cols.length===1) q=q.gt(cols[0], last[cols[0]]); else q=q.or(cols[0]+'.gt.'+qv(last[cols[0]])+',and('+cols[0]+'.eq.'+qv(last[cols[0]])+','+cols[1]+'.gt.'+qv(last[cols[1]])+')'); }
      var r=await q.limit(1000);
      if(r.error) return {error:r.error, data:out};
      var d=r.data||[]; if(!d.length) break;
      for(var i=0;i<d.length;i++) out.push(d[i]);
      last=d[d.length-1];
      if(out.length>=cap || ++n>=1000) break;
    }
    return {data:out};
  },
  // 일지 — 필요한 칸만(녹음 원문 supplement 는 안 받음: 앱 시작 때 받는 양의 94%, B3). time 칸은 있는 DB 에서만 —
  // 운영 DB 엔 아직 없어 넣으면 조회 자체가 실패하므로, 넣어 보고 '그런 칸 없음'이면 빼고 다시 + 하루 동안 기억(_sessNoTime).
  // (레슨 시간은 time 칸이 없어도 media 의 _meta 에서 복원된다)
  async _loadSessionRows(){
    var c=this.client, withTime=!_sessNoTime();
    var cols='id,member_id,date,author,content,media'+(withTime?',time':'');
    var r=await this._pages(function(){ return c.from('sessions').select(cols).order('date',{ascending:true}).order('id',{ascending:true}); });
    if(r.error && withTime && _isTimeColErr(r.error)){ _sessNoTime(true); return this._loadSessionRows(); }
    return r;
  },
  // 녹음 원문만 따로 — 관리자 원문 보기·원문 보관함·데이터 백업에서 그때그때(기기에는 저장하지 않음).
  // opts.mid: 그 회원 일지만 · opts.idsOnly: 원문이 있는 일지 id 만(원문 내용 없이 — 아주 작음) → {일지id: 원문 | 1} · 실패하면 null
  async transcripts(opts){opts=opts||{};if(!this.enabled||!this.client) return null;
    try{ var c=this.client, cols=opts.idsOnly?'id':'id,supplement';
      var r=await this._pages(function(){ var q=c.from('sessions').select(cols).neq('supplement',''); if(opts.mid) q=q.eq('member_id',opts.mid); return q.order('id',{ascending:true}); });
      if(r.error){ console.warn('[cloud] transcripts fail:', r.error.message||r.error); return null; }
      var o={}; r.data.forEach(function(x){ o[x.id]=opts.idsOnly?1:String(x.supplement||''); }); return o;
    }catch(e){ console.warn('[cloud] transcripts fail:', e&&e.message); return null; }},
  // 원문 없는 녹음 일지 수(D9) — AI 로 정리된 녹음 일지(본문이 '## 📋'로 시작)인데 서버의 녹음 원문(supplement)이 비어 있는 것.
  // 행은 받지 않고 개수만(head). sinceDay('YYYY-MM-DD'): 그 날짜 이후 일지만 · 실패하면 null
  async countTxMissing(sinceDay){if(!this.enabled||!this.client) return null;
    try{ var q=this.client.from('sessions').select('id',{count:'exact',head:true}).like('content','## 📋%').or('supplement.is.null,supplement.eq.');
      if(sinceDay) q=q.gte('date',sinceDay);
      var r=await q; if(r.error||typeof r.count!=='number') return null; return r.count;
    }catch(e){ return null; }},
  async loadAll(_again){if(!this.enabled) return null;try{const _tk=tokStore.token();const c=this.client;
    // 회원·평가·일지 모두 1000건씩 끝까지(B6). 일지는 원문 없이(B3)
    const [mRes,aRes,sRes]=await Promise.all([
      this._pages(function(){ return c.from('members').select('*').order('created_at',{ascending:true}).order('id',{ascending:true}); }),
      this._pages(function(){ return c.from('assessments').select('*').order('member_id',{ascending:true}).order('item_key',{ascending:true}); }),
      this._loadSessionRows()]);
    if(mRes.error) throw mRes.error;if(aRes.error) throw aRes.error;if(sRes.error) throw sRes.error;
// 회원 0명 = 잠긴 DB 에서 토큰이 없을 때도 이렇게 보인다 → 확인되기 전엔 '빈 스튜디오'로 보지 않음(시드·덮어쓰기 금지)
if(!(mRes.data||[]).length && !_again && tokStore.token()!==_tk) return this.loadAll(true);   // 받는 사이 로그인해 토큰이 생김 → 새 토큰으로 한 번 더
if(!(mRes.data||[]).length && !(await _emptyServerIsReal())){ await _authLost(30000); return null; }
const members=(mRes.data||[]).map(r=>{var extra=r.data||{};return Object.assign({id:r.id,name:r.name,color:r.color||'av-green'},extra);});const assessments={};(aRes.data||[]).forEach(r=>{if(!assessments[r.member_id]) assessments[r.member_id]={};assessments[r.member_id][r.item_key]={result:r.result||'미검사',note:r.note||''};});// 녹음 원문(supplement 컬럼)은 어느 기기에도 내려받지 않는다(B3).
// 트레이너·프로 기기에는 원문이 아예 없어 본인 레슨 대화가 남지 않고, 관리자는 볼 때만 그 원문을 받는다
// (회원 화면 [녹음 원문 전체 보기]·원문 보관함·백업 → cloud.transcripts / fetchSessionRaw).
// ※ 'AI 정리 대기' 재시도도 그 순간에만 cloud.fetchSessionRaw() 로 읽어 쓴다 (app_handlers._aiSourceForSession).
const sessions={};(sRes.data||[]).forEach(r=>{if(!sessions[r.member_id]) sessions[r.member_id]=[];
// 레슨 시간: time 컬럼(있으면 우선) → media JSON 에 백업된 _meta 항목에서 복원.
// (_meta 는 화면에 첨부파일로 안 보이게 media 목록에서 걸러낸다)
var _mArr=Array.isArray(r.media)?r.media:(r.media?r.media:[]);var _tMeta='';_mArr=_mArr.filter(function(m){if(m&&m.type==='_meta'){if(m.time)_tMeta=m.time;return false;}return true;});
sessions[r.member_id].push({id:r.id,date:r.date,time:r.time||_tMeta||undefined,author:r.author,content:r.content||'',supplement:'',media:_mArr});});return {members,assessments,sessions};}catch(e){console.warn('[cloud] loadAll fail:',e);return null;}},
  // opts.clearReportDirty: 검토 완료·리포트 공유처럼 '검토 대기'를 일부러 지우는 호출. 그 외(회원 정보 수정 등)에는
  // 이 기기의 복사본이 낡았어도 다른 기기가 켜 둔 검토 대기 표시·회원 링크를 지우지 않도록 클라우드 값을 유지한다.
  async upsertMember(m, opts){if(!this.enabled) return false;
    var _keepRd=!(opts&&opts.clearReportDirty) && (!m.reportDirty || !m.reportId);
    try{ var cur=await this.client.from('members').select('data').eq('id',m.id).maybeSingle(); var cd=(cur&&cur.data&&cur.data.data)||{};
      if(_keepRd){
        if(!m.reportDirty && cd.reportDirty){ m.reportDirty=cd.reportDirty; if(cd.reportDirtyBy) m.reportDirtyBy=cd.reportDirtyBy; }
        if(!m.reportId && cd.reportId) m.reportId=cd.reportId; }
      // 녹음 동의 — 서버 기록이 더 새로우면(다른 기기에서 기록) 그것을 따른다. 낡은 회원 정보를 저장해도 동의·거부 기록이 지워지지 않게 (v9.99)
      if(_rcAt(cd)>_rcAt(m)) _rcCopy(m, cd);
    }catch(e){}
    var extra={phone:m.phone||'',email:m.email||'',registeredDate:m.registeredDate||'',golfLessonCount:m.golfLessonCount||'',golfPTCount:m.golfPTCount||'',golfLessonAmount:m.golfLessonAmount||'',golfPTAmount:m.golfPTAmount||'',expiry:m.expiry||'',golfLessonExpiry:m.golfLessonExpiry||'',golfPTExpiry:m.golfPTExpiry||'',assignedTo:m.assignedTo||[],memberType:m.memberType||'pt_lesson',handicap:m.handicap||'',avgScore:m.avgScore||'',goal:m.goal||'',focusPoints:m.focusPoints||'',reportId:m.reportId||'',reportDirty:m.reportDirty||'',reportDirtyBy:(m.reportDirty?(m.reportDirtyBy||''):''),ownerWatch:m.ownerWatch||'',
      recConsent:m.recConsent||'',recConsentBy:m.recConsentBy||'',recConsentHow:m.recConsentHow||'',recConsentNo:m.recConsentNo||'',recConsentAt:m.recConsentAt||''};return await this._w('upsert','members',{rows:[{id:m.id,name:m.name,color:m.color,data:extra}]});},
  // 녹음 동의만 서버에 — 지금 서버의 회원 행을 다시 읽어 동의 칸만 바꿔 쓴다. 예전엔 직원 폰의 회원 사본을 통째로 올려, 폰이 받은 뒤에
  // 인포데스크가 고친 유효기간·구매 횟수·연락처 등이 서버에서 조용히 되돌아갔다. 서버 기록이 더 새로우면(다른 기기에서 기록) 그것을 따른다.
  // 서버에 아직 없는 회원(이 기기에서 새로 등록해 아직 안 올라감)은 예전처럼 통째로. → 성공 true
  // noCreate: 서버에 그 회원 행이 없으면 아무것도 쓰지 않는다(이 기기에 없는 회원의 동의만 적을 때 — 빈 회원 행을 만들지 않게)
  async upsertMemberConsent(m, noCreate){if(!this.enabled||!m||!m.id) return false;
    try{ var r=await this.client.from('members').select('id,name,color,data').eq('id',m.id).maybeSingle();
      if(!r || r.error) return false;
      var row=r.data; if(!row) return noCreate ? false : await this.upsertMember(m);
      var d=Object.assign({}, row.data||{});
      if(_rcAt(d)>_rcAt(m)){ _rcCopy(m, d); return true; }
      REC_CONSENT_KEYS.forEach(function(k){ d[k]=m[k]||''; });
      return await this._w('upsert','members',{rows:[{id:row.id,name:row.name,color:row.color,data:d}]});
    }catch(e){ return false; }},
  // 회원 한 명을 통째로(앱의 회원 모양으로) — 이 기기에 아직 없는 회원(다른 기기에서 방금 등록)의 녹음 동의 확인용. 없거나 못 읽으면 null
  async memberRow(id){if(!this.enabled||!id) return null;try{const r=await this.client.from('members').select('*').eq('id',id).maybeSingle();if(!r||r.error||!r.data) return null;const x=r.data;return Object.assign({id:x.id,name:x.name,color:x.color||'av-green'},x.data||{});}catch(e){return null;}},
  // 회원 한 명의 data 를 그 자리에서 읽기 — 녹음 시작 직전 동의 확인용(다른 기기에서 방금 적었을 수 있음). 못 읽으면 null
  async memberData(id){if(!this.enabled||!id) return null;try{const r=await this.client.from('members').select('data').eq('id',id).maybeSingle();if(!r||r.error||!r.data) return null;return r.data.data||{};}catch(e){return null;}},
  async upsertAssessment(memberId,itemKey,result,note){if(!this.enabled) return false;return await this._w('upsert','assessments',{rows:[{member_id:memberId,item_key:itemKey,result:result||'미검사',note:note||'',updated_at:new Date().toISOString()}]});},
  // 한 일지의 녹음 원문만 그 자리에서 읽기 — 'AI 정리 대기' 재시도용. 기기에 저장하지 않는다
  // (프로 기기에 원문을 안 남기는 loadAll 설계 유지). 실패/없음이면 '' → 호출측이 본문으로 폴백.
  // nullOnError: 받지 못함(네트워크·서버 오류)을 '원문 없음('')'과 구분해 null 로 (관리자 원문 보기)
  async fetchSessionRaw(sid, nullOnError){if(!this.enabled||!sid) return nullOnError?null:'';try{const r=await this.client.from('sessions').select('supplement').eq('id',sid).maybeSingle();if(nullOnError&&(!r||r.error)) return null;return (r&&r.data&&r.data.supplement)||'';}catch(e){return nullOnError?null:'';}},
  async upsertSession(memberId,s){if(!this.enabled) return false;var mediaMeta=(s.media||[]).map(function(m){return {type:m.type,view:m.view||'other',name:m.name||'',mimeType:m.mimeType||'',size:m.size||0,mediaId:m.mediaId||null,r2Key:m.r2Key||m.mediaId||null,data:(m.type==='url'?(m.data||''):undefined)};});
    // 레슨 시간을 media JSON 에도 백업 — sessions.time 컬럼이 없는 DB(마이그레이션 전)는
    // 아래 폴백이 time 만 빼고 재전송해 시간이 조용히 유실됐다("저장해도 사라짐"의 원인).
    // media 컬럼은 확실히 존재하므로 여기 실으면 어느 DB에서든 시간이 보존된다.
    if(s.time) mediaMeta.push({type:'_meta', time:s.time});
    var row={id:s.id,member_id:memberId,date:s.date,author:s.author,content:s.content||'',media:mediaMeta};
    // 🛡 녹음 원문(supplement)은 이 기기가 실제로 들고 있을 때만 보낸다 (v9.98).
    // 프로·트레이너 기기(그리고 앱을 새로 켠 직후의 관리자 기기)는 원문 없이 일지를 받는데, 예전엔
    // 일지 수정·AI 정리 반영·재전송 때 빈 원문('')을 같이 올려 서버의 원문을 지웠다(9~11월 49건 유실).
    // upsert 는 보낸 칸만 덮어쓰므로, 칸을 아예 빼면 서버 원문은 그대로 남는다. 새 일지는 기본값 ''.
    var _tx=String(s.rawTranscript||s.supplement||'');
    if(_tx.trim()) row.supplement=_tx;
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
  // 순서(A2): 서버에서 그 회원의 샷(member_id)과 일지 첨부를 찾아 R2 파일부터 지운다 → 영상이 다 지워진 샷 행 → 일지·평가 → 회원.
  // 못 지운 영상의 샷 행은 남기고 삭제 대기열로(다음 정리 때 영상부터 다시). 샷·일지 목록을 못 받으면 아무것도 지우지 않는다
  // (삭제 표시(tombstone)가 남아 다음 동기화 때 다시). local = {keys:[이 기기의 첨부 키], shots:[이 기기의 그 회원 샷]} (선택)
  async deleteMember(id, local){
    try{
      local=local||{};
      if(!this.enabled){ await delShotsRun(local.shots||[], {extra:local.keys}); return false; }
      var c=this.client, mid=id;
      var sh=await this.shotRowsWhere(function(q){ return q.eq('member_id',mid); });
      if(!sh) return false;
      var se=await this._pages(function(){ return c.from('sessions').select('id,media').eq('member_id',mid).order('id',{ascending:true}); });
      if(se.error) return false;
      var seen={}; sh.forEach(function(s){ seen[s.id]=1; });
      (local.shots||[]).forEach(function(s){ if(s && s.id && !seen[s.id]){ seen[s.id]=1; sh.push(s); } });
      var keys=(local.keys||[]).slice();
      se.data.forEach(function(r){ (Array.isArray(r.media)?r.media:[]).forEach(function(m){ var k=m && (m.r2Key||m.mediaId); if(k && typeof k==='string' && keys.indexOf(k)===-1) keys.push(k); }); });
      await delShotsRun(sh, {extra:keys});
      await this._w('delete','sessions',{filters:[{col:'member_id',op:'eq',val:id}]});
      await this._w('delete','assessments',{filters:[{col:'member_id',op:'eq',val:id}]});
      return await this._w('delete','members',{filters:[{col:'id',op:'eq',val:id}]});
    }catch(e){ console.warn('[cloud] deleteMember fail:', e&&e.message); return false; }
  },
  // ----- 라이브 세션 (베이/활성세션/굿샷) -----
  async loadLive(){if(!this.enabled) return null;
    // 🔇 수신 일시정지 — 관리자가 토글했으면 빈 라이브 데이터 반환(샷 부활 차단)
    try{ if(localStorage.getItem('golf_pt_shotpause')==='1') return {bays:[], activeSessions:{}, shotEvents:[]}; }catch(e){}
    try{const [bRes,aRes,sRes]=await Promise.all([this.client.from('bays').select('*'),this.client.from('active_sessions').select('*'),this.client.from('shot_events').select('*').order('ts',{ascending:false}).limit(1000)]);if(bRes.error) throw bRes.error;if(aRes.error) throw aRes.error;if(sRes.error) throw sRes.error;
    // 타석 0개 = 잠긴 DB 에서 토큰이 안 먹힐 때 모습 → 잠김이 확인됐으면 이 결과로 화면(진행 세션·샷)을 비우지 않는다
    if(!(bRes.data||[]).length){ if(S._dbMode==='locked'){ _authLost(); return null; } if(!S._dbMode) _authLost(); }
    const bays=(bRes.data||[]).map(r=>({id:r.id,name:r.name,color:r.color,type:r.type}));const activeSessions=this._liveActive(aRes.data);
    const shotEvents=this._liveShots(sRes.data).reverse();return {bays,activeSessions,shotEvents};}catch(e){console.warn('[cloud] loadLive skip:',e&&e.message);return null;}},
  _liveActive(rows){const a={};(rows||[]).forEach(r=>{a[r.bay_id]={memberId:r.member_id,memberName:r.member_name,author:r.author,startedAt:r.started_at,note:r.note||''};});return a;},
  // 🚫 mock 출처는 통째로 제외 — 옛 데모 데이터/잡음 부활 차단 (앱 자체는 mock 안 만듦)
  // 🗑 삭제 대기열에 있는 샷도 제외 — 영상을 지우는 동안(또는 실패해 다음 정리를 기다리는 동안) 서버 행이 남아 있어도 화면에 되살아나지 않게
  _liveShots(rows){var gone=delQ.ids('del');return (rows||[]).filter(r=>r.source!=='mock'&&!gone[r.id]).map(r=>this._shotRow(r));},
  _shotRow(r){return {id:r.id,bayId:r.bay_id,memberId:r.member_id,memberName:r.member_name,author:r.author||'',ts:r.ts,data:r.data||{},videoR2Key:r.video_r2_key||null,source:r.source||'agent'};},
  // 24시간 넘은 미배정 샷 후보 — 서버에서 바로(회원 이름 없음 + 관찰용 회원 샷), 오래된 것부터 최대 1000개. 실패하면 null
  async staleShotRows(beforeIso, owIds){if(!this.enabled) return null;
    try{ var or='member_name.is.null,member_name.eq.'+(owIds||[]).map(function(id){ return ',member_id.eq.'+id; }).join('');
      var r=await this.client.from('shot_events').select('*').lt('ts',beforeIso).or(or).order('ts',{ascending:true}).order('id',{ascending:true}).limit(1000);
      if(r.error) return null; return this._liveShots(r.data); }catch(e){ return null; }},
  // id 로 콕 집어 지금 서버 값(정리 직전 확인용) → {id: 샷} · 실패하면 null
  // raw: 삭제 대기열에 있는 샷도 그대로(대기 작업을 다시 하기 전 확인용 — 화면용 걸러내기 없이)
  async shotsByIds(ids, raw){if(!this.enabled) return null;var out={}, self=this;
    try{ for(var i=0;i<(ids||[]).length;i+=80){ var r=await this.client.from('shot_events').select('*').in('id',ids.slice(i,i+80)); if(r.error) return null; (raw ? (r.data||[]).map(function(x){ return self._shotRow(x); }) : this._liveShots(r.data)).forEach(function(s){ out[s.id]=s; }); } return out; }catch(e){ return null; }},
  // 조건에 맞는 샷 행 전부(1000개씩 끝까지, mock 포함 — 회원 삭제·전체 삭제용) · 실패하면 null
  async shotRowsWhere(where){if(!this.enabled) return null;
    try{ var c=this.client, self=this;
      var r=await this._pages(function(){ var q=c.from('shot_events').select('*'); if(where) q=where(q); return q.order('id',{ascending:true}); }, 50000);
      if(r.error) return null; return r.data.map(function(x){ return self._shotRow(x); }); }catch(e){ return null; }},
  // 진행 세션만 — 수업 센터가 닫혀 있을 때 자동 종료 확인용 → {bay: 세션} · 실패하면 null
  async loadActiveSessions(){if(!this.enabled) return null;
    try{ var r=await this.client.from('active_sessions').select('*'); if(r.error) return null; return this._liveActive(r.data); }catch(e){ return null; }},
  // 고객 리포트(알림 제외)의 content 에 든 글자 전부 → {글자:1}. 리포트가 쓰는 영상은 자동 정리에서 지우지 않는다(A6).
  // 받지 못했거나 믿을 수 없으면 null(→ 그 정리는 이번엔 안 지움)
  async reportStrings(){if(!this.enabled) return null;
    try{ var c=this.client;
      var r=await this._pages(function(){ return c.from('reports').select('id,content').neq('member_id','notice').order('id',{ascending:true}); });
      if(r.error) return null;
      var set={};
      var walk=function(v,d){ if(v==null||d>40) return; if(typeof v==='string'){ if(v.length<=600) set[v]=1; return; } if(typeof v==='object'){ for(var k in v){ if(Object.prototype.hasOwnProperty.call(v,k)) walk(v[k],d+1); } } };
      r.data.forEach(function(x){ var ct=x.content; if(typeof ct==='string'){ try{ ct=JSON.parse(ct); }catch(e){} } walk(ct,0); });
      // 링크를 준 회원이 있는데 리포트가 0개 = 잠긴 DB 에서 토큰이 안 먹힌 답일 수 있음 → 모르는 것으로
      if(!r.data.length && (S.members||[]).some(function(m){ return m && m.reportId; })) return null;
      return set; }catch(e){ return null; }},
  // 스토리지 정리(관리자)의 보호 목록(A6) — DB 의 모든 표·모든 행(1000행 넘게 끝까지)·모든 칸(리포트 본문·알림·녹음 원문 포함)의 글자 전부,
  // 그 글자 속 경로 모양 조각(주소·JSON 글자 안의 키, %2F 로 적힌 주소까지), 샷 행 id 전부 → {strs, shotIds, rows}.
  // 하나라도 끝까지 못 읽었거나, 잠긴 DB 에서 토큰이 안 먹혀 '텅 빈 답'일 수 있으면 null(→ 그 정리는 이번엔 아무것도 지우지 않는다)
  async storageProtect(){if(!this.enabled||!this.client) return null;
    try{ var c=this.client, self=this, strs=Object.create(null), shotIds=Object.create(null), rows={}, TOK=/[A-Za-z0-9_.\-\/]{3,}/g, PCT=/[A-Za-z0-9_.\-\/%]*%[0-9A-Fa-f]{2}[A-Za-z0-9_.\-\/%]*/g;
      var addTok=function(s){ TOK.lastIndex=0; var m; while((m=TOK.exec(s))){ var k=m[0]; if(k.length>1024) continue; strs[k]=1; for(var i=k.indexOf('/'); i!==-1 && i<k.length-1; i=k.indexOf('/',i+1)) strs[k.slice(i+1)]=1; } };
      // %2F 처럼 주소로 적힌 키 — 주소 조각마다 풀어 본다(글 속 다른 '%'(예: 70%) 때문에 통째로 못 풀어도 놓치지 않게)
      var addStr=function(s){ if(s.length<=2048) strs[s]=1; addTok(s); if(s.indexOf('%')===-1) return; var p=[], m; PCT.lastIndex=0; while((m=PCT.exec(s))) p.push(m[0]);
        p.forEach(function(x){ try{ var u=decodeURIComponent(x); if(u!==x){ if(u.length<=2048) strs[u]=1; addTok(u); } }catch(e){} }); };
      var walk=function(v,d){ if(v==null||d>60) return; if(typeof v==='string'){ addStr(v); var t=v.trim(); if(t.length>1 && (t[0]==='{'||t[0]==='[')){ try{ walk(JSON.parse(t),d+1); }catch(e){} } return; }
        if(typeof v==='object'){ for(var k in v){ if(Object.prototype.hasOwnProperty.call(v,k)){ addStr(k); walk(v[k],d+1); } } } };
      var T=[['members',['id']],['assessments',['member_id','item_key']],['sessions',['id']],['reports',['id']],['shot_events',['id']],['active_sessions',['bay_id']],['bays',['id']]];
      var got=await Promise.all(T.map(function(x){ return self._keyset(x[0], x[1], 200000); }));
      for(var i=0;i<T.length;i++){
        var r=got[i], tb=T[i][0];
        if(!r || r.error || r.data.length>=200000) return null;
        rows[tb]=r.data.length;
        r.data.forEach(function(x){ walk(x,0); if(tb==='shot_events' && x && x.id) shotIds[x.id]=1; });
      }
      // 회원·타석 0개 = 잠긴 DB 에서 토큰이 안 먹힌 모습일 수 있다 → 지우지 않음. 그 밖에도 지금 잠금·토큰 상태를 서버에 다시 물어 확인
      if(!rows.members || !rows.bays) return null;
      var w=await authWhoami();
      if(!(w.missing || (w.data && (w.data.mode!=='locked' || w.data.ok)))) return null;
      return {strs:strs, shotIds:shotIds, rows:rows};
    }catch(e){ console.warn('[cloud] storageProtect fail:', e&&e.message); return null; }},
  // 수업 센터 4초 폴링용 가벼운 조회(B2) — 진행 세션 + ts 가 sinceIso 이후인 샷(+ 콕 집어 지켜보는 샷 id 몇 개)만. 타석(bays)은 안 받는다.
  // ts 는 타석 PC 시계로 찍히고 같은 샷을 다시 보내면 바뀌므로 '마지막으로 받은 시각 이후' 커서 대신 넉넉한 창을 매번 받아 id 로 합친다.
  // → {activeSessions, shotEvents(오래된→최신), extra, since, ids, complete(창이 1000개 상한에 안 걸림), empty(세 결과 모두 0행)} | null
  async loadLiveWindow(sinceIso, ids){if(!this.enabled) return null;
    try{ if(localStorage.getItem('golf_pt_shotpause')==='1') return null; }catch(e){}
    try{const c=this.client;const qs=[c.from('active_sessions').select('*'),c.from('shot_events').select('*').gte('ts',sinceIso).order('ts',{ascending:false}).limit(1000)];
      if(ids&&ids.length) qs.push(c.from('shot_events').select('*').in('id',ids));
      const rs=await Promise.all(qs);for(var i=0;i<rs.length;i++){ if(rs[i].error) throw rs[i].error; }
      const win=rs[1].data||[], ext=rs[2]?(rs[2].data||[]):[];
      return {activeSessions:this._liveActive(rs[0].data), shotEvents:this._liveShots(win).reverse(), extra:this._liveShots(ext), since:sinceIso, ids:(ids||[]).slice(), complete:win.length<1000, empty:!(rs[0].data||[]).length&&!win.length&&!ext.length};
    }catch(e){console.warn('[cloud] loadLive(window) skip:',e&&e.message);return null;}},
  async upsertBays(bays){if(!this.enabled||!bays||!bays.length) return;await this._w('upsert','bays',{rows:bays.map(b=>({id:b.id,name:b.name,color:b.color,type:b.type}))});},
  async startActiveSession(bayId,sess){if(!this.enabled) return;await this._w('upsert','active_sessions',{rows:[{bay_id:bayId,member_id:sess.memberId,member_name:sess.memberName,author:sess.author,started_at:sess.startedAt,note:sess.note||''}]});},
  async endActiveSession(bayId){if(!this.enabled) return;await this._w('delete','active_sessions',{filters:[{col:'bay_id',op:'eq',val:bayId}]});},
  async insertShot(shot){if(!this.enabled) return;await this._w('upsert','shot_events',{rows:[{id:shot.id,bay_id:shot.bayId,member_id:shot.memberId,member_name:shot.memberName,author:shot.author||'',ts:shot.ts,data:shot.data||{},video_r2_key:shot.videoR2Key||null,source:shot.source||'mock'}]});},
  async reassignShot(shotId,memberId,memberName){if(!this.enabled) return;await this._w('update','shot_events',{values:{member_id:memberId,member_name:memberName},filters:[{col:'id',op:'eq',val:shotId}]});},
  // 샷 행의 몇 칸만 바꾸기 (A5) — 지금 서버의 data 를 다시 읽어 바꿀 칸만 고쳐 쓴다. 예전엔 이 기기의 옛 사본으로 data 를 통째로
  // 덮어써서, 그사이 타석 PC 가 붙인 영상 키가 지워지고 '영상 대기'가 되살아났다(저장한 애프터 샷 3개 영상 연결 끊김).
  // edit(data, row) → 고친 data · cols: 같이 바꿀 칸 {member_id:…} 또는 function(row) → {…}
  // → {ok:true, data} | {gone:true}(행이 없거나 안 보임) | {fail:true}(받기·쓰기 실패 — 실제로 바뀐 행이 없어도 실패)
  async patchShot(id, edit, cols){
    if(!this.enabled||!id) return {fail:true};
    try{
      var r=await this.client.from('shot_events').select('id,data,video_r2_key').eq('id',id).limit(1);
      if(r.error) return {fail:true};
      var row=(r.data||[])[0];
      if(!row) return (S._dbMode==='locked' && !(await _lockedWriteOk())) ? {fail:true} : {gone:true};   // 잠긴 DB: 무효 토큰이면 '없음'처럼 보인다 → 토큰이 유효할 때만 '없음'
      var d0=JSON.stringify(row.data||{}), d=JSON.parse(d0);
      if(edit) d=edit(d, row)||d;
      var extra=(typeof cols==='function' ? cols(row) : cols)||{};
      if(JSON.stringify(d)===d0 && !Object.keys(extra).length) return {ok:true, data:d};   // 바꿀 것 없음
      var vals=Object.assign({data:d}, extra);
      if(this.dbProxy) return (await this._w('update','shot_events',{values:vals,filters:[{col:'id',op:'eq',val:id}]})) ? {ok:true, data:d} : {fail:true};
      var u=await this.client.from('shot_events').update(vals).eq('id',id).select('id');
      if(u.error || !u.data || !u.data.length) return {fail:true};
      return {ok:true, data:d};
    }catch(e){ return {fail:true}; }
  },
  // 샷 표시(_kept·_tag·원본 요청 등)만 서버에 — set 칸은 그 값으로, unset 칸은 지움, 나머지 data 는 서버 값 그대로. 성공 true
  async updateShotData(shot, set, unset, cols){if(!this.enabled||!shot) return false;
    var r=await this.patchShot(shot.id, function(d){ Object.keys(set||{}).forEach(function(k){ d[k]=set[k]; }); (unset||[]).forEach(function(k){ delete d[k]; }); return d; }, cols);
    return !!r.ok;},
  // 영상을 지운 샷의 영상 키만 비움 — 서버의 지금 값이 지운 키일 때만(그사이 새로 붙은 영상은 그대로). 측정 데이터(행·그래프)는 유지
  async clearShotVideo(id, gone){var g={};(gone||[]).forEach(function(k){ g[k]=1; });
    return await this.patchShot(id, function(d){ ['videoMp4R2Key','videoDL','videoFO','videoClub'].forEach(function(f){ if(d[f] && g[d[f]]) delete d[f]; }); return d; },
      function(row){ return (row.video_r2_key && g[row.video_r2_key]) ? {video_r2_key:null} : {}; });},
  // 원본 파일을 지운 샷의 data.orig 비움 — 그 키가 모두 지워졌을 때만(새 원본이 왔으면 그대로)
  async clearShotOrig(id, gone){var g={};(gone||[]).forEach(function(k){ g[k]=1; });
    return await this.patchShot(id, function(d){ var o=d.orig; if(o && typeof o==='object' && ['dl','fo','club','scene'].every(function(a){ return !o[a] || g[o[a]]; })) delete d.orig; return d; });},
  async deleteShot(id){if(!this.enabled) return;await this._w('delete','shot_events',{filters:[{col:'id',op:'eq',val:id}]});},
  // 샷 행 지우기(영상을 먼저 지운 뒤 — delJobsRun) — 80개씩. IN 절에 수백 개 ID 를 한 번에 넣으면 URL 길이 초과(414)로 조용히 실패한다.
  // → {성공한 묶음의 id:1} · DB 미연결(로컬 모드)이면 모두 지운 것으로
  // 잠긴 DB 에서는 지운 행을 돌려받아 그 행만 지운 것으로 — 무효 토큰이면 오류 없이 0행이라, 예전엔 영상만 지워지고 행은 남은 채 작업이 끝났다.
  // 안 돌아온 id 는 토큰이 지금 유효하다고 서버가 답할 때만 '이미 없음'으로 본다(아니면 대기열에 남아 다시 로그인한 뒤 다시)
  async deleteShotRows(ids){var out={};if(!ids||!ids.length) return out;
    if(!this.enabled){ ids.forEach(function(id){ out[id]=1; }); return out; }
    var locked=(S._dbMode==='locked' && !this.dbProxy), trust=null;
    for(var i=0;i<ids.length;i+=80){ var part=ids.slice(i,i+80);
      if(!locked){ if(await this._w('delete','shot_events',{filters:[{col:'id',op:'in',val:part}]})) part.forEach(function(id){ out[id]=1; }); continue; }
      try{ var r=await this.client.from('shot_events').delete().in('id',part).select('id'); if(r.error) continue;
        var got={}; (r.data||[]).forEach(function(x){ if(x && x.id){ got[x.id]=1; out[x.id]=1; } });
        var rest=part.filter(function(id){ return !got[id]; });
        if(rest.length){ if(trust===null) trust=await _lockedWriteOk(); if(trust) rest.forEach(function(id){ out[id]=1; }); }
      }catch(e){}
    }
    return out;}
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
  // 지난번에 못 연 복구 대기 전문이 있으면 재시도 (일지 작성이 끝난 뒤 폴링에서)
  if(S._lostTx && S._lostTx.length && !S.showAddSession){
    var _it=S._lostTx[0];
    try{
      if(typeof openVoiceDraft==='function' && openVoiceDraft(_it.memberId, _it.author, _it.tx)){
        S._lostTx.shift(); try{ save(); }catch(e){}
        liveToastSafe('🎙 대기 중이던 녹음 전문을 복구했어요 — 일지를 저장하세요');
      } else {
        // 영구 실패 항목(삭제된 회원·관찰용 회원 등)이 큐 머리를 점거하면 뒤의 일반 회원
        // 전문 복구까지 막힌다 — 몇 번 시도해도 안 열리면 버린다
        _it._tries=(_it._tries||0)+1;
        var _mm=S.members.find(function(x){return x.id===_it.memberId;});
        if(!_mm || _mm.ownerWatch || _it._tries>=30){ S._lostTx.shift(); try{ save(); }catch(e){} }
      }
    }catch(e){}
  }
  // 다른 기기에서 세션이 종료돼 서버 목록에서 사라졌는데 이 기기에 받아쓴 전문이
  // 남아 있으면 — 조용히 버리지 않고 일지 초안으로 복구한다.
  // (2026-08-11 김현수 50분 레슨 유실 사고: 종료가 다른 경로로 일어나며 폴링이
  //  로컬 세션 객체를 통째로 버려 전문이 증발했음)
  Object.keys(prev).forEach(function(b){
    if(next[b]) return;
    var p = prev[b];
    var tx = p && String(p._transcript||'').trim();
    if(!tx || p.author!==S.currentUser) return;
    if(typeof isOwnerWatchMember==='function' && isOwnerWatchMember(p.memberId)) return;   // 관찰용 회원 — 일지 복구 대상 아님
    if(typeof _rec!=='undefined' && (_rec.bayId===b || _rec._lastBay===b)) return;   // 이 기기에서 녹음 중·마지막 조각 변환 중 — 녹음 마무리(_finishRec)가 전문으로 복구한다(초안 두 번 방지)
    try{
      if(typeof openVoiceDraft==='function' && !S.showAddSession && openVoiceDraft(p.memberId, p.author, tx)){
        liveToastSafe('🎙 다른 곳에서 종료된 세션의 녹음 전문을 복구했어요 — 일지를 저장하세요');
      } else {
        // 일지 작성 중 등으로 지금 못 열면 보관함에 쌓아두고 폴링에서 재시도
        S._lostTx = S._lostTx || [];
        S._lostTx.push({ memberId:p.memberId, author:p.author, tx:tx, at:new Date().toISOString() });
        try{ save(); }catch(e){}
      }
    }catch(e){}
  });
  Object.keys(next).forEach(function(b){
    var n = next[b], p = prev[b];
    if(p && p.memberId === n.memberId){
      if(!n.mode && p.mode) n.mode = p.mode;
      Object.keys(p).forEach(function(k){
        if(k.charAt(0)==='_' && k!=='_gone' && n[k]===undefined) n[k]=p[k];
      });
    }
    if(!n.mode){
      var bay = (typeof getBay==='function') ? getBay(b) : null;
      n.mode = (bay && bay.type==='lesson_only') ? 'lesson' : 'practice';
    }
  });
  // 이 기기에서 녹음 중인 수업이 다른 곳에서 끝났으면(2시간 자동 종료 등) 녹음을 마칠 때까지 이 기기 화면엔 남긴다 — 예전엔 바로 사라져
  // [녹음 종료] 버튼이 없어지고 그 뒤에 받아쓴 글은 어디에도 저장되지 않았다. 녹음을 마치면 다음 확인 때 위의 복구로 일지 초안이 된다.
  // 서버엔 이 수업이 없으므로 새 샷은 이 회원에게 붙이지 않는다(_gone)
  try{ var _rb=(typeof _rec!=='undefined') ? _rec.bayId : null; if(_rb && prev[_rb] && !next[_rb]){ next[_rb]=prev[_rb]; next[_rb]._gone=1; } }catch(e){}
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
    if(act && !act._gone && !isStaleSession(act)){
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

// ============ 저장 워커 요청 공통 — 인증 헤더 (보안 S1) ============
// 공용 열쇠 X-API-Key(config R2_API_KEY 가 있는 동안) + 로그인 토큰 X-Staff-Token(있으면) (+ 스토리지 진단만 관리자 열쇠 X-Admin-Key)
// ⚠️ 지금 운영 중인 워커(v1)는 CORS 에서 X-Staff-Token·X-Admin-Key 를 허용하지 않아, 브라우저가 그 헤더가 붙은 요청을 통째로
//    막는다(TypeError → 업로드·녹음 복구 끊김). 그래서 그런 요청이 네트워크 오류로 실패하면 그 헤더만 빼고 바로 다시 보내고,
//    그게 되면 30분 동안 그 워커엔 붙이지 않는다(v2 를 배포하면 30분 안에 자동으로 다시 붙음). 이때 토큰 없이 보낸 요청이
//    401 이면(나중에 공용 열쇠를 끈 단계) 곧바로 토큰을 붙여 다시 보낸다.
var _wNoTok={};
function _wOrigin(u){ try{ return new URL(u, location.href).origin; }catch(e){ return String(u||''); } }
function _wSkipTok(org){ var t=_wNoTok[org]; if(t===undefined){ try{ t=+(sessionStorage.getItem('golf_pt_wnotok:'+org)||0); }catch(e){ t=0; } _wNoTok[org]=t; } return t>Date.now(); }
function _wSetSkip(org, on){ var t=on?Date.now()+30*60000:0; _wNoTok[org]=t; try{ if(on) sessionStorage.setItem('golf_pt_wnotok:'+org, String(t)); else sessionStorage.removeItem('golf_pt_wnotok:'+org); }catch(e){} }
// 관리자 열쇠(워커 ADMIN_KEY) — 스토리지 진단에서 입력. 이 탭에만(sessionStorage) 두고 로그아웃·앱 종료 때 사라짐
function _adminKey(){ try{ return sessionStorage.getItem('golf_pt_admin_key')||''; }catch(e){ return ''; } }
function setAdminKey(v){ try{ if(v) sessionStorage.setItem('golf_pt_admin_key', String(v)); else sessionStorage.removeItem('golf_pt_admin_key'); }catch(e){} }
async function wFetch(url, init, o){
  init=init||{}; o=o||{};
  var base=Object.assign({}, init.headers||{});
  if(base['X-API-Key']===undefined && typeof r2!=='undefined' && r2.apiKey) base['X-API-Key']=r2.apiKey;
  if(!base['X-API-Key']) delete base['X-API-Key'];
  var add={}, tok=tokStore.token(), ak=o.admin ? _adminKey() : '';
  if(tok) add['X-Staff-Token']=tok;
  if(ak) add['X-Admin-Key']=ak;
  var go=function(extra){ return fetch(url, Object.assign({}, init, {headers:Object.assign({}, base, extra||{})})); };
  if(!tok && !ak) return go();
  var org=_wOrigin(url);
  if(_wSkipTok(org)){
    var r0=await go();
    if(r0.status!==401) return r0;
    try{ var r1=await go(add); _wSetSkip(org, false); return r1; }catch(e){ return r0; }
  }
  try{ return await go(add); }
  catch(e){
    if(e && e.name==='AbortError') throw e;   // 시간 초과 등 — 그대로
    var rr=await go();                        // 헤더 없이도 실패하면 진짜 네트워크 문제 → 그대로 오류
    _wSetSkip(org, true);
    return rr;
  }
}

// ============ Cloudflare R2 미디어 스토리지 ============
const r2 = {
  workerUrl:'', apiKey:'', enabled:false, lastListStatus:0,
  // 공용 열쇠(R2_API_KEY)가 없어도(나중에 config 에서 뺀 뒤) 로그인 토큰만으로 동작
  init(){const cfg=window.APP_CONFIG||{};if(!cfg.R2_WORKER_URL) return false;this.workerUrl=String(cfg.R2_WORKER_URL).replace(/\/+$/,'');this.apiKey=cfg.R2_API_KEY||'';this.enabled=true;return true;},
  url(key){if(!this.enabled||!key) return '';return this.workerUrl+'/'+encodeURIComponent(key);},
  // 업로드 — 일시적 네트워크/5xx 실패는 3회까지 자동 재시도 (지수 백오프)
  async upload(key,blob){if(!this.enabled) return false;
    for(var attempt=0; attempt<3; attempt++){
      try{
        const res=await wFetch(this.url(key),{method:'PUT',headers:{'Content-Type':(blob&&blob.type)||'application/octet-stream'},body:blob});
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
  async remove(key){if(!this.enabled) return false;try{const res=await wFetch(this.url(key),{method:'DELETE'});return res.ok;}catch(e){console.warn('[r2] delete fail:',e);return false;}},
  // 샷·회원 삭제용 지우기 — 지워졌으면 true. 없는 파일(404)도 '이미 지워짐'이라 성공. 네트워크·5xx·429 는 3번까지 다시(0.4·0.8·1.6초 뒤),
  // 인증 거절 같은 다른 4xx 는 다시 보내도 같으므로 바로 실패(그 키는 삭제 대기열에 남아 다음 정리 때 다시)
  async removeSure(key){if(!this.enabled||!key) return false;
    for(var i=0;i<DEL_TRIES;i++){
      var st=0;
      try{ var res=await wFetch(this.url(key),{method:'DELETE'}); st=res.status; if(res.ok||st===404) return true; }catch(e){ st=0; }
      if(st>=400 && st<500 && st!==408 && st!==429) return false;
      if(i<DEL_TRIES-1) await new Promise(function(r){ setTimeout(r, 400*Math.pow(2,i)); });
    }
    return false;},
  // R2 객체 목록 (관리자 스토리지 진단용) — 워커 /__list 라우트. cursor 로 페이지네이션.
  // 워커 v2 + ADMIN_KEY 설정 뒤에는 관리자 열쇠(입력했으면) 또는 관리자 토큰으로만 열림 — 실패 코드는 lastListStatus 에
  async list(cursor){if(!this.enabled) return null;this.lastListStatus=0;try{const u=this.workerUrl+'/__list'+(cursor?('?cursor='+encodeURIComponent(cursor)):'');const res=await wFetch(u,{},{admin:true});this.lastListStatus=res.status;if(!res.ok) return null;return await res.json();}catch(e){console.warn('[r2] list fail:',e);return null;}}
};
// ============ 샷 삭제 — 영상(R2) 먼저, 다 지워진 샷만 DB 에서 (A2 · v9.99) ============
// 예전엔 DB 행을 먼저 지우고 영상 삭제는 보내고 잊어서(결과 확인·재시도 없음) 한 번 실패하면 그 묶음의 영상이 주인 없는 파일로
// 영영 남았다(8~11월 약 1만 5천 개). 이제: 영상을 6개씩 동시에 지우며 끝날 때까지 기다리고, 실패하면 3번까지 다시(없는 파일 404 = 성공),
// 영상이 다 지워진 샷만 DB 에서 지운다. 못 지운 키는 이 기기의 대기열(localStorage 'golf_pt_delq')에 남아 다음 정리 때(앱 시작·로그인·
// 30분마다·앱으로 돌아올 때 — shotMaintTick) 다시 지운다. 대기열의 샷은 서버에 행이 남아 있어도 이 기기 화면엔 다시 뜨지 않는다.
// 다른 샷·고객 리포트가 함께 쓰는 파일(keep)은 지우지 않는다 — 행만 지우고 파일은 그쪽 참조로 남긴다.
// job = {j, id:샷 id(''=파일만), op:'del'(행 삭제)|'clear'(영상 키만 비움)|'orig'(원본 키 비움)|''(파일만), k:[남은 키], g:[지운 키], c:DB 에서 비운 g 수, at, n:실패 횟수}
var DEL_CONC=6, DEL_TRIES=4, DEL_STOP_FAILS=12, DEL_LATER_MSG='⚠️ 일부 영상을 못 지웠어요 — 자동으로 다시 지울게요';
// 샷 하나의 R2 파일 키 — what: 'video'(측면·정면·클럽·mkv 원본·mp4) | 'orig'(요청해서 받은 원본) | 전부
function shotVideoKeys(s, what){
  var out=[], d=(s&&s.data)||{}, o=(d.orig&&typeof d.orig==='object')?d.orig:{};
  var add=function(k){ if(k && typeof k==='string' && out.indexOf(k)===-1) out.push(k); };
  if(what!=='orig'){ add(s&&s.videoR2Key); add(d.videoMp4R2Key); add(d.videoDL); add(d.videoFO); add(d.videoClub); }
  if(what!=='video') ['dl','fo','club','scene'].forEach(function(a){ add(o[a]); });
  return out;
}
var delQ={
  K:'golf_pt_delq', _a:null,
  all(){ if(!this._a){ var a=[]; try{ a=JSON.parse(localStorage.getItem(this.K)||'[]'); }catch(e){} this._a=(Array.isArray(a)?a:[]).filter(function(j){ return j && typeof j==='object' && Array.isArray(j.k); }); this._a.forEach(function(j){ if(!Array.isArray(j.g)) j.g=[]; }); } return this._a; },
  save(){ var a=this.all().filter(function(j){ return !j.x; }); this._a=a; try{ if(a.length) localStorage.setItem(this.K, JSON.stringify(a.slice(-5000))); else localStorage.removeItem(this.K); }catch(e){} },
  // 같은 샷·같은 작업이 이미 있으면 키만 합친다 → 실제로 대기열에 있는 job 들
  add(jobs){ var a=this.all(), idx={}, out=[];
    a.forEach(function(j){ if(j.id && !j.x) idx[j.op+'|'+j.id]=j; });
    (jobs||[]).forEach(function(nj){ var ex=nj.id?idx[nj.op+'|'+nj.id]:null;
      if(ex){ nj.k.forEach(function(k){ if(ex.k.indexOf(k)===-1 && ex.g.indexOf(k)===-1) ex.k.push(k); }); if(!nj.a) delete ex.a; out.push(ex); }   // 사람이 누른 삭제가 합쳐지면 자동 작업 표시(a)를 뗀다(다시 확인 대상 아님)
      else { a.push(nj); if(nj.id) idx[nj.op+'|'+nj.id]=nj; out.push(nj); } });
    this.save(); return out; },
  ids(op){ var m={}; this.all().forEach(function(j){ if(j.id && !j.x && (!op || j.op===op)) m[j.id]=1; }); return m; }   // 대기 중인 샷 id
};
function delJob(id, op, keys){ return {j:'j'+Date.now().toString(36)+Math.random().toString(36).slice(2,7), id:id||'', op:op||'', k:(keys||[]).slice(), g:[], at:Date.now(), n:0}; }
// 이 기기 목록에서 (지우려는 샷 말고) 다른 샷이 쓰는 파일 — 한 파일을 두 행이 쓰면 한쪽을 지울 때 다른 쪽(저장 샷일 수 있음) 영상까지 사라진다
function _keysInUse(excl){ var m={}; (S.shotEvents||[]).forEach(function(s){ if(!s || excl[s.id]) return; shotVideoKeys(s).forEach(function(k){ m[k]=1; }); }); return m; }
// 영상 키를 서버에서 비운 샷 — 이 기기 사본에서도 그 키만 뺀다
function _delLocalApply(j){
  var s=(S.shotEvents||[]).find(function(x){ return x.id===j.id; }); if(!s) return;
  var g={}; j.g.forEach(function(k){ g[k]=1; });
  if(j.op==='clear'){ if(s.videoR2Key && g[s.videoR2Key]) s.videoR2Key=null; if(s.data) ['videoMp4R2Key','videoDL','videoFO','videoClub'].forEach(function(f){ if(s.data[f] && g[s.data[f]]) delete s.data[f]; }); }
  if(j.op==='orig' && s.data && s.data.orig && typeof s.data.orig==='object' && ['dl','fo','club','scene'].every(function(a){ return !s.data.orig[a] || g[s.data.orig[a]]; })) delete s.data.orig;
}
// job 처리 — 파일 삭제(첫 키는 혼자, 나머지는 6개씩 동시에) → 파일이 다 지워진 job 만 DB 단계.
// 첫 키를 혼자 보내는 이유: 운영 중인 워커(v1)는 로그인 토큰 헤더를 CORS 로 막아, 첫 요청이 '토큰 없이'를 기억한 뒤에 나머지가 바로 통과.
// 한 번에 12개 넘게 실패하면(망 끊김·인증 거절) 나머지는 보내지 않고 다음 정리 때로. → {rows:지운 행, left:남은 job, keysFailed, done:[끝난 job]}
var _delBusy={};
async function delJobsRun(jobs){
  var out={rows:0, left:0, keysFailed:0, done:[]};
  var other=(jobs||[]).filter(function(j){ return j && !j.x && _delBusy[j.j]; }).length;   // 다른 곳에서 지우는 중 — 그쪽이 끝냄(아직 안 끝난 것으로 셈)
  jobs=(jobs||[]).filter(function(j){ return j && !j.x && !_delBusy[j.j]; });
  if(!jobs.length){ out.left=other; return out; }
  // 잠긴 DB: 이 기기 토큰이 지금도 유효하다고 서버가 답할 때만 지운다 — 무효 토큰이면 영상만 지워지고 행은 오류 없이 남는다.
  // 아니면 job 은 대기열에 그대로(비밀번호로 다시 로그인한 뒤 다음 정리 때 다시)
  if(typeof cloud!=='undefined' && cloud.enabled && S._dbMode==='locked' && !(await _lockedWriteOk())){ out.left=other+jobs.length; return out; }
  var n0=jobs.length; jobs=jobs.filter(function(j){ return !j.x && !_delBusy[j.j]; }); other+=n0-jobs.length;   // 확인하는 사이 다른 곳에서 시작한 job 은 그쪽에
  if(!jobs.length){ out.left=other; return out; }
  jobs.forEach(function(j){ _delBusy[j.j]=1; });
  try{
    var keys=[], seen={}, ok={}, fails=0, next=1, useR2=(typeof r2!=='undefined' && r2.enabled);
    jobs.forEach(function(j){ j.k.forEach(function(k){ if(!seen[k]){ seen[k]=1; keys.push(k); } }); });
    var one=async function(k){ if(!useR2){ ok[k]=1; return; } if(fails>=DEL_STOP_FAILS) return; if(await r2.removeSure(k)) ok[k]=1; else fails++; };   // R2 미설정 기기는 파일 단계 없음(예전과 같음)
    if(keys.length) await one(keys[0]);
    var lane=async function(){ while(next<keys.length){ var k=keys[next++]; await one(k); } };
    var lanes=[]; for(var i=0;i<Math.min(DEL_CONC, keys.length-1);i++) lanes.push(lane());
    await Promise.all(lanes);
    out.keysFailed=keys.length-Object.keys(ok).length;
    jobs.forEach(function(j){ var left=[]; j.k.forEach(function(k){ if(ok[k]){ if(j.g.indexOf(k)===-1) j.g.push(k); } else left.push(k); }); j.k=left; if(left.length) j.n=(j.n||0)+1; });
    delQ.save();
    // DB — 행 삭제·원본 비우기는 파일이 다 지워진 job 만. 영상 키 비우기(clear)는 지워진 키만 그때그때(못 지운 키는 그대로 두어 영상이 계속 재생됨)
    var ready=jobs.filter(function(j){ return !j.k.length || (j.op==='clear' && j.id && j.g.length>(j.c||0)); });
    var dIds=ready.filter(function(j){ return j.op==='del' && j.id && !j.k.length; }).map(function(j){ return j.id; });
    var gone=dIds.length ? await cloud.deleteShotRows(dIds) : {};
    for(var x=0;x<ready.length;x++){
      var j=ready[x], fin=!j.k.length;
      if(j.op==='del' && j.id){ fin=!!gone[j.id]; if(fin) out.rows++; }
      else if(j.op==='clear' && j.id){ var pr=await cloud.clearShotVideo(j.id, j.g); if(pr.ok||pr.gone){ j.c=j.g.length; if(pr.ok) _delLocalApply(j); } else fin=false; }
      else if(j.op==='orig' && j.id){ var po=await cloud.clearShotOrig(j.id, j.g); fin=!!(po.ok||po.gone); if(po.ok) _delLocalApply(j); }
      if(fin){ j.x=1; out.done.push(j); } else if(!j.k.length) j.n=(j.n||0)+1;
    }
  }catch(e){ console.warn('[del] run fail:', e&&e.message); }
  finally{ jobs.forEach(function(j){ delete _delBusy[j.j]; }); delQ.save(); }
  out.left=other+jobs.filter(function(j){ return !j.x; }).length;
  return out;
}
// 대기열 다시 — 정리 때마다(shotMaintTick). 30일 넘게·60번 넘게 실패한 job 은 버린다(행은 서버에 남아 다음 정리 대상이 되므로 잃는 것 없음)
async function delQueueRetry(){
  var now=Date.now();
  delQ.all().forEach(function(j){ if(!j.x && ((j.n||0)>60 || now-(j.at||0)>30*86400000)){ j.x=1; console.warn('[del] 오래 못 지운 삭제 대기 정리:', j.op, j.k.length); } });
  delQ.save();
  var jobs=delQ.all().slice();
  // 자동 정리(24시간 미배정·3일 영상·7일 원본)가 남긴 작업은 다시 하기 직전에 서버 값으로 다시 판단한다(그 사이 배정·저장됐거나 리포트가 쓰기 시작했을 수 있음)
  if(typeof _delAutoRecheck==='function') jobs=await _delAutoRecheck(jobs);
  return await delJobsRun(jobs);
}
// 샷 지우기 공통 — 사람이 누른 삭제(샷 삭제·버림·선택/전체/미배정 삭제·리포트 샷 삭제·회원 삭제)와 자동 정리(24시간 미배정).
// 이 기기 목록에서 빼고 대기열에 먼저 적은 뒤(도중에 앱이 닫혀도 다음에 이어서) 영상부터 지운다.
// o.keep: 지우면 안 되는 파일 {키:1}(고객 리포트가 쓰는 영상) · o.extra: 함께 지울 다른 파일(회원 일지 첨부)
// o.auto: 자동 정리가 정한 삭제('stale' 등) — 대기열에서 다시 할 때는 그 직전에 서버 값으로 다시 판단한다(_delAutoRecheck)
async function delShotsRun(shots, o){
  o=o||{};
  var ids={}, list=[];
  (shots||[]).forEach(function(s){ if(s && s.id && !ids[s.id]){ ids[s.id]=1; list.push(s); } });
  var keep=_keysInUse(ids); Object.keys(o.keep||{}).forEach(function(k){ keep[k]=1; });
  var jobs=list.map(function(s){ var j=delJob(s.id, 'del', shotVideoKeys(s).filter(function(k){ return !keep[k]; })); if(o.auto) j.a=o.auto; return j; });
  var ex=(o.extra||[]).filter(function(k){ return k && typeof k==='string' && !keep[k]; });
  if(ex.length) jobs.push(delJob('', '', ex));
  jobs=delQ.add(jobs);
  if(list.length && S.shotEvents){ var n0=S.shotEvents.length; S.shotEvents=S.shotEvents.filter(function(s){ return !ids[s.id]; }); if(S.shotEvents.length!==n0){ try{ save(); }catch(e){} } }
  return await delJobsRun(jobs);
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
  handovers:{}, showHandover:null,
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
  try{_notifyOwner(entry);}catch(e){}
}

// ── 관리자(대표) 알림 — 프로·트레이너·인포데스크의 주요 등록/수정을 클라우드에 남겨
// 관리자 기기의 🔔 알림함에서 확인. reports 테이블을 재활용(member_id='notice')해
// DB 스키마 변경 없이 동작. 관리자 본인의 행동은 알리지 않는다.
var NOTIFY_ACTIONS = {'회원 등록':1,'회원 수정':1,'세션 기록':1,'세션 수정':1,'세션 삭제':1,'평가 수정':1,'삭제 요청':1};
function _notifyOwner(entry){
  if(S.currentRole==='admin') return;
  if(!NOTIFY_ACTIONS[entry.action]) return;
  if(typeof cloud==='undefined'||!cloud||!cloud.enabled) return;
  var row={ id:'ntc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),
    member_id:'notice', member_name:String(entry.target||'').slice(0,80),
    created_by:entry.user||'',
    content:{ notice:true, action:entry.action, category:entry.category,
              user:entry.user, role:entry.role, target:entry.target, time:entry.time } };
  (async function(){
    try{ if((await cloud._w('upsert','reports',{rows:[row]}))===true) return; }catch(e){}
    try{ await cloud.client.from('reports').upsert(row); }catch(e){}
  })();
}

// ============ Activity Log ============
function logActivity(action, memberId, detail){
  var mName='';var m=S.members.find(function(x){return x.id===memberId;});if(m) mName=m.name;
  if(m && m.ownerWatch) return;   // 관찰용 회원 활동은 활동 로그(알림 벨)에 기록 안 함 — 전 직원에게 노출되는 로그
  S.activityLog.push({time:new Date().toISOString(),user:S.currentUser||'시스템',action:action,memberId:memberId||'',memberName:mName,detail:detail||''});
  if(S.activityLog.length>200) S.activityLog=S.activityLog.slice(-200);
}
function getUnreadCount(){if(!S.currentUser) return 0;var last=S.lastSeen[S.currentUser]||'';return S.activityLog.filter(function(e){return e.time>last&&e.user!==S.currentUser&&!(typeof isOwnerWatchMember==='function'&&isOwnerWatchMember(e.memberId));}).length;}
function markSeen(){if(!S.currentUser)return;S.lastSeen[S.currentUser]=new Date().toISOString();save();}

// ============ Helpers ============
function today(){return new Date().toISOString().slice(0,10);}
function daysUntilExpiry(dateStr){if(!dateStr)return null;var exp=new Date(dateStr+'T23:59:59');var now=new Date();return Math.ceil((exp-now)/(1000*60*60*24));}
function nearestExpiry(m){if(!m) return '';var dates=[];if(m.golfLessonExpiry) dates.push(m.golfLessonExpiry);if(m.golfPTExpiry) dates.push(m.golfPTExpiry);if(dates.length===0&&m.expiry) dates.push(m.expiry);if(dates.length===0) return '';return dates.reduce(function(a,b){return a<b?a:b;});}
function expiryBadge(dateStr){var d=daysUntilExpiry(dateStr);if(d===null)return '';if(d<0)return ' <span class="exp-badge exp-expired">만료</span>';if(d<=30)return ' <span class="exp-badge exp-soon">D-'+d+'</span>';return '';}
// 지도자 역할에 맞는 유효기간 — 프로(골프 레슨): 레슨 유효기간, 트레이너(PT): PT 유효기간. 둘 다 비어 있으면 예전 단일 유효기간(expiry)
function expiryFor(m, role){if(!m) return '';var l=m.golfLessonExpiry||'', p=m.golfPTExpiry||'', old=(!l&&!p)?(m.expiry||''):'';return role==='trainer'?(p||old):(l||old);}
// 활성 회원 = 유효기간이 하나라도 남음(만료 배지와 같은 기준). role 을 주면 그 역할의 유효기간만 본다. 관찰용 회원은 아님
function memberActive(m, role){if(!m||m.ownerWatch) return false;var ds=role?[expiryFor(m,role)]:[m.golfLessonExpiry,m.golfPTExpiry,m.expiry];return ds.some(function(v){var d=v?daysUntilExpiry(v):null;return d!==null&&d>=0;});}
// ── 녹음·AI 정리 동의 (v9.99) — members.data: recConsent(동의한 날 'YYYY-MM-DD') · recConsentBy(기록한 직원) · recConsentHow('서면'|'구두')
//    · recConsentNo(거부한 날) · recConsentAt(마지막으로 바꾼 시각 — 기기끼리 엇갈리면 나중 기록이 이긴다)
var REC_CONSENT_KEYS=['recConsent','recConsentBy','recConsentHow','recConsentNo','recConsentAt'];
// 'yes' 동의 · 'no' 거부 · '' 기록 없음 (둘 다 있으면 늦은 날, 같은 날이면 거부)
function recConsentState(m){if(!m) return '';var y=String(m.recConsent||''),n=String(m.recConsentNo||'');if(n&&n>=y) return 'no';return y?'yes':'';}
function _rcRefusedId(mid){var m=(S.members||[]).find(function(x){return x.id===mid;});return !!m&&!m.ownerWatch&&recConsentState(m)==='no';}
// 비교용 기록 시각 — 시각 없는 기록은 '0'(기록 없음 '' 보다는 새것)
function _rcAt(d){return d?String(d.recConsentAt||((d.recConsent||d.recConsentNo)?'0':'')):'';}
function _rcCopy(to, from){REC_CONSENT_KEYS.forEach(function(k){to[k]=(from&&from[k])||'';});}
// 이 기기의 오늘 날짜 — today() 는 UTC 날짜라 오전 9시 전엔 어제가 된다(동의한 날은 실제 날짜로)
function _rcToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// 서버에서 회원을 새로 받은 뒤 — 이 기기의 동의 기록이 더 새로우면(올리기 실패, 또는 옛 버전 앱이 회원을 저장하며 동의 칸을 지움) 다시 올린다
function _rcKeep(localMembers){(localMembers||[]).forEach(function(lm){if(!lm||!_rcAt(lm)) return;var rm=(S.members||[]).find(function(x){return x.id===lm.id;});if(!rm||_rcAt(lm)<=_rcAt(rm)) return;_rcCopy(rm, lm);try{syncConsentUp(rm);}catch(e){}});}
// 녹음 시작 직전 — 서버의 동의 기록을 그 자리에서 확인(다른 기기에서 방금 거부·동의를 적었을 수 있음). ms 까지만 기다리고, 못 받으면 이 기기 기록대로
function _rcFresh(m, ms){
  if(!m||typeof cloud==='undefined'||!cloud||!cloud.enabled) return Promise.resolve(false);
  var p=Promise.resolve(cloud.memberData(m.id)).then(function(d){ if(d && _rcAt(d)>_rcAt(m)){ _rcCopy(m, d); try{save();}catch(e){} return true; } return false; }, function(){ return false; });
  return Promise.race([p, new Promise(function(r){ setTimeout(function(){ r(false); }, ms||2500); })]);
}
function uid(){return 'm'+Date.now()+Math.random().toString(36).slice(2,5);}
function suid(){return 's'+Date.now()+Math.random().toString(36).slice(2,5);}
function initials(name){if(!name) return '?';const p=name.trim().split(/\s+/);if(p.length>=2) return p[0][0]+p[1][0];return name.slice(0,2);}
function save(){
  if(S.activityLog&&S.activityLog.length>50) S.activityLog=S.activityLog.slice(-50);
  if(S.auditLog&&S.auditLog.length>100) S.auditLog=S.auditLog.slice(-100);
  var _draft=(S.showAddSession?S.newSession:null);
  // 녹음 원문은 기기에 저장하지 않는다(관리자 기기 포함 — 원문 두 벌로 저장 한도 85~93%를 쓰던 문제, v9.98).
  // 예외: 아직 서버 업로드가 안 끝난 일지(_dirty) — 이때는 기기 사본이 유일해서 지우면 원문이 사라진다. 그때도 한 벌만 저장.
  var _rep=function(k,v){
    if(k==='data'&&typeof v==='string'&&v.length>1000) return undefined;
    if(k==='rawTranscript'||k==='supplement'){
      if(!(this && this._dirty)) return undefined;
      if(k==='supplement' && this.rawTranscript && String(this.rawTranscript).trim()) return undefined;   // rawTranscript 와 같은 내용 → 한 벌만
    }
    return v;
  };
  var _pack=function(shots){ return {members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,auditLog:S.auditLog,lastSeen:S.lastSeen,handovers:S.handovers,bays:S.bays,activeSessions:S.activeSessions,shotEvents:shots,deletedSessionIds:S.deletedSessionIds,deletedMemberIds:S.deletedMemberIds,_dirtyAssess:S._dirtyAssess,_draftSession:_draft,_draftMember:S.selectedMember,_lostTx:S._lostTx||[]}; };
  try{ localStorage.setItem('golf_pt_v2',JSON.stringify(_pack(S.shotEvents),_rep)); return true; }catch(e){}
  // 저장 공간 부족 → 샷 목록은 최근 200개만 기기에 남긴다(앱을 켤 때 서버에서 다시 받음). 일지·인수인계 메모는 그대로.
  try{ var _sh=(S.shotEvents||[]); localStorage.setItem('golf_pt_v2',JSON.stringify(_pack(_sh.length>200?_sh.slice(-200):_sh),_rep)); return true; }catch(e1){}
  // 그래도 부족 → 활동·감사 기록만 줄여서 마지막 시도 (인수인계 메모·미업로드 표시·초안은 지우지 않음)
  try{ S.activityLog=[]; S.auditLog=S.auditLog?S.auditLog.slice(-20):[]; localStorage.setItem('golf_pt_v2',JSON.stringify(_pack([]),_rep)); return true; }
  catch(e2){
    console.warn('[save] localStorage full');
    try{ if(!window.__saveFullWarned){ window.__saveFullWarned=true; setTimeout(function(){ try{ if(typeof liveToast==='function') liveToast('⚠️ 이 기기의 저장 공간이 부족해 일부 내용이 기기에 저장되지 않았어요 — 계속되면 관리자에게 알려주세요','err'); }catch(_){} },0); } }catch(_){}
    return false;
  }
}
function estimateStorageSize(){try{return JSON.stringify({members:S.members,assessments:S.assessments,sessions:S.sessions,deleteRequests:S.deleteRequests,activityLog:S.activityLog,lastSeen:S.lastSeen}).length;}catch(e){return 0;}}
function loadLocal(){try{const d=localStorage.getItem('golf_pt_v2');if(d){const p=JSON.parse(d);S.members=p.members||SAMPLE_DATA.members;S.assessments=p.assessments||SAMPLE_DATA.assessments;S.sessions=p.sessions||SAMPLE_DATA.sessions;S.deleteRequests=p.deleteRequests||{};S.activityLog=p.activityLog||[];S.auditLog=p.auditLog||[];S.lastSeen=p.lastSeen||{};S.handovers=p.handovers||{};S.bays=CONFIG_BAYS_SET?BAYS_DEFAULT.slice():((p.bays&&p.bays.length)?p.bays:BAYS_DEFAULT.slice());S.activeSessions=p.activeSessions||{};S.shotEvents=p.shotEvents||[];S.deletedSessionIds=p.deletedSessionIds||{};S.deletedMemberIds=p.deletedMemberIds||{};S._dirtyAssess=p._dirtyAssess||{};S._draftSession=p._draftSession||null;S._draftMember=p._draftMember||null;S._lostTx=p._lostTx||[];}else{S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}}catch(e){S.members=SAMPLE_DATA.members;S.assessments=SAMPLE_DATA.assessments;S.sessions=SAMPLE_DATA.sessions;}if(!S.bays||!S.bays.length) S.bays=BAYS_DEFAULT.slice();}
function readHash(){var h=location.hash.replace('#','');if(!h)return;var parts=h.split('-');var role=parts[0];var user=decodeURIComponent(parts.slice(1).join('-'));var authed=sessionStorage.getItem('golf_pt_auth');if(!authed){location.hash='';return;}
  // 🛡 주소(#) 만 바꿔서 다른 역할로 들어가는 것 차단 (v9.98) — 이 탭에서 실제로 로그인한 역할·사람과 같을 때만 복원
  // (예전엔 인포데스크로 로그인한 뒤 주소 끝을 #admin 으로 바꿔 새로고침하면 관리자가 됐다)
  var _ai=String(authed).indexOf(':'), _aRole=_ai>=0?String(authed).slice(0,_ai):String(authed), _aUser=_ai>=0?String(authed).slice(_ai+1):'';
  if(_aRole!==role || ((role==='pro'||role==='trainer') && _aUser!==user)){location.hash='';return;}
  if(role==='infodesk'){S.currentRole='infodesk';S.currentUser='인포데스크';}else if(role==='admin'){S.currentRole='admin';S.currentUser='관리자';}else if(role==='pro'&&user){S.currentRole='pro';S.currentUser=user;}else if(role==='trainer'&&user){S.currentRole='trainer';S.currentUser=user;}
  // 세션 복원(리로드/재개)도 로그인 상태 → 자동 업데이트가 계속 동작하도록 플래그 세팅
  if(S.currentRole){ try{window.__authed=true;}catch(e){} }}
function setRole(role,user){var key=role==='infodesk'?'infodesk':(role==='admin'?'관리자':user);
  // DB 잠금 중인데 이 계정 토큰이 없음 → 생체·자동 로그인으로는 토큰을 못 받으니 비밀번호로만 (S1)
  var _pwOnly=_needPwForToken(key);
  // 신뢰기기(생체 미지원 + '이 기기 자동 로그인' 허용) → 랜딩에서 역할 탭 즉시 입장(비번 생략)
  if(!_pwOnly && !bio.available && deviceTrusted()){ activateRole(role,user); return; }
  var pw=getPassword(key);if(pw||_pwOnly){S.pendingRole={role:role,user:user};S.showPwModal=true;S.pwError=false;S.pwInput='';S.bioError='';render();if(!_pwOnly) bioAutoTry();return;}activateRole(role,user);}
function activateRole(role,user){
  // 다른 사람의 토큰이 남아 있으면 버린다(그 사람 이름으로 저장 기록이 남지 않게). 비밀번호로 들어왔으면 방금 받은 내 토큰
  try{ var _tk=tokStore.raw(); if(_tk && _tk.u!==pwKeyOf(role,user)) tokStore.clear(); }catch(e){}
  // 잠긴 DB 라서 부팅 때 서버 자료를 못 불러왔으면 → 이제 토큰이 있으니 불러온다
  if(S._authNeedLoad && tokStore.token()){ S._authNeedLoad=false; setTimeout(function(){ try{ refreshFromCloud(); }catch(e){} }, 0); }
  S.currentRole=role;S.currentUser=user;S.showPwModal=false;S.pwError=false;S.pendingRole=null;S.bioError='';try{window.__authed=true;}catch(e){}try{sessionStorage.setItem('golf_pt_auth',role+':'+user);}catch(e){}try{localStorage.setItem('golf_pt_last_user',JSON.stringify({role:role,user:user}));}catch(e){}location.hash=role+(role!=='infodesk'?'-'+encodeURIComponent(user):'');if(role==='pro'||role==='trainer') S.newSession.author=user;
  // 로그인 착지 = 대시보드 홈. 예전엔 담당 첫 회원(로버트)이 자동 선택돼 "첫 화면이 맨날 로버트" 문제.
  S.selectedMember=null;S.showDashboard=true;S.showLiveSession=false;
  if(S._pwForce && S._pwForce.key===pwKeyOf(role,user)){ S.pwChange={current:'',newPw:'',confirm:''}; S.pwChangeError=''; S.showPwChange=true; } else S._pwForce=null;
  var _viaPw=!!S._pwViaPassword; S._pwViaPassword=false;
  render();
  try{ setTimeout(ensureOwnerWatchMember, 5000); }catch(e){}
  // 생체·자동 로그인(비밀번호 안 침)이면 잠시 뒤 서버에 내 계정 표시(초기값 이전·변경 요구) — 비밀번호로 들어왔으면 이미 끝난 일
  if(!_viaPw){ try{ setTimeout(function(){ pwClaimAfterLogin(role,user); }, 1500); }catch(e){} }
  try{ setTimeout(function(){ if(typeof retryPendingAiSummaries==='function') retryPendingAiSummaries(); }, 8000); }catch(e){}
  try{ setTimeout(function(){ if(typeof shotMaintTick==='function') shotMaintTick('login'); }, 0); }catch(e){}   // 샷 자동 정리·세션 자동 종료 (서버 자료를 받는 중이면 끝난 뒤)
  try{ setTimeout(function(){ if(typeof resumeInterruptedRec==='function') resumeInterruptedRec(); }, 2500); }catch(e){}   // 로그인 후 끊긴 녹음 자동 재개
  // 리포트 검토 독촉 — 클라우드 동기화가 끝날 즈음 검토 대기 목록을 띄우고, 폰 푸시 구독을 이 사용자로 다시 묶는다
  try{ setTimeout(function(){ if(typeof showReviewNag==='function') showReviewNag(!!window.__rvForceOnce); }, 7000); }catch(e){}
  try{ setTimeout(function(){ if(typeof _pushSyncOnLogin==='function') _pushSyncOnLogin(); }, 4000); }catch(e){}
  try{ setTimeout(function(){ if(typeof _fetchCoNotices==='function') _fetchCoNotices(true); }, 2500); }catch(e){}   // 담당자 알림·점 표시
  try{ setTimeout(function(){ if(typeof _openMemberOnce==='function') _openMemberOnce(); }, 1800); }catch(e){}   // 푸시(?member=)로 들어왔으면 그 회원 열기
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
function syncMemberUp(m, opts){
  if(!m) return;
  m._dirty = true;
  try{save();}catch(e){}
  Promise.resolve(cloud.upsertMember(m, opts)).then(function(ok){ if(ok){ delete m._dirty; try{save();}catch(e){} } });
}
// 녹음 동의만 올리기(위 upsertMemberConsent) — 회원 정보를 통째로 올리지 않는다. 실패해도 이 기기의 기록이 더 새로우므로
// 다음에 서버에서 받을 때(_rcKeep) 다시 올라간다
function syncConsentUp(m, noCreate){
  if(!m) return;
  try{save();}catch(e){}
  Promise.resolve(cloud.upsertMemberConsent(m, noCreate)).then(function(ok){ if(ok){ try{save();}catch(e){} } }, function(){});
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
async function submitPassword(){var p=S.pendingRole;if(!p||S.pwBusy===p)return;var key=pwKeyOf(p.role,p.user);var typed=S.pwInput||'';
  // 서버 확인(보통 1초 안, 최대 8초) — 다시 그리면 입력칸이 비므로 버튼 글자만 바꾼다. 진행 표시는 이 요청(p)에 묶어, 취소 뒤 새 시도를 막지 않게
  S.pwBusy=p;S.pwError=false;S.pwMsg='';try{var _b=document.querySelector('.pw-modal .btn.primary');if(_b){_b.disabled=true;_b.textContent='확인 중...';}}catch(e){}
  var res;try{res=await verifyPassword(key,typed);}catch(e){res={ok:false};}finally{if(S.pwBusy===p)S.pwBusy=null;}
  if(S.pendingRole!==p) return;   // 그 사이 취소됨
  if(!res.ok){S.pwError=true;S.pwMsg=res.msg||'';S.pwInput='';render();return;}
  S.pwMsg='';S.pwInput='';S._pwViaPassword=true;
  // 초기 비밀번호·관리자 초기화로 들어옴 → 들어간 직후 새 비밀번호 정하기 창
  S._pwForce=res.mustChange?{key:key,current:typed}:null;
  {logAudit('auth','로그인',p.user||key,{role:p.role,method:(res.via==='server'?'password':'password-'+res.via)});
  // 생체 미지원 기기에서 '자동 로그인' 체크 시 → 이 기기 신뢰 저장
  if(!bio.available && S.trustDevice){ setDeviceTrust(true); }
  // 생체 등록 모달: (1) 아직 등록 안 됨 (2) 등록은 돼 있는데 이번에 생체 인증이 실패함(등록 정보가 풀린 것)
  //  — 예전엔 (1)만 있어서, 폰 업데이트 등으로 등록이 풀리면 다시 등록할 길이 없이 매번 비밀번호를 쳐야 했다
  //  (2026-09 갤럭시 폴드 "일주일 전부터 생체 로그인이 안 됨" 사례). 재등록은 기존 등록 정보를 덮어쓴다.
  var _bf=S._bioFail; var _stale=!!(_bf && _bf.role===p.role && _bf.user===p.user);
  if(bio.available && (!bio.isRegistered(p.role,p.user) || _stale)){S.bioEnrollFor={role:p.role,user:p.user,reenroll:_stale};S._bioFail=null;S.showPwModal=false;render();return;}activateRole(p.role,p.user);}}
function cancelPassword(){S.showPwModal=false;S.pendingRole=null;S.pwError=false;S.pwMsg='';S.pwInput='';S.bioError='';render();}

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
      rp:{name:APP_BRAND.appName,id:location.hostname},
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
  if(_needPwForToken(pwKeyOf(p.role,p.user))) return;   // 잠금 중 + 토큰 없음 → 비밀번호로만
  _bioTrying = true;
  S.bioBusy=true; S.bioError=''; render();
  try{
    var ok=await bio.verify(p.role,p.user);
    S.bioBusy=false;
    if(ok){logAudit('auth','로그인',p.user||p.role,{role:p.role,method:'biometric'});activateRole(p.role,p.user);return;}
    // 인증창이 뜨기 전에 거부된 경우(이미 로그인 상태·미지원·등록 정보 없음) — 원인을 구분해 표시
    S._bioFail={role:p.role,user:p.user,err:'nocred'};
    S.bioError='생체 인증을 시작하지 못했어요 — 비밀번호로 로그인하면 바로 다시 등록됩니다';
  }catch(e){
    S.bioBusy=false;
    // 실패 원인(NotAllowedError = 취소 또는 이 기기에 그 등록 정보가 더 이상 없음 — 폰 업데이트·
    // 지문 재등록·비밀번호 관리자 정리 후 흔함)을 기록 → 비밀번호 로그인 뒤 자동으로 재등록 제안
    var nm=(e&&e.name)||'오류';
    S._bioFail={role:p.role,user:p.user,err:nm};
    S.bioError=(nm==='NotAllowedError')
      ? '생체 인증이 취소됐거나 이 기기의 등록 정보가 풀렸어요 — 비밀번호로 로그인하면 바로 다시 등록됩니다'
      : '생체 인증 오류('+nm+') — 비밀번호로 로그인하면 바로 다시 등록됩니다';
    try{ console.warn('[bio] verify fail:', nm, e&&e.message); }catch(_){}
  }finally{
    _bioTrying = false;
  }
  render();
}
// 비밀번호 모달의 [지문 다시 등록] — 다음 비밀번호 로그인 때 재등록 모달로
function bioReenrollHint(){
  var p=S.pendingRole; if(!p) return;
  S._bioFail={role:p.role,user:p.user,err:'manual'};
  S.bioError='비밀번호로 로그인하면 생체 로그인을 다시 등록합니다';
  render();
  try{ var i=document.querySelector('.pw-modal input[type=password]'); if(i) i.focus(); }catch(e){}
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
function switchRole(){if(S.currentUser) logAudit('auth','로그아웃',S.currentUser,{});S._pwForce=null;S.showPwChange=false;S.currentRole=null;S.currentUser=null;location.hash='';try{sessionStorage.removeItem('golf_pt_auth');}catch(e){}
  tokStore.clear(); setAdminKey('');   // 로그아웃 = 이 기기의 로그인 토큰·관리자 열쇠도 지움 (다음 사람이 내 이름으로 저장하지 않게)
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
    // 로그인 토큰·DB 잠금 확인 (S1) — 잠긴 DB + 쓸 토큰 없음이면 불러오지도 시드하지도 않고 비밀번호 로그인부터
    if((await authBoot())==='login'){ _authNeedLogin(); } else {
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
        try{ _rcKeep(localSnap.members); }catch(e){}   // 서버보다 새로운 이 기기의 녹음 동의 기록 다시 올리기
        // 미업로드 평가(_dirtyAssess) 재적용
        var _da=S._dirtyAssess||{}; for(const k in _da){ if(!_da[k]) continue; var _p=k.split('|'); var _mid=_p[0], _key=_p[1]; var _lv=(localSnap.assessments[_mid]||{})[_key]; if(_lv){ if(!S.assessments[_mid]) S.assessments[_mid]={}; S.assessments[_mid][_key]=_lv; syncAssessUp(_mid,_key,_lv); } }
        const remoteSessionIds=new Set();Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){remoteSessionIds.add(s.id);});});
        // 재업로드는 "이 기기가 만들었고 아직 업로드 안 끝난(_dirty)" 세션만.
        // 캐시에만 남은 세션을 무조건 복구하면, 다른 기기/브라우저에서 삭제한 기록이 부활한다.
        for(const mid in localSnap.sessions){for(const s of localSnap.sessions[mid]){if(_tomb[s.id]) continue; if(!s._dirty) continue; if(!remoteSessionIds.has(s.id)){const ok=await cloud.upsertSession(mid,s);if(ok) delete s._dirty;if(!S.sessions[mid]) S.sessions[mid]=[];S.sessions[mid].push(s);remoteSessionIds.add(s.id);}}}
        for(const mid in localSnap.assessments){for(const key in localSnap.assessments[mid]){if(key.indexOf('_')===0) continue;const hasRemote=S.assessments[mid]&&S.assessments[mid][key];if(!hasRemote){const v=localSnap.assessments[mid][key];await cloud.upsertAssessment(mid,key,v.result,v.note);if(!S.assessments[mid]) S.assessments[mid]={};S.assessments[mid][key]=v;}}}
        if(!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=null;}
      } else {await seedRemote();}
      purgeZombieSessions();   // 클라우드 머지 후 유령 세션 재확인(서버 삭제 포함)
      save();S.cloudSync='connected';
      try{ ensureOwnerWatchMember(); }catch(e){}   // 서버 목록을 받은 지금 확인 (받기 전엔 만들지 않음)
    } else {S.cloudSync=S._authNeedLoad?'auth':'error';}
    // 라이브 세션(베이/활성세션/굿샷) 클라우드 로드 — 테이블 미생성 시 null 반환 → 로컬 유지
    try{const live=await cloud.loadLive();if(live){if(CONFIG_BAYS_SET){S.bays=BAYS_DEFAULT.slice();cloud.upsertBays(S.bays);}else if(live.bays&&live.bays.length){S.bays=live.bays;}else{cloud.upsertBays(S.bays);}applyRemoteActive(live.activeSessions);(function(){var om={};(S.shotEvents||[]).forEach(function(s){om[s.id]=s;});S.shotEvents=(live.shotEvents||[]).map(function(s){var o=om[s.id];if(o){if(o._rcvAt)s._rcvAt=o._rcvAt;if(o._isNew)s._isNew=o._isNew;if(o._uiSavedAt)s._uiSavedAt=o._uiSavedAt;}return s;});})();_liveFullAt=Date.now();reconcileAgentShots();save();}}catch(e){console.warn('[cloud] live load skip:',e);}
    try{ if(typeof shotMaintAfterLoad==='function') shotMaintAfterLoad(); }catch(e){}   // 샷 자동 정리·세션 자동 종료 — 서버 자료를 받은 직후 (그 뒤 30분마다·앱으로 돌아올 때)
    }
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
  if(!(cloud&&cloud.enabled)){ try{ render(); }catch(e){} liveToastSafe('✓ 최신 데이터로 동기화됨'); return; }   // 로컬 모드면 그냥 화면만 갱신
  // 이미 받는 중이면 또 시작하지 않는다 — 예전엔 연타·여러 버튼으로 전체 다운로드가 겹쳐 돌았다(B3)
  if(_rfc.p){ liveToastSafe('동기화 중 — 잠시만요'); return; }
  S.cloudSync='loading';
  try{ render(); }catch(e){}
  var p=refreshFromCloud();
  var r=await Promise.race([
    p.then(function(){ return 'done'; }, function(e){ console.warn('[reload] cloud:',e&&e.message); return 'fail'; }),
    new Promise(function(res){ setTimeout(function(){ res('slow'); }, 6000); })
  ]);
  if(r==='slow'){
    // 느린 망: 오류가 아니다 — 받기는 계속되고 끝나면 화면이 저절로 바뀐다(예전엔 '동기화 오류'로 보여 다시 눌러 다운로드가 겹쳤다)
    liveToastSafe('백그라운드 동기화 중 — 끝나면 자동 반영');
    p.then(function(){ if(S.cloudSync==='connected') liveToastSafe('✓ 최신 데이터로 동기화됨'); }, function(){});
    return;
  }
  if(r==='fail'){ S.cloudSync='error'; try{ render(); }catch(e){} }
  if(S.cloudSync==='connected') liveToastSafe('✓ 최신 데이터로 동기화됨');
  else if(S.cloudSync==='error') liveToastSafe('동기화 지연 — 네트워크 확인');   // 'auth' = 잠긴 DB 에서 토큰이 안 먹혀 비밀번호 창으로 감 → 안내는 그 창이
}
function liveToastSafe(msg){ try{ if(typeof liveToast==='function') liveToast(msg,'ok'); }catch(e){} }

// ---------- 오너 관찰용 회원 ----------
// 최현승 트레이너 전용 "타석 점검" 회원 — 타석에 배정해 현재 치는 샷을 실시간으로
// 보기 위한 용도. 세션 종료 시 일지 작성 없음. 담당자(최현승)와 관리자에게만 보이고
// 인포데스크·다른 직원에게는 숨김.
var OWNER_WATCH_USER = '최현승 트레이너';
function isOwnerWatchMember(mid){
  try{ var m=S.members.find(function(x){return x.id===mid;}); return !!(m && m.ownerWatch); }catch(e){ return false; }
}
// 관찰용 회원(타석 점검)을 이 기기 사용자에게 보여도 되는가 — 담당자·관리자만.
// (사이드바 필터와 같은 규칙. 수업 센터의 타석 카드·샷 목록 비노출에 사용)
function canSeeOwnerWatch(){
  return S.currentRole==='admin' || S.currentUser===OWNER_WATCH_USER;
}
function ensureOwnerWatchMember(){
  try{
    if(S.currentRole!=='trainer' || S.currentUser!==OWNER_WATCH_USER) return;
    // 서버 자료를 다 받은 뒤에만 — 받기 전(잠긴 DB 에서 비밀번호 로그인 직후 느린 망 등)엔 이 기기 목록이 아직 예시 자료라
    // 서버에 이미 있는 '타석 점검'을 못 보고 하나 더 만들었다. 다 받으면(_refreshFromCloudNow·앱 시작 머지) 그때 다시 확인한다
    if(typeof cloud!=='undefined' && cloud && cloud.enabled && (S.cloudSync!=='connected' || S._authNeedLoad)) return;
    if(S.members.some(function(m){return m.ownerWatch;})) return;
    var m={ id:uid(), name:'타석 점검', color:'av-green', memberType:'lesson', ownerWatch:1,
      assignedTo:[OWNER_WATCH_USER], registeredDate:today(), phone:'', email:'',
      golfLessonCount:'', golfPTCount:'' };
    S.members.push(m);
    try{ save(); }catch(e){}
    try{ cloud.upsertMember(m); }catch(e){}
    try{ render(); }catch(e){}
  }catch(e){}
}
// 로그인 직후 클라우드 동기화가 끝날 시간을 준 뒤 1회 확인 (기기 간 중복 생성 방지)
try{ setTimeout(ensureOwnerWatchMember, 6000); }catch(e){}
// 'AI 정리 대기'로 남은 일지 자동 재시도 — 부팅 후 + 앱 복귀 때
// (저장 직후 앱을 닫으면 AI 요청이 브라우저와 함께 죽어 받아쓰기 조각으로 남는 사고)
try{ setTimeout(function(){ if(typeof retryPendingAiSummaries==='function') retryPendingAiSummaries(); }, 9000); }catch(e){}
try{ document.addEventListener('visibilitychange', function(){
  if(document.visibilityState==='visible') setTimeout(function(){ if(typeof retryPendingAiSummaries==='function') retryPendingAiSummaries(); }, 2500);
  if(document.visibilityState==='visible') setTimeout(tokMaybeRefresh, 4000);   // 며칠씩 켜 둔 앱도 토큰 갱신(7일 남았을 때 하루 1번)
}); }catch(e){}

// ============ 새 버전 감지 → 업데이트 배너 ============
// iOS PWA 는 며칠씩 리로드 없이 살아남아 배포가 나가도 옛 버전이 계속 뜬다(v9.52 사건).
// version.json 을 주기적으로(10분 + 앱 복귀 시) 확인해 새 버전이면 하단 배너를 띄우고,
// 탭하면 새로고침. 판별은 문자열 불일치가 아니라 숫자 비교 — 배포가 밀려 옛 버전이
// 내려오는 동안(페이지즈 장애 등) 엉뚱한 "다운그레이드 배너"가 뜨지 않게.
function _verNum(v){ var m=/^v?(\d+)\.(\d+)/.exec(String(v||'')); return m ? (+m[1])*1000+(+m[2]) : 0; }
// 수업 녹음·받아쓰기 중인지 — 이때 배너를 탭해 새로고침하면 진행 중 녹음이 끊기므로 배너 금지
function _updBlocked(){
  try{ if(typeof _rec!=='undefined' && (_rec.bayId || _rec.pendingStt>0)) return true; }catch(e){}   // 녹음 중 + 종료 후 변환 대기 중
  try{ if(S && S.voiceBay) return true; }catch(e){}
  try{ if(S && S.activeSessions && Object.keys(S.activeSessions).some(function(b){ var a=S.activeSessions[b]; return a && a._sttBusy && (!a._sttBusyAt || Date.now()-a._sttBusyAt<90000); })) return true; }catch(e){}   // "마지막 조각 변환 중" (90초 지난 스테일 플래그는 무시 — 업데이트 무기한 차단 방지)
  return false;
}
async function checkAppUpdate(){
  try{
    if(_updBlocked()){ var eb=document.getElementById('upd-banner'); if(eb) eb.remove(); return; }
    var r=await fetch('version.json?_='+Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    var j=await r.json();
    var nv=j&&j.version;
    if(!nv || _verNum(nv)<=_verNum(APP_VERSION.version)) return;
    // 새 서비스워커도 미리 받아두기 — 배너 탭 한 번으로 완전히 새 버전
    try{ if(navigator.serviceWorker){ var reg=await navigator.serviceWorker.getRegistration(); if(reg) reg.update(); } }catch(e){}
    var b=document.getElementById('upd-banner');
    if(!b){
      b=document.createElement('div'); b.id='upd-banner';
      b.onclick=function(){ b.textContent='업데이트 중...'; location.reload(); };
      document.body.appendChild(b);
    }
    b.innerHTML='🔄 새 버전 '+esc(nv)+' — <b>탭하면 업데이트</b> <span>(현재 '+APP_VERSION.version+')</span>';
  }catch(e){}
}
try{
  setInterval(checkAppUpdate, 10*60000);
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') setTimeout(checkAppUpdate, 1500); });
  setTimeout(checkAppUpdate, 8000);
}catch(e){}

// 서버에서 다시 받기 — 진행 중이면 같은 다운로드를 같이 기다린다(로그인 직후·샷 수신 재개·새로고침 버튼이 겹쳐도 한 번만, B3).
// 그 사이 로그인 토큰이 바뀌었으면(비밀번호 로그인) 지금 것이 끝난 뒤 새 토큰으로 한 번 더 받는다.
var _rfc={p:null, tok:''};
function refreshFromCloud(){
  var tk=tokStore.token();
  if(_rfc.p && _rfc.tok===tk) return _rfc.p;
  var prev=_rfc.p;
  var p=(prev ? prev.then(function(){}, function(){}) : Promise.resolve()).then(_refreshFromCloudNow);
  _rfc={p:p, tok:tk};
  var done=function(){ if(_rfc.p===p) _rfc={p:null, tok:''}; };
  p.then(done, done);
  return p;
}
async function _refreshFromCloudNow(){
  if(!cloud.enabled) return;S.cloudSync='loading';render();
  const remote=await cloud.loadAll();
  if(remote){
    var localMediaMap={}, localDirty={};
    Object.keys(S.sessions).forEach(function(mid){(S.sessions[mid]||[]).forEach(function(s){
      if(s.media) localMediaMap[s.id]=s.media;
      if(s._dirty){ if(!localDirty[mid]) localDirty[mid]=[]; localDirty[mid].push(s); }   // 업로드 미완 보존
    });});
    var _localMembers=S.members, _localAssess=S.assessments||{};
    S.members=remote.members;S.assessments=remote.assessments;S.sessions=remote.sessions;
    var _mtomb2=S.deletedMemberIds||{};
    if(Object.keys(_mtomb2).length){ S.members=S.members.filter(function(m){ if(_mtomb2[m.id]){ try{cloud.deleteMember(m.id);}catch(e){} delete S.assessments[m.id]; delete S.sessions[m.id]; return false; } return true; }); }
    // 이 기기에서 아직 못 올린 회원 수정(_dirty)·평가(_dirtyAssess)는 서버 사본으로 덮지 않고 다시 얹어 올린다(앱 시작 머지와 같게).
    // 예전엔 새로고침 때, 그리고 잠긴 DB 에서 토큰이 취소·만료돼 비밀번호로 다시 들어온 직후(이 경로로만 받음) 그 수정이 조용히 사라졌다
    (_localMembers||[]).forEach(function(dm){ if(!dm || !dm._dirty || _mtomb2[dm.id]) return; var i=S.members.findIndex(function(x){return x.id===dm.id;}); if(i>=0) S.members[i]=dm; else S.members.push(dm); try{ syncMemberUp(dm); }catch(e){} });
    var _da=S._dirtyAssess||{}; Object.keys(_da).forEach(function(k){ if(!_da[k]) return; var p=k.split('|'), lv=(_localAssess[p[0]]||{})[p[1]]; if(!lv || _mtomb2[p[0]]) return; if(!S.assessments[p[0]]) S.assessments[p[0]]={}; S.assessments[p[0]][p[1]]=lv; try{ syncAssessUp(p[0], p[1], lv); }catch(e){} });
    try{ _rcKeep(_localMembers); }catch(e){}   // 서버보다 새로운 이 기기의 녹음 동의 기록은 지우지 않고 다시 올린다
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
    if(S.members.length>0&&!S.members.find(m=>m.id===S.selectedMember)){S.selectedMember=null;}
    purgeZombieSessions();
    try{ if(typeof _rawIdxReset==='function') _rawIdxReset(); }catch(e){}   // 관리자 원문 목록(어느 일지에 원문이 있나)도 다시 받게
    save();S.cloudSync='connected';
    try{ ensureOwnerWatchMember(); }catch(e){}   // 서버 목록을 받은 지금 확인 (받기 전엔 만들지 않음)
  }else{S.cloudSync=S._authNeedLoad?'auth':'error';}
  try{const live=await cloud.loadLive();if(live){if(live.bays&&live.bays.length&&!CONFIG_BAYS_SET) S.bays=live.bays;applyRemoteActive(live.activeSessions);(function(){var om={};(S.shotEvents||[]).forEach(function(s){om[s.id]=s;});S.shotEvents=(live.shotEvents||[]).map(function(s){var o=om[s.id];if(o){if(o._rcvAt)s._rcvAt=o._rcvAt;if(o._isNew)s._isNew=o._isNew;if(o._uiSavedAt)s._uiSavedAt=o._uiSavedAt;}return s;});})();_liveFullAt=Date.now();reconcileAgentShots();save();}}catch(e){console.warn('[cloud] live refresh skip:',e);}
  try{ if(typeof shotMaintAfterLoad==='function') shotMaintAfterLoad(); }catch(e){}   // 받는 중에 로그인했으면 그 자동 정리를 지금
  render();
}

function stats(mid){const sess=S.sessions[mid]||[];return {total:sess.length,pro:sess.filter(s=>getRole(s.author)==='pro').length,trainer:sess.filter(s=>getRole(s.author)==='trainer').length};}
function calcFitness(assess){var PTS={'정상':7,'경미한 제한':5,'주의 필요':2,'제한':0,'미검사':0};var total=0,untested=0;for(var i=0;i<ASSESSMENT_ITEMS.length;i++){var v=assess[ASSESSMENT_ITEMS[i].key];if(!v||!v.result||v.result==='미검사'){untested++;}else{total+=(PTS[v.result]||0);}}var score=Math.round((total/98)*100);var cls=score>=85?'fit-good':score>=60?'fit-warn':'fit-danger';return {score:score,cls:cls,untested:untested};}

function syncBadge(){
  const map={local:{cls:'local',label:'로컬 모드'},loading:{cls:'loading',label:'동기화 중...'},connected:{cls:'connected',label:'Supabase 동기화됨'},error:{cls:'error',label:'동기화 오류'},auth:{cls:'error',label:'로그인 필요'}};
  const s=map[S.cloudSync]||map.local;
  const refresh=(S.cloudSync==='connected'||S.cloudSync==='error'||S.cloudSync==='auth')?`<button class="sync-refresh" onclick="reloadApp()">새로고침</button>`:'';
  return `<div class="sync-indicator ${s.cls}"><div class="sync-dot"></div><div>${s.label}</div>${refresh}</div>`;
}

// ============ Render ============
