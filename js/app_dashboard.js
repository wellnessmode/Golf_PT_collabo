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
  assess:[{date:'03-01', score:62},{date:'04-05', score:71},{date:'05-23', score:83}],
  shots:[
    {id:'d1', memberId:'demo', memberName:'김서연', ts:'2026-03-08T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:94.2,ballSpeed:134,smash:1.42,carry:182,total:196,launch:11.8,spin:3250,clubPath:-3.1,faceAngle:2.4,attack:-1.8}},
    {id:'d2', memberId:'demo', memberName:'김서연', ts:'2026-04-05T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:97.1,ballSpeed:140,smash:1.44,carry:194,total:210,launch:13.0,spin:2950,clubPath:-1.8,faceAngle:1.5,attack:-0.6}},
    {id:'d3', memberId:'demo', memberName:'김서연', ts:'2026-04-19T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:98.6,ballSpeed:143,smash:1.45,carry:200,total:217,launch:13.5,spin:2820,clubPath:-1.2,faceAngle:1.1,attack:0.2}},
    {id:'d4', memberId:'demo', memberName:'김서연', ts:'2026-05-03T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:100.2,ballSpeed:147,smash:1.467,carry:207,total:225,launch:13.9,spin:2740,clubPath:-0.6,faceAngle:0.8,attack:1.1}},
    {id:'d5', memberId:'demo', memberName:'김서연', ts:'2026-05-17T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:101.4,ballSpeed:150,smash:1.479,carry:213,total:231,launch:14.2,spin:2690,clubPath:-0.2,faceAngle:0.5,attack:1.8}},
    {id:'d6', memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:00:00Z', source:'mock', data:{club:'드라이버',clubSpeed:102.3,ballSpeed:152,smash:1.486,carry:217,total:236,launch:14.4,spin:2650,clubPath:0.1,faceAngle:0.3,attack:2.3}},
    {id:'w1', memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:05:00Z', source:'mock', data:{club:'5번 우드',clubSpeed:96,ballSpeed:140,smash:1.46,carry:200,total:212,launch:14.9,spin:3420,clubPath:0.4,faceAngle:0.5}},
    {id:'i1', memberId:'demo', memberName:'김서연', ts:'2026-05-17T05:10:00Z', source:'mock', data:{club:'7번 아이언',clubSpeed:82,ballSpeed:110,smash:1.34,carry:148,total:156,launch:18.2,spin:6210,clubPath:-0.5,faceAngle:0.3}},
    {id:'i2', memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:12:00Z', source:'mock', data:{club:'7번 아이언',clubSpeed:82.5,ballSpeed:110.3,smash:1.34,carry:152,total:160,launch:18.4,spin:6180,clubPath:-0.4,faceAngle:0.2}},
    {id:'wd1',memberId:'demo', memberName:'김서연', ts:'2026-05-24T05:15:00Z', source:'mock', data:{club:'피칭웨지',clubSpeed:74,ballSpeed:92.4,smash:1.25,carry:105,total:108,launch:26.4,spin:8540,clubPath:1.0,faceAngle:0.5}}
  ]
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
  // 라이브 세션에서 저장된 트랙맨 샷 → 날짜별 평균(드라이버 우선)으로 골프 시계열 보강
  var memberShots=(S.shotEvents||[]).filter(function(s){return s.memberId===memberId;});
  if(memberShots.length){
    var existDates={}; golf.forEach(function(g){existDates[g.date]=true;});
    var byDate={};
    memberShots.forEach(function(s){ var d=String(s.ts).slice(0,10); if(d) (byDate[d]=byDate[d]||[]).push(s); });
    Object.keys(byDate).sort().forEach(function(d){
      var md=d.slice(5); if(existDates[md]) return;
      var arr=byDate[d];
      var drv=arr.filter(function(s){return (s.data&&s.data.club)==='드라이버';});
      var use=drv.length?drv:arr;
      var avg=function(f){var v=use.map(function(s){return parseFloat(s.data&&s.data[f]);}).filter(function(x){return !isNaN(x);}); return v.length?Math.round((v.reduce(function(a,b){return a+b;},0)/v.length)*100)/100:null;};
      golf.push({date:md, club:(drv.length?'드라이버':((use[0].data&&use[0].data.club)||'')),
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
function pfDistU(){ return S.perfUnitDist==='m'?'m':'yd'; }
function pfSpdU(){ return S.perfUnitSpd==='ms'?'m/s':'mph'; }
function setPerfDist(u){ S.perfUnitDist=u; render(); }
function setPerfSpd(u){ S.perfUnitSpd=u; render(); }
function setPerfTextScale(t){ S.perfTextScale=t; render(); }
function printPerf(){ try{ window.print(); }catch(e){} }
function _assessScore(items){
  try{return calcFitness(items||{}).score;}catch(e){return 0;}
}

// ---------- 열기/닫기 ----------
function openPerformance(){ S.perfMember=S.selectedMember; S.perfDemo=false; S.perfClub='driver'; S.perfVidFilter='all'; S.perfShotModal=null; S.showPerformance=true; render(); }
function openDemoPerformance(){ S.perfDemo=true; S.perfClub='driver'; S.perfVidFilter='all'; S.perfShotModal=null; S.showPerformance=true; S.sidebarOpen=false; render(); }
function closePerformance(){ S.showPerformance=false; S.perfDemo=false; S.perfShotModal=null; render(); }
function setPerfClub(c){ S.perfClub=c; render(); }
function setPerfVidFilter(f){ S.perfVidFilter=f; render(); }
function openPerfShot(idx){ S.perfShotModal=idx; render(); }
function closePerfShot(){ S.perfShotModal=null; render(); }

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
  var hasData = (data.golf&&data.golf.length) || (data.pt&&data.pt.length) || (data.shots&&data.shots.length);
  if(!hasData && !S.perfDemo){
    return '<div class="perf-overlay perf-light"><div class="perf-shell"><div class="perf-topbar"><div class="perf-brand"><img src="assets/logo.png" class="perf-logo" alt="">PERFORMANCE REPORT</div><button class="perf-close" onclick="closePerformance()">✕</button></div>'+
      '<div class="perf-empty"><div class="pe-icon">📊</div><div class="pe-title">'+data.member.name+' 회원님 측정 데이터가 아직 없습니다</div><div class="pe-sub">라이브 세션에서 샷을 저장하면<br>이 화면에 성장 리포트가 자동으로 그려집니다.</div><button class="perf-demo-btn" onclick="openDemoPerformance()">상담용 데모 데이터로 미리보기 →</button></div>'+
      '</div></div>';
  }
  var m=data.member;
  var ts=S.perfTextScale||1;
  var locked=_buildLockIn(m, S.sessions[m.id]||[], data.shots||[]);
  var html='<div class="perf-overlay perf-light"><div class="perf-shell perf-v3" style="font-size:'+(15*ts)+'px">';

  // ===== 헤더 =====
  html+='<div class="pv-hd">'
    +'<div class="pv-hd-top">'
      +'<div class="pv-brand">NATIONAL GYM<small>GOLF PT · PERFORMANCE</small></div>'
      +'<div class="pv-ctrls">'
        +'<div class="pv-cg"><span class="pv-l">단위</span><div class="pv-seg"><button class="'+(S.perfUnitDist==='yd'?'on':'')+'" onclick="setPerfDist(\'yd\')">yd</button><button class="'+(S.perfUnitDist==='m'?'on':'')+'" onclick="setPerfDist(\'m\')">m</button></div></div>'
        +'<div class="pv-cg"><span class="pv-l">속도</span><div class="pv-seg"><button class="'+(S.perfUnitSpd==='mph'?'on':'')+'" onclick="setPerfSpd(\'mph\')">mph</button><button class="'+(S.perfUnitSpd==='ms'?'on':'')+'" onclick="setPerfSpd(\'ms\')">m/s</button></div></div>'
        +'<div class="pv-cg"><span class="pv-l">글씨</span><div class="pv-seg"><button class="'+(ts===1?'on':'')+'" onclick="setPerfTextScale(1)">가</button><button class="'+(ts>1&&ts<1.3?'on':'')+'" onclick="setPerfTextScale(1.18)">가+</button><button class="'+(ts>=1.3?'on':'')+'" onclick="setPerfTextScale(1.4)">가++</button></div></div>'
        +'<button class="pv-icbtn" onclick="printPerf()" title="인쇄">🖨</button>'
        +'<button class="pv-icbtn" onclick="closePerformance()" title="닫기">✕</button>'
      +'</div>'
    +'</div>'
    +'<div class="pv-title">PERFORMANCE <span>REPORT</span>'+(S.perfDemo?'<span class="pv-demo">DEMO</span>':'')+'</div>'
    +'<div class="pv-meta">'+(m.registeredDate||'')+' – 현재 · MEASURED BY TRACKMAN iO</div>'
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
      +'<div class="pv-iv-label">⏱ 내셔널짐과 함께한 시간</div>'
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
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>01</i>베스트 샷</div><div class="pv-sec-x">'+(best?_clubKo(bd.club)+' · '+String(best.ts).slice(5,10):'')+'</div></div>'
      +'<div class="pv-kgrid">'
        +'<div class="pv-k hi"><div class="pv-k-l">Carry</div><div class="pv-k-v">'+(bd.carry!=null?_fmtNum(pfDistFrom(bd.carry,bm)):'—')+'<span class="pv-k-u">'+pfDistU()+'</span></div></div>'
        +'<div class="pv-k"><div class="pv-k-l">Ball Speed</div><div class="pv-k-v">'+(bd.ballSpeed!=null?_fmtNum(pfSpdFrom(bd.ballSpeed,bm)):'—')+'<span class="pv-k-u">'+pfSpdU()+'</span></div></div>'
        +'<div class="pv-k"><div class="pv-k-l">Club Speed</div><div class="pv-k-v">'+(bd.clubSpeed!=null?_fmtNum(pfSpdFrom(bd.clubSpeed,bm)):'—')+'<span class="pv-k-u">'+pfSpdU()+'</span></div></div>'
        +'<div class="pv-k hi"><div class="pv-k-l">Smash</div><div class="pv-k-v">'+(bd.smash!=null?_fmtNum(bd.smash):'—')+'</div></div>'
      +'</div>'
      +'<div class="pv-shotcount">총 <strong>'+data.shots.length+'</strong>개 샷 측정됨 · 아래에서 개별 샷·영상 확인</div>'
      +'</div>';
  }

  // ===== 목표 진척 (Lock-in #2) =====
  if(data.golf&&data.golf.length){
    var gL2=data.golf[data.golf.length-1];
    var goalCarry=250, curCarry=gL2.carry||200;
    var pct=Math.min(100, Math.max(0, Math.round((curCarry/goalCarry)*100)));
    var rest=Math.max(0, goalCarry-curCarry);
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>02</i>목표 진척</div><div class="pv-sec-x">12주 사이클</div></div>'
      +'<div class="pv-gl"><div class="pv-gl-h">🎯 다음 단계까지</div>'
        +'<div class="pv-gl-row"><div class="pv-gl-top"><span class="pv-gl-name">드라이버 평균 비거리 '+_fmtNum(pfDist(goalCarry))+' '+pfDistU()+' 돌파</span><span class="pv-gl-val">'+_fmtNum(pfDist(curCarry))+'<span class="un"> '+pfDistU()+'</span></span></div>'
          +'<div class="pv-gl-bar"><div class="pv-gl-fill" style="width:'+pct+'%"></div></div>'
          +'<div class="pv-gl-rest">'+_fmtNum(pfDist(rest))+' '+pfDistU()+' 남음 · 현재 페이스 유지 시 6주 내 달성 예상</div>'
        +'</div>'
        +(m.avgScore?'<div class="pv-gl-row"><div class="pv-gl-top"><span class="pv-gl-name">평균 스코어 90타 깨기</span><span class="pv-gl-val">'+m.avgScore+'<span class="un"> 타</span></span></div><div class="pv-gl-bar"><div class="pv-gl-fill" style="width:'+Math.min(100,Math.max(0,Math.round(100-(parseFloat(m.avgScore)-90)*8)))+'%"></div></div><div class="pv-gl-rest">숏게임 정확도 보강으로 달성 가능</div></div>':'')
      +'</div></div>';
  }

  // ===== 클럽별 평균 (탭) =====
  if(data.shots&&data.shots.length){
    var avgs=_buildClubAverages(data.shots);
    var curG=S.perfClub||'driver'; if(!avgs[curG]||avgs[curG].n===0){curG=['driver','wood','iron','wedge'].find(function(g){return avgs[g]&&avgs[g].n>0;})||'driver';}
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>03</i>클럽별 평균</div><div class="pv-sec-x">TrackMan 측정값</div></div>'
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
        +rowfn('Club Speed', a.clubSpeed!=null?pfSpdFrom(a.clubSpeed,am):null, pfSpdU(),1)
        +rowfn('Ball Speed', a.ballSpeed!=null?pfSpdFrom(a.ballSpeed,am):null, pfSpdU(),1)
        +rowfn('Smash', a.smash, '',2)
        +rowfn('Carry', a.carry!=null?pfDistFrom(a.carry,am):null, pfDistU(),0)
        +rowfn('Total', a.total!=null?pfDistFrom(a.total,am):null, pfDistU(),0)
        +rowfn('Launch', a.launch, '°',1)
        +rowfn('Spin', a.spin, 'rpm',0)
        +rowfn('Club Path', a.clubPath, '°',1)
        +rowfn('Face Angle', a.faceAngle, '°',1)
        +'</tbody></table>';
    } else { html+='<div class="pv-empty">해당 클럽 측정 데이터가 아직 없습니다</div>'; }
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
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>04</i>측정 샷 · 영상</div><div class="pv-sec-x">'+list.length+'개 표시</div></div>'
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
        var isBest=(parseFloat(d.carry)||0)>=maxCarry*0.97;
        var dateStr=String(s.ts).slice(5,10);
        var hasVid=!!s.videoR2Key;
        html+='<div class="pv-vcard" onclick="openPerfShot('+idx+')"><div class="pv-vthumb">'
          +(isBest?'<span class="pv-vbest">BEST</span>':'')
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

  // ===== 비포/애프터 (Lock-in #3) =====
  var ba=data.shots? _findBeforeAfter(data.shots) : null;
  if(ba){
    var bC=parseFloat(ba.before.data&&ba.before.data.carry)||0, aC=parseFloat(ba.after.data&&ba.after.data.carry)||0;
    var diff=aC-bC, pctChg=bC>0?Math.round((diff/bC)*100*10)/10:0;
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>05</i>변화의 증거</div><div class="pv-sec-x">처음 vs 현재</div></div>'
      +'<div class="pv-bna-h">⏮ BEFORE  ·  AFTER ⏭</div>'
      +'<div class="pv-bna">'
        +'<div class="pv-bna-col"><div class="pv-bna-thumb"><span class="pv-bna-tag">BEFORE</span><div class="pv-vplay">▶</div></div>'
          +'<div class="pv-bna-stats"><div class="pv-bna-date">'+String(ba.before.ts).slice(0,10)+'</div><div class="pv-bna-val">'+_fmtNum(pfDist(bC))+' <span>'+pfDistU()+'</span></div></div></div>'
        +'<div class="pv-bna-arr">→</div>'
        +'<div class="pv-bna-col after"><div class="pv-bna-thumb"><span class="pv-bna-tag">AFTER</span><div class="pv-vplay">▶</div></div>'
          +'<div class="pv-bna-stats"><div class="pv-bna-date">'+String(ba.after.ts).slice(0,10)+'</div><div class="pv-bna-val">'+_fmtNum(pfDist(aC))+' <span>'+pfDistU()+'</span></div></div></div>'
      +'</div>'
      +(diff>0?'<div class="pv-bna-delta"><span>드라이버 캐리 변화</span><b>+'+_fmtNum(pfDist(diff))+' '+pfDistU()+' · +'+pctChg+'%</b></div>':'')
    +'</div>';
  }

  // ===== PT 보조 (보존: 기존 기능) =====
  if(data.pt&&data.pt.length){
    var exNames={}; data.pt.forEach(function(s){(s.sets||[]).forEach(function(st){exNames[st.exercise]=true;});});
    var exList=Object.keys(exNames).slice(0,4);
    var ptLabels=data.pt.map(function(x){return x.date;});
    function exWeight(sess,ex){var f=(sess.sets||[]).find(function(st){return st.exercise===ex;});return f?f.weight:null;}
    html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>06</i>근력 향상 · Golf PT</div></div>';
    if(exList.length>0){
      var series=exList.map(function(ex,i){return {name:ex, color:['#0a0c0f','#5b616a','#9aa0a8','#c8cdd3'][i%4], values:data.pt.map(function(s){return exWeight(s,ex)||0;})};});
      html+='<div class="pv-chart">'+svgMultiLine(series,ptLabels,{w:560,h:180})+'</div>';
    }
    html+='</div>';
  }

  // ===== 다음 사이클 (Lock-in #6) =====
  html+='<div class="pv-sec"><div class="pv-sec-h"><div class="pv-sec-t"><i>07</i>다음 12주 계획</div></div>'
    +'<div class="pv-next">'
      +'<div class="pv-nx-h">시즌 챌린지 · 진행 중</div>'
      +'<div class="pv-nx-grid">'
        +'<div class="pv-nx"><div class="v">'+_fmtNum(pfDist(250))+'<span class="u"> '+pfDistU()+'</span></div><div class="l">드라이버 평균</div></div>'
        +'<div class="pv-nx"><div class="v">89<span class="u"> 타</span></div><div class="l">평균 스코어</div></div>'
        +'<div class="pv-nx"><div class="v">±1<span class="u">°</span></div><div class="l">Face to Path</div></div>'
      +'</div>'
      +'<div class="pv-nx-note">권장 일정 · 골프 PT <b>주 2회 × 12주 = 24회</b> · 트랙맨 측정 <b>월 1회 정밀</b>.</div>'
    +'</div></div>';

  // ===== CTA (Lock-in #5, #7) =====
  html+='<div class="pv-sec"><div class="pv-cta-wrap">'
    +'<div class="pv-cta primary"><div class="pv-cta-ic">📅</div><div><div class="pv-cta-t">다음 레슨 예약</div><div class="pv-cta-s">담당 지도자에게 안내</div></div></div>'
    +'<div class="pv-cta"><div class="pv-cta-ic">📤</div><div><div class="pv-cta-t">친구에게 공유</div><div class="pv-cta-s">변화 자랑하기</div></div></div>'
  +'</div></div>';

  // ===== 푸터 =====
  html+='<div class="pv-foot">본 리포트의 모든 탄도 데이터는 <b>TRACKMAN iO</b> 로 측정되었으며 담당 지도자 분석과 함께 작성되었습니다.<br><span>측정 베이스라인 · 영상 자산 · 코칭 이력은 <b>내셔널짐</b>에 누적되어 회원님의 다음 단계 진단에 활용됩니다.</span></div>';
  html+='</div></div>';

  // ===== 샷 상세 모달 (개별 샷 — 실제 영상 + 전체 트랙맨 지표) =====
  if(S.perfShotModal!=null && data.shots && data.shots[S.perfShotModal]){
    var sm=data.shots[S.perfShotModal], dm=sm.data||{};
    var metric=_isMetricShot(dm);
    var vmt=function(l,v,u){return '<div class="pv-vmt"><div class="l">'+l+'</div><div class="v">'+(v==null?'—':v)+(u?'<span class="u"> '+u+'</span>':'')+'</div></div>';};
    var vmp=function(l,v,u){return '<div class="pv-vmp"><span>'+l+'</span><b>'+(v==null?'—':v)+(u?' '+u:'')+'</b></div>';};
    // 영상: R2 키가 있으면 실제 영상 재생, 없으면 플레이스홀더
    var vidUrl=(sm.videoR2Key && typeof r2!=='undefined' && r2.enabled)? r2.url(sm.videoR2Key) : '';
    var vidHtml;
    if(vidUrl){
      var isMkv=/\.mkv$/i.test(sm.videoR2Key);
      vidHtml='<video class="pv-vm-video" src="'+vidUrl+'" controls playsinline preload="metadata"></video>'
        +(isMkv?'<div class="pv-vm-mkvnote">⚠️ 트랙맨 원본(MKV)은 일부 기기에서 재생이 안 될 수 있어요. <a href="'+vidUrl+'" download>영상 내려받기</a></div>':'');
    } else {
      vidHtml='<div class="pv-vm-novid"><div class="pv-vplay" style="width:54px;height:54px;font-size:18px">▶</div><div class="pv-vm-novid-t">영상 없음</div></div>';
    }
    html+='<div class="pv-vm on" onclick="if(event.target===this)closePerfShot()">'
      +'<div class="pv-vm-box">'
        +'<div class="pv-vm-vid">'+vidHtml+'</div>'
        +'<div class="pv-vm-info">'
          +'<div class="pv-vm-h"><div class="pv-vm-club">'+(_clubKo(dm.club)||'샷')+'</div><div class="pv-vm-date">'+String(sm.ts).slice(0,16).replace('T',' ')+(dm._src==='trackman_io'?' · TrackMan':'')+'</div></div>'
          +'<div class="pv-vm-tiles">'+vmt('Carry', dm.carry!=null?_fmtNum(pfDistFrom(dm.carry,metric)):'—', pfDistU())
            +vmt('Total', dm.total!=null?_fmtNum(pfDistFrom(dm.total,metric)):'—', pfDistU())
            +vmt('Ball', dm.ballSpeed!=null?_fmtNum(pfSpdFrom(dm.ballSpeed,metric)):'—', pfSpdU())
            +vmt('Smash', dm.smash!=null?dm.smash:'—', '')
          +'</div>'
          +'<div class="pv-vm-params">'+vmp('Club Speed', dm.clubSpeed!=null?_fmtNum(pfSpdFrom(dm.clubSpeed,metric)):null, pfSpdU())
            +vmp('Launch', dm.launch, '°')
            +vmp('Spin', dm.spin, 'rpm')
            +vmp('Club Path', dm.clubPath!=null?(dm.clubPath>0?'+':'')+dm.clubPath:null, '°')
            +vmp('Face Angle', dm.faceAngle!=null?(dm.faceAngle>0?'+':'')+dm.faceAngle:null, '°')
            +vmp('Face to Path', dm.faceToPath!=null?(dm.faceToPath>0?'+':'')+dm.faceToPath:null, '°')
            +vmp('Attack', dm.attack!=null?(dm.attack>0?'+':'')+dm.attack:null, '°')
            +vmp('Spin Axis', dm.spinAxis!=null?(dm.spinAxis>0?'+':'')+dm.spinAxis:null, '°')
            +vmp('Land Angle', dm.landAngle, '°')
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
