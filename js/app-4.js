
// ============ 이벤트 핸들러 ============
function selectMember(id){S.selectedMember=id; S.filterAuthor='all'; S.sidebarOpen=false; render();}
function toggleAssess(){S.assessOpen=!S.assessOpen; render();}
function toggleWarningBanner(){S.warningBannerCollapsed=!S.warningBannerCollapsed; render();}
function setFilter(f){S.filterAuthor=f; render();}
function openAddSession(){S.newSession={date:today(),author:S.currentUser||'',content:'',media:[],mediaUrls:['','']}; S.showAddSession=true; render();}

// ============ 운동 빠른추가 픽커 ============
function openExercisePicker(){
  S.exercisePicker = {open:true, query:'', category:'all', selected:[]};
  render();
  setTimeout(function(){
    var inp = document.querySelector('.ex-picker-search input');
    if(inp) inp.focus();
  }, 50);
}
function closeExercisePicker(){
  S.exercisePicker.open = false;
  render();
}
function updateExerciseQuery(v){
  S.exercisePicker.query = v;
  render();
  setTimeout(function(){
    var inp = document.querySelector('.ex-picker-search input');
    if(inp){ inp.focus(); var l=inp.value.length; try{inp.setSelectionRange(l,l);}catch(e){} }
  }, 10);
}
function setExerciseCategory(c){
  S.exercisePicker.category = c;
  render();
}
function toggleExerciseSelect(idx){
  var ex = EXERCISES[idx];
  if(!ex) return;
  var list = S.exercisePicker.selected;
  var found = list.findIndex(function(x){return x.n===ex.n;});
  if(found >= 0){
    list.splice(found, 1);
  } else {
    list.push({n:ex.n, s:ex.s, sets:ex.ds, reps:ex.dr, u:ex.u});
  }
  render();
}
function updateSelectedEx(i, key, v){
  var item = S.exercisePicker.selected[i];
  if(!item) return;
  var n = parseInt(v, 10);
  if(isFinite(n) && n>0) item[key] = n;
  // 재렌더 없이 값만 업데이트 — 입력 포커스 유지 위해
}
function removeSelectedEx(i){
  S.exercisePicker.selected.splice(i, 1);
  render();
}
function applyExercisePicker(){
  var sel = S.exercisePicker.selected;
  if(!sel.length){ closeExercisePicker(); return; }
  var lines = sel.map(function(x){
    var unit = x.u==='sec'?'초':x.u==='min'?'분':'회';
    return '• '+x.n+' ('+x.s+') '+x.sets+'×'+x.reps+unit;
  });
  var existing = (S.newSession.content||'').trim();
  S.newSession.content = existing ? (existing + '\n' + lines.join('\n')) : lines.join('\n');
  closeExercisePicker();
}

function renderExercisePicker(){
  if(!S.exercisePicker || !S.exercisePicker.open) return '';
  var p = S.exercisePicker;
  var filtered = EXERCISES.map(function(ex, i){return {ex:ex, i:i};}).filter(function(x){
    if(p.category!=='all' && x.ex.c!==p.category) return false;
    return matchExercise(x.ex, p.query);
  });
  var catCounts = {all:EXERCISES.length, weight:0, golf_fit:0, golf_skill:0};
  EXERCISES.forEach(function(e){ catCounts[e.c] = (catCounts[e.c]||0)+1; });
  return '<div class="modal-overlay ex-picker-overlay" onclick="if(event.target===this)closeExercisePicker()">'+
    '<div class="modal ex-picker">'+
      '<div class="ex-picker-hd">'+
        '<div class="ex-picker-title">운동 빠른추가</div>'+
        '<button class="modal-close" onclick="closeExercisePicker()">×</button>'+
      '</div>'+
      '<div class="ex-picker-search">'+
        '<input class="form-input" placeholder="이름/부위/영문 검색 (예: 스쿼트, 하체, squat, ㅅㅋㅌ)" value="'+(p.query||'').replace(/"/g,'&quot;')+'" oninput="updateExerciseQuery(this.value)">'+
      '</div>'+
      '<div class="ex-picker-tabs">'+
        '<button class="ex-tab '+(p.category==='all'?'active':'')+' " onclick="setExerciseCategory(\'all\')">전체 <span>'+catCounts.all+'</span></button>'+
        '<button class="ex-tab '+(p.category==='weight'?'active':'')+' " onclick="setExerciseCategory(\'weight\')">웨이트 <span>'+catCounts.weight+'</span></button>'+
        '<button class="ex-tab '+(p.category==='golf_fit'?'active':'')+' " onclick="setExerciseCategory(\'golf_fit\')">골프피트 <span>'+catCounts.golf_fit+'</span></button>'+
        '<button class="ex-tab '+(p.category==='golf_skill'?'active':'')+' " onclick="setExerciseCategory(\'golf_skill\')">골프스킬 <span>'+catCounts.golf_skill+'</span></button>'+
      '</div>'+
      '<div class="ex-picker-list">'+
        (filtered.length===0 ?
          '<div class="ex-empty">검색 결과가 없습니다</div>' :
          filtered.map(function(o){
            var ex = o.ex;
            var sel = p.selected.find(function(x){return x.n===ex.n;});
            var diff = ['', '초급', '중급', '고급'][ex.d||1];
            return '<div class="ex-item'+(sel?' selected':'')+'" onclick="toggleExerciseSelect('+o.i+')">'+
              '<div class="ex-col">'+
                '<div class="ex-name">'+ex.n+'</div>'+
                '<div class="ex-meta"><span class="ex-sub">'+ex.s+'</span> · '+ex.f+'</div>'+
              '</div>'+
              '<div class="ex-right">'+
                '<div class="ex-diff d'+(ex.d||1)+'">'+diff+'</div>'+
                (sel ? '<div class="ex-check">✓</div>' : '')+
              '</div>'+
            '</div>';
          }).join('')
        )+
      '</div>'+
      (p.selected.length>0 ?
        '<div class="ex-selected-box">'+
          '<div class="ex-selected-title">선택된 '+p.selected.length+'개</div>'+
          p.selected.map(function(s, i){
            var unit = s.u==='sec'?'초':s.u==='min'?'분':'회';
            return '<div class="ex-sel-row">'+
              '<span class="ex-sel-name">'+s.n+'</span>'+
              '<input class="ex-sel-num" type="number" value="'+s.sets+'" min="1" max="99" onchange="updateSelectedEx('+i+',\'sets\',this.value)">'+
              '<span class="ex-sel-x">세트 ×</span>'+
              '<input class="ex-sel-num" type="number" value="'+s.reps+'" min="1" max="999" onchange="updateSelectedEx('+i+',\'reps\',this.value)">'+
              '<span class="ex-sel-x">'+unit+'</span>'+
              '<button class="ex-sel-rm" onclick="event.stopPropagation();removeSelectedEx('+i+')">×</button>'+
            '</div>';
          }).join('')+
        '</div>' : ''
      )+
      '<div class="ex-picker-ft">'+
        '<button class="btn" onclick="closeExercisePicker()">취소</button>'+
        '<button class="btn primary"'+(p.selected.length===0?' disabled':'')+' onclick="applyExercisePicker()">선택 '+p.selected.length+'개 추가</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function openAddMember(){S.newMember={name:'',phone:'',email:'',registeredDate:today(),golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',golfLessonExpiry:'',golfPTExpiry:'',assignedTo:[],memberType:S.sidebarTab||'pt_lesson',handicap:'',avgScore:'',goal:'',focusPoints:''}; S.editMemberId=null; S.showAddMember=true; render();}
function toggleAssign(name){
  var arr=S.newMember.assignedTo||[];
  var idx=arr.indexOf(name);
  if(idx===-1) arr.push(name); else arr.splice(idx,1);
  S.newMember.assignedTo=arr; render();
}
function openEditMember(id){
  var m=S.members.find(function(x){return x.id===id;});
  if(!m)return;
  S.newMember={
    name:m.name, phone:m.phone||'', email:m.email||'',
    registeredDate:m.registeredDate||'',
    golfLessonCount:m.golfLessonCount||'', golfPTCount:m.golfPTCount||'',
    golfLessonAmount:m.golfLessonAmount||'', golfPTAmount:m.golfPTAmount||'',
    expiry:m.expiry||'',
    golfLessonExpiry:m.golfLessonExpiry||m.expiry||'',
    golfPTExpiry:m.golfPTExpiry||'',
    assignedTo:(m.assignedTo||[]).slice(),
    memberType:m.memberType||'pt_lesson',
    handicap:m.handicap||'', avgScore:m.avgScore||'',
    goal:m.goal||'', focusPoints:m.focusPoints||''
  };
  S.editMemberId=id; S.showAddMember=true; render();
}
function saveMemberEdit(){
  var nm=S.newMember.name.trim();if(!nm){alert('이름을 입력하세요');return;}
  var m=S.members.find(function(x){return x.id===S.editMemberId;});
  if(!m)return;
  var before={name:m.name,phone:m.phone,email:m.email,expiry:m.expiry};
  var oldAssigned = (m.assignedTo||[]).slice();
  m.name=nm;m.phone=S.newMember.phone;m.email=S.newMember.email;
  m.registeredDate=S.newMember.registeredDate;
  m.golfLessonCount=S.newMember.golfLessonCount;m.golfPTCount=S.newMember.golfPTCount;
  m.golfLessonAmount=S.newMember.golfLessonAmount;m.golfPTAmount=S.newMember.golfPTAmount;
  m.expiry=S.newMember.expiry;
  m.golfLessonExpiry=S.newMember.golfLessonExpiry||'';
  m.golfPTExpiry=S.newMember.golfPTExpiry||'';
  m.assignedTo=S.newMember.assignedTo||[];
  m.memberType=S.newMember.memberType||'pt_lesson';
  m.handicap=S.newMember.handicap;m.avgScore=S.newMember.avgScore;
  m.goal=S.newMember.goal;m.focusPoints=S.newMember.focusPoints;
  // 담당자 변경 감지 → 인수인계 자동 생성
  var newAssigned = m.assignedTo;
  var removed = oldAssigned.filter(function(n){return newAssigned.indexOf(n)===-1;});
  var added = newAssigned.filter(function(n){return oldAssigned.indexOf(n)===-1;});
  if(removed.length>0 || added.length>0){
    generateHandover(S.editMemberId, removed.length>0?removed:oldAssigned, added.length>0?added:newAssigned);
  }
  var editId = S.editMemberId;
  S.editMemberId=null; S.showAddMember=false;
  logActivity('회원 수정', editId, nm);
  logAudit('member','회원 수정',nm,{before:before,after:{name:m.name,phone:m.phone,email:m.email,expiry:m.expiry}});
  save(); render(); cloud.upsertMember(m);
}
// ============ 인수인계 시스템 ============
function generateHandover(memberId, removedInstructors, addedInstructors){
  var m = S.members.find(function(x){return x.id===memberId;});
  if(!m) return;
  var allSess = (S.sessions[memberId]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var assess = S.assessments[memberId]||{};
  // 최근 10개 세션 요약
  var recentSessions = allSess.slice(0,10).map(function(s){
    return s.date+' ('+s.author+'): '+s.content.slice(0,80)+(s.content.length>80?'…':'');
  });
  // 체형평가 경고 항목
  var warnings = ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && (v.result==='제한'||v.result==='주의 필요');
  }).map(function(item){
    return item.name+' ['+assess[item.key].result+'] → '+(BODY_SWING_MAP[item.key]||'');
  });
  // 체형평가 요약 (비정상 항목만)
  var assessSummary = ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && v.result && v.result!=='미검사' && v.result!=='정상';
  }).map(function(item){
    var v = assess[item.key];
    return item.name+': '+v.result+(v.note?' ('+v.note+')':'');
  });
  // 스윙 영상 링크 (최근 세션에서 영상 포함된 것)
  var videoSessions = allSess.filter(function(s){return s.media && s.media.length>0;}).slice(0,5);
  var videoLinks = videoSessions.map(function(s){
    return s.date+' ('+s.author+') — 영상 '+s.media.length+'개';
  });
  var summary = {
    memberName: m.name,
    date: today(),
    from: removedInstructors,
    to: addedInstructors,
    totalSessions: allSess.length,
    proSessions: allSess.filter(function(s){return getRole(s.author)==='pro';}).length,
    trainerSessions: allSess.filter(function(s){return getRole(s.author)==='trainer';}).length,
    recentSessions: recentSessions,
    assessDate: assess._date||'미기록',
    assessSummary: assessSummary,
    warnings: warnings,
    videoLinks: videoLinks
  };
  if(!S.handovers[memberId]) S.handovers[memberId] = [];
  S.handovers[memberId].push(summary);
  logActivity('인수인계 생성', memberId, removedInstructors.join(',')+' → '+addedInstructors.join(','));
  save();
}
function openHandover(memberId){S.showHandover=memberId; render();}
function closeHandover(){S.showHandover=null; render();}
function renderHandoverModal(){
  var mid = S.showHandover;
  if(!mid) return '';
  var list = (S.handovers[mid]||[]).slice().reverse();
  if(list.length===0) return '';
  return `<div class="modal-overlay" onclick="if(event.target===this)closeHandover()">
    <div class="modal" style="width:600px;max-height:90vh;overflow-y:auto">
      <div class="modal-title">인수인계 기록 — ${list[0].memberName}</div>
      ${list.map(function(h,i){
        return '<div class="handover-card'+(i===0?' latest':'')+'">' +
          '<div class="ho-header">' +
            '<span class="ho-date">'+h.date+'</span>' +
            '<span class="ho-badge">'+h.from.join(', ')+' → '+h.to.join(', ')+'</span>' +
          '</div>' +
          '<div class="ho-section"><strong>세션 현황:</strong> 총 '+h.totalSessions+'회 (프로 '+h.proSessions+' / PT '+h.trainerSessions+')</div>' +
          (h.warnings.length>0?'<div class="ho-section ho-warn"><strong>Body-Swing 주의 항목:</strong><ul>'+h.warnings.map(function(w){return '<li>'+w+'</li>';}).join('')+'</ul></div>':'') +
          (h.assessSummary.length>0?'<div class="ho-section"><strong>체형평가 이상 소견 ('+h.assessDate+'):</strong><ul>'+h.assessSummary.map(function(a){return '<li>'+a+'</li>';}).join('')+'</ul></div>':'') +
          '<div class="ho-section"><strong>최근 세션 (최대 10개):</strong><ol>'+h.recentSessions.map(function(s){return '<li>'+s+'</li>';}).join('')+'</ol></div>' +
          (h.videoLinks.length>0?'<div class="ho-section"><strong>최근 스윙 영상:</strong><ul>'+h.videoLinks.map(function(v){return '<li>'+v+'</li>';}).join('')+'</ul></div>':'') +
        '</div>';
      }).join('<hr style="border:none;border-top:1px dashed #ddd;margin:16px 0">')}
      <div class="modal-actions"><button class="btn" onclick="closeHandover()">닫기</button></div>
    </div>
  </div>`;
}

// ============ 회원 리포트 (HTML → 인쇄/PDF) ============
// ============ 간편 레슨 노트 ============
const LESSON_TAGS = ['드라이버','우드','아이언','웨지','퍼팅','숏게임','벙커','어프로치','그립','셋업','백스윙','다운스윙','임팩트','피니시','템포','멘탈'];
function openQuickNote(){
  S.showQuickNote=true;
  S.quickNote={date:today(),memo:'',tags:[],author:S.currentUser||''};
  render();
}
function closeQuickNote(){S.showQuickNote=false;render();}
function toggleQTag(tag){
  var idx=S.quickNote.tags.indexOf(tag);
  if(idx===-1) S.quickNote.tags.push(tag); else S.quickNote.tags.splice(idx,1);
  render();
}
function saveQuickNote(){
  if(!S.quickNote.memo.trim()){alert('메모를 입력하세요');return;}
  var mid=S.selectedMember;
  if(!S.sessions[mid]) S.sessions[mid]=[];
  var tagStr=S.quickNote.tags.length>0?' #'+S.quickNote.tags.join(' #'):'';
  var s={
    id:suid(), date:S.quickNote.date, author:S.quickNote.author,
    content:S.quickNote.memo.trim()+tagStr,
    _addedAt:new Date().toISOString(), _quickNote:true
  };
  S.sessions[mid].push(s);
  logActivity('레슨 노트',mid,s.content.slice(0,40));
  save(); S.showQuickNote=false; render();
  cloud.upsertSession(mid,s);
}
function renderQuickNoteModal(){
  if(!S.showQuickNote) return '';
  var m=S.members.find(function(x){return x.id===S.selectedMember;});
  return `<div class="modal-overlay" onclick="if(event.target===this)closeQuickNote()">
    <div class="modal" style="width:440px">
      <div class="modal-title">레슨 노트 — ${m?m.name+' 회원님':''}</div>
      <div class="form-group">
        <label class="form-label">날짜</label>
        <input type="date" class="form-input" value="${S.quickNote.date}" onchange="S.quickNote.date=this.value">
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" rows="3" placeholder="오늘 레슨 내용을 간단히..." oninput="S.quickNote.memo=this.value" autofocus>${S.quickNote.memo}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">태그</label>
        <div class="qtag-grid">${LESSON_TAGS.map(function(t){
          var sel=S.quickNote.tags.indexOf(t)!==-1;
          return '<span class="qtag'+(sel?' sel':'')+'" onclick="toggleQTag(\''+t+'\')">' +t+'</span>';
        }).join('')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeQuickNote()">취소</button>
        <button class="btn primary" onclick="saveQuickNote()">저장</button>
      </div>
    </div>
  </div>`;
}

// ============ 이미지 카드 (카카오톡 공유용) ============
function openImageCard(){S.showImageCard=true;render();}
function closeImageCard(){S.showImageCard=false;render();}
function generateImageCard(){
  var mid=S.selectedMember;
  var m=S.members.find(function(x){return x.id===mid;});
  if(!m) return;
  var allSess=(S.sessions[mid]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var thisMonth=today().slice(0,7);
  var monthSess=allSess.filter(function(s){return s.date.slice(0,7)===thisMonth;});
  var canvas=document.createElement('canvas');
  canvas.width=720; canvas.height=960;
  var ctx=canvas.getContext('2d');
  // 배경
  ctx.fillStyle='#f5f5f0'; ctx.fillRect(0,0,720,960);
  // 상단 바
  ctx.fillStyle='#1a3d2b'; ctx.fillRect(0,0,720,120);
  ctx.fillStyle='#fff'; ctx.font='bold 28px -apple-system,sans-serif';
  ctx.fillText('내셔널짐 Golf Lesson',40,50);
  ctx.font='16px -apple-system,sans-serif';
  ctx.fillText('월간 레슨 리포트 · '+today(),40,85);
  // 회원 정보
  var y=160;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 32px -apple-system,sans-serif';
  ctx.fillText(m.name+' 회원님',40,y); y+=45;
  ctx.fillStyle='#555'; ctx.font='18px -apple-system,sans-serif';
  if(m.handicap||m.avgScore){
    ctx.fillText('HC '+(m.handicap||'-')+' · 평균 '+(m.avgScore||'-')+'타',40,y); y+=35;
  }
  if(m.goal){
    ctx.fillText('목표: '+m.goal,40,y); y+=35;
  }
  if(m.focusPoints){
    ctx.fillText('교정: '+m.focusPoints,40,y); y+=35;
  }
  // 구분선
  y+=10;
  ctx.strokeStyle='#d4cfc4'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(680,y); ctx.stroke(); y+=30;
  // 이번 달 레슨
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 22px -apple-system,sans-serif';
  ctx.fillText('이번 달 레슨: '+monthSess.length+'회',40,y); y+=35;
  ctx.fillStyle='#333'; ctx.font='16px -apple-system,sans-serif';
  var shownSess=monthSess.slice(0,6);
  shownSess.forEach(function(s){
    var line=s.date.slice(5)+' — '+s.content.slice(0,40)+(s.content.length>40?'…':'');
    ctx.fillText(line,50,y); y+=28;
  });
  if(monthSess.length>6){ctx.fillText('... 외 '+(monthSess.length-6)+'건',50,y); y+=28;}
  // 구분선
  y+=10;
  ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(680,y); ctx.stroke(); y+=30;
  // 전체 레슨 현황
  var totalUsed=allSess.length;
  var totalReg=parseInt(m.golfLessonCount)||0;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 20px -apple-system,sans-serif';
  ctx.fillText('전체 진행: '+totalUsed+' / '+totalReg+'회',40,y); y+=30;
  // 진행률 바
  var pct=totalReg>0?Math.min(1,totalUsed/totalReg):0;
  ctx.fillStyle='#e0ddc8'; roundRect(ctx,40,y,640,20,10); ctx.fill();
  ctx.fillStyle='#2d7a4f'; roundRect(ctx,40,y,Math.max(20,640*pct),20,10); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 12px -apple-system,sans-serif';
  ctx.fillText(Math.round(pct*100)+'%',40+640*pct/2-10,y+15); y+=45;
  // 하단
  ctx.fillStyle='#999'; ctx.font='13px -apple-system,sans-serif';
  ctx.fillText('내셔널짐 Golf PT Collaboration · '+today(),40,920);
  // 다운로드
  canvas.toBlob(function(blob){
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download=m.name+'_레슨카드_'+today()+'.png';
    a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},200);
  },'image/png');
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function renderImageCardModal(){
  if(!S.showImageCard) return '';
  var m=S.members.find(function(x){return x.id===S.selectedMember;});
  if(!m) return '';
  return `<div class="modal-overlay" onclick="if(event.target===this)closeImageCard()">
    <div class="modal" style="width:400px">
      <div class="modal-title">이미지 카드 생성</div>
      <p style="font-size:13px;color:#555;margin-bottom:16px">${m.name} 회원님의 월간 레슨 리포트를 이미지로 다운로드합니다.<br>길게 눌러 카카오톡으로 공유하세요.</p>
      <div class="modal-actions">
        <button class="btn" onclick="closeImageCard()">취소</button>
        <button class="btn primary" onclick="generateImageCard();closeImageCard()">📥 이미지 다운로드</button>
      </div>
    </div>
  </div>`;
}

function openReport(){S.showReport=true; render();}
function closeReport(){S.showReport=false; render();}
function printReport(){
  var el = document.getElementById('report-print-area');
  if(!el) return;
  var win = window.open('','_blank','width=800,height=1100');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>회원 리포트</title>');
  win.document.write('<style>');
  win.document.write('*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;padding:30px;color:#222;font-size:13px;line-height:1.6}');
  win.document.write('.rpt-header{text-align:center;border-bottom:2px solid #2d5016;padding-bottom:15px;margin-bottom:20px}');
  win.document.write('.rpt-header h1{font-size:20px;color:#2d5016}.rpt-header p{font-size:12px;color:#666}');
  win.document.write('.rpt-member-info{background:#f5f5f0;padding:14px;border-radius:8px;margin-bottom:18px}');
  win.document.write('.rpt-member-info td{padding:3px 12px 3px 0;font-size:13px}');
  win.document.write('.rpt-section{margin-bottom:18px}.rpt-section h2{font-size:15px;color:#2d5016;border-bottom:1px solid #ccc;padding-bottom:5px;margin-bottom:8px}');
  win.document.write('table.rpt-table{width:100%;border-collapse:collapse;font-size:12px}');
  win.document.write('table.rpt-table th,table.rpt-table td{border:1px solid #ddd;padding:5px 8px;text-align:left}');
  win.document.write('table.rpt-table th{background:#eee8d5;font-weight:600}');
  win.document.write('.warn-row{background:#fff3e0}.rpt-footer{margin-top:30px;text-align:center;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:10px}');
  win.document.write('@media print{body{padding:15px}@page{margin:15mm}}');
  win.document.write('</style></head><body>');
  win.document.write(el.innerHTML);
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function(){win.print();},300);
}
function renderReportModal(){
  if(!S.showReport) return '';
  var mid = S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m) return '';
  var allSess = (S.sessions[mid]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var assess = S.assessments[mid]||{};
  var st = stats(mid);
  var recentSess = allSess.slice(0,20);
  var assessRows = ASSESSMENT_ITEMS.map(function(item){
    var v = assess[item.key]||{result:'미검사',note:''};
    var isWarn = v.result!=='정상'&&v.result!=='미검사';
    return '<tr class="'+(isWarn?'warn-row':'')+'"><td>'+item.name+'</td><td>'+v.result+'</td><td>'+(v.note||'-')+'</td>'+(isWarn&&BODY_SWING_MAP[item.key]?'<td style="font-size:11px;color:#993c1d">'+BODY_SWING_MAP[item.key]+'</td>':'<td>-</td>')+'</tr>';
  }).join('');
  var sessionRows = recentSess.map(function(s){
    return '<tr><td>'+s.date+'</td><td><span style="font-weight:600;color:'+(getRole(s.author)==='pro'?'#3a72c0':'#2d7a4f')+'">'+(getRole(s.author)==='pro'?'프로':'PT')+'</span> '+s.author+'</td><td>'+s.content.replace(/</g,'&lt;').slice(0,120)+(s.content.length>120?'…':'')+'</td></tr>';
  }).join('');

  return `<div class="modal-overlay" onclick="if(event.target===this)closeReport()">
    <div class="modal" style="width:720px;max-height:90vh;overflow-y:auto">
      <div class="modal-title">회원 리포트</div>
      <div id="report-print-area">
        <div class="rpt-header">
          <h1>내셔널짐 Golf PT 회원 리포트</h1>
          <p>출력일: ${today()} | 담당: ${(m.assignedTo||[]).join(', ')||'미배정'}</p>
        </div>
        <div class="rpt-member-info">
          <table><tr><td><strong>회원명</strong></td><td>${m.name}</td><td><strong>연락처</strong></td><td>${m.phone||'-'}</td></tr>
          <tr><td><strong>등록일</strong></td><td>${m.registeredDate||'-'}</td><td><strong>레슨 유효기간</strong></td><td>${m.golfLessonExpiry||m.expiry||'-'}</td></tr>
          ${(m.memberType||'pt_lesson')==='pt_lesson'?'<tr><td></td><td></td><td><strong>PT 유효기간</strong></td><td>'+(m.golfPTExpiry||'-')+'</td></tr>':''}
          <tr><td><strong>골프 레슨</strong></td><td>${st?st.pro:0}/${m.golfLessonCount||0}회</td><td><strong>골프 PT</strong></td><td>${st?st.trainer:0}/${m.golfPTCount||0}회</td></tr></table>
        </div>
        <div class="rpt-section">
          <h2>체형 기능 평가${assess._date?' ('+assess._date+')':''}</h2>
          <table class="rpt-table"><thead><tr><th>항목</th><th>결과</th><th>특이사항</th><th>스윙 연관성</th></tr></thead><tbody>${assessRows}</tbody></table>
        </div>
        <div class="rpt-section">
          <h2>세션 기록 (최근 ${recentSess.length}건 / 총 ${allSess.length}건)</h2>
          <table class="rpt-table"><thead><tr><th style="width:90px">날짜</th><th style="width:130px">담당</th><th>내용</th></tr></thead><tbody>${sessionRows}</tbody></table>
        </div>
        <div class="rpt-footer">본 리포트는 내셔널짐 Golf PT Collaboration 시스템에서 자동 생성되었습니다.</div>
      </div>
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn" onclick="closeReport()">닫기</button>
        <button class="btn primary" onclick="printReport()">🖨️ 인쇄 / PDF 저장</button>
      </div>
    </div>
  </div>`;
}

function requestDelete(id){
  if(!confirm('이 회원의 삭제를 요청하시겠습니까? 운동지도자 승인 후 삭제됩니다.'))return;
  S.deleteRequests[id]={requestedBy:S.currentUser||'인포데스크',requestedAt:today()};
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
