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
  var recentSessions = allSess.slice(0,10).map(function(s){
    return s.date+' ('+s.author+'): '+s.content.slice(0,80)+(s.content.length>80?'…':'');
  });
  var warnings = ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && (v.result==='제한'||v.result==='주의 필요');
  }).map(function(item){
    return item.name+' ['+assess[item.key].result+'] → '+(BODY_SWING_MAP[item.key]||'');
  });
  var assessSummary = ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && v.result && v.result!=='미검사' && v.result!=='정상';
  }).map(function(item){
    var v = assess[item.key];
    return item.name+': '+v.result+(v.note?' ('+v.note+')':'');
  });
  var videoSessions = allSess.filter(function(s){return s.media && s.media.length>0;}).slice(0,5);
  var videoLinks = videoSessions.map(function(s){
    return s.date+' ('+s.author+') — 영상 '+s.media.length+'개';
  });
  var summary = {
    memberName: m.name, date: today(), from: removedInstructors, to: addedInstructors,
    totalSessions: allSess.length,
    proSessions: allSess.filter(function(s){return getRole(s.author)==='pro';}).length,
    trainerSessions: allSess.filter(function(s){return getRole(s.author)==='trainer';}).length,
    recentSessions: recentSessions, assessDate: assess._date||'미기록',
    assessSummary: assessSummary, warnings: warnings, videoLinks: videoLinks
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
  ctx.fillStyle='#f5f5f0'; ctx.fillRect(0,0,720,960);
  ctx.fillStyle='#1a3d2b'; ctx.fillRect(0,0,720,120);
  ctx.fillStyle='#fff'; ctx.font='bold 28px -apple-system,sans-serif';
  ctx.fillText('내셔널짐 Golf Lesson',40,50);
  ctx.font='16px -apple-system,sans-serif';
  ctx.fillText('월간 레슨 리포트 · '+today(),40,85);
  var y=160;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 32px -apple-system,sans-serif';
  ctx.fillText(m.name+' 회원님',40,y); y+=45;
  ctx.fillStyle='#555'; ctx.font='18px -apple-system,sans-serif';
  if(m.handicap||m.avgScore){ ctx.fillText('HC '+(m.handicap||'-')+' · 평균 '+(m.avgScore||'-')+'타',40,y); y+=35; }
  if(m.goal){ ctx.fillText('목표: '+m.goal,40,y); y+=35; }
  if(m.focusPoints){ ctx.fillText('교정: '+m.focusPoints,40,y); y+=35; }
  y+=10;
  ctx.strokeStyle='#d4cfc4'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(680,y); ctx.stroke(); y+=30;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 22px -apple-system,sans-serif';
  ctx.fillText('이번 달 레슨: '+monthSess.length+'회',40,y); y+=35;
  ctx.fillStyle='#333'; ctx.font='16px -apple-system,sans-serif';
  var shownSess=monthSess.slice(0,6);
  shownSess.forEach(function(s){
    var line=s.date.slice(5)+' — '+s.content.slice(0,40)+(s.content.length>40?'…':'');
    ctx.fillText(line,50,y); y+=28;
  });
  if(monthSess.length>6){ctx.fillText('... 외 '+(monthSess.length-6)+'건',50,y); y+=28;}
  y+=10;
  ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(680,y); ctx.stroke(); y+=30;
  var totalUsed=allSess.length;
  var totalReg=parseInt(m.golfLessonCount)||0;
  ctx.fillStyle='#1a3d2b'; ctx.font='bold 20px -apple-system,sans-serif';
  ctx.fillText('전체 진행: '+totalUsed+' / '+totalReg+'회',40,y); y+=30;
  var pct=totalReg>0?Math.min(1,totalUsed/totalReg):0;
  ctx.fillStyle='#e0ddc8'; roundRect(ctx,40,y,640,20,10); ctx.fill();
  ctx.fillStyle='#2d7a4f'; roundRect(ctx,40,y,Math.max(20,640*pct),20,10); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 12px -apple-system,sans-serif';
  ctx.fillText(Math.round(pct*100)+'%',40+640*pct/2-10,y+15); y+=45;
  ctx.fillStyle='#999'; ctx.font='13px -apple-system,sans-serif';
  ctx.fillText('내셔널짐 Golf PT Collaboration · '+today(),40,920);
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

function openReport(){
  var mid = S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m) return;
  var allSess = (S.sessions[mid]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,10);
  var cleaned = allSess.map(function(s){
    return {
      id:s.id, date:s.date, author:s.author, role:getRole(s.author),
      original:s.content,
      cleaned:cleanupContent(s.content, getRole(s.author)),
      ai:s._ai||null, approved:false,
      videos:(s.media||[]).filter(function(mm){return (mm.mimeType||'').indexOf('video/')!==-1 && (mm.r2Key||mm.mediaId);}).map(function(mm){return {key:mm.r2Key||mm.mediaId, view:mm.view||'other'};})
    };
  });
  S.reportDraft = {sessions:cleaned, step:'review', link:''};
  S.showReport = true; render();
}
function closeReport(){S.showReport=false; S.reportDraft=null; render();}
function cleanupContent(text, role){
  if(!text) return '';
  var lines = text.split(/\n/).filter(function(l){return l.trim();});
  var result = [];
  lines.forEach(function(line){
    var l = line.trim();
    if(l.startsWith('-')||l.startsWith('·')) result.push(l);
    else if(l.indexOf(',')!==-1) l.split(',').forEach(function(p){p=p.trim();if(p) result.push('- '+p);});
    else result.push('- '+l);
  });
  result = result.map(function(line){
    if(role==='pro'){
      line=line.replace(/하체턴/g,'하체 턴 (Hip Rotation)');
      line=line.replace(/샬로윙/g,'샬로윙 (Shallowing)');
      line=line.replace(/스쿠핑/g,'스쿠핑 (Scooping)');
      line=line.replace(/핸드퍼스트/g,'핸드 퍼스트 (Hands First)');
    } else {
      line=line.replace(/코어/g,'코어 (Core)');
      line=line.replace(/모빌리티/g,'모빌리티 (Mobility)');
    }
    return line;
  });
  return result.join('\n');
}
function updateReportSession(idx, val){if(S.reportDraft&&S.reportDraft.sessions[idx]) S.reportDraft.sessions[idx].cleaned=val;}
function toggleReportApprove(idx){if(S.reportDraft&&S.reportDraft.sessions[idx]){S.reportDraft.sessions[idx].approved=!S.reportDraft.sessions[idx].approved;render();}}
function approveAllReport(){if(S.reportDraft){S.reportDraft.sessions.forEach(function(s){s.approved=true;});S.reportDraft.step='approved';render();}}
async function generateShareLink(){
  var mid = S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m || !cloud.enabled || !S.reportDraft) return;
  var st = stats(mid);
  var reportId = 'rpt_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  var sessions = S.reportDraft.sessions.filter(function(s){return s.approved;}).map(function(s){
    return {date:s.date, author:s.author, role:s.role, content:s.cleaned, ai:s.ai, videos:s.videos};
  });
  var allSess = S.sessions[mid]||[];
  var content = {
    member:{name:m.name, phone:m.phone||'', registeredDate:m.registeredDate||'', handicap:m.handicap||'', avgScore:m.avgScore||'', goal:m.goal||'', focusPoints:m.focusPoints||''},
    totalSessions:allSess.length, proSessions:st?st.pro:0, trainerSessions:st?st.trainer:0,
    sessions:sessions
  };
  try{
    var {error} = await cloud.client.from('reports').upsert({
      id:reportId, member_id:mid, member_name:m.name,
      created_by:S.currentUser||'', content:content
    });
    if(error) throw error;
    var base = location.origin+location.pathname.replace(/\/[^\/]*$/,'/');
    S.reportDraft.link = base+'report.html?id='+reportId;
    S.reportDraft.step = 'shared';
    render();
  }catch(e){
    console.warn('[report] failed:', e);
    S.reportDraft.link = 'error';
    render();
  }
}
function copyReportLink(){
  if(!S.reportDraft||!S.reportDraft.link) return;
  navigator.clipboard.writeText(S.reportDraft.link).then(function(){
    var btn = document.getElementById('copy-link-btn');
    if(btn){btn.textContent='복사됨!';setTimeout(function(){btn.textContent='링크 복사';},2000);}
  });
}
function renderReportModal(){
  if(!S.showReport || !S.reportDraft) return '';
  var mid = S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m) return '';
  var d = S.reportDraft;
  var approvedCount = d.sessions.filter(function(s){return s.approved;}).length;
  if(d.step==='review'){
    return `<div class="modal-overlay" onclick="if(event.target===this)closeReport()"><div class="modal" style="width:680px;max-height:92vh;overflow-y:auto">
      <div class="modal-title">${m.name} 회원님 리포트 검토</div>
      <div style="font-size:12px;color:var(--tx-2);margin-bottom:14px;padding:10px 14px;background:var(--bg-3);border-radius:var(--r);line-height:1.6">
        AI가 세션 기록을 자동 정리했습니다. 각 세션을 <strong>검토 후 수정</strong>하고 승인해주세요.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        ${d.sessions.map(function(s,i){
          return '<div style="border:1px solid '+(s.approved?'rgba(0,184,132,.3)':'var(--brd)')+';border-radius:12px;overflow:hidden;background:'+(s.approved?'var(--ac-glow2)':'var(--card)')+'">'+
            '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--brd);background:var(--bg-3)">'+
              '<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:4px;'+(s.role==='pro'?'background:var(--pro-bg);color:var(--pro)':'background:var(--tr-bg);color:var(--ac)')+'">'+
                (s.role==='pro'?'PRO':'PT')+'</span>'+
              '<span style="font-size:12px;font-weight:600">'+s.author+'</span>'+
              '<span style="font-size:11px;color:var(--tx-3);margin-left:auto">'+s.date+'</span>'+
            '</div>'+
            '<div style="padding:10px 14px">'+
              '<div style="font-size:9px;font-weight:700;color:var(--tx-3);margin-bottom:3px">원본</div>'+
              '<div style="font-size:11px;color:var(--tx-3);margin-bottom:8px;line-height:1.5;white-space:pre-line">'+s.original.slice(0,100)+(s.original.length>100?'...':'')+'</div>'+
              '<div style="font-size:9px;font-weight:700;color:var(--ac);margin-bottom:3px">AI 정리 (수정 가능)</div>'+
              '<textarea style="width:100%;min-height:50px;padding:6px 8px;border:1px solid var(--brd-2);border-radius:6px;font-size:11px;font-family:var(--font);color:var(--tx);background:var(--bg-4);resize:vertical;line-height:1.5" onchange="updateReportSession('+i+',this.value)">'+s.cleaned+'</textarea>'+
            '</div>'+
            '<div style="padding:6px 14px;border-top:1px solid var(--brd);display:flex;align-items:center;gap:6px">'+
              '<button class="btn" style="font-size:10px;padding:4px 10px" onclick="toggleReportApprove('+i+')">'+(s.approved?'승인됨':'승인')+'</button>'+
              (s.videos.length>0?'<span style="font-size:10px;color:var(--tx-3)">영상 '+s.videos.length+'개</span>':'')+
            '</div>'+
          '</div>';
        }).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeReport()">취소</button>
        <button class="btn" onclick="approveAllReport()">전체 승인</button>
        <button class="btn primary" ${approvedCount===0?'disabled':''} onclick="S.reportDraft.step='approved';render()">검토 완료 (${approvedCount}건)</button>
      </div>
    </div></div>`;
  }
  if(d.step==='approved'){
    return `<div class="modal-overlay" onclick="if(event.target===this)closeReport()"><div class="modal" style="width:500px">
      <div class="modal-title">리포트 공유 준비 완료</div>
      <div style="font-size:12px;color:var(--tx-2);margin-bottom:16px;padding:12px;background:var(--ac-glow2);border:1px solid rgba(0,184,132,.15);border-radius:var(--r);line-height:1.6">
        <strong>${approvedCount}건 세션 승인 완료.</strong><br>
        공유 링크를 생성하면 회원에게 카카오톡으로 전달할 수 있습니다.<br><br>
        포함: 회원 정보 · AI 정리 세션 · 훈련 추천 · 스윙 영상
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="S.reportDraft.step='review';render()">뒤로</button>
        <button class="btn primary" onclick="generateShareLink()">공유 링크 생성</button>
      </div>
    </div></div>`;
  }
  // shared step
  return `<div class="modal-overlay" onclick="if(event.target===this)closeReport()"><div class="modal" style="width:500px">
    <div class="modal-title">공유 링크 생성 완료</div>
    ${d.link && d.link!=='error' ? `
    <div style="padding:14px;background:var(--ac-glow2);border:1px solid rgba(0,184,132,.15);border-radius:var(--r);margin-bottom:16px">
      <div style="font-size:12px;color:var(--tx-2);word-break:break-all;margin-bottom:10px;padding:8px;background:var(--bg-4);border-radius:6px;font-family:var(--mono);font-size:11px">${d.link}</div>
      <div style="display:flex;gap:6px">
        <button class="btn primary" id="copy-link-btn" onclick="copyReportLink()">링크 복사</button>
        <button class="btn" onclick="window.open('${d.link}','_blank')">미리보기</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--tx-3);margin-bottom:16px">카카오톡으로 링크를 보내면 회원이 직접 열어볼 수 있습니다.</div>
    ` : `
    <div style="padding:10px;background:var(--err-bg);border-radius:var(--r);color:var(--err);font-size:12px;margin-bottom:12px">
      링크 생성 실패. Supabase reports 테이블을 확인하세요.
    </div>
    `}
    <div class="modal-actions"><button class="btn" onclick="closeReport()">닫기</button></div>
  </div></div>`;
}

function requestDelete(id){
  if(!confirm('이 회원의 삭제를 요청하시겠습니까? 운동지도자 승인 후 삭제됩니다.'))return;
  S.deleteRequests[id]={requestedBy:S.currentUser||'인포데스크',requestedAt:today()};
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
  logAudit('member','삭제 요청',mName,{id:id});
  save(); render();
}
function approveDelete(id){
  if(!confirm('삭제를 승인하시겠습니까? 모든 세션과 평가 데이터가 영구 삭제됩니다.'))return;
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
  S.members=S.members.filter(function(x){return x.id!==id;});
  delete S.assessments[id];delete S.sessions[id];delete S.deleteRequests[id];
  if(S.selectedMember===id) S.selectedMember=S.members.length>0?S.members[0].id:null;
  logAudit('member','삭제 승인',mName,{id:id});
  save(); render();
}
function rejectDelete(id){
  var mName=(S.members.find(function(m){return m.id===id;})||{}).name||'';
  delete S.deleteRequests[id];
  logAudit('member','삭제 거절',mName,{id:id});
  save(); render();
}
function toggleSidebar(){S.sidebarOpen=!S.sidebarOpen; render();}
function closeModal(){S.showAddSession=false; S.showAddMember=false; S.showActivityLog=false; S.editMemberId=null; S.editSessionId=null; render();}
function openActivityLog(){markSeen(); S.showActivityLog=true; render();}
function openPasswordChange(){S.pwChange={current:'',newPw:'',confirm:''}; S.pwChangeError=''; S.showPwChange=true; render();}
function submitPasswordChange(){
  var key = S.currentRole==='infodesk' ? 'infodesk' : (S.currentRole==='admin' ? '관리자' : S.currentUser);
  if(S.pwChange.current !== getPassword(key)){S.pwChangeError='현재 비밀번호가 일치하지 않습니다'; render(); return;}
  if(!S.pwChange.newPw || S.pwChange.newPw.length<4){S.pwChangeError='새 비밀번호는 4자 이상이어야 합니다'; render(); return;}
  if(S.pwChange.newPw !== S.pwChange.confirm){S.pwChangeError='새 비밀번호가 일치하지 않습니다'; render(); return;}
  setPassword(key, S.pwChange.newPw);
  S.showPwChange=false; S.pwChangeError='';
  alert('비밀번호가 변경되었습니다');
  render();
}
function openAuditLog(){S.showAuditLog=true; S.auditFilter=S.auditFilter||'all'; S.auditUserSelected=null; render();}
function exportAuditLog(user){
  var entries = user ? S.auditLog.filter(function(e){return e.user===user;}) : S.auditLog;
  var rows = [['시간','카테고리','사용자','역할','액션','대상','메타']];
  entries.forEach(function(e){
    rows.push([e.time, e.category, e.user, e.role||'', e.action, e.target||'', JSON.stringify(e.meta||{})]);
  });
  var csv = rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'audit_'+(user||'all')+'_'+today()+'.csv';
  a.click();
  setTimeout(function(){URL.revokeObjectURL(url);}, 100);
}
function updateNS(k,v){S.newSession[k]=v; if(k==='author'||k==='date') render();}

function updateAssess(key, field, val){
  const mid = S.selectedMember;
  if(!S.assessments[mid]) S.assessments[mid] = {};
  if(!S.assessments[mid][key]) S.assessments[mid][key] = {result:'미검사', note:''};
  S.assessments[mid][key][field] = val;
  if(!S.assessments[mid]._date) S.assessments[mid]._date = today();
  save();
  const v = S.assessments[mid][key];
  var itemName=(ASSESSMENT_ITEMS.find(function(i){return i.key===key;})||{}).name||key;
  logActivity('평가 수정', mid, itemName+': '+v.result);
  logAudit('assess','평가 수정', (S.members.find(function(m){return m.id===mid;})||{}).name||'', {item:itemName, field:field, value:val});
  cloud.upsertAssessment(mid, key, v.result, v.note);
}

function snapshotAssessment(){
  const mid = S.selectedMember;
  if(!mid || !S.assessments[mid]) return;
  if(!confirm('현재 평가를 히스토리에 저장하고 새 평가를 시작하시겠습니까?\n(초기 평가 → 애프터 평가 기록용)')) return;
  var cur = S.assessments[mid];
  var snapshot = {date: cur._date||today(), items:{}};
  for(var k in cur){
    if(k==='_date'||k==='_history') continue;
    snapshot.items[k] = {result:cur[k].result, note:cur[k].note};
  }
  if(!cur._history) cur._history = [];
  cur._history.push(snapshot);
  var newAssess = {_date: today(), _history: cur._history};
  ASSESSMENT_ITEMS.forEach(function(item){
    newAssess[item.key] = {result:'미검사', note:''};
  });
  S.assessments[mid] = newAssess;
  logActivity('평가 스냅샷', mid, snapshot.date+' 기록 저장');
  save(); render();
}

function updateAssessDate(val){
  const mid = S.selectedMember;
  if(!S.assessments[mid]) S.assessments[mid] = {};
  S.assessments[mid]._date = val;
  save();
}

function addSession(){
  const ns = S.newSession;
  if(!ns.content.trim()){alert('운동/레슨 내용을 입력하세요'); return;}
  const mid = S.selectedMember;
  if(!S.sessions[mid]) S.sessions[mid] = [];
  var media = (ns.media||[]).slice();
  (ns.mediaUrls||[]).forEach(function(u){ u=(u||'').trim(); if(u) media.push({type:'url',name:u,data:u}); });
  const s = {
    id: suid(),
    date: ns.date,
    author: ns.author,
    content: ns.content.trim(),
    media: media.length>0 ? media : undefined,
    _addedAt: new Date().toISOString()
  };
  S.sessions[mid].push(s);
  logActivity('세션 추가', mid, s.content.slice(0,40));
  logAudit('session','세션 기록', (S.members.find(function(x){return x.id===mid;})||{}).name||'', {date:s.date, author:s.author, content:s.content.slice(0,80), mediaCount:(s.media||[]).length});
  if(!save()){
    S.sessions[mid].pop();
    S.activityLog.pop();
    render();
    return;
  }
  S.showAddSession = false;
  render();
  cloud.upsertSession(mid, s);
  generateLocalSummary(mid, s);
  render();
}

// ============ AI 세션 요약 + 운동 추천 ============
