// ============================================================
//  성과 대시보드 (Performance Dashboard)
//  - 상담/리포트용 회원 1명의 성과 스토리 시각화
//  - 외부 라이브러리 없이 순수 SVG 차트 (오프라인/PWA 안전)
//  - 데이터 모델:
//      골프 세션:  s.golfMetrics = {club, clubSpeed, ballSpeed, smash,
//                    launch, spin, carry, total, clubPath, faceAngle, attack}
//      PT 세션:    s.ptSets = [{exercise, weight, reps, sets, unit}]
// ============================================================

// ---------- SVG 차트 헬퍼 ----------
var _chartSeq = 0;
function _cid(){ return 'c'+(++_chartSeq); }

// 단일 라인 + 영역 차트
function svgLine(vals, labels, opt){
  opt = opt||{};
  var W=opt.w||340, H=opt.h||140, color=opt.color||'#00b884';
  var pad={t:16,r:16,b:24,l:38};
  var n=vals.length; if(!n) return '<div class="chart-empty">데이터 없음</div>';
  var min=(opt.min!=null)?opt.min:Math.min.apply(null,vals);
  var max=(opt.max!=null)?opt.max:Math.max.apply(null,vals);
  if(min===max){min-=1;max+=1;}
  var iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  var X=function(i){return pad.l+(n===1?iw/2:iw*i/(n-1));};
  var Y=function(v){return pad.t+ih*(1-(v-min)/(max-min));};
  var pts=vals.map(function(v,i){return X(i).toFixed(1)+','+Y(v).toFixed(1);});
  var gid=_cid();
  var base=(pad.t+ih).toFixed(1);
  var areaPts=X(0).toFixed(1)+','+base+' '+pts.join(' ')+' '+X(n-1).toFixed(1)+','+base;
  // 격자 (3단)
  var grid='';
  for(var g=0; g<=2; g++){var gy=(pad.t+ih*g/2).toFixed(1);grid+='<line x1="'+pad.l+'" y1="'+gy+'" x2="'+(pad.l+iw)+'" y2="'+gy+'" stroke="rgba(0,0,0,.05)" stroke-width="1"/>';}
  // 점 + 마지막 강조
  var dots=vals.map(function(v,i){var last=i===n-1;return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="'+(last?4.5:2.6)+'" fill="'+(last?color:'#fff')+'" stroke="'+color+'" stroke-width="'+(last?0:2)+'"/>';}).join('');
  // 축 라벨
  var yLab='<text x="'+(pad.l-6)+'" y="'+(pad.t+4)+'" text-anchor="end" class="cax">'+_fmtNum(max)+'</text>'+
           '<text x="'+(pad.l-6)+'" y="'+(pad.t+ih)+'" text-anchor="end" class="cax">'+_fmtNum(min)+'</text>';
  var xLab='';
  if(labels&&labels.length){
    var idxs=n<=5?labels.map(function(_,i){return i;}):[0,Math.floor((n-1)/2),n-1];
    xLab=idxs.map(function(i){var anchor=i===0?'start':(i===n-1?'end':'middle');return '<text x="'+X(i).toFixed(1)+'" y="'+(H-7)+'" text-anchor="'+anchor+'" class="cax">'+labels[i]+'</text>';}).join('');
  }
  // 마지막 값 배지
  var lastV=vals[n-1];
  var lx=X(n-1), ly=Y(lastV);
  var badge='<text x="'+(lx-8).toFixed(1)+'" y="'+(ly-9).toFixed(1)+'" text-anchor="end" class="clast" fill="'+color+'">'+_fmtNum(lastV)+(opt.unit||'')+'</text>';
  return '<svg viewBox="0 0 '+W+' '+H+'" class="chart" preserveAspectRatio="xMidYMid meet">'+
    '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0" stop-color="'+color+'" stop-opacity="0.22"/>'+
      '<stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+
    grid+
    '<polygon fill="url(#'+gid+')" points="'+areaPts+'"/>'+
    '<polyline fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="'+pts.join(' ')+'"/>'+
    dots+yLab+xLab+badge+'</svg>';
}

// 다중 라인 차트 (범례 포함)
function svgMultiLine(series, labels, opt){
  opt=opt||{};
  var W=opt.w||340, H=opt.h||160, pad={t:16,r:16,b:26,l:38};
  var all=[]; series.forEach(function(s){all=all.concat(s.values);});
  if(!all.length) return '<div class="chart-empty">데이터 없음</div>';
  var min=(opt.min!=null)?opt.min:Math.min.apply(null,all);
  var max=(opt.max!=null)?opt.max:Math.max.apply(null,all);
  if(min===max){min-=1;max+=1;}
  var n=labels.length;
  var iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  var X=function(i){return pad.l+(n===1?iw/2:iw*i/(n-1));};
  var Y=function(v){return pad.t+ih*(1-(v-min)/(max-min));};
  var grid='';
  for(var g=0; g<=2; g++){var gy=(pad.t+ih*g/2).toFixed(1);grid+='<line x1="'+pad.l+'" y1="'+gy+'" x2="'+(pad.l+iw)+'" y2="'+gy+'" stroke="rgba(0,0,0,.05)" stroke-width="1"/>';}
  var lines=series.map(function(s){
    var pts=s.values.map(function(v,i){return X(i).toFixed(1)+','+Y(v).toFixed(1);});
    var dots=s.values.map(function(v,i){var last=i===s.values.length-1;return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="'+(last?3.6:2.2)+'" fill="'+(last?s.color:'#fff')+'" stroke="'+s.color+'" stroke-width="'+(last?0:1.6)+'"/>';}).join('');
    return '<polyline fill="none" stroke="'+s.color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="'+pts.join(' ')+'"/>'+dots;
  }).join('');
  var yLab='<text x="'+(pad.l-6)+'" y="'+(pad.t+4)+'" text-anchor="end" class="cax">'+_fmtNum(max)+'</text>'+
           '<text x="'+(pad.l-6)+'" y="'+(pad.t+ih)+'" text-anchor="end" class="cax">'+_fmtNum(min)+'</text>';
  var xLab='';
  if(n){var idxs=n<=5?labels.map(function(_,i){return i;}):[0,Math.floor((n-1)/2),n-1];
    xLab=idxs.map(function(i){var anchor=i===0?'start':(i===n-1?'end':'middle');return '<text x="'+X(i).toFixed(1)+'" y="'+(H-9)+'" text-anchor="'+anchor+'" class="cax">'+labels[i]+'</text>';}).join('');}
  var svg='<svg viewBox="0 0 '+W+' '+H+'" class="chart" preserveAspectRatio="xMidYMid meet">'+grid+lines+yLab+xLab+'</svg>';
  var legend='<div class="chart-legend">'+series.map(function(s){return '<span class="cl-item"><i style="background:'+s.color+'"></i>'+s.name+'</span>';}).join('')+'</div>';
  return svg+legend;
}

// 막대 차트
function svgBars(vals, labels, opt){
  opt=opt||{};
  var W=opt.w||340, H=opt.h||140, color=opt.color||'#3868d6', pad={t:16,r:10,b:24,l:38};
  var n=vals.length; if(!n) return '<div class="chart-empty">데이터 없음</div>';
  var max=(opt.max!=null)?opt.max:Math.max.apply(null,vals); if(max<=0)max=1;
  var iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  var bw=iw/n*0.6, gap=iw/n;
  var bars=vals.map(function(v,i){
    var h=ih*(v/max), x=pad.l+gap*i+(gap-bw)/2, y=pad.t+ih-h;
    var last=i===n-1;
    return '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(h,1).toFixed(1)+'" rx="3" fill="'+color+'" opacity="'+(last?1:0.45)+'"/>';
  }).join('');
  var xLab='';
  if(labels){var idxs=n<=6?labels.map(function(_,i){return i;}):[0,Math.floor((n-1)/2),n-1];
    xLab=idxs.map(function(i){var x=pad.l+gap*i+gap/2;return '<text x="'+x.toFixed(1)+'" y="'+(H-7)+'" text-anchor="middle" class="cax">'+labels[i]+'</text>';}).join('');}
  var yLab='<text x="'+(pad.l-6)+'" y="'+(pad.t+4)+'" text-anchor="end" class="cax">'+_fmtNum(max)+'</text>';
  return '<svg viewBox="0 0 '+W+' '+H+'" class="chart" preserveAspectRatio="xMidYMid meet">'+bars+yLab+xLab+'</svg>';
}

// 진행률 링
function svgRing(pct, opt){
  opt=opt||{};
  var sz=opt.size||120, sw=opt.stroke||11, color=opt.color||'#00b884';
  var r=(sz-sw)/2, cx=sz/2, cy=sz/2, c=2*Math.PI*r;
  var p=Math.max(0,Math.min(100,pct));
  var off=c*(1-p/100);
  return '<svg viewBox="0 0 '+sz+' '+sz+'" class="ring" style="width:'+sz+'px;height:'+sz+'px">'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="'+sw+'"/>'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 '+cx+' '+cy+')"/>'+
    '<text x="'+cx+'" y="'+(cy-1)+'" text-anchor="middle" dominant-baseline="central" class="ring-val">'+Math.round(p)+'</text>'+
    '<text x="'+cx+'" y="'+(cy+18)+'" text-anchor="middle" class="ring-lbl">'+(opt.label||'점')+'</text>'+
    '</svg>';
}

// 레이더 (전/후 2계열)
function svgRadar(axes, seriesA, seriesB, opt){
  opt=opt||{};
  var sz=opt.size||260, cx=sz/2, cy=sz/2, r=sz/2-34;
  var n=axes.length;
  var ang=function(i){return -Math.PI/2 + 2*Math.PI*i/n;};
  var pt=function(i,val){var a=ang(i);return [cx+r*(val/100)*Math.cos(a), cy+r*(val/100)*Math.sin(a)];};
  var rings='';
  [0.25,0.5,0.75,1].forEach(function(f){
    var poly=axes.map(function(_,i){var a=ang(i);return (cx+r*f*Math.cos(a)).toFixed(1)+','+(cy+r*f*Math.sin(a)).toFixed(1);}).join(' ');
    rings+='<polygon points="'+poly+'" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="1"/>';
  });
  var spokes=axes.map(function(_,i){var a=ang(i);return '<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+r*Math.cos(a)).toFixed(1)+'" y2="'+(cy+r*Math.sin(a)).toFixed(1)+'" stroke="rgba(0,0,0,.06)" stroke-width="1"/>';}).join('');
  var labs=axes.map(function(ax,i){var a=ang(i);var lx=cx+(r+16)*Math.cos(a), ly=cy+(r+16)*Math.sin(a);var anchor=Math.abs(Math.cos(a))<0.3?'middle':(Math.cos(a)>0?'start':'end');return '<text x="'+lx.toFixed(1)+'" y="'+(ly+3).toFixed(1)+'" text-anchor="'+anchor+'" class="radar-lab">'+ax+'</text>';}).join('');
  function polyFor(series){return series.map(function(v,i){var p=pt(i,v);return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');}
  var pA='<polygon points="'+polyFor(seriesA)+'" fill="rgba(150,160,170,.12)" stroke="#9aa3ad" stroke-width="1.6" stroke-dasharray="4 3"/>';
  var pB='<polygon points="'+polyFor(seriesB)+'" fill="rgba(0,184,132,.16)" stroke="#00b884" stroke-width="2.2"/>';
  var dotsB=seriesB.map(function(v,i){var p=pt(i,v);return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="#00b884"/>';}).join('');
  return '<svg viewBox="0 0 '+sz+' '+sz+'" class="radar">'+rings+spokes+pA+pB+dotsB+labs+'</svg>';
}

// ---------- 포맷 헬퍼 ----------
function _fmtNum(v){
  if(v==null||isNaN(v)) return '-';
  if(Math.abs(v)>=100) return Math.round(v).toString();
  if(Math.abs(v)>=10) return (Math.round(v*10)/10).toString();
  return (Math.round(v*100)/100).toString();
}
function _delta(cur, first, opt){
  opt=opt||{};
  if(cur==null||first==null) return '';
  var d=cur-first;
  var better=opt.lowerBetter?d<0:d>0;
  var sign=d>0?'+':'';
  var cls=better?'up':(d===0?'flat':'down');
  return '<span class="kpi-delta '+cls+'">'+(better?'▲':(d===0?'■':'▼'))+' '+sign+_fmtNum(d)+(opt.unit||'')+'</span>';
}
function _clamp01(x){return Math.max(0,Math.min(100,x));}

// ---------- 데모 데이터 (상담용) ----------
var DEMO_PERF = {
  member:{name:'김서연', goal:'드라이버 비거리 220m 돌파 · 싱글 핸디캡', handicap:'14', avgScore:'88',
    registeredDate:'2026-03-01', focusPoints:'상하체 분리 · 다운스윙 샬로윙', memberType:'pt_lesson', demo:true},
  golf:[
    {date:'03-08', club:'드라이버', clubSpeed:94.2, ballSpeed:134, smash:1.42, launch:11.8, spin:3250, carry:182, total:196, clubPath:-3.1, faceAngle:2.4, attack:-1.8},
    {date:'03-22', club:'드라이버', clubSpeed:95.8, ballSpeed:137, smash:1.43, launch:12.4, spin:3100, carry:188, total:203, clubPath:-2.4, faceAngle:1.9, attack:-1.2},
    {date:'04-05', club:'드라이버', clubSpeed:97.1, ballSpeed:140, smash:1.44, launch:13.0, spin:2950, carry:194, total:210, clubPath:-1.8, faceAngle:1.5, attack:-0.6},
    {date:'04-19', club:'드라이버', clubSpeed:98.6, ballSpeed:143, smash:1.45, launch:13.5, spin:2820, carry:200, total:217, clubPath:-1.2, faceAngle:1.1, attack:0.2},
    {date:'05-03', club:'드라이버', clubSpeed:100.2, ballSpeed:147, smash:1.467, launch:13.9, spin:2740, carry:207, total:225, clubPath:-0.6, faceAngle:0.8, attack:1.1},
    {date:'05-17', club:'드라이버', clubSpeed:101.4, ballSpeed:150, smash:1.479, launch:14.2, spin:2690, carry:213, total:231, clubPath:-0.2, faceAngle:0.5, attack:1.8},
    {date:'05-24', club:'드라이버', clubSpeed:102.3, ballSpeed:152, smash:1.486, launch:14.4, spin:2650, carry:217, total:236, clubPath:0.1, faceAngle:0.3, attack:2.3}
  ],
  pt:[
    {date:'03-15', sets:[{exercise:'스쿼트',weight:50},{exercise:'데드리프트',weight:60},{exercise:'벤치프레스',weight:30},{exercise:'바벨로우',weight:35}]},
    {date:'03-29', sets:[{exercise:'스쿼트',weight:55},{exercise:'데드리프트',weight:65},{exercise:'벤치프레스',weight:32},{exercise:'바벨로우',weight:38}]},
    {date:'04-12', sets:[{exercise:'스쿼트',weight:60},{exercise:'데드리프트',weight:72},{exercise:'벤치프레스',weight:35},{exercise:'바벨로우',weight:40}]},
    {date:'04-26', sets:[{exercise:'스쿼트',weight:65},{exercise:'데드리프트',weight:78},{exercise:'벤치프레스',weight:38},{exercise:'바벨로우',weight:43}]},
    {date:'05-10', sets:[{exercise:'스쿼트',weight:70},{exercise:'데드리프트',weight:85},{exercise:'벤치프레스',weight:40},{exercise:'바벨로우',weight:45}]},
    {date:'05-23', sets:[{exercise:'스쿼트',weight:75},{exercise:'데드리프트',weight:92},{exercise:'벤치프레스',weight:43},{exercise:'바벨로우',weight:48}]}
  ],
  assess:[{date:'03-01', score:62},{date:'04-05', score:71},{date:'05-23', score:83}]
};

// ---------- 실제 회원 데이터 → perfData ----------
function buildPerfData(memberId){
  var m=S.members.find(function(x){return x.id===memberId;});
  if(!m) return null;
  var sess=(S.sessions[memberId]||[]).slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
  var golf=[], pt=[];
  sess.forEach(function(s){
    var md=(s.date||'').slice(5); // MM-DD
    if(s.golfMetrics && (s.golfMetrics.carry||s.golfMetrics.clubSpeed||s.golfMetrics.ballSpeed)){
      golf.push(Object.assign({date:md}, s.golfMetrics));
    }
    if(s.ptSets && s.ptSets.length){
      pt.push({date:md, sets:s.ptSets});
    }
  });
  var assess=[];
  var a=S.assessments[memberId]||{};
  if(a._history&&a._history.length){
    a._history.forEach(function(h){assess.push({date:(h.date||'').slice(5), score:_assessScore(h.items)});});
  }
  if(a._date){assess.push({date:(a._date||'').slice(5), score:calcFitness(a).score});}
  return {member:m, golf:golf, pt:pt, assess:assess};
}
function _assessScore(items){
  try{return calcFitness(items||{}).score;}catch(e){return 0;}
}

// ---------- 열기/닫기 ----------
function openPerformance(){ S.perfMember=S.selectedMember; S.perfDemo=false; S.showPerformance=true; render(); }
function openDemoPerformance(){ S.perfDemo=true; S.showPerformance=true; S.sidebarOpen=false; render(); }
function closePerformance(){ S.showPerformance=false; S.perfDemo=false; render(); }

// ---------- 렌더 ----------
function renderPerformance(){
  if(!S.showPerformance) return '';
  var data = S.perfDemo ? DEMO_PERF : buildPerfData(S.perfMember);
  if(!data) return '';
  var hasData = (data.golf&&data.golf.length) || (data.pt&&data.pt.length);
  if(!hasData && !S.perfDemo){
    return '<div class="perf-overlay"><div class="perf-shell"><div class="perf-topbar"><div class="perf-brand"><img src="assets/logo.png" class="perf-logo" alt="">성과 리포트</div><button class="perf-close" onclick="closePerformance()">✕</button></div>'+
      '<div class="perf-empty"><div class="pe-icon">📊</div><div class="pe-title">'+data.member.name+' 회원님 측정 데이터가 아직 없습니다</div><div class="pe-sub">골프 레슨 시 트랙맨 수치, PT 시 운동 기록을 입력하면<br>이 화면에 성장 그래프가 자동으로 그려집니다.</div><button class="perf-demo-btn" onclick="openDemoPerformance()">상담용 데모 데이터로 미리보기 →</button></div>'+
      '</div></div>';
  }
  var m=data.member;
  var html='<div class="perf-overlay"><div class="perf-shell">';
  // 상단바
  html+='<div class="perf-topbar"><div class="perf-brand"><img src="assets/logo.png" class="perf-logo" alt="">성과 리포트'+(S.perfDemo?'<span class="perf-demo-tag">DEMO</span>':'')+'</div><button class="perf-close" onclick="closePerformance()">✕</button></div>';
  // 히어로
  var period=(m.registeredDate?m.registeredDate+' ~ 현재':'');
  html+='<div class="perf-hero">'+
    '<div class="ph-left"><div class="ph-name">'+m.name+' 회원님</div>'+
      (m.goal?'<div class="ph-goal">🎯 '+m.goal+'</div>':'')+
      '<div class="ph-meta">'+[(m.handicap?'핸디캡 '+m.handicap:''),(m.avgScore?'평균 '+m.avgScore+'타':''),period].filter(Boolean).join('  ·  ')+'</div>'+
      (m.focusPoints?'<div class="ph-focus">교정 포인트 — '+m.focusPoints+'</div>':'')+
    '</div>';
  // 체형 점수 링
  if(data.assess&&data.assess.length){
    var lastScore=data.assess[data.assess.length-1].score;
    html+='<div class="ph-right">'+svgRing(lastScore,{size:118,label:'체형점수'})+'</div>';
  }
  html+='</div>';

  // ===== 골프 퍼포먼스 =====
  if(data.golf&&data.golf.length){
    var g0=data.golf[0], gL=data.golf[data.golf.length-1];
    var labels=data.golf.map(function(x){return x.date;});
    html+='<div class="perf-section"><div class="ps-title"><span class="ps-dot blue"></span>골프 퍼포먼스 <small>(트랙맨 · '+(gL.club||'드라이버')+')</small></div>';
    // KPI
    html+='<div class="kpi-grid">'+
      _kpi('비거리(캐리)', _fmtNum(gL.carry), 'm', _delta(gL.carry,g0.carry,{unit:'m'}), 'blue')+
      _kpi('클럽 스피드', _fmtNum(gL.clubSpeed), 'mph', _delta(gL.clubSpeed,g0.clubSpeed,{unit:''}), 'blue')+
      _kpi('볼 스피드', _fmtNum(gL.ballSpeed), 'mph', _delta(gL.ballSpeed,g0.ballSpeed,{unit:''}), 'blue')+
      _kpi('스매시 팩터', _fmtNum(gL.smash), '', _delta(gL.smash,g0.smash,{unit:''}), 'green')+
    '</div>';
    // 차트들
    html+='<div class="chart-grid">';
    html+='<div class="chart-card"><div class="cc-title">비거리(캐리) 추세 <span class="cc-unit">m</span></div>'+svgLine(data.golf.map(function(x){return x.carry;}),labels,{color:'#3868d6',unit:'m'})+'</div>';
    html+='<div class="chart-card"><div class="cc-title">클럽 스피드 추세 <span class="cc-unit">mph</span></div>'+svgLine(data.golf.map(function(x){return x.clubSpeed;}),labels,{color:'#6366f1',unit:''})+'</div>';
    html+='<div class="chart-card"><div class="cc-title">스핀량 최적화 <span class="cc-unit">rpm · 낮을수록 효율↑</span></div>'+svgLine(data.golf.map(function(x){return x.spin;}),labels,{color:'#d97706',unit:''})+'</div>';
    html+='<div class="chart-card"><div class="cc-title">클럽 패스 정렬 <span class="cc-unit">° · 0에 가까울수록 직진성↑</span></div>'+svgLine(data.golf.map(function(x){return x.clubPath;}),labels,{color:'#00b884',unit:'°'})+'</div>';
    html+='</div>';
    // 전/후 레이더
    var radarAxes=['비거리','클럽\n스피드','볼\n스피드','스매시','구질\n정확도'];
    var normFirst=[_norm(g0.carry,150,240),_norm(g0.clubSpeed,85,115),_norm(g0.ballSpeed,120,165),_norm(g0.smash,1.30,1.50),_clamp01(100-Math.abs(g0.clubPath)*14)];
    var normLast=[_norm(gL.carry,150,240),_norm(gL.clubSpeed,85,115),_norm(gL.ballSpeed,120,165),_norm(gL.smash,1.30,1.50),_clamp01(100-Math.abs(gL.clubPath)*14)];
    html+='<div class="radar-card"><div class="cc-title">스윙 종합 — 초기 vs 현재</div>'+svgRadar(['비거리','클럽스피드','볼스피드','스매시','정확도'],normFirst,normLast)+
      '<div class="radar-legend"><span><i class="dash"></i>초기('+g0.date+')</span><span><i class="solid"></i>현재('+gL.date+')</span></div></div>';
    html+='</div>';
  }

  // ===== 근력(PT) =====
  if(data.pt&&data.pt.length){
    var exNames={}; data.pt.forEach(function(s){(s.sets||[]).forEach(function(st){exNames[st.exercise]=true;});});
    var exList=Object.keys(exNames).slice(0,4);
    var ptLabels=data.pt.map(function(x){return x.date;});
    var p0=data.pt[0], pL=data.pt[data.pt.length-1];
    var COLORS=['#00b884','#3868d6','#d97706','#9333ea'];
    function exWeight(sess,ex){var f=(sess.sets||[]).find(function(st){return st.exercise===ex;});return f?f.weight:null;}
    html+='<div class="perf-section"><div class="ps-title"><span class="ps-dot green"></span>근력 향상 (Golf PT)</div>';
    // KPI: 주요 3종
    html+='<div class="kpi-grid">';
    exList.slice(0,3).forEach(function(ex,i){
      var cur=exWeight(pL,ex), first=exWeight(p0,ex);
      html+=_kpi(ex, _fmtNum(cur), 'kg', _delta(cur,first,{unit:'kg'}), 'green');
    });
    var volL=_volume(pL), vol0=_volume(p0);
    html+=_kpi('총 볼륨', _fmtNum(volL), 'kg', _delta(volL,vol0,{unit:''}), 'green')+'</div>';
    // 차트
    html+='<div class="chart-grid">';
    var series=exList.map(function(ex,i){return {name:ex, color:COLORS[i%COLORS.length], values:data.pt.map(function(s){return exWeight(s,ex)||0;})};});
    html+='<div class="chart-card wide"><div class="cc-title">주요 리프트 중량 변화 <span class="cc-unit">kg</span></div>'+svgMultiLine(series,ptLabels,{})+'</div>';
    html+='<div class="chart-card"><div class="cc-title">세션별 총 볼륨 <span class="cc-unit">kg</span></div>'+svgBars(data.pt.map(function(s){return _volume(s);}),ptLabels,{color:'#00b884'})+'</div>';
    html+='</div></div>';
  }

  // ===== 체형 평가 추세 =====
  if(data.assess&&data.assess.length>1){
    var aLabels=data.assess.map(function(x){return x.date;});
    var a0=data.assess[0], aL=data.assess[data.assess.length-1];
    html+='<div class="perf-section"><div class="ps-title"><span class="ps-dot amber"></span>체형 기능 개선</div>';
    html+='<div class="kpi-grid">'+
      _kpi('현재 체형점수', _fmtNum(aL.score), '점', _delta(aL.score,a0.score,{unit:'점'}), 'amber')+
      _kpi('개선 폭', '+'+_fmtNum(aL.score-a0.score), '점', '', 'amber')+
    '</div>';
    html+='<div class="chart-card wide"><div class="cc-title">체형 기능 점수 추세 <span class="cc-unit">점</span></div>'+svgLine(data.assess.map(function(x){return x.score;}),aLabels,{color:'#d97706',min:0,max:100,unit:'점'})+'</div>';
    html+='</div>';
  }

  html+='<div class="perf-footer">내셔널짐 Golf PT · Performance Analytics<br><span>모든 데이터는 실제 측정 장비(TrackMan) 및 트레이닝 기록 기반으로 산출됩니다.</span></div>';
  html+='</div></div>';
  return html;
}

function _kpi(label, val, unit, delta, color){
  return '<div class="kpi-card '+(color||'')+'"><div class="kpi-label">'+label+'</div><div class="kpi-val">'+val+'<span class="kpi-unit">'+(unit||'')+'</span></div>'+(delta||'')+'</div>';
}
function _volume(sess){ var t=0; (sess.sets||[]).forEach(function(st){ t+=(st.weight||0)*((st.reps||10))*((st.sets||3)); }); return Math.round(t/100)*100; }
function _norm(v,lo,hi){ if(v==null) return 0; return _clamp01((v-lo)/(hi-lo)*100); }
