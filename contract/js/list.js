(function () {
const $ = id => document.getElementById(id);
const cfg = window.NG_CONTRACT_CONFIG;
let session = null;

const STATUS_LABEL = {
  pending: '대기', sent: '발송', viewed: '열람',
  signed: '서명완료', expired: '만료', canceled: '취소'
};

async function init() {
  // 지점 필터 채우기
  const branches = cfg.BRANCHES || [];
  $('filter-branch').innerHTML = '<option value="">전체 지점</option>'
    + branches.map(b => '<option>' + b + '</option>').join('');

  const { data } = await sb.auth.getSession();
  session = data.session;
  if (!session) { $('login').style.display='block'; $('app').style.display='none'; return; }
  $('login').style.display='none'; $('app').style.display='block';
  load();
}
$('btn-login').onclick = async () => {
  const email = $('login-email').value.trim(), pw = $('login-pw').value;
  $('login-err').textContent='';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) { $('login-err').textContent = error.message; return; }
  session = data.session; init();
};

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let _searchTimer = null;
function load() {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(_load, 200);
}

async function _load() {
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="muted">불러오는 중...</td></tr>';
  let q = sb.from('contracts').select('*').order('created_at', { ascending: false }).limit(300);
  const txt = $('q').value.trim();
  const st = $('filter-status').value;
  const br = $('filter-branch').value;
  if (txt) q = q.or('member_name.ilike.%' + txt + '%,member_phone.ilike.%' + txt + '%');
  if (st)  q = q.eq('status', st);
  if (br)  q = q.eq('branch', br);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = '<tr><td colspan="7" class="error">' + escapeHTML(error.message) + '</td></tr>'; return; }
  $('count').textContent = data.length + '건';
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">결과 없음</td></tr>'; return; }
  tbody.innerHTML = data.map(c => {
    const tag = '<span class="tag ' + c.status + '">' + (STATUS_LABEL[c.status] || c.status) + '</span>';
    let actions = '';
    if (c.status === 'signed') {
      actions = '<a href="./view.html?id=' + c.id + '" class="btn secondary" style="padding:4px 10px;font-size:12px">보기</a>';
    } else if (c.status === 'expired' || c.status === 'canceled') {
      actions = '<span class="muted small">-</span>';
    } else {
      const url = (cfg.SIGN_BASE_URL || (location.origin + location.pathname.replace(/list\.html$/, 'sign.html'))) + '?t=' + c.sign_token;
      actions = '<button class="secondary" style="padding:4px 10px;font-size:12px" data-copy="' + escapeHTML(url) + '">링크 복사</button>';
    }
    return '<tr>'
      + '<td>' + escapeHTML(c.member_name) + '</td>'
      + '<td>' + escapeHTML(c.member_phone) + '</td>'
      + '<td>' + escapeHTML(c.branch || '-') + '</td>'
      + '<td>' + Number(c.total_amount || 0).toLocaleString() + '원</td>'
      + '<td>' + tag + '</td>'
      + '<td>' + new Date(c.created_at).toLocaleDateString('ko-KR') + '</td>'
      + '<td>' + actions + '</td>'
      + '</tr>';
  }).join('');
  tbody.querySelectorAll('[data-copy]').forEach(b => {
    b.onclick = () => {
      const v = b.dataset.copy;
      if (navigator.clipboard) navigator.clipboard.writeText(v);
      else {
        const ta = document.createElement('textarea'); ta.value = v;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      b.textContent = '복사됨';
      setTimeout(() => b.textContent = '링크 복사', 1500);
    };
  });
}
$('q').oninput = load;
$('filter-status').onchange = load;
$('filter-branch').onchange = load;

init();
})();
