(function () {
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const id = params.get('id');
const token = params.get('t');

const PAY_LABEL = { card:'카드', cash:'현금', seoul_pay:'서울페이', transfer:'계좌이체', other:'기타' };

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function load() {
  if (!id) { $('loading').textContent = '유효하지 않은 접근입니다.'; return; }
  const { data, error } = await sb.rpc('get_signed_contract', { p_id: id, p_token: token });
  if (error) { $('loading').textContent = '오류: ' + error.message; return; }
  if (data.error) {
    $('loading').textContent = data.error === 'unauthorized'
      ? '권한이 없습니다. 회원은 카카오톡으로 받으신 링크로 다시 접속해 주세요.'
      : ('오류: ' + data.error);
    return;
  }
  if (!data.signature) {
    $('loading').innerHTML = '아직 서명되지 않은 계약입니다.';
    return;
  }
  render(data);
  $('loading').style.display = 'none';
  $('doc').style.display = 'block';
}

function render(d) {
  const c = d.contract, t = d.template, s = d.signature;
  const fmt = n => Number(n || 0).toLocaleString() + '원';

  const itemRows = (c.items_json || []).map(it =>
    '<tr><td>' + escapeHTML(it.name) + '</td><td>' + escapeHTML(it.qty || '') +
    '</td><td style="text-align:right">' + fmt(it.price) + '</td></tr>'
  ).join('');

  const agreed = s.agreed_items || {};
  const agreedRows = Object.entries(agreed).map(([k, v]) =>
    '<li>' + escapeHTML(k) + ': <b>' + (v ? '동의' : '미동의') + '</b></li>'
  ).join('');

  $('body').innerHTML =
    '<div class="card">'
    + '<h2 style="margin:0">' + escapeHTML(t.title) + ' (v' + escapeHTML(t.version) + ')</h2>'
    + '<p class="muted small">계약번호: ' + escapeHTML(c.id) + '</p>'
    + '</div>'

    + '<div class="card">'
    + '<h2>계약 당사자 및 내용</h2>'
    + '<table class="data">'
    + '<tr><th>회원</th><td>' + escapeHTML(c.member_name) + ' / ' + escapeHTML(c.member_phone) + '</td></tr>'
    + (c.member_birth ? '<tr><th>생년월일</th><td>' + escapeHTML(c.member_birth) + '</td></tr>' : '')
    + (c.member_address ? '<tr><th>주소</th><td>' + escapeHTML(c.member_address) + '</td></tr>' : '')
    + '<tr><th>사업자</th><td>' + escapeHTML(c.business_name) + ' (대표 ' + escapeHTML(c.business_owner) + ')'
      + (c.business_registration ? ' · ' + escapeHTML(c.business_registration) : '') + '</td></tr>'
    + '<tr><th>지점</th><td>' + escapeHTML(c.branch || '-') + '</td></tr>'
    + '<tr><th>이용 기간</th><td>' + escapeHTML(c.contract_period_start || '-') + ' ~ ' + escapeHTML(c.contract_period_end || '-') + '</td></tr>'
    + '<tr><th>결제수단</th><td>' + escapeHTML(PAY_LABEL[c.payment_method] || c.payment_method || '-') + '</td></tr>'
    + (c.locker_no ? '<tr><th>사물함</th><td>' + escapeHTML(c.locker_no) + (c.locker_months ? ' / ' + c.locker_months + '개월' : '') + '</td></tr>' : '')
    + (c.notes ? '<tr><th>비고</th><td>' + escapeHTML(c.notes) + '</td></tr>' : '')
    + '</table>'
    + '<h3>계약 항목</h3>'
    + '<table class="data"><thead><tr><th>항목</th><th>횟수/기간</th><th style="text-align:right">금액</th></tr></thead>'
    + '<tbody>' + itemRows
    + '<tr><th colspan="2" style="text-align:right">합계</th><th style="text-align:right">' + fmt(c.total_amount) + '</th></tr>'
    + '</tbody></table>'
    + '</div>'

    + '<div class="card">'
    + '<h2>약관 전문 (서명 시점 스냅샷)</h2>'
    + '<div class="terms" style="max-height:none">' + s.contract_html_snapshot + '</div>'
    + '</div>'

    + '<div class="card">'
    + '<h2>동의 항목</h2><ul>' + agreedRows + '</ul>'
    + '</div>'

    + '<div class="card">'
    + '<h2>회원 서명</h2>'
    + '<img src="' + s.signature_data_url + '" style="border:1px solid #ddd;max-width:320px;background:#fff" alt="서명">'
    + '<p class="muted small">서명일시: ' + new Date(s.signed_at).toLocaleString('ko-KR') + '<br>'
    + 'User-Agent: ' + escapeHTML(s.signer_user_agent || '-') + '</p>'
    + '</div>';

  document.title = '전자계약서 - ' + c.member_name;
}

$('btn-print') && ($('btn-print').onclick = () => window.print());

$('btn-pdf') && ($('btn-pdf').onclick = async () => {
  $('btn-pdf').disabled = true; $('btn-pdf').textContent = '생성 중...';
  try {
    const target = document.getElementById('body');
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = canvas.height * imgW / canvas.width;
    let heightLeft = imgH, position = 0;
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    pdf.save('nationalgym-contract-' + (params.get('id') || '').slice(0, 8) + '.pdf');
  } catch (e) {
    alert('PDF 생성 실패: ' + e.message);
  } finally {
    $('btn-pdf').disabled = false; $('btn-pdf').textContent = 'PDF 저장';
  }
});

load();
})();
