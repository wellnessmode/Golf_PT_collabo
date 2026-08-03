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

// 탄착군 산점도 (dispersion) — x: 좌우 편차, y: 캐리. GDR/트랙맨 리포트의 표준 문법.
function svgDispersion(pts, opt){
  opt=opt||{};
  var W=opt.w||340, H=opt.h||230, pad={t:18,r:16,b:26,l:40};
  if(!pts||pts.length<3) return '';
  var xs=pts.map(function(p){return p.x;}), ys=pts.map(function(p){return p.y;});
  var xAbs=Math.max(10, Math.ceil(Math.max.apply(null, xs.map(Math.abs))*1.15));
  var yMin=Math.floor(Math.min.apply(null,ys)*0.94), yMax=Math.ceil(Math.max.apply(null,ys)*1.05);
  if(yMin===yMax){yMin-=5;yMax+=5;}
  var iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  var X=function(v){return pad.l+iw*(v+xAbs)/(2*xAbs);};
  var Y=function(v){return pad.t+ih*(1-(v-yMin)/(yMax-yMin));};
  // 타깃 라인(중앙) + 격자
  var cx=X(0).toFixed(1);
  var grid='<line x1="'+cx+'" y1="'+pad.t+'" x2="'+cx+'" y2="'+(pad.t+ih)+'" stroke="rgba(0,0,0,.18)" stroke-width="1.2" stroke-dasharray="4 3"/>';
  [0.5].forEach(function(f){
    var gx1=X(-xAbs*f).toFixed(1), gx2=X(xAbs*f).toFixed(1);
    grid+='<line x1="'+gx1+'" y1="'+pad.t+'" x2="'+gx1+'" y2="'+(pad.t+ih)+'" stroke="rgba(0,0,0,.05)"/>'
        +'<line x1="'+gx2+'" y1="'+pad.t+'" x2="'+gx2+'" y2="'+(pad.t+ih)+'" stroke="rgba(0,0,0,.05)"/>';
  });
  for(var g=0;g<=2;g++){var gy=(pad.t+ih*g/2).toFixed(1);grid+='<line x1="'+pad.l+'" y1="'+gy+'" x2="'+(pad.l+iw)+'" y2="'+gy+'" stroke="rgba(0,0,0,.05)"/>';}
  var dots=pts.map(function(p){
    return '<circle cx="'+X(p.x).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+'" r="'+(p.best?5:3.4)+'" fill="'+(p.best?'#d97706':'rgba(0,184,132,.75)')+'" stroke="#fff" stroke-width="1"/>';
  }).join('');
  var labs='<text x="'+(pad.l-6)+'" y="'+(pad.t+4)+'" text-anchor="end" class="cax">'+yMax+'</text>'
    +'<text x="'+(pad.l-6)+'" y="'+(pad.t+ih)+'" text-anchor="end" class="cax">'+yMin+'</text>'
    +'<text x="'+pad.l+'" y="'+(H-8)+'" text-anchor="start" class="cax">← 좌 '+xAbs+'</text>'
    +'<text x="'+(pad.l+iw)+'" y="'+(H-8)+'" text-anchor="end" class="cax">우 '+xAbs+' →</text>'
    +'<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle" class="cax">타깃</text>';
  return '<svg viewBox="0 0 '+W+' '+H+'" class="chart" preserveAspectRatio="xMidYMid meet">'+grid+dots+labs+'</svg>';
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
  assess:[{date:'03-01', score:62},{date:'04-05', score:71},{date:'05-23', score:83}],
  shots:[
    {id:'d1', memberId:'demo', memberName:'김서연', ts:'2026-03-08T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:94.2,ballSpeed:134,smash:1.42,carry:182,total:196,launch:11.8,spin:3250,clubPath:-3.1,faceAngle:2.4,attack:-1.8,carrySide:-18}},
    {id:'d2', memberId:'demo', memberName:'김서연', ts:'2026-04-05T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:97.1,ballSpeed:140,smash:1.44,carry:194,total:210,launch:13.0,spin:2950,clubPath:-1.8,faceAngle:1.5,attack:-0.6,carrySide:-12}},
    {id:'d3', memberId:'demo', memberName:'김서연', ts:'2026-04-19T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:98.6,ballSpeed:143,smash:1.45,carry:200,total:217,launch:13.5,spin:2820,clubPath:-1.2,faceAngle:1.1,attack:0.2,carrySide:9}},
    {id:'d4', memberId:'demo', memberName:'김서연', ts:'2026-05-03T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:100.2,ballSpeed:147,smash:1.467,carry:207,total:225,launch:13.9,spin:2740,clubPath:-0.6,faceAngle:0.8,attack:1.1,carrySide:-6}},
    {id:'d5', memberId:'demo', memberName:'김서연', ts:'2026-05-17T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:101.4,ballSpeed:150,smash:1.479,carry:213,total:231,launch:14.2,spin:2690,clubPath:-0.2,faceAngle:0.5,attack:1.8,carrySide:4}},
    {id:'d6', memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:102.3,ballSpeed:152,smash:1.486,carry:217,total:236,launch:14.4,spin:2650,clubPath:0.1,faceAngle:0.3,attack:2.3,carrySide:-2}},
    {id:'w1', memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:05:00Z', source:'mock', data:{club:'5번 우드',clubSpeed:96,ballSpeed:140,smash:1.46,carry:200,total:212,launch:14.9,spin:3420,clubPath:0.4,faceAngle:0.5,carrySide:6}},
    {id:'i1', memberId:'demo', memberName:'김서연', ts:'2026-05-17T05:10:00Z', source:'mock', data:{club:'7번 아이언',clubSpeed:82,ballSpeed:110,smash:1.34,carry:148,total:156,launch:18.2,spin:6210,clubPath:-0.5,faceAngle:0.3,carrySide:-4}},
    {id:'i2', memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:12:00Z', source:'mock', data:{club:'7번 아이언',clubSpeed:82.5,ballSpeed:110.3,smash:1.34,carry:152,total:160,launch:18.4,spin:6180,clubPath:-0.4,faceAngle:0.2,carrySide:3}},
    {id:'wd1',memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:15:00Z', source:'mock', data:{club:'피칭웨지',clubSpeed:74,ballSpeed:92.4,smash:1.25,carry:105,total:108,launch:26.4,spin:8540,clubPath:1.0,faceAngle:0.5,carrySide:-2}}
  ]
};

// ---------- 실제 회원 데이터 → perfData ----------
function buildPerfData(memberId){
  var m=S.members.find(function(x){return x.id===memberId;});
  if(!m) return null;
  var sess=(S.sessions[memberId]||[]).slice().sort(sessionCompareAsc); // 추이 차트는 오래된 것부터
  var golf=[], pt=[];
  sess.forEach(function(s){
    var md=(s.date||'').slice(5); // MM-DD
    if(s.golfMetrics && (s.golfMetrics.carry||s.golfMetrics.clubSpeed||s.golfMetrics.ballSpeed)){
      // 수동 입력 골프 지표는 yd/mph 가정 (_metric:false). _d = 페이스 계산용 전체 날짜.
      golf.push(Object.assign({date:md, _d:s.date, _metric:false}, s.golfMetrics));
    }
    if(s.ptSets && s.ptSets.length){
      pt.push({date:md, sets:s.ptSets});
    }
  });
  // 라이브 세션에서 저장된 트랙맨 샷 (데모/가짜 mock 제외 — 실측만)
  var memberShots=(S.shotEvents||[]).filter(function(s){return s.memberId===memberId && s.source!=='mock';});
  if(memberShots.length){
    var existDates={}; golf.forEach(function(g){existDates[g.date]=true;});
    var byDate={};
    memberShots.forEach(function(s){ var d=String(s.ts).slice(0,10); if(d) (byDate[d]=byDate[d]||[]).push(s); });
    Object.keys(byDate).sort().forEach(function(d){
      var md=d.slice(5); if(existDates[md]) return;
      var arr=byDate[d];
      // 트랙맨 에이전트는 club 을 영문('Driver','7Iron')으로 저장 — 그룹 분류로 매칭 (한글/영문 모두)
      var drv=arr.filter(function(s){return _clubGroup(s.data&&s.data.club)==='driver';});
      var use=drv.length?drv:arr;
      var avg=function(f){var v=use.map(function(s){return parseFloat(s.data&&s.data[f]);}).filter(function(x){return !isNaN(x);}); return v.length?Math.round((v.reduce(function(a,b){return a+b;},0)/v.length)*100)/100:null;};
      golf.push({date:md, _d:d, _metric:_isMetricShot(use[0].data), club:(drv.length?'드라이버':((use[0].data&&use[0].data.club)||'')),
        clubSpeed:avg('clubSpeed'), ballSpeed:avg('ballSpeed'), smash:avg('smash'),
        carry:avg('carry'), total:avg('total'), spin:avg('spin'),
        clubPath:avg('clubPath'), faceAngle:avg('faceAngle'), attack:avg('attack'), _shots:use.length});
    });
    golf.sort(function(a,b){return a.date.localeCompare(b.date);});
  }
  var assess=[];
  var a=S.assessments[memberId]||{};
  if(a._history&&a._history.length){
    a._history.forEach(function(h){assess.push({date:(h.date||'').slice(5), score:_assessScore(h.items)});});
  }
  if(a._date){assess.push({date:(a._date||'').slice(5), score:calcFitness(a).score});}
  return {member:m, golf:golf, pt:pt, assess:assess, shots:memberShots};
}

// ---------- 성과 리포트: 단위/글씨/인쇄 ----------
// 샷 데이터의 원본 단위를 인식해서 변환. 트랙맨(에이전트)=미터/ms, 수동입력=yd/mph 가정.
// dataUnits: 's.data._units' 또는 's.data._src==trackman_io' 로 판별.
function _isMetricShot(data){
  if(!data) return false;
  if(data._units && data._units.dist==='m') return true;
  if(data._src==='trackman_io') return true;
  return false;
}
// 거리 값(원본단위 srcM=true면 m, 아니면 yd) → 표시단위(perfUnitDist)로
function pfDistFrom(v, srcMetric){
  if(v==null||isNaN(v)) return v;
  var meters = srcMetric ? v : v*0.9144;        // 원본을 m로 통일
  return S.perfUnitDist==='m' ? meters : meters/0.9144; // 표시단위로
}
function pfSpdFrom(v, srcMetric){
  if(v==null||isNaN(v)) return v;
  var ms = srcMetric ? v : v*0.44704;
  return S.perfUnitSpd==='ms' ? ms : ms/0.44704;
}
function pfDist(v){ if(v==null||isNaN(v)) return v; return S.perfUnitDist==='m'? v*0.9144 : v; }
function pfSpd(v){ if(v==null||isNaN(v)) return v; return S.perfUnitSpd==='ms'? v*0.44704 : v; }
// 미터 원본 → 표시 단위 (골프 지표를 m 로 통일해 계산할 때 사용)
function pfDistM(vM){ if(vM==null||isNaN(vM)) return vM; return S.perfUnitDist==='m'? vM : vM/0.9144; }
// golf[] 세션 지표 한 건의 캐리를 미터로 정규화 (_metric 플래그 기준)
function _carryM(g){ var c=g&&parseFloat(g.carry); if(c==null||isNaN(c)) return null; return g._metric? c : c*0.9144; }
// 회원 목표 문자열에서 목표 거리 추출 — "드라이버 220m 돌파", "230야드" 등 → 미터
function _parseGoalDist(goal){
  var m=String(goal||'').match(/(\d{2,3})\s*(m(?![a-z])|미터|yd|야드)/i);
  if(!m) return null;
  var v=parseFloat(m[1]);
  if(!isFinite(v)||v<50||v>400) return null;
  return /yd|야드/i.test(m[2]) ? v*0.9144 : v;
}
function pfDistU(){ return S.perfUnitDist==='m'?'m':'yd'; }
function pfSpdU(){ return S.perfUnitSpd==='ms'?'m/s':'mph'; }
function setPerfDist(u){ S.perfUnitDist=u; render(); }
function setPerfSpd(u){ S.perfUnitSpd=u; render(); }
function setPerfTextScale(t){ S.perfTextScale=t; render(); }
// 우측 하단 돋보기 — 누를 때마다 글씨 단계 확대 (가 → 가+ → 가++ → 가+++ → 처음)
var _PF_SCALES=[1, 1.18, 1.4, 1.65];
function perfZoomCycle(){
  var cur=S.perfTextScale||1;
  var i=_PF_SCALES.findIndex(function(s){ return Math.abs(s-cur)<0.05; });
  S.perfTextScale=_PF_SCALES[(i+1)%_PF_SCALES.length];
  render();
}
function printPerf(){ try{ window.print(); }catch(e){} }
// 샷 데이터 CSV 내보내기 — 회원/센터의 데이터 소유권 보장 (B2B 요구사항, SkyTrak 벤치마킹)
function exportShotsCsv(){
  var data = S.perfDemo ? DEMO_PERF : buildPerfData(S.perfMember);
  if(!data || !data.shots || !data.shots.length){ alert('내보낼 측정 샷이 없습니다'); return; }
  var keys=['clubSpeed','ballSpeed','smash','carry','total','launch','spin','clubPath','faceAngle','attack','carrySide','totalSide','spinAxis','landAngle'];
  var rows=[['시각','클럽','단위계','클럽스피드','볼스피드','스매시','캐리','토탈','발사각','스핀','클럽패스','페이스앵글','어택앵글','캐리좌우','토탈좌우','스핀축','낙하각']];
  data.shots.slice().sort(function(a,b){return String(a.ts).localeCompare(String(b.ts));}).forEach(function(s){
    var d=s.data||{};
    rows.push([String(s.ts).replace('T',' ').slice(0,19), _clubKo(d.club)||'', _isMetricShot(d)?'m·m/s':'yd·mph']
      .concat(keys.map(function(k){return d[k]!=null?d[k]:'';})));
  });
  var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url; a.download=(data.member.name||'member')+'_shots_'+today()+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},200);
}
// 성과 요약 공유 — Web Share(카톡 등 OS 공유시트) → 미지원 시 클립보드 복사
// 샷의 앵글별 영상 키 (측면/정면/클럽) — 공유 리포트·비교재생 공용
function _shotAngles(s){
  var d=(s&&s.data)||{};
  var dl=d.videoDL||d.videoMp4R2Key||s.videoR2Key||null;
  if(dl&&(dl===d.videoClub||dl===d.videoFO)) dl=null;
  return {dl:dl, fo:d.videoFO||null, club:d.videoClub||null};
}
// [리포트 공유] — 예전엔 요약 텍스트 몇 줄만 카톡에 보내 "엉망"이었음.
// 이제 고객용 웹 리포트 페이지(report.html)를 생성해 링크를 공유한다:
// 회원은 링크만 열면 측정 데이터·비포/애프터 비교·스윙 영상·레슨 일지를 본다.
async function sharePerfSummary(){
  if(S.perfDemo){ alert('데모 데이터는 공유할 수 없습니다.'); return; }
  var mid=S.perfMember||S.selectedMember;
  var m=S.members.find(function(x){return x.id===mid;});
  var data=buildPerfData(mid);
  if(!m||!data){ alert('공유할 데이터가 없습니다.'); return; }
  if(typeof cloud==='undefined'||!cloud.enabled){ alert('클라우드 미연결 — 공유 링크를 만들 수 없습니다.'); return; }
  try{ liveToastSafe('📤 고객용 리포트 링크 생성 중...'); }catch(e){}
  // 공유 주소 사전 점검 — 전용 도메인(REPORT_BASE)이 아직 연결 전이거나 중계 워커가
  // 내려가 있으면 "죽은 링크"가 고객에게 나간다. 링크를 만드는 동안 미리 확인해두고
  // 응답이 없으면 워커 기본 주소로 자동 폴백. (병렬 실행이라 공유 속도엔 영향 없음)
  var _cfg=window.APP_CONFIG||{};
  var _primary=String(_cfg.REPORT_BASE||'').replace(/\/+$/,'');
  var _fallback=String(_cfg.R2_WORKER_URL||'').replace(/\/+$/,'');
  var _probe=null;
  if(_primary && _fallback && _primary!==_fallback){
    _probe=(async function(){
      try{
        var ctl=new AbortController(), t=setTimeout(function(){ try{ctl.abort();}catch(e){} },4000);
        // 어떤 상태코드든 "응답이 왔다" = 그 주소가 살아있다는 뜻 (404/400 포함)
        var rr=await fetch(_primary+'/r/__ping',{method:'HEAD',signal:ctl.signal,cache:'no-store'});
        clearTimeout(t);
        return !!(rr && rr.status>0);
      }catch(e){ console.warn('[share] REPORT_BASE 응답 없음 → 기본 주소로 폴백:', e&&e.message); return false; }
    })();
  }
  var shots=data.shots||[];
  // 트랙맨 요약 (기존 발송 리포트와 같은 스키마 + 앵글·비포/애프터 확장)
  var trackman=null;
  try{
    if(shots.length){
      var avgs=_buildClubAverages(shots);
      var clubs=['driver','wood','iron','wedge'].map(function(g){return avgs[g];}).filter(function(a){return a.n>0;})
        .map(function(a){return {name:a.name,n:a.n,metric:!!a._metric,clubSpeed:a.clubSpeed,ballSpeed:a.ballSpeed,smash:a.smash,carry:a.carry,total:a.total,launch:a.launch,spin:a.spin};});
      var best=null,bc=-1; shots.forEach(function(s){var c=parseFloat(s.data&&s.data.carry); if(!isNaN(c)&&c>bc){bc=c;best=s;}});
      var trendSrc=(data.golf||[]).filter(function(g){return _carryM(g)!=null && _clubGroup(g.club)==='driver';});
      if(trendSrc.length<2) trendSrc=(data.golf||[]).filter(function(g){return _carryM(g)!=null;});
      var trend=trendSrc.map(function(g){return {date:g.date, carryM:Math.round(_carryM(g)*10)/10};});
      var vids=shots.filter(function(s){var a=_shotAngles(s); return a.dl||a.fo||a.club;})
        .sort(function(x,y){return String(y.ts).localeCompare(String(x.ts));}).slice(0,8)
        .map(function(s){
          var a=_shotAngles(s), d=s.data||{};
          return {ts:s.ts, club:d.club, carry:d.carry, metric:_isMetricShot(d), tag:d._tag||null,
                  key:a.dl||a.club||a.fo, dl:a.dl, fo:a.fo, clubv:a.club, mkv:/\.mkv$/i.test(String(a.dl||a.club||a.fo||''))};
        });
      // 비포·애프터 (프로 지정 우선)
      var mk=function(s){ var a=_shotAngles(s), d=s.data||{}; var key=a.dl||a.club||a.fo;
        return key?{key:key, dl:a.dl, fo:a.fo, clubv:a.club, club:d.club, carry:d.carry, metric:_isMetricShot(d), ts:s.ts}:null; };
      var ba=_findBeforeAfter(shots), beforeAfter=null;
      if(ba){
        var b=mk(ba.before), aa=mk(ba.after);
        if(b&&aa) beforeAfter={b:b, a:aa, tagged:!!ba.tagged};
      }
      // 레슨 날짜별 비포·애프터 — 날짜마다 프로 지정(비포/애프터 태그) 우선,
      // 태그가 없으면 그 날 "첫 샷 vs 마지막 샷"(레슨 시작 vs 종료)로 구성.
      var byDate={};
      shots.forEach(function(s){ var a=_shotAngles(s); if(!(a.dl||a.fo||a.club)) return;
        var day=String(s.ts||'').slice(0,10); if(!day) return; (byDate[day]=byDate[day]||[]).push(s); });
      var baDates=Object.keys(byDate).sort().reverse().slice(0,12).map(function(day){
        var list=byDate[day].slice().sort(function(x,y){return String(x.ts).localeCompare(String(y.ts));});
        var tb=null,ta=null;
        list.forEach(function(s){ var tag=(s.data||{})._tag; if(tag==='before') tb=tb||s; if(tag==='after') ta=s; });
        var tagged=!!(tb&&ta), b=tb, a2=ta;
        if(!b&&!a2){ if(list.length>=2){ b=list[0]; a2=list[list.length-1]; } else { a2=list[0]; } }
        else if(b&&!a2&&list.length>=2&&list[list.length-1]!==b){ a2=list[list.length-1]; }
        else if(!b&&a2&&list.length>=2&&list[0]!==a2){ b=list[0]; }
        return {date:day, tagged:tagged, b:b?mk(b):null, a:a2?mk(a2):null};
      }).filter(function(x){return x.b||x.a;});
      trackman={shotCount:shots.length, clubs:clubs,
        best:best?{ts:best.ts,club:best.data.club,carry:best.data.carry,ballSpeed:best.data.ballSpeed,smash:best.data.smash,metric:_isMetricShot(best.data)}:null,
        trend:trend, trendClub:trendSrc.length?(_clubKo(trendSrc[trendSrc.length-1].club)||''):'',
        videos:vids, beforeAfter:beforeAfter, baDates:baDates, measuredBy:APP_BRAND.measuredBy};
    }
  }catch(e){ console.warn('[share] trackman build skip:', e); }
  // 레슨 일지 — 고객에게 보이는 내용만 (녹음 원문 제외), 최근 20개
  var allSess=(S.sessions[mid]||[]).slice().sort(sessionCompare);
  var sessions=allSess.slice(0,20).map(function(s){
    var vids2=(s.media||[]).filter(function(mm){ var mt=String(mm.mimeType||inferMime(mm.name||'')||''); return mt.indexOf('video')!==-1 && mm.r2Key; })
      .map(function(mm){ return {key:mm.r2Key, view:mm.view||''}; });
    return {date:s.date, time:s.time||'', author:s.author, role:(typeof getRole==='function'?getRole(s.author):'trainer'), content:s.content||'', videos:vids2};
  });
  var st=stats(mid);
  // 링크 ID는 추측 불가능한 난수로 — 링크를 아는 사람만 열 수 있는 구조라 엔트로피가 곧 보안이다.
  var reportId='rpt_'+(function(){
    try{ var u=new Uint8Array(16); crypto.getRandomValues(u);
      return Array.prototype.map.call(u,function(b){return ('0'+b.toString(36)).slice(-2);}).join('').slice(0,24); }
    catch(e){ return Date.now().toString(36)+Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,12); }
  })();
  var content={
    member:{name:m.name, registeredDate:m.registeredDate||'', handicap:m.handicap||'', avgScore:m.avgScore||'', goal:m.goal||'', focusPoints:m.focusPoints||''},
    totalSessions:allSess.length, proSessions:st?st.pro:0, trainerSessions:st?st.trainer:0,
    sessions:sessions, trackman:trackman, customer:true,
    brand:{name:APP_BRAND.name, nameKo:APP_BRAND.nameKo, store:APP_BRAND.store, storeEn:APP_BRAND.storeEn, measuredBy:APP_BRAND.measuredBy}
  };
  var row={id:reportId, member_id:mid, member_name:m.name, created_by:S.currentUser||'', content:content};
  var saved=false;
  try{ saved = (await cloud._w('upsert','reports',{rows:[row]})) === true; }catch(e){ console.warn('[share] proxy upsert fail:', e); }
  if(!saved){
    try{ var r=await cloud.client.from('reports').upsert(row); if(r.error) throw r.error; saved=true; }
    catch(e){ console.warn('[share] direct upsert fail:', e); }
  }
  if(!saved){ alert('리포트 링크 생성 실패 — 네트워크 확인 후 다시 시도해주세요.'); return; }
  // 공유 링크는 자체 서버(워커) 주소로 — 깃허브 주소가 고객에게 노출되지 않고,
  // 워커 페이지에는 키/설정이 전혀 없다. REPORT_BASE(전용 도메인)가 응답하면 그 주소로,
  // 응답이 없으면 워커 기본 주소로. 둘 다 없으면 기존 report.html 경로(구버전 폴백).
  var rbase=_primary||_fallback;
  if(_probe && !(await _probe)) rbase=_fallback||_primary;
  var link=rbase ? rbase+'/r/'+reportId
                 : location.origin+location.pathname.replace(/\/[^\/]*$/,'/')+'report.html?id='+reportId;
  var text=APP_BRAND.store+' — '+m.name+' 회원님 성과 리포트입니다.\n측정 데이터·비포/애프터 영상·레슨 일지를 한눈에 보실 수 있어요.';
  try{ if(navigator.share){ await navigator.share({title:m.name+' 성과 리포트', text:text, url:link}); return; } }catch(e){ if(e&&e.name==='AbortError') return; }
  try{ await navigator.clipboard.writeText(text+'\n'+link); alert('리포트 링크가 복사되었습니다 — 카카오톡에 붙여넣기 하세요.\n\n'+link); return; }catch(e){}
  prompt('아래 링크를 복사해 회원님께 보내주세요:', link);
}
function _assessScore(items){
  try{return calcFitness(items||{}).score;}catch(e){return 0;}
}

// ---------- 열기/닫기 ----------
function openPerformance(){ S.perfMember=S.selectedMember; S.perfDemo=false; S.perfClub='driver'; S.perfVidFilter='all'; S.perfShotModal=null; S.showPerformance=true; render(); }
function openDemoPerformance(){ S.perfDemo=true; S.perfClub='driver'; S.perfVidFilter='all'; S.perfShotModal=null; S.showPerformance=true; S.sidebarOpen=false; render(); }
function closePerformance(){ S.showPerformance=false; S.perfDemo=false; S.perfShotModal=null; render(); }
function setPerfClub(c){ S.perfClub=c; render(); }
function setPerfVidFilter(f){ S.perfVidFilter=f; render(); }
function openPerfShot(idx){ S.perfShotModal=idx; S.perfShotView=0; render(); }
function closePerfShot(){ S.perfShotModal=null; S.perfShotView=0; render(); }
// 샷 모달 안 앵글 전환 (측면/정면/클럽) — 재렌더 없이 비디오 src 만 교체.
// 클럽 딜리버리는 좌우 반전 + 확대 + 기본 0.5× 슬로우.
function setPerfShotView(i, key, isClub){
  S.perfShotView=i;
  try{
    var v=document.querySelector('.pv-vm-video');
    if(v){
      v.dataset.k=key; v.dataset.rate=isClub?0.5:1;
      v.classList.toggle('vid-flip', !!isClub); v.classList.toggle('club-big', !!isClub);
      v.controls=false; v.loop=!!isClub;   // 전 앵글 기본 컨트롤 OFF(가림 방지) — 자체 시크바·탭·▶/⏸ 로 조작
      var w=v.closest('.vid-wrap'); if(w) w.classList.toggle('club-on', !!isClub);
      v.src=r2.url(key); v.load();
      try{ v.playbackRate=isClub?0.5:1; }catch(e){}
      v.play().catch(function(){});
    }
    var tabs=document.querySelectorAll('.pv-vm-tabs .vv-tab');
    for(var k=0;k<tabs.length;k++){ tabs[k].classList.toggle('on', k===i); }
    var def=isClub?0.5:1;
    [].slice.call(document.querySelectorAll('.pv-speeds .vv-sp')).forEach(function(b){ b.classList.toggle('on', parseFloat(b.getAttribute('data-sp'))===def); });
  }catch(e){}
}
// 샷 모달 배속 칩
function _pvRate(el){
  try{
    var sp=parseFloat(el.getAttribute('data-sp'))||1;
    var v=document.querySelector('.pv-vm-video');
    if(v){ v.dataset.rate=sp; try{ v.playbackRate=sp; }catch(e){} }
    [].slice.call(document.querySelectorAll('.pv-speeds .vv-sp')).forEach(function(b){ b.classList.toggle('on', b===el); });
  }catch(e){}
}

// ===== 영상 진짜 다운로드 — PWA 에서 <a href download> 는 앱 밖으로 내비게이션돼
// 앱이 재시작되던 문제. blob 으로 받아 기기에 저장한다.
//   아이폰: 공유시트(navigator.share) → "비디오 저장" 누르면 사진앱에 저장
//   갤럭시/안드로이드: 다운로드 폴더로 바로 저장
async function downloadShotVideo(btn, url, fname){
  if(btn && btn._busy) return;
  var orig = btn ? btn.textContent : '';
  try{
    // 파일명 확장자를 실제 영상(URL)에 맞춤 — mkv/mov 원본이면 그 확장자로 저장
    try{ var xm=/\.(mkv|mov|mp4)(\?|$)/i.exec(url||''); if(xm) fname=String(fname||'video').replace(/\.(mp4|mkv|mov)$/i,'')+'.'+xm[1].toLowerCase(); }catch(e){}
    if(btn){ btn._busy=1; btn.textContent='⬇ 내려받는 중... 0%'; }
    var res = await fetch(url);
    if(!res.ok) throw new Error('http '+res.status);
    // 진행률 표시하며 수신 (지원 안 되면 통짜로)
    var blob;
    try{
      var total = parseInt(res.headers.get('content-length')||'0',10);
      if(res.body && res.body.getReader && total>0){
        var reader=res.body.getReader(), chunks=[], got=0;
        while(true){ var r=await reader.read(); if(r.done) break; chunks.push(r.value); got+=r.value.length;
          if(btn) btn.textContent='⬇ 내려받는 중... '+Math.min(99,Math.round(got/total*100))+'%'; }
        blob=new Blob(chunks,{type:res.headers.get('content-type')||'video/mp4'});
      } else { blob=await res.blob(); }
    }catch(e){ blob=await res.blob(); }
    var isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
    var file=null; try{ file=new File([blob], fname, {type: blob.type||'video/mp4'}); }catch(e){}
    if(isIOS && file && navigator.canShare && navigator.canShare({files:[file]})){
      // 아이폰 — 공유시트에서 [비디오 저장]을 누르면 사진앱에 저장됩니다
      try{ await navigator.share({files:[file]}); if(btn) btn.textContent='✓ 완료'; }
      catch(e){ if(e && e.name==='AbortError'){ if(btn) btn.textContent=orig; } else { _blobDownload(blob, fname); if(btn) btn.textContent='✓ 파일로 저장됨'; } }
    } else {
      _blobDownload(blob, fname);
      if(btn) btn.textContent='✓ 저장됨 (다운로드 폴더)';
    }
  }catch(e){
    console.warn('[video-dl] fail:', e);
    if(btn) btn.textContent='⚠ 저장 실패 — 다시 시도';
    if(typeof liveToastSafe==='function') liveToastSafe('영상 저장 실패: '+String(e&&e.message||e).slice(0,60));
  }finally{
    if(btn){ btn._busy=0; setTimeout(function(){ try{ btn.textContent=orig; }catch(e){} }, 4000); }
  }
}
function _blobDownload(blob, fname){
  var u=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=u; a.download=fname; a.style.display='none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ try{ URL.revokeObjectURL(u); }catch(e){} }, 60000);
}

// ===== 비포·애프터 나란히 비교 재생 =====
// 동시 재생/일시정지 · 처음부터 · 배속(0.125/0.25/0.5/1×) · 공용 시크바(양쪽 동시 탐색)
// 앵글 전환: 측면/정면/클럽 — 두 샷 모두 해당 앵글이 있을 때 활성.
// 데이터는 렌더 시 S._cmpBA = {b:{dl,fo,club,cap}, a:{...}} 로 준비됨.
function openCompareBA(){
  var C=S._cmpBA; if(!C || typeof r2==='undefined' || !r2.enabled) return;
  var ANGLES=[{k:'dl',label:'측면'},{k:'fo',label:'정면'},{k:'club',label:'클럽'}];
  var avail=ANGLES.filter(function(x){ return C.b[x.k] && C.a[x.k]; });
  var curAngle = avail.length ? avail[0].k : null;
  function keyOf(side, ang){ return ang ? side[ang] : (side.dl||side.club||side.fo); }
  var bKey=keyOf(C.b,curAngle), aKey=keyOf(C.a,curAngle);
  if(!bKey||!aKey) return;
  var sameWarn = (bKey===aKey) ? '<div class="cmp-warn">⚠️ 두 샷에 같은 영상이 연결되어 있어요 — 최신 에이전트로 교체하면 새 샷부터는 중복 배정이 방지됩니다</div>' : '';
  var angleTabs = ANGLES.map(function(x){
    var on = x.k===curAngle, ok = C.b[x.k]&&C.a[x.k];
    return '<button class="vv-tab cmp-ang'+(on?' on':'')+'" data-ang="'+x.k+'"'+(ok?'':' disabled title="두 샷 모두 이 앵글 영상이 있어야 해요"')+'>'+x.label+'</button>';
  }).join('');
  var div=document.createElement('div'); div.className='media-overlay cmp-overlay';
  div.onclick=function(e){ if(e.target===div) div.remove(); };
  div.innerHTML = '<div class="cmp-box">'
    +sameWarn
    +'<div class="vv-tabs cmp-angles">'+angleTabs+'</div>'
    +'<div class="cmp-grid">'
      +'<div class="cmp-col"><span class="cmp-tag b">BEFORE</span><video src="'+r2.url(bKey)+'" playsinline muted loop preload="auto"></video>'+(C.b.cap?'<div class="cmp-cap">'+C.b.cap+'</div>':'')+'</div>'
      +'<div class="cmp-col"><span class="cmp-tag a">AFTER</span><video src="'+r2.url(aKey)+'" playsinline muted loop preload="auto"></video>'+(C.a.cap?'<div class="cmp-cap">'+C.a.cap+'</div>':'')+'</div>'
    +'</div>'
    +'<div class="cmp-seekrow"><span class="cmp-time" data-role="cur">0.0s</span>'
      +'<input type="range" class="cmp-seek" min="0" max="1000" value="0" step="1">'
      +'<span class="cmp-time" data-role="dur">—</span></div>'
    +'<div class="cmp-ctrl">'
      +'<button class="cmp-btn" data-act="restart">⏮ 처음부터</button>'
      +'<button class="cmp-btn play" data-act="play">▶ 동시 재생</button>'
      +'<div class="cmp-speeds"><span>배속</span>'
        +[0.125,0.25,0.5,1].map(function(sp){ return '<button class="cmp-sp'+(sp===0.5?' on':'')+'" data-sp="'+sp+'">'+(sp===1?'1×':String(sp).replace('0.','.')+'×')+'</button>'; }).join('')
      +'</div>'
    +'</div>'
    +'<button class="cmp-close" onclick="this.closest(\'.media-overlay\').remove()">닫기</button>'
  +'</div>';
  document.body.appendChild(div);
  var vids=[].slice.call(div.querySelectorAll('video'));
  vids.forEach(function(v){ try{ v.playbackRate=0.5; }catch(e){} });   // 기본 슬로우(0.5×)
  if(curAngle==='club') vids.forEach(function(v){ v.classList.add('vid-flip'); });   // 클럽: 스윙 방향 보정
  var playBtn=div.querySelector('[data-act="play"]');
  var seek=div.querySelector('.cmp-seek');
  var curEl=div.querySelector('[data-role="cur"]'), durEl=div.querySelector('[data-role="dur"]');
  var master=vids[0], dragging=false;
  function fmt(t){ return (Math.round(t*10)/10).toFixed(1)+'s'; }
  master.addEventListener('loadedmetadata', function(){ if(isFinite(master.duration)) durEl.textContent=fmt(master.duration); });
  // 재생 중 시크바·시간 표시 따라가기 (드래그 중엔 건드리지 않음)
  master.addEventListener('timeupdate', function(){
    if(dragging || !isFinite(master.duration) || !master.duration) return;
    seek.value=Math.round(master.currentTime/master.duration*1000);
    curEl.textContent=fmt(master.currentTime);
  });
  // 시크바 드래그 → 두 영상을 같은 비율 지점으로 동시 탐색 (프레임 단위 비교)
  function seekBoth(){
    var pct=(parseInt(seek.value,10)||0)/1000;
    vids.forEach(function(v){ if(isFinite(v.duration)&&v.duration){ try{ v.currentTime=v.duration*pct; }catch(e){} } });
    if(isFinite(master.duration)&&master.duration) curEl.textContent=fmt(master.duration*pct);
  }
  var wasPlaying=false;
  seek.addEventListener('input', function(){
    if(!dragging){ dragging=true; wasPlaying=vids.some(function(v){return !v.paused;}); vids.forEach(function(v){v.pause();}); }
    seekBoth();
  });
  seek.addEventListener('change', function(){
    seekBoth(); dragging=false;
    if(wasPlaying){ vids.forEach(function(v){v.play().catch(function(){});}); playBtn.textContent='⏸ 일시정지'; }
    wasPlaying=false;
  });
  playBtn.onclick=function(){
    var anyPlaying=vids.some(function(v){ return !v.paused; });
    if(anyPlaying){ vids.forEach(function(v){ v.pause(); }); playBtn.textContent='▶ 동시 재생'; }
    else{ vids.forEach(function(v){ v.play().catch(function(){}); }); playBtn.textContent='⏸ 일시정지'; }
  };
  div.querySelector('[data-act="restart"]').onclick=function(){
    vids.forEach(function(v){ try{ v.currentTime=0; }catch(e){} v.play().catch(function(){}); });
    seek.value=0; playBtn.textContent='⏸ 일시정지';
  };
  var curRate=0.5;
  [].slice.call(div.querySelectorAll('.cmp-sp')).forEach(function(b){
    b.onclick=function(){
      curRate=parseFloat(b.getAttribute('data-sp'))||1;
      vids.forEach(function(v){ try{ v.playbackRate=curRate; }catch(e){} });
      [].slice.call(div.querySelectorAll('.cmp-sp')).forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
    };
  });
  // 앵글 전환 — 두 영상을 같은 앵글로 동시 교체 (배속 유지, 처음부터)
  [].slice.call(div.querySelectorAll('.cmp-ang')).forEach(function(b){
    b.onclick=function(){
      if(b.disabled) return;
      var ang=b.getAttribute('data-ang');
      var nb=keyOf(C.b,ang), na=keyOf(C.a,ang); if(!nb||!na) return;
      vids[0].src=r2.url(nb); vids[1].src=r2.url(na);
      vids.forEach(function(v){ v.load(); try{ v.playbackRate=curRate; }catch(e){} v.classList.toggle('vid-flip', ang==='club'); });
      seek.value=0; curEl.textContent='0.0s'; durEl.textContent='—';
      playBtn.textContent='▶ 동시 재생';
      [].slice.call(div.querySelectorAll('.cmp-ang')).forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
    };
  });
}

// ---------- 헬퍼: Lock-in 카운터 ----------
function _weeksSince(dateStr){
  if(!dateStr) return 0;
  var d=new Date(dateStr); if(isNaN(d)) return 0;
  return Math.max(0, Math.round((Date.now()-d)/(86400000*7)));
}
function _buildLockIn(member, sessions, shots){
  var weeks = _weeksSince(member.registeredDate);
  var sessCount = (sessions||[]).length;
  var hours = Math.round(sessCount*0.7); // 평균 25/50분 70/30 가정 → 평균 ~37분 ≈ 0.6h, 영상 분석시간 포함 0.7h
  var shotCount = (shots||[]).length;
  return {weeks:weeks, sessions:sessCount, hours:hours, shots:shotCount};
}

// ---------- 헬퍼: 클럽 그룹 분류 ----------
function _clubGroup(name){
  var n=String(name||'').toLowerCase();
  if(n.indexOf('드라이버')!==-1||n.indexOf('driver')!==-1) return 'driver';
  if(n.indexOf('우드')!==-1||n.indexOf('wood')!==-1||n.indexOf('하이브리드')!==-1||n.indexOf('hybrid')!==-1||n.indexOf('유틸')!==-1) return 'wood';
  if(n.indexOf('웨지')!==-1||n.indexOf('wedge')!==-1||n.indexOf('피칭')!==-1||n.indexOf('pitch')!==-1||n.indexOf('샌드')!==-1||n.indexOf('sand')!==-1) return 'wedge';
  if(n.indexOf('아이언')!==-1||n.indexOf('iron')!==-1) return 'iron';
  return 'iron'; // 기본은 아이언으로
}
function _clubLabel(g){return {driver:'드라이버',wood:'우드',iron:'아이언',wedge:'웨지'}[g]||g;}

// ---------- 헬퍼: 클럽별 평균 ----------
function _avg(arr, f){ var vs=arr.map(function(x){var v=parseFloat(x.data&&x.data[f]); return isNaN(v)?null:v;}).filter(function(v){return v!=null;}); return vs.length? (vs.reduce(function(a,b){return a+b;},0)/vs.length) : null; }
function _buildClubAverages(shots){
  var groups={driver:[],wood:[],iron:[],wedge:[]};
  (shots||[]).forEach(function(s){var g=_clubGroup(s.data&&s.data.club); if(groups[g]) groups[g].push(s);});
  var out={};
  ['driver','wood','iron','wedge'].forEach(function(g){
    var arr=groups[g];
    out[g]={
      name:_clubLabel(g), n:arr.length,
      _metric: arr.length? _isMetricShot(arr[0].data) : false,
      clubSpeed:_avg(arr,'clubSpeed'), ballSpeed:_avg(arr,'ballSpeed'), smash:_avg(arr,'smash'),
      carry:_avg(arr,'carry'), total:_avg(arr,'total'),
      launch:_avg(arr,'launch'), spin:_avg(arr,'spin'),
      clubPath:_avg(arr,'clubPath'), faceAngle:_avg(arr,'faceAngle'), attack:_avg(arr,'attack')
    };
  });
  return out;
}

// ---------- 헬퍼: 비포/애프터 ----------
function _findBeforeAfter(shots){
  var sorted=(shots||[]).slice().sort(function(a,b){return String(a.ts).localeCompare(String(b.ts));});
  // 1순위: 프로가 직접 지정한 비포/애프터 (각각 가장 최근 것) — 교육 의도를 그대로 반영
  var tagB=null, tagA=null;
  sorted.forEach(function(s){ var t=s.data&&s.data._tag; if(t==='before') tagB=s; else if(t==='after') tagA=s; });
  if(tagB && tagA && tagB!==tagA) return {before:tagB, after:tagA, tagged:true};
  // 2순위(폴백): 드라이버(없으면 전체) 첫 샷 vs 마지막 샷
  var drv=sorted.filter(function(s){return _clubGroup(s.data&&s.data.club)==='driver';});
  var use=drv.length>=2?drv:sorted;
  if(use.length<2) return null;
  return {before:use[0], after:use[use.length-1]};
}

// ---------- 렌더 (v3 — 흰색 통일 · 클럽/날짜/영상 · Lock-in) ----------
function renderPerformance(){
  if(!S.showPerformance) return '';
  var data = S.perfDemo ? DEMO_PERF : buildPerfData(S.perfMember);
  if(!data) return '';
  // 측정 샷/지표뿐 아니라 세션 기록·체형평가·스윙 영상도 리포트 콘텐츠로 인정.
  // (트랙맨을 안 쓰는 골프 레슨/PT 회원도 리포트가 뜨도록 — 로버트처럼 텍스트 세션만 있는 경우)
  var _sess = (S.sessions[data.member.id]||[]).slice().sort(sessionCompare); // 최신 레슨부터
  var _sessVids = [];
  _sess.forEach(function(s){ (s.media||[]).forEach(function(mm){ var mt=String(mm.mimeType||inferMime(mm.name||'')||''); if(mt.indexOf('video')!==-1 && (mm.r2Key||mm.mediaId)) _sessVids.push({s:s, m:mm}); }); });
  var hasData = (data.golf&&data.golf.length) || (data.pt&&data.pt.length) || (data.shots&&data.shots.length) || _sess.length>0 || (data.assess&&data.assess.length);
  if(!hasData && !S.perfDemo){
    return '<div class="perf-overlay perf-light"><div class="perf-shell"><div class="perf-topbar"><div class="perf-brand"><img src="assets/logo.png" class="perf-logo" alt="">PERFORMANCE REPORT</div><button class="perf-close" onclick="closePerformance()">닫기</button></div>'+
      '<div class="perf-empty"><div class="pe-icon">📊</div><div class="pe-title">'+data.member.name+' 회원님 측정 데이터가 아직 없습니다</div><div class="pe-sub">라이브 세션에서 샷을 저장하면<br>이 화면에 성장 리포트가 자동으로 그려집니다.</div><button class="perf-demo-btn" onclick="openDemoPerformance()">상담용 데모 데이터로 미리보기 →</button></div>'+
      '</div></div>';
  }
  var m=data.member;
  var ts=S.perfTextScale||1;
  var locked=_buildLockIn(m, S.sessions[m.id]||[], data.shots||[]);
  // 공용 계산 — 클럽별 평균 · 목표 (여러 섹션에서 재사용)
  var avgs = (data.shots&&data.shots.length) ? _buildClubAverages(data.shots) : null;
  var goalM = _parseGoalDist(m.goal), goalAuto=false;
  if(goalM==null && data.golf && data.golf.length){
    var bestTrendM=0; data.golf.forEach(function(g){var c=_carryM(g); if(c!=null&&c>bestTrendM) bestTrendM=c;});
    if(bestTrendM>0){ goalM=Math.ceil(bestTrendM*1.05/5)*5; goalAuto=true; }   // 목표 미설정 시: 베스트+5% 자동
  }
  var secNo=0; var _sn=function(){ secNo++; return (secNo<10?'0':'')+secNo; };
  var html='<div class="perf-overlay perf-light"><div class="perf-shell perf-v3" style="font-size:'+(16*ts)+'px">'
    +'<button class="pf-zoom" onclick="perfZoomCycle()" title="글씨 크기 확대">🔍<small>'+(ts>=1.6?'가+++':ts>=1.3?'가++':ts>1?'가+':'가')+'</small></button>';

  // ===== 헤더 =====
  html+='<div class="pv-hd">'
    +'<div class="pv-hd-top">'
      +'<div class="pv-brand">'+(APP_BRAND.storeEn||APP_BRAND.name)+'<small>'+APP_BRAND.reportSub+'</small></div>'
      +'<div class="pv-ctrls">'
        +'<div class="pv-cg"><span class="pv-l">단위</span><div class="pv-seg"><button class="'+(S.perfUnitDist==='yd'?'on':'')+'" onclick="setPerfDist(\'yd\')">yd</button><button class="'+(S.perfUnitDist==='m'?'on':'')+'" onclick="setPerfDist(\'m\')">m</button></div></div>'
        +'<div class="pv-cg"><span class="pv-l">속도</span><div class="pv-seg"><button class="'+(S.perfUnitSpd==='mph'?'on':'')+'" onclick="setPerfSpd(\'mph\')">mph</button><button class="'+(S.perfUnitSpd==='ms'?'on':'')+'" onclick="setPerfSpd(\'ms\')">m/s</button></div></div>'
        +'<button class="pv-closebtn" onclick="closePerformance()">닫기</button>'
      +'</div>'
    +'</div>'
    +'<div class="pv-title">PERFORMANCE <span>REPORT</span>'+(S.perfDemo?'<span class="pv-demo">DEMO</span>':'')+'</div>'
    +'<div class="pv-meta">'+(m.registeredDate||'')+' – 현재 · MEASURED BY '+APP_BRAND.measuredBy+'</div>'
    +(S.perfDemo?'<div class="pv-meta" style="color:#d97706;font-weight:700">※ 상담용 데모 데이터입니다 — 실제 회원 측정값이 아닙니다</div>':'')
  +'</div>';

  // ===== 선수 + 매몰 카운터 (Lock-in #1) =====
  html+='<div class="pv-player">'
    +'<div class="pv-p-top">'
      +'<div><div class="pv-pname">'+m.name+' <span>회원님</span></div>'
        +'<div class="pv-pmeta">'+[(m.handicap?'HCP '+m.handicap:''),(m.avgScore?'AVG '+m.avgScore:''),(m.registeredDate?'가입 '+m.registeredDate:'')].filter(Boolean).join(' · ')+'</div>'
      +'</div>'
      +(m.goal?'<div class="pv-ptags"><div>🎯 '+m.goal+'</div></div>':'')
    +'</div>'
    +'<div class="pv-invest">'
      +'<div class="pv-iv-label">⏱ '+APP_BRAND.nameKo+'과 함께한 시간</div>'
      +'<div class="pv-iv-grid">'
        +'<div class="pv-iv-cell"><div class="pv-iv-v">'+locked.weeks+'<span class="u">주</span></div><div class="pv-iv-l">함께한 기간</div></div>'
        +'<div class="pv-iv-cell"><div class="pv-iv-v">'+locked.sessions+'</div><div class="pv-iv-l">완료 세션</div></div>'
        +'<div class="pv-iv-cell"><div class="pv-iv-v">'+locked.hours+'<span class="u">시간</span></div><div class="pv-iv-l">측정·훈련</div></div>'
        +'<div class="pv-iv-cell"><div class="pv-iv-v">'+locked.shots+'</div><div class="pv-iv-l">기록된 샷</div></div>'
      +'</div>'
    +'</div>'
  +'</div>';

  // ===== 현재 상태 KPI — 베스트 샷 기준 (평균 아님, 실측 개별값) =====
  if(data.shots&&data.shots.length){
    // 가장 긴 캐리 샷 = 베스트
    var best=null, bestC=-1;
    data.shots.forEach(function(s){var c=parseFloat(s.data&&s.data.carry); if(!isNaN(c)&&c>bestC){bestC=c;best=s;}});
    var bd=(best&&best.data)||{}; var bm=_isMetricShot(bd);
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>베스트 샷</div><div class="pv-sec-x">'+(best?_clubKo(bd.club)+' · '+String(best.ts).slice(5,10):'')+'</div></div>'
      +'<div class="pv-kgrid">'
        +'<div class="pv-k hi"><div class="pv-k-l">캐리</div><div class="pv-k-v">'+(bd.carry!=null?_fmtNum(pfDistFrom(bd.carry,bm)):'—')+'<span class="pv-k-u">'+pfDistU()+'</span></div></div>'
        +'<div class="pv-k"><div class="pv-k-l">볼 스피드</div><div class="pv-k-v">'+(bd.ballSpeed!=null?_fmtNum(pfSpdFrom(bd.ballSpeed,bm)):'—')+'<span class="pv-k-u">'+pfSpdU()+'</span></div></div>'
        +'<div class="pv-k"><div class="pv-k-l">클럽 스피드</div><div class="pv-k-v">'+(bd.clubSpeed!=null?_fmtNum(pfSpdFrom(bd.clubSpeed,bm)):'—')+'<span class="pv-k-u">'+pfSpdU()+'</span></div></div>'
        +'<div class="pv-k hi"><div class="pv-k-l">스매시</div><div class="pv-k-v">'+(bd.smash!=null?_fmtNum(bd.smash):'—')+'</div></div>'
      +'</div>'
      +'<div class="pv-shotcount">총 <strong>'+data.shots.length+'</strong>개 샷 측정됨 · 아래에서 개별 샷·영상 확인</div>'
      +'</div>';
  }

  // ===== 성장 그래프 — 세션별 드라이버 캐리 추이 (실측) =====
  // 드라이버 데이터가 부족하면 "전 클럽 혼합"이 아니라 최다 측정 단일 클럽 그룹으로 대체
  // (혼합 추이는 클럽 간 거리 차이가 성장으로 오표시되므로 금지)
  var trendPts=(data.golf||[]).filter(function(g){return _carryM(g)!=null && _clubGroup(g.club)==='driver';});
  if(trendPts.length<2){
    var _byGrp={};
    (data.golf||[]).forEach(function(g){ if(_carryM(g)==null) return; var k=_clubGroup(g.club); (_byGrp[k]=_byGrp[k]||[]).push(g); });
    var _bestK=Object.keys(_byGrp).sort(function(a,b){return _byGrp[b].length-_byGrp[a].length;})[0];
    trendPts=_bestK? _byGrp[_bestK] : [];
  }
  if(trendPts.length>=2){
    var tVals=trendPts.map(function(g){return Math.round(pfDistM(_carryM(g))*10)/10;});
    var tLabs=trendPts.map(function(g){return g.date;});
    var tFirst=tVals[0], tLast=tVals[tVals.length-1], tDiff=Math.round((tLast-tFirst)*10)/10;
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>성장 그래프</div><div class="pv-sec-x">'+(_clubKo(trendPts[trendPts.length-1].club)||'드라이버')+' 캐리 · 세션 평균</div></div>'
      +'<div class="pv-chart">'+svgLine(tVals,tLabs,{w:560,h:170,color:'#00b884',unit:pfDistU()})+'</div>'
      +(tDiff!==0?'<div class="pv-shotcount">첫 측정 대비 <strong>'+(tDiff>0?'+':'')+_fmtNum(tDiff)+' '+pfDistU()+'</strong> 변화 · '+trendPts.length+'회 측정 기준</div>':'')
      +'</div>';
  }

  // ===== 목표 진척 — 회원 목표 + 실측 페이스 =====
  (function(){
    var gAll=(data.golf||[]).filter(function(g){return _carryM(g)!=null && _clubGroup(g.club)==='driver';});
    var grpIsDriver=gAll.length>0;
    if(!grpIsDriver) gAll=(data.golf||[]).filter(function(g){return _carryM(g)!=null;});
    if(!gAll.length || !goalM) return;
    // 회원이 직접 적은 목표(대개 드라이버 기준)에 다른 클럽 수치를 대입하지 않는다
    if(!grpIsDriver && !goalAuto) return;
    var grpLabel=grpIsDriver?'드라이버':(_clubLabel(_clubGroup(gAll[gAll.length-1].club))||'클럽');
    var curM=_carryM(gAll[gAll.length-1]);
    if(curM==null) return;
    var pct=Math.min(100, Math.max(0, Math.round((curM/goalM)*100)));
    var restM=Math.max(0, goalM-curM);
    // 페이스 예측 — 3회 이상 측정 + 2주 이상 간격 + 상승 추세일 때만 (근거 없는 예측 금지)
    var paceLine='';
    if(restM<=0){ paceLine='🎉 목표 달성 — 담당 지도자와 다음 목표를 설정하세요'; }
    else if(gAll.length>=3 && gAll[0]._d && gAll[gAll.length-1]._d){
      var firstM=_carryM(gAll[0]);
      var days=(new Date(gAll[gAll.length-1]._d)-new Date(gAll[0]._d))/86400000;
      if(firstM!=null && days>=14 && curM>firstM){
        var perWeek=(curM-firstM)/(days/7);
        var wks=Math.ceil(restM/perWeek);
        if(perWeek>=0.2 && wks<=52) paceLine='최근 페이스(주당 +'+_fmtNum(pfDistM(perWeek))+' '+pfDistU()+') 유지 시 약 '+wks+'주 내 달성 예상';
      }
    }
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>목표 진척</div><div class="pv-sec-x">'+(goalAuto?'자동 목표 (베스트 +5%)':'회원 목표 기준')+'</div></div>'
      +'<div class="pv-gl"><div class="pv-gl-h">🎯 '+(m.goal?String(m.goal).replace(/</g,'&lt;'):'다음 단계까지')+'</div>'
        +'<div class="pv-gl-row"><div class="pv-gl-top"><span class="pv-gl-name">'+grpLabel+' 캐리 '+_fmtNum(pfDistM(goalM))+' '+pfDistU()+' 돌파</span><span class="pv-gl-val">'+_fmtNum(pfDistM(curM))+'<span class="un"> '+pfDistU()+'</span></span></div>'
          +'<div class="pv-gl-bar"><div class="pv-gl-fill" style="width:'+pct+'%"></div></div>'
          +'<div class="pv-gl-rest">'+(restM>0?_fmtNum(pfDistM(restM))+' '+pfDistU()+' 남음':'')+(paceLine?(restM>0?' · ':'')+paceLine:'')+'</div>'
        +'</div>'
        +(m.avgScore?'<div class="pv-gl-row"><div class="pv-gl-top"><span class="pv-gl-name">평균 스코어</span><span class="pv-gl-val">'+m.avgScore+'<span class="un"> 타</span></span></div><div class="pv-gl-rest">회원 프로필 기준 — 라운드 후 업데이트하면 추이가 기록됩니다</div></div>':'')
      +'</div></div>';
  })();

  // ===== 클럽별 평균 (탭) =====
  if(avgs){
    var curG=S.perfClub||'driver'; if(!avgs[curG]||avgs[curG].n===0){curG=['driver','wood','iron','wedge'].find(function(g){return avgs[g]&&avgs[g].n>0;})||'driver';}
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>클럽별 평균</div><div class="pv-sec-x">'+APP_BRAND.measuredBy+' 측정값</div></div>'
      +'<div class="pv-tabs">';
    ['driver','wood','iron','wedge'].forEach(function(g){
      var a=avgs[g], dis=a.n===0?' dis':'';
      html+='<button class="pv-tab'+(curG===g?' on':'')+dis+'" onclick="setPerfClub(\''+g+'\')">'+a.name+' <span class="pv-ct">'+a.n+'</span></button>';
    });
    html+='</div>';
    var a=avgs[curG];
    if(a.n>0){
      var am=!!a._metric;
      var rowfn=function(label,val,u,dec){return '<tr><td>'+label+'</td><td>'+(val==null?'—':_fmtNum(dec!=null?Number(val.toFixed(dec)):val))+'</td><td>'+(u||'')+'</td></tr>';};
      html+='<table class="pv-tbl"><thead><tr><th>지표</th><th>평균 ('+a.n+'샷)</th><th>단위</th></tr></thead><tbody>'
        +rowfn('클럽 스피드', a.clubSpeed!=null?pfSpdFrom(a.clubSpeed,am):null, pfSpdU(),1)
        +rowfn('볼 스피드', a.ballSpeed!=null?pfSpdFrom(a.ballSpeed,am):null, pfSpdU(),1)
        +rowfn('스매시', a.smash, '',2)
        +rowfn('캐리', a.carry!=null?pfDistFrom(a.carry,am):null, pfDistU(),0)
        +rowfn('토탈', a.total!=null?pfDistFrom(a.total,am):null, pfDistU(),0)
        +rowfn('발사각', a.launch, '°',1)
        +rowfn('스핀량', a.spin, 'rpm',0)
        +rowfn('클럽 패스', a.clubPath, '°',1)
        +rowfn('페이스 앵글', a.faceAngle, '°',1)
        +'</tbody></table>';
    } else { html+='<div class="pv-empty">해당 클럽 측정 데이터가 아직 없습니다</div>'; }
    // 탄착군 산점도 — 선택된 클럽, carrySide 데이터 있는 샷 3개 이상일 때 (GDR '탄착 분석' 벤치마킹)
    (function(){
      var grpShots=(data.shots||[]).filter(function(s){
        if(_clubGroup(s.data&&s.data.club)!==curG) return false;
        var side=parseFloat(s.data&&s.data.carrySide), c=parseFloat(s.data&&s.data.carry);
        return !isNaN(side)&&!isNaN(c);
      });
      if(grpShots.length<3) return;
      var bestC=-1; grpShots.forEach(function(s){var c=parseFloat(s.data.carry); if(c>bestC)bestC=c;});
      var pts=grpShots.map(function(s){
        var met=_isMetricShot(s.data);
        return { x:Math.round(pfDistFrom(parseFloat(s.data.carrySide),met)*10)/10,
                 y:Math.round(pfDistFrom(parseFloat(s.data.carry),met)),
                 best:parseFloat(s.data.carry)>=bestC*0.99 };
      });
      // 판정은 항상 미터 기준(15/30m) — 표시 단위 토글에 따라 등급이 바뀌면 안 된다
      var xsM=grpShots.map(function(s){var met=_isMetricShot(s.data); var v=parseFloat(s.data.carrySide); return met? v : v*0.9144;});
      var spreadM=Math.max.apply(null,xsM)-Math.min.apply(null,xsM);
      var spreadDisp=_fmtNum(pfDistM(spreadM))+' '+pfDistU();
      var judge=spreadM<=15?'탄착군이 '+spreadDisp+' 폭 — 상급자 수준의 일관성입니다':
                spreadM<=30?'좌우 분산 '+spreadDisp+' — 방향 일관성이 잡혀가는 중입니다':
                '좌우 분산 '+spreadDisp+' — 페이스 컨트롤이 다음 과제입니다';
      html+='<div class="pv-chart" style="margin-top:10px">'+svgDispersion(pts,{w:560,h:240})+'</div>'
        +'<div class="pv-shotcount">🎯 '+_clubLabel(curG)+' 탄착군 ('+grpShots.length+'샷) · '+judge+'</div>';
    })();
    // 클럽별 평균 캐리 한눈 비교 (GDR 스타일 클럽 비거리 차트)
    var barClubs=['driver','wood','iron','wedge'].map(function(g){return avgs[g];}).filter(function(x){return x.n>0&&x.carry!=null;});
    if(barClubs.length>=2){
      html+='<div class="pv-chart" style="margin-top:10px">'+svgBars(
        barClubs.map(function(x){return Math.round(pfDistFrom(x.carry,x._metric));}),
        barClubs.map(function(x){return x.name;}),
        {w:560,h:150})+'</div>'
        +'<div class="pv-shotcount">클럽별 평균 캐리 ('+pfDistU()+') — 클럽 간 거리 갭 확인용</div>';
    }
    html+='</div>';
  }

  // ===== 측정 샷 · 영상 그리드 =====
  if(data.shots&&data.shots.length){
    var filt=S.perfVidFilter||'all';
    var now=new Date();
    var list=data.shots.slice().sort(function(a,b){return String(b.ts).localeCompare(String(a.ts));});
    var maxCarry=0; list.forEach(function(s){var c=parseFloat(s.data&&s.data.carry)||0; if(c>maxCarry) maxCarry=c;});
    if(filt==='week'){list=list.filter(function(s){return (now-new Date(s.ts))/86400000<=7;});}
    else if(filt==='month'){list=list.filter(function(s){return (now-new Date(s.ts))/86400000<=31;});}
    else if(filt==='best'){list=list.filter(function(s){return (parseFloat(s.data&&s.data.carry)||0)>=maxCarry*0.95;});}
    else if(['driver','wood','iron','wedge'].indexOf(filt)!==-1){list=list.filter(function(s){return _clubGroup(s.data&&s.data.club)===filt;});}
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>측정 샷 · 영상</div><div class="pv-sec-x">'+list.length+'개 표시</div></div>'
      +'<div class="pv-filt">'
        +['all:전체','week:이번주','month:이번달','best:⭐ 베스트','driver:드라이버','iron:아이언'].map(function(o){var k=o.split(':')[0],l=o.split(':')[1];return '<button class="pv-chip'+(filt===k?' on':'')+'" onclick="setPerfVidFilter(\''+k+'\')">'+l+'</button>';}).join('')
      +'</div>';
    if(list.length===0){html+='<div class="pv-empty">해당 조건의 샷이 없습니다</div>';}
    else{
      html+='<div class="pv-vg">';
      list.slice(0,18).forEach(function(s){
        var idx=data.shots.indexOf(s);
        var d=s.data||{};
        var sm=_isMetricShot(d);
        var dist=d.carry!=null?_fmtNum(pfDistFrom(d.carry,sm)):'—';
        var u=d.carry!=null?pfDistU():'';
        var club=_clubKo(d.club)||'';
        // 프로가 직접 지정한 비포/애프터만 배지 표시 — 캐리 기준 자동 BEST 는 오해 소지
        // (교정 전 나쁜 습관 예시 영상이 "베스트"로 보일 수 있음) → 제거.
        var tagBadge = d._tag==='before' ? '<span class="pv-vbest tag-before">BEFORE</span>'
                     : d._tag==='after'  ? '<span class="pv-vbest tag-after">AFTER</span>' : '';
        var dateStr=String(s.ts).slice(5,10);
        var hasVid=!!(s.videoR2Key || d.videoMp4R2Key || d.videoDL);
        html+='<div class="pv-vcard" onclick="openPerfShot('+idx+')"><div class="pv-vthumb">'
          +tagBadge
          +(hasVid?'<span class="pv-vhasvid">🎬</span>':'')
          +'<div class="pv-vplay">▶</div>'
          +'<span class="pv-vdate">'+dateStr+'</span><span class="pv-vdist">'+dist+'<span>'+u+'</span></span>'
        +'</div><div class="pv-vinfo"><div class="pv-vclub">'+club+'</div>'
          +'<div class="pv-vdetail">'+(d.clubSpeed!=null?'CS '+_fmtNum(pfSpdFrom(d.clubSpeed,sm)):'')+(d.smash!=null?' · '+d.smash:'')+'</div>'
        +'</div></div>';
      });
      html+='</div>';
    }
    html+='</div>';
  }

  // ===== 비포/애프터 (Lock-in #3) — 카드 탭 시 해당 샷·영상 모달 =====
  var ba=data.shots? _findBeforeAfter(data.shots) : null;
  if(ba){
    var bMet=_isMetricShot(ba.before.data), aMet=_isMetricShot(ba.after.data);
    var bC=parseFloat(ba.before.data&&ba.before.data.carry)||0, aC=parseFloat(ba.after.data&&ba.after.data.carry)||0;
    var bCm=bMet?bC:bC*0.9144, aCm=aMet?aC:aC*0.9144;   // m 로 정규화해 비교
    var diffM=aCm-bCm, pctChg=bCm>0?Math.round((diffM/bCm)*100*10)/10:0;
    var bIdx=data.shots.indexOf(ba.before), aIdx=data.shots.indexOf(ba.after);
    var _vk=function(s){ var d=(s&&s.data)||{}; return d.videoDL||d.videoMp4R2Key||d.videoClub||s.videoR2Key||null; };
    var _cap=function(s){ var d=(s&&s.data)||{}; var met=_isMetricShot(d); var c=d.carry!=null?_fmtNum(pfDistFrom(d.carry,met))+' '+pfDistU():''; return (_clubKo(d.club)||'샷')+' · '+String(s.ts).slice(5,10)+(c?' · '+c:''); };
    // 각 샷의 앵글별 키 — 비교 재생기에서 측면/정면/클럽 전환용
    var _ang=function(s){ var d=(s&&s.data)||{}; var dl=d.videoDL||d.videoMp4R2Key||s.videoR2Key||null; if(dl&&(dl===d.videoClub||dl===d.videoFO)) dl=null; return {dl:dl, fo:d.videoFO||null, club:d.videoClub||null}; };
    var bKey=_vk(ba.before), aKey=_vk(ba.after);
    var bVid=!!bKey, aVid=!!aKey;
    S._cmpBA = { b:Object.assign(_ang(ba.before),{cap:_cap(ba.before)}), a:Object.assign(_ang(ba.after),{cap:_cap(ba.after)}) };
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>비포 · 애프터</div><div class="pv-sec-x">'+(ba.tagged?'프로 지정 비교':'처음 vs 현재')+' · 탭하면 상세</div></div>'
      +'<div class="pv-bna-h">⏮ BEFORE  ·  AFTER ⏭</div>'
      +'<div class="pv-bna">'
        +'<div class="pv-bna-col" onclick="openPerfShot('+bIdx+')" style="cursor:pointer"><div class="pv-bna-thumb"><span class="pv-bna-tag">BEFORE</span>'+(bVid?'<span class="pv-vhasvid">🎬</span>':'')+'<div class="pv-vplay">▶</div></div>'
          +'<div class="pv-bna-stats"><div class="pv-bna-date">'+String(ba.before.ts).slice(0,10)+'</div><div class="pv-bna-val">'+_fmtNum(pfDistM(bCm))+' <span>'+pfDistU()+'</span></div></div></div>'
        +'<div class="pv-bna-arr">→</div>'
        +'<div class="pv-bna-col after" onclick="openPerfShot('+aIdx+')" style="cursor:pointer"><div class="pv-bna-thumb"><span class="pv-bna-tag">AFTER</span>'+(aVid?'<span class="pv-vhasvid">🎬</span>':'')+'<div class="pv-vplay">▶</div></div>'
          +'<div class="pv-bna-stats"><div class="pv-bna-date">'+String(ba.after.ts).slice(0,10)+'</div><div class="pv-bna-val">'+_fmtNum(pfDistM(aCm))+' <span>'+pfDistU()+'</span></div></div></div>'
      +'</div>'
      +(bVid&&aVid
        ? '<button class="pv-cmp-btn" onclick="openCompareBA()">🎬 비포·애프터 나란히 재생 <small>슬로우 · 배속 · 동시 탐색 · 앵글 전환</small></button>'
        : '<div class="pv-cmp-note">🎬 나란히 재생은 두 샷 모두 영상이 있어야 해요 — '+(!bVid&&!aVid?'비포·애프터':(!bVid?'비포':'애프터'))+' 샷 영상이 아직 없습니다</div>')
      +(diffM>0&&!ba.tagged?'<div class="pv-bna-delta"><span>드라이버 캐리 변화</span><b>+'+_fmtNum(pfDistM(diffM))+' '+pfDistU()+' · +'+pctChg+'%</b></div>':'')
    +'</div>';
  }

  // ===== 체형 기능 평가 추이 (측정 샷 없어도 표시) =====
  if(data.assess && data.assess.length){
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>체형 기능 평가</div><div class="pv-sec-x">'+(data.assess.length>1?data.assess.length+'회 기록':'현재')+'</div></div>';
    if(data.assess.length>=2){
      html+='<div class="pv-chart">'+svgLine(data.assess.map(function(a){return a.score;}), data.assess.map(function(a){return a.date;}), {w:560,h:150,color:'#3868d6',unit:'점'})+'</div>';
      var _af=data.assess[0].score, _al=data.assess[data.assess.length-1].score;
      html+='<div class="pv-shotcount">체형 기능 점수 '+((_al-_af)>=0?'+':'')+(_al-_af)+'점 변화 · 100점 만점(높을수록 양호)</div>';
    } else {
      html+='<div class="pv-kgrid"><div class="pv-k hi"><div class="pv-k-l">체형 기능 점수</div><div class="pv-k-v">'+data.assess[0].score+'<span class="pv-k-u">/100</span></div></div></div>'
        +'<div class="pv-shotcount">애프터 평가를 한 번 더 기록하면 점수 추이 그래프가 그려집니다.</div>';
    }
    html+='</div>';
  }

  // ===== 레슨 기록 · 스윙 영상 (세션 데이터 기반 — 측정 샷 없어도 리포트가 채워짐) =====
  if(_sess.length){
    var _recent=_sess; // 이미 최신순 정렬됨
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>레슨 기록'+(_sessVids.length?' · 스윙 영상':'')+'</div><div class="pv-sec-x">최근 '+Math.min(_recent.length,6)+' / 총 '+_sess.length+'회</div></div>';
    if(_sessVids.length){
      html+='<div class="pv-sess-vids">'+_sessVids.slice(0,6).map(function(v){
        var mm=v.m; var src=(mm.mediaId&&S.mediaUrls[mm.mediaId])?S.mediaUrls[mm.mediaId]:((typeof r2!=='undefined'&&r2.enabled&&(mm.r2Key||mm.mediaId))?r2.url(mm.r2Key||mm.mediaId):'');
        if(!src) return '';
        var label=(mm.view==='front'?'정면':mm.view==='side'?'측면':'스윙');
        return '<div class="pv-sess-vid"><video src="'+src+'" controls playsinline preload="metadata" crossorigin="anonymous"></video><div class="pv-sess-vlabel">'+esc(v.s.date)+(v.s.time?' '+esc(timeLabel(v.s.time)):'')+' · '+label+'</div></div>';
      }).join('')+'</div>';
    }
    html+='<div class="pv-lessons">'+_recent.slice(0,6).map(function(s){
      var r=getRole(s.author); var tag=r==='pro'?'GOLF PRO':(r==='trainer'?'GOLF PT':'관리자');
      var txt=String(s.content||'').replace(/\s+/g,' ').trim();
      return '<div class="pv-lesson-row"><span class="pv-lesson-date">'+esc(s.date)+(s.time?' '+esc(timeLabel(s.time)):'')+'</span><span class="pv-lesson-tag '+r+'">'+tag+'</span><span class="pv-lesson-txt">'+esc(txt.slice(0,64))+(txt.length>64?'…':'')+'</span></div>';
    }).join('')+'</div>';
    if(!(data.shots&&data.shots.length)){
      html+='<div class="pv-shotcount">🎯 트랙맨 라이브 수업에서 샷을 저장하면 비거리·구질·성장 그래프가 이 리포트에 자동으로 더해집니다.</div>';
    }
    html+='</div>';
  }

  // ===== PT 보조 (보존: 기존 기능) =====
  if(data.pt&&data.pt.length){
    var exNames={}; data.pt.forEach(function(s){(s.sets||[]).forEach(function(st){exNames[st.exercise]=true;});});
    var exList=Object.keys(exNames).slice(0,4);
    var ptLabels=data.pt.map(function(x){return x.date;});
    function exWeight(sess,ex){var f=(sess.sets||[]).find(function(st){return st.exercise===ex;});return f?f.weight:null;}
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>근력 향상 · Golf PT</div></div>';
    if(exList.length>0){
      var series=exList.map(function(ex,i){return {name:ex, color:['#0a0c0f','#5b616a','#9aa0a8','#c8cdd3'][i%4], values:data.pt.map(function(s){return exWeight(s,ex)||0;})};});
      html+='<div class="pv-chart">'+svgMultiLine(series,ptLabels,{w:560,h:180})+'</div>';
    }
    html+='</div>';
  }

  // ===== 시즌 목표 — 실데이터·회원 프로필 기반 (없으면 타일 생략) =====
  (function(){
    var tiles=[];
    if(goalM) tiles.push('<div class="pv-nx"><div class="v">'+_fmtNum(pfDistM(goalM))+'<span class="u"> '+pfDistU()+'</span></div><div class="l">드라이버 캐리 목표'+(goalAuto?' (자동)':'')+'</div></div>');
    if(avgs && avgs.driver && avgs.driver.n>0 && avgs.driver.faceAngle!=null && avgs.driver.clubPath!=null){
      var f2p=Math.abs(avgs.driver.faceAngle-avgs.driver.clubPath);
      tiles.push('<div class="pv-nx"><div class="v">'+_fmtNum(f2p)+'<span class="u">°</span></div><div class="l">Face to Path (목표 ±1°)</div></div>');
    }
    if(m.avgScore) tiles.push('<div class="pv-nx"><div class="v">'+m.avgScore+'<span class="u"> 타</span></div><div class="l">평균 스코어</div></div>');
    if(!tiles.length && !m.goal) return;
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>'+_sn()+'</i>시즌 목표</div><div class="pv-sec-x">담당 지도자와 설정</div></div>'
      +'<div class="pv-next">'
        +'<div class="pv-nx-h">'+(m.goal?'🎯 '+String(m.goal).replace(/</g,'&lt;'):'시즌 챌린지 · 진행 중')+'</div>'
        +(tiles.length?'<div class="pv-nx-grid">'+tiles.join('')+'</div>':'')
        +'<div class="pv-nx-note">권장 일정 · 골프 PT <b>주 2회 × 12주 = 24회</b> · '+APP_BRAND.measuredBy+' 측정 <b>월 1회 정밀</b>.</div>'
      +'</div></div>';
  })();

  // ===== CTA — 실동작 (공유 · 인쇄) =====
  html+='<div class="pv-sec"><div class="pv-cta-wrap">'
    +'<div class="pv-cta primary" onclick="sharePerfSummary()"><div class="pv-cta-ic">📤</div><div><div class="pv-cta-t">리포트 공유</div><div class="pv-cta-s">요약을 카카오톡 등으로 전송</div></div></div>'
    +'<div class="pv-cta" onclick="printPerf()"><div class="pv-cta-ic">🖨</div><div><div class="pv-cta-t">인쇄 · PDF 저장</div><div class="pv-cta-s">상담용 출력</div></div></div>'
  +'</div></div>';

  // ===== 푸터 =====
  html+='<div class="pv-foot">본 리포트의 모든 탄도 데이터는 <b>'+APP_BRAND.measuredBy+'</b> 로 측정되었으며 담당 지도자 분석과 함께 작성되었습니다.<br><span>측정 베이스라인 · 영상 자산 · 코칭 이력은 <b>'+APP_BRAND.nameKo+'</b>에 누적되어 회원님의 다음 단계 진단에 활용됩니다.</span></div>';
  html+='</div></div>';

  // ===== 샷 상세 모달 (개별 샷 — 실제 영상 + 전체 트랙맨 지표) =====
  if(S.perfShotModal!=null && data.shots && data.shots[S.perfShotModal]){
    var sm=data.shots[S.perfShotModal], dm=sm.data||{};
    var metric=_isMetricShot(dm);
    var vmt=function(l,v,u){return '<div class="pv-vmt"><div class="l">'+l+'</div><div class="v">'+(v==null?'—':v)+(u?'<span class="u"> '+u+'</span>':'')+'</div></div>';};
    var vmp=function(l,v,u){return '<div class="pv-vmp"><span>'+l+'</span><b>'+(v==null?'—':v)+(u?' '+u:'')+'</b></div>';};
    // 영상 앵글: 측면(DL, 주 영상) / 정면(FO) / 클럽 딜리버리 — 있는 것만 탭으로 전환.
    // ※ 각도 키는 shot.data 안에 저장됨(videoDL/videoFO/videoClub/videoMp4R2Key).
    var views=[];
    var dlK = dm.videoDL || dm.videoMp4R2Key || sm.videoR2Key || null;
    // 대표 영상이 클럽/정면과 같은 파일이면 "측면" 탭으로 중복 표시하지 않음
    if(dlK && dlK!==dm.videoClub && dlK!==dm.videoFO) views.push({label:'측면', key:dlK});
    if(dm.videoFO) views.push({label:'정면', key:dm.videoFO});
    if(dm.videoClub) views.push({label:'클럽', key:dm.videoClub});
    var curV = Math.min(S.perfShotView||0, Math.max(0,views.length-1));
    var vidUrl='', isMkvOnly=false;
    if(views.length && typeof r2!=='undefined' && r2.enabled){
      vidUrl = r2.url(views[curV].key);
      isMkvOnly = /\.mkv$/i.test(views[curV].key);
    }
    var fname = 'shot_'+(sm.id||'').slice(0,8)+'.mp4';
    var vidHtml;
    if(vidUrl){
      var isClubV = views[curV].label==='클럽';
      var tabsHtml = views.length>1
        ? '<div class="pv-vm-tabs vv-tabs">'+views.map(function(v,i){return '<button class="vv-tab'+(i===curV?' on':'')+'" onclick="setPerfShotView('+i+',\''+v.key+'\','+(v.label==='클럽'?1:0)+')">'+v.label+'</button>';}).join('')+'</div>'
        : '';
      // 영상 로드 실패 시 실제 사유(404/형식/네트워크)를 확인해 표시 — _vidDiag
      // 클럽 딜리버리: 180° 회전(샤프트 아래) + 확대 + 기본 0.5× 슬로우.
      // 회전 시 기본 컨트롤까지 뒤집히므로 클럽 뷰는 컨트롤 OFF → 탭 재생/정지 + 자동 반복,
      // 그 위에 TPS 스타일 패스 오버레이(타깃라인·패스 곡선·페이스 각).
      vidHtml=tabsHtml
        +'<div class="vid-wrap'+(isClubV?' club-on':'')+'">'
        +'<video class="pv-vm-video'+(isClubV?' vid-flip club-big':'')+'" src="'+vidUrl+'" crossorigin="anonymous" data-k="'+views[curV].key+'" data-rate="'+(isClubV?0.5:1)+'"'+(isClubV?' loop':'')+' playsinline preload="metadata"'
        +' onplay="try{_cvPlayIcon(this)}catch(e){}" onpause="try{_cvPlayIcon(this)}catch(e){}" onended="try{_cvPlayIcon(this)}catch(e){}"'
        +' onloadedmetadata="try{this.playbackRate=parseFloat(this.dataset.rate)||1}catch(e){}"'
        +' ontimeupdate="try{_cvSeekSync(this)}catch(e){}"'
        +' onclick="if(!this.controls){if(this.paused){this.play().catch(function(){})}else{this.pause()};try{_cvPlayIcon(this)}catch(e){}}"'
        +' onerror="try{_vidDiag(this, this.dataset.k)}catch(e){}"></video>'
        +(typeof _cvSeekRowHTML==='function'?_cvSeekRowHTML():'')
        +(typeof _clubPathOverlayHTML==='function'?_clubPathOverlayHTML(dm):'')
        +'</div>'
        +'<div class="vv-speeds pv-speeds">'+'<span>배속</span>'
          +[0.125,0.25,0.5,1].map(function(sp){ return '<button class="vv-sp'+(sp===(isClubV?0.5:1)?' on':'')+'" onclick="_pvRate(this)" data-sp="'+sp+'">'+(sp===1?'1×':String(sp).replace('0.','.')+'×')+'</button>'; }).join('')
        +'</div>';
      if(isMkvOnly){
        vidHtml += '<div class="pv-vm-mkvnote">⚠️ 트랙맨 원본(MKV)은 일부 기기에서 재생이 안 될 수 있어요. 아래 [영상 저장]으로 내려받아 폰의 동영상 앱으로 보세요.</div>';
      }
    } else if(dm._videoPending && (function(){ var t=Date.parse(dm.measuredAt||sm.ts); return !isNaN(t) && Date.now()-t < 5*60000; })()){
      vidHtml='<div class="pv-vm-novid"><div class="pv-vplay" style="width:54px;height:54px;font-size:18px">🎞</div><div class="pv-vm-novid-t">영상 업로드 중...<br><span style="font-size:11px;opacity:.75">약 30초 뒤 다시 열면 재생됩니다</span></div></div>';
    } else {
      vidHtml='<div class="pv-vm-novid"><div class="pv-vplay" style="width:54px;height:54px;font-size:18px">▶</div><div class="pv-vm-novid-t">영상 없음</div></div>';
    }
    html+='<div class="pv-vm on" onclick="if(event.target===this)closePerfShot()">'
      +'<div class="pv-vm-box">'
        +'<div class="pv-vm-vid">'+vidHtml+'</div>'
        +'<div class="pv-vm-info">'
          +'<div class="pv-vm-h"><div class="pv-vm-club">'+(_clubKo(dm.club)||'샷')+(dm._tag==='before'?' <span class="pv-vm-tagb b">BEFORE</span>':(dm._tag==='after'?' <span class="pv-vm-tagb a">AFTER</span>':''))+'</div><div class="pv-vm-date">'+String(sm.ts).slice(0,16).replace('T',' ')+(dm._src==='trackman_io'?' · TrackMan':'')+'</div></div>'
          +(vidUrl?'<button class="pv-dl-btn" onclick="var v=document.querySelector(\'.pv-vm-video\');downloadShotVideo(this, v?v.src:\''+vidUrl+'\', \''+fname+'\')">⬇ 영상 저장</button>':'')
          +'<div class="pv-vm-tiles">'+vmt('캐리', dm.carry!=null?_fmtNum(pfDistFrom(dm.carry,metric)):'—', pfDistU())
            +vmt('토탈', dm.total!=null?_fmtNum(pfDistFrom(dm.total,metric)):'—', pfDistU())
            +vmt('볼 스피드', dm.ballSpeed!=null?_fmtNum(pfSpdFrom(dm.ballSpeed,metric)):'—', pfSpdU())
            +vmt('스매시', dm.smash!=null?dm.smash:'—', '')
          +'</div>'
          +'<div class="pv-vm-params">'+vmp('클럽 스피드', dm.clubSpeed!=null?_fmtNum(pfSpdFrom(dm.clubSpeed,metric)):null, pfSpdU())
            +vmp('발사각', dm.launch!=null?_fmtNum(dm.launch):null, '°')
            +vmp('스핀량', dm.spin!=null?Math.round(dm.spin):null, 'rpm')
            +vmp('클럽 패스', dm.clubPath!=null?(dm.clubPath>0?'+':'')+_fmtNum(dm.clubPath):null, '°')
            +vmp('페이스 앵글', dm.faceAngle!=null?(dm.faceAngle>0?'+':'')+_fmtNum(dm.faceAngle):null, '°')
            +vmp('페이스 투 패스', dm.faceToPath!=null?(dm.faceToPath>0?'+':'')+_fmtNum(dm.faceToPath):null, '°')
            +vmp('어택 앵글', dm.attack!=null?(dm.attack>0?'+':'')+_fmtNum(dm.attack):null, '°')
            +vmp('스핀 축', dm.spinAxis!=null?(dm.spinAxis>0?'+':'')+_fmtNum(dm.spinAxis):null, '°')
            +vmp('낙하 각도', dm.landAngle!=null?_fmtNum(dm.landAngle):null, '°')
          +'</div>'
          +'<button class="pv-vm-close" onclick="closePerfShot()">닫기</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  }
  return html;
}
// 클럽 영문→한글
function _clubKo(c){
  if(!c) return c;
  var map={Driver:'드라이버','3Wood':'3번 우드','5Wood':'5번 우드',Wood:'우드',Hybrid:'하이브리드',
    Iron:'아이언','3Iron':'3번 아이언','4Iron':'4번 아이언','5Iron':'5번 아이언','6Iron':'6번 아이언',
    '7Iron':'7번 아이언','8Iron':'8번 아이언','9Iron':'9번 아이언',Wedge:'웨지',PitchingWedge:'피칭웨지',
    SandWedge:'샌드웨지',Putter:'퍼터'};
  return map[c]||c;
}
