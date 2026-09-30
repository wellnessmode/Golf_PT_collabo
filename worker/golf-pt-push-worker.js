// ============================================================
//  Golf PT — 리포트 검토 독촉 푸시 워커  · 이름: golf-pt-push
// ------------------------------------------------------------
//  무엇을 하나:
//   회원 링크가 있는 회원의 일지·영상이 바뀌면 앱이 members.data.reportDirty 를 켠다.
//   담당 프로가 앱에서 [검토 완료]를 눌러야 회원 링크에 최신 리포트가 반영되는데,
//   이걸 안 누르면 회원은 옛 리포트를 본다. 이 워커는 크론(하루 몇 번)마다
//   검토 대기 회원을 담당자별로 모아 담당자 폰에 웹 푸시(Web Push)로 알린다.
//   관리자 구독은 전체 요약을 받는다.
//
//  라우트 (CORS 허용):
//   GET  /health                → 상태 (시크릿 설정 여부)
//   GET  /push/key              → VAPID 공개키 (앱이 구독할 때 필요, 공개 정보)
//   POST /push/subscribe        → 폰 구독 저장 { user, role, subscription, ua }   (X-API-Key)
//   POST /push/unsubscribe      → 구독 삭제 { endpoint }                          (X-API-Key)
//   POST /push/test             → 그 사용자 폰으로 테스트 알림 { user }             (X-API-Key)
//   POST /push/notify           → 즉시 알림 { to:[이름…], title, body, tag, url } (X-API-Key) — 담당자 간 일지 알림 등
//   GET  /push/run              → 지금 바로 독촉 1회 실행 (X-API-Key 또는 ?key=, 한국 09~21시만·&force=1 로 우회) ← 배포 확인용
//   GET  /push/genkeys?key=…    → VAPID 키쌍 새로 생성해 보여줌 (한 번만 쓰고 시크릿에 저장)
//   scheduled (크론)            → 독촉 실행 (한국 시간 09~21시에만)
//
//  시크릿 (Settings → Variables and Secrets):
//   APP_API_KEY           앱 config.js 의 R2_API_KEY 와 같은 값
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  Supabase service_role 키 (RLS 우회 — 워커에만)
//   VAPID_PUBLIC_KEY      /push/genkeys 로 만든 공개키 (base64url, 87자)
//   VAPID_PRIVATE_KEY     같이 만든 비밀키 (base64url, 43자)
//   VAPID_SUBJECT         mailto:연락이메일  (선택, 푸시 서비스에 알려주는 연락처)
//   PUSH_HOST_ALLOW       (선택) 허용할 푸시 서비스 호스트 추가, 콤마 구분
//
//  테이블: supabase_schema.sql 의 push_subscriptions (anon 정책 없음 — 워커만 접근)
//  배포 절차: worker/푸시-알림-배포.md
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400',
};
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });
}

// ---------- base64url / 바이트 도우미 ----------
const te = new TextEncoder();
function utf8(s) { return te.encode(s); }
function b64uEnc(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDec(s) {
  s = String(s || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  let bin; try { bin = atob(s); } catch (e) { return new Uint8Array(0); }   // 깨진 값은 빈 배열 → 호출측 길이 검사에서 걸림
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat() {
  let n = 0; for (const a of arguments) n += a.length;
  const out = new Uint8Array(n); let o = 0;
  for (const a of arguments) { out.set(a, o); o += a.length; }
  return out;
}

// ---------- VAPID (RFC 8292) — 푸시 서비스에 "우리 서버가 보낸다"를 증명하는 서명 ----------
async function vapidHeaders(endpoint, env) {
  const pub = String(env.VAPID_PUBLIC_KEY || '').trim().replace(/=+$/, '');
  const pubRaw = b64uDec(pub);                                    // 65바이트: 0x04 || x || y
  if (pubRaw.length !== 65 || pubRaw[0] !== 4) throw new Error('VAPID_PUBLIC_KEY 형식 오류(65바이트 raw 공개키여야 함)');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEnc(pubRaw.slice(1, 33)), y: b64uEnc(pubRaw.slice(33, 65)), d: String(env.VAPID_PRIVATE_KEY || '').trim().replace(/=+$/, ''), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = b64uEnc(utf8('{"typ":"JWT","alg":"ES256"}'));
  const claims = b64uEnc(utf8(JSON.stringify({ aud, exp, sub: env.VAPID_SUBJECT || 'mailto:admin@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(header + '.' + claims));   // raw r||s = JWT ES256 형식
  const jwt = header + '.' + claims + '.' + b64uEnc(sig);
  return { 'Authorization': 'vapid t=' + jwt + ', k=' + pub };
}

// ---------- 페이로드 암호화 (RFC 8291 + RFC 8188, aes128gcm) ----------
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
// opts(테스트용): { asKeys: CryptoKeyPair, salt: Uint8Array } — 지정하면 RFC 예제와 동일 출력
async function encryptPayload(sub, payloadStr, opts) {
  const uaPub = b64uDec(sub.keys.p256dh);          // 폰(브라우저) 공개키 65바이트
  const authSecret = b64uDec(sub.keys.auth);       // 폰이 준 16바이트 비밀
  if (uaPub.length !== 65) throw new Error('p256dh 형식 오류');
  const asKeys = (opts && opts.asKeys) || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const salt = (opts && opts.salt) || crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, ecdh, concat(utf8('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const plain = concat(utf8(payloadStr), new Uint8Array([2]));   // 마지막 레코드 구분자 0x02
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain));
  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]), new Uint8Array([asPub.length]), asPub);
  return concat(header, ct);
}

// ---------- 푸시 1건 전송 ----------
async function sendPush(env, s, payloadObj, topic) {
  const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
  const body = await encryptPayload(sub, JSON.stringify(payloadObj));
  const vh = await vapidHeaders(s.endpoint, env);
  const r = await fetch(s.endpoint, {
    method: 'POST',
    headers: { ...vh, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': '43200', 'Urgency': 'normal', 'Topic': topic || 'report-review' },
    body,
  });
  let text = ''; try { text = (await r.text()).slice(0, 200); } catch (e) {}
  return { status: r.status, text };
}

// ---------- Supabase (서비스 키) ----------
function sb(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY 시크릿이 없습니다');
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  const H = { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' };
  return {
    async get(path) { const r = await fetch(base + path, { headers: H }); if (!r.ok) throw new Error('supabase GET ' + path.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 120)); return r.json(); },
    async upsert(table, rows) { const r = await fetch(base + table, { method: 'POST', headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); if (!r.ok) throw new Error('supabase upsert ' + table + ' ' + r.status + ' ' + (await r.text()).slice(0, 120)); },
    async patch(table, qs, values) { const r = await fetch(base + table + '?' + qs, { method: 'PATCH', headers: { ...H, 'Prefer': 'return=minimal' }, body: JSON.stringify(values) }); if (!r.ok) throw new Error('supabase patch ' + table + ' ' + r.status); },
    async del(table, qs) { const r = await fetch(base + table + '?' + qs, { method: 'DELETE', headers: { ...H, 'Prefer': 'return=minimal' } }); if (!r.ok) throw new Error('supabase delete ' + table + ' ' + r.status); },
  };
}

// ---------- 구독 검증 ----------
// endpoint 는 실제 푸시 서비스 주소만 — APP_API_KEY 는 앱 config.js 에 공개된 값이라, 아무 주소나 받으면
// 크론마다 그 주소로 POST 를 보내는 대리 요청기가 된다. (PUSH_HOST_ALLOW 시크릿에 콤마로 추가 가능)
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'web.push.apple.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.samsungosp.com', 'push.samsung.com'];
function endpointAllowed(endpoint, env) {
  let h; try { h = new URL(endpoint).hostname.toLowerCase(); } catch (e) { return false; }
  const extra = String(env.PUSH_HOST_ALLOW || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return PUSH_HOSTS.concat(extra).some(d => h === d || h.endsWith('.' + d));
}
// 사용자 이름은 실제 담당자 명단(회원의 assignedTo 에 등장하는 이름) 또는 '관리자'만 — 아무 이름으로 남의 독촉을 받지 못하게.
// role 은 클라이언트 값을 믿지 않는다: '관리자'만 admin, 그 외는 pro/trainer 중 이름으로 유도.
async function staffNames(db) {
  const rows = await db.get('members?select=data');
  const names = new Set(['관리자']);
  (rows || []).forEach(m => { const a = m && m.data && m.data.assignedTo; if (Array.isArray(a)) a.forEach(n => { if (n) names.add(String(n)); }); });
  return names;
}
function roleFor(user, claimed) {
  if (user === '관리자') return 'admin';
  if (/트레이너|코치/.test(user)) return 'trainer';
  if (/프로/.test(user)) return 'pro';
  return claimed === 'trainer' ? 'trainer' : 'pro';
}
const MAX_SUBS_PER_USER = 5;
const FAIL_DELETE_AT = 10;          // 연속 실패 n회면 구독 삭제
const RESEND_GAP_MS = 3 * 3600000;  // 같은 구독에 3시간 안엔 다시 보내지 않음 (크론·수동 실행 중복 억제)
const TEST_GAP_MS = 60000;          // 테스트 알림은 사용자당 1분 1회

// ---------- 검토 대기 계산 + 알림 문구 ----------
function daysSince(iso, now) { const t = Date.parse(iso); if (!t) return 0; return Math.max(0, Math.floor((now - t) / 86400000)); }
function pendingFromMembers(members, now) {
  return (members || []).filter(m => m && m.data && m.data.reportDirty && m.data.reportId && !m.data.ownerWatch)
    .map(m => ({ id: m.id, name: m.name, days: daysSince(m.data.reportDirty, now), to: Array.isArray(m.data.assignedTo) ? m.data.assignedTo : [] }))
    .sort((a, b) => b.days - a.days);
}
function dayLabel(d) { return d <= 0 ? '오늘' : d + '일째'; }
function buildPayload(sub, mine, all, opts) {
  const url = './index.html?review=1';
  if (opts && opts.test) {
    const extra = mine.length ? ' 지금 검토 대기 ' + mine.length + '명: ' + mine.slice(0, 3).map(p => p.name + '(' + dayLabel(p.days) + ')').join(', ') : ' 지금은 검토 대기가 없어요.';
    return { title: '🔔 알림 테스트 — ' + (sub.user_name || ''), body: '이 폰으로 리포트 검토 알림이 옵니다.' + extra, tag: 'report-review', url };
  }
  if (sub.role === 'admin') {
    const byWho = {};
    all.forEach(p => { (p.to.length ? p.to : ['담당 없음']).forEach(w => { byWho[w] = (byWho[w] || 0) + 1; }); });
    const parts = Object.keys(byWho).sort((a, b) => byWho[b] - byWho[a]).map(w => w + ' ' + byWho[w]);
    const oldest = all.length ? all[0].days : 0;
    return { title: '📤 리포트 검토 대기 ' + all.length + '명', body: parts.join(' · ') + (oldest >= 3 ? ' — 최장 ' + oldest + '일째 방치' : ''), tag: 'report-review', url };
  }
  const names = mine.slice(0, 4).map(p => p.name + '(' + dayLabel(p.days) + ')').join(', ') + (mine.length > 4 ? ' 외 ' + (mine.length - 4) + '명' : '');
  const oldest = mine[0].days;
  const nudge = oldest >= 3 ? ' ⚠️ ' + oldest + '일째 회원이 옛 리포트를 보고 있어요.' : ' [검토 완료]를 눌러야 회원 링크에 반영돼요.';
  return { title: '📤 리포트 검토 대기 ' + mine.length + '명', body: names + nudge, tag: 'report-review', url };
}

// ---------- 독촉 실행 (크론·/push/run·/push/test 공용) ----------
// opts: { onlyUser?: string, test?: boolean }
async function runReminders(env, opts) {
  const db = sb(env);
  const now = Date.now();
  const members = await db.get('members?select=id,name,data');
  const pending = pendingFromMembers(members, now);
  const subs = await db.get('push_subscriptions?select=endpoint,user_name,role,p256dh,auth,fail_count,last_ok_at');
  const sent = [];
  const isTest = !!(opts && opts.test);
  for (const s of subs) {
    if (opts && opts.onlyUser && s.user_name !== opts.onlyUser) continue;
    const mine = s.role === 'admin' ? pending : pending.filter(p => p.to.indexOf(s.user_name) !== -1);
    if (!mine.length && !isTest) continue;
    const lastOk = Date.parse(s.last_ok_at || '') || 0;
    if (!isTest && now - lastOk < RESEND_GAP_MS) { sent.push({ user: s.user_name, role: s.role, count: mine.length, status: 0, note: '최근 ' + Math.round((now - lastOk) / 60000) + '분 전 발송 → 건너뜀' }); continue; }
    if (isTest && now - lastOk < TEST_GAP_MS) { sent.push({ user: s.user_name, role: s.role, count: mine.length, status: 0, note: '1분 뒤 다시 시도' }); continue; }
    let res;
    try { res = await sendPush(env, s, buildPayload(s, mine, pending, opts)); }
    catch (e) { res = { status: -1, text: String(e && e.message || e) }; }
    sent.push({ user: s.user_name, role: s.role, count: mine.length, status: res.status, note: res.status >= 400 || res.status < 0 ? res.text : '' });
    const q = 'endpoint=eq.' + encodeURIComponent(s.endpoint);
    try {
      const gone = res.status === 404 || res.status === 410 || (res.status === 403 && /VapidPkHashMismatch/i.test(res.text || ''));   // 폰이 구독을 지움 / 옛 VAPID 키 구독
      const fails = (s.fail_count || 0) + 1;
      if (gone || ((res.status >= 400 || res.status < 0) && fails >= FAIL_DELETE_AT)) await db.del('push_subscriptions', q);
      else if (res.status >= 400 || res.status < 0) await db.patch('push_subscriptions', q, { fail_count: fails });
      else await db.patch('push_subscriptions', q, { fail_count: 0, last_ok_at: new Date(now).toISOString() });
    } catch (e) {}
  }
  return { pending: pending.length, subscriptions: subs.length, sent };
}

function kstHour(d) { return (d.getUTCHours() + 9) % 24; }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname;
    const authed = () => !!env.APP_API_KEY && (request.headers.get('X-API-Key') === env.APP_API_KEY || url.searchParams.get('key') === env.APP_API_KEY);

    if (p === '/' || p === '/health') {
      return json({ ok: true, worker: 'golf-pt-push', appKey: !!env.APP_API_KEY, db: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY), vapid: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), subject: !!env.VAPID_SUBJECT });
    }
    if (p === '/push/key') {
      return json({ key: String(env.VAPID_PUBLIC_KEY || '').trim().replace(/=+$/, '') });
    }
    if (p === '/push/genkeys') {
      if (!authed()) return json({ error: 'unauthorized (?key=APP_API_KEY)' }, 401);
      const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const pub = b64uEnc(await crypto.subtle.exportKey('raw', k.publicKey));
      const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
      return json({ VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d, note: '두 값을 Settings → Variables and Secrets 에 저장하세요. 이 화면은 저장되지 않으니 지금 복사.' });
    }
    if (p === '/push/run') {
      if (!authed()) return json({ error: 'unauthorized' }, 401);
      const h = kstHour(new Date());
      if ((h < 9 || h > 21) && url.searchParams.get('force') !== '1') return json({ skipped: true, reason: '한국 시간 ' + h + '시 — 09~21시에만 발송 (확인용은 &force=1)' });
      try { return json(await runReminders(env, {})); } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    // 즉시 알림 (앱이 일지 저장 직후 호출) — { to:[담당자 이름…], title, body, tag, url }
    // 검토 독촉과 달리 크론·재발송 간격과 무관하게 바로 보낸다. 받는 이름은 담당자 명단에 있는 것만.
    if (p === '/push/notify') {
      if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
      if (!authed()) return json({ error: 'unauthorized' }, 401);
      let b; try { b = JSON.parse(await request.text()); } catch (e) { return json({ error: 'bad json' }, 400); }
      const to = Array.isArray(b.to) ? b.to.map(x => String(x).slice(0, 60)).slice(0, 10) : [];
      if (!to.length || !b.title) return json({ error: 'to/title 필요' }, 400);
      try {
        const db = sb(env);
        const names = await staffNames(db);
        const valid = to.filter(n => names.has(n));
        if (!valid.length) return json({ error: '등록된 담당자 이름이 아닙니다' }, 400);
        const tag = (String(b.tag || 'golfpt').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)) || 'golfpt';
        const url = /^\.\/index\.html(\?[A-Za-z0-9_=&%.-]*)?$/.test(String(b.url || '')) ? String(b.url) : './index.html';
        const payload = { title: String(b.title).slice(0, 80), body: String(b.body || '').slice(0, 200), tag, url };
        const subs = (await db.get('push_subscriptions?select=endpoint,user_name,role,p256dh,auth,fail_count')).filter(s => valid.indexOf(s.user_name) !== -1);
        const sent = [];
        for (const s of subs) {
          let res; try { res = await sendPush(env, s, payload, tag); } catch (e) { res = { status: -1, text: String(e && e.message || e) }; }
          sent.push({ user: s.user_name, status: res.status, note: res.status >= 400 || res.status < 0 ? res.text : '' });
          const q = 'endpoint=eq.' + encodeURIComponent(s.endpoint);
          try {
            const gone = res.status === 404 || res.status === 410 || (res.status === 403 && /VapidPkHashMismatch/i.test(res.text || ''));
            const fails = (s.fail_count || 0) + 1;
            if (gone || ((res.status >= 400 || res.status < 0) && fails >= FAIL_DELETE_AT)) await db.del('push_subscriptions', q);
            else if (res.status >= 400 || res.status < 0) await db.patch('push_subscriptions', q, { fail_count: fails });
          } catch (e) {}
        }
        return json({ ok: true, to: valid, sent });
      } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    if (p === '/push/subscribe' || p === '/push/unsubscribe' || p === '/push/test') {
      if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
      if (!authed()) return json({ error: 'unauthorized' }, 401);
      let b; try { b = JSON.parse(await request.text()); } catch (e) { return json({ error: 'bad json' }, 400); }
      try {
        const db = sb(env);
        if (p === '/push/subscribe') {
          const s = b.subscription || {};
          const keys = s.keys || {};
          if (!s.endpoint || !/^https:\/\//.test(s.endpoint) || !keys.p256dh || !keys.auth || !b.user) return json({ error: 'endpoint/keys/user 필요' }, 400);
          if (!endpointAllowed(s.endpoint, env)) return json({ error: '허용되지 않은 푸시 서비스 주소' }, 400);
          if (b64uDec(keys.p256dh).length !== 65 || b64uDec(keys.auth).length !== 16) return json({ error: 'p256dh/auth 형식 오류' }, 400);
          const user = String(b.user).slice(0, 60);
          const names = await staffNames(db);
          if (!names.has(user)) return json({ error: '등록된 담당자 이름이 아닙니다' }, 400);
          const role = roleFor(user, String(b.role || ''));
          await db.upsert('push_subscriptions', [{ endpoint: s.endpoint, user_name: user, role, p256dh: keys.p256dh, auth: keys.auth, ua: String(b.ua || '').slice(0, 160), fail_count: 0, updated_at: new Date().toISOString() }]);
          // 사용자당 구독 상한 — 오래된 것부터 정리 (같은 폰 재구독·기기 교체로 쌓이는 행)
          try {
            const rows = await db.get('push_subscriptions?select=endpoint,updated_at&user_name=eq.' + encodeURIComponent(user) + '&order=updated_at.desc');
            for (const r of rows.slice(MAX_SUBS_PER_USER)) await db.del('push_subscriptions', 'endpoint=eq.' + encodeURIComponent(r.endpoint));
          } catch (e) {}
          return json({ ok: true, role });
        }
        if (p === '/push/unsubscribe') {
          if (!b.endpoint) return json({ error: 'endpoint 필요' }, 400);
          await db.del('push_subscriptions', 'endpoint=eq.' + encodeURIComponent(b.endpoint));
          return json({ ok: true });
        }
        // /push/test
        if (!b.user) return json({ error: 'user 필요' }, 400);
        return json(await runReminders(env, { onlyUser: String(b.user), test: true }));
      } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    return json({ error: 'not found' }, 404);
  },

  // 크론 — 대시보드 Triggers → Cron Triggers 에 예:  0 1,5,10 * * *  (한국 10시·14시·19시)
  // 매시간으로 걸어도 한국 시간 09~21시 밖에는 보내지 않는다.
  async scheduled(event, env, ctx) {
    const h = kstHour(new Date(event.scheduledTime || Date.now()));
    if (h < 9 || h > 21) return;
    ctx.waitUntil(runReminders(env, {}).then(r => console.log('reminders', JSON.stringify(r))).catch(e => console.error('reminders fail', e && e.message)));
  },
};

// 테스트(Node)에서 순수 로직을 검증할 수 있게 내보냄 — 워커 런타임은 default export 만 본다
export { encryptPayload, vapidHeaders, pendingFromMembers, buildPayload, runReminders, b64uEnc, b64uDec, endpointAllowed, roleFor };
