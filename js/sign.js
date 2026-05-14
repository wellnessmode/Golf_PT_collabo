(function () {
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const token = params.get('t');

let contract = null, template = null, pad = null;

const PAY_LABEL = { card:'카드', cash:'현금', seoul_pay:'서울페이', transfer:'계좌이체', other:'기타' };

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function load() {
  if (!token) { $('loading').textContent = '유효하지 않은 링크입니다.'; return; }
  const { data, error } = await sb.rpc('get_contract_for_signing', { p_token: token });
  if (error) { $('loading').textContent = '오류: ' + error.message; return; }
  if (data.error) {
    $('loading').textContent = data.error === 'invalid_or_expired'
      ? '만료되었거나 유효하지 않은 링크입니다. 담당자에게 문의해 주세요.'
      : ('오류: ' + data.error);
    return;
  }
  contract = data.contract; template = data.template;
  render();
  $('loading').style.display = 'none';
  $('app').style.display = 'block';
}

function render() {
  const fmt = n => Number(n || 0).toLocaleString() + '원';

  // 계약 요약
  const itemRows = (contract.items_json || []).map(it =>
    '<tr><td>' + escapeHTML(it.name) + '</td><td>' + escapeHTML(it.qty || '') +
    '</td><td style="text-align:right">' + fmt(it.price) + '</td></tr>'
  ).join('');

  const summary =
    '<table class="data">'
    + '<tr><th>회원</th><td>' + escapeHTML(contract.member_name) + ' (' + escapeHTML(contract.member_phone) + ')</td></tr>'
    + (contract.member_birth ? '<tr><th>생년월일</th><td>' + escapeHTML(contract.member_birth) + '</td></tr>' : '')
    + (contract.member_address ? '<tr><th>주소</th><td>' + escapeHTML(contract.member_address) + '</td></tr>' : '')
    + '<tr><th>지점</th><td>' + escapeHTML(contract.branch || '-') + '</td></tr>'
    + '<tr><th>사업자</th><td>' + escapeHTML(contract.business_name) + ' / ' + escapeHTML(contract.business_owner)
      + (contract.business_registration ? ' (' + escapeHTML(contract.business_registration) + ')' : '') + '</td></tr>'
    + '<tr><th>이용 기간</th><td>' + escapeHTML(contract.contract_period_start || '-') + ' ~ ' + escapeHTML(contract.contract_period_end || '-') + '</td></tr>'
    + '<tr><th>결제수단</th><td>' + escapeHTML(PAY_LABEL[contract.payment_method] || contract.payment_method || '-') + '</td></tr>'
    + (contract.locker_no ? '<tr><th>사물함</th><td>' + escapeHTML(contract.locker_no) + (contract.locker_months ? ' / ' + contract.locker_months + '개월' : '') + '</td></tr>' : '')
    + (contract.notes ? '<tr><th>비고</th><td>' + escapeHTML(contract.notes) + '</td></tr>' : '')
    + '</table>'
    + '<h3>계약 항목</h3>'
    + '<table class="data"><thead><tr><th>항목</th><th>횟수/기간</th><th style="text-align:right">금액</th></tr></thead>'
    + '<tbody>' + itemRows
    + '<tr><th colspan="2" style="text-align:right">합계</th><th style="text-align:right">' + fmt(contract.total_amount) + '</th></tr>'
    + '</tbody></table>';

  $('contract-summary').innerHTML = summary;

  // 약관
  $('terms-title').textContent = template.title + ' (v' + template.version + ')';
  $('terms-body').innerHTML = template.body_html;
  $('terms-meta').textContent = '시행일: ' + new Date(template.effective_from).toLocaleDateString('ko-KR');

  // 동의 항목
  const agreements = (template.agreements_json && template.agreements_json.length)
    ? template.agreements_json
    : [
      { key:'terms', label:'위 약관 전문에 동의합니다.', required:true },
      { key:'privacy', label:'서비스 제공을 위한 개인정보 수집·이용에 동의합니다.', required:true }
    ];
  const agEl = $('agreements');
  agEl.innerHTML = agreements.map((a, i) =>
    '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;color:var(--pri);font-size:14px">'
    + '<input type="checkbox" data-i="' + i + '" ' + (a.required ? 'data-req="1"' : '') + ' style="margin-top:2px;width:18px;height:18px;flex:0 0 auto">'
    + '<span>' + (a.required ? '<b style="color:var(--err)">[필수]</b> ' : '<span class="muted">[선택]</span> ') + escapeHTML(a.label) + '</span>'
    + '</label>'
  ).join('');
  agEl.dataset.json = JSON.stringify(agreements);

  // 서명 패드
  const canvas = $('sig');
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    if (pad) pad.clear();
  }
  pad = new SignaturePad(canvas, { penColor: '#111', minWidth: 1.0, maxWidth: 2.5 });
  resize();
  window.addEventListener('resize', resize);
  pad.addEventListener('beginStroke', () => { $('sig-hint').style.display = 'none'; });
  $('sig-clear').onclick = () => { pad.clear(); $('sig-hint').style.display = 'flex'; };
}

$('submit').onclick = async () => {
  $('err').textContent = '';
  const ag = $('agreements');
  const list = JSON.parse(ag.dataset.json);
  const checks = ag.querySelectorAll('input[type=checkbox]');
  const result = {};
  let missing = false;
  checks.forEach((c, i) => {
    result[list[i].key] = c.checked;
    if (list[i].required && !c.checked) missing = true;
  });
  if (missing) { $('err').textContent = '필수 동의 항목을 모두 체크해 주세요.'; return; }
  if (pad.isEmpty()) { $('err').textContent = '서명을 입력해 주세요.'; return; }

  const sigPng = pad.toDataURL('image/png');

  // 약관 + 동의 항목을 모두 포함한 스냅샷 (서명 시점 박제)
  const snapshot =
    '<div class="contract-snapshot">'
    + '<div>' + $('terms-body').outerHTML + '</div>'
    + '<div><h3>동의 항목</h3>'
    + list.map((a, i) => '<div>' + (checks[i].checked ? '☑' : '☐') + ' ' + escapeHTML(a.label) + '</div>').join('')
    + '</div></div>';

  $('submit').disabled = true; $('submit').textContent = '제출 중...';
  const { data, error } = await sb.rpc('submit_signature', {
    p_token: token,
    p_signature_data_url: sigPng,
    p_agreed_items: result,
    p_contract_html_snapshot: snapshot,
    p_signer_user_agent: navigator.userAgent
  });

  if (error) {
    $('err').textContent = '제출 실패: ' + error.message;
    $('submit').disabled = false; $('submit').textContent = '동의하고 서명 제출';
    return;
  }
  if (data && data.error) {
    $('err').textContent = data.error;
    $('submit').disabled = false; $('submit').textContent = '동의하고 서명 제출';
    return;
  }

  $('app').style.display = 'none';
  $('view-link').href = './view.html?id=' + data.contract_id + '&t=' + token;
  $('done').style.display = 'block';
  window.scrollTo(0, 0);
};

load();
})();
