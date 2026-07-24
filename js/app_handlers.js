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
  m._dirty=true; save(); render(); syncMemberUp(m);
}
// ============ 인수인계 시스템 ============
function generateHandover(memberId, removedInstructors, addedInstructors){
  var m = S.members.find(function(x){return x.id===memberId;});
  if(!m) return;
  var allSess = (S.sessions[memberId]||[]).slice().sort(sessionCompare);
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
  syncSessionUp(mid,s);
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
function _drawImageCard(m){
  var mid=m.id;
  var allSess=(S.sessions[mid]||[]).slice().sort(sessionCompare);
  var thisMonth=today().slice(0,7);
  var monthSess=allSess.filter(function(s){return s.date.slice(0,7)===thisMonth;});
  var canvas=document.createElement('canvas');
  canvas.width=720; canvas.height=960;
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#f5f5f0'; ctx.fillRect(0,0,720,960);
  ctx.fillStyle='#1a3d2b'; ctx.fillRect(0,0,720,120);
  ctx.fillStyle='#fff'; ctx.font='bold 28px -apple-system,sans-serif';
  ctx.fillText(APP_BRAND.nameKo+' Golf Lesson',40,50);
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
  ctx.fillText(APP_BRAND.nameKo+' Golf PT Collaboration · '+today(),40,920);
  return canvas;
}
function _imageCardFilename(m){ return m.name+'_레슨카드_'+today()+'.png'; }
// 다운로드
function generateImageCard(){
  var m=S.members.find(function(x){return x.id===S.selectedMember;});
  if(!m) return;
  _drawImageCard(m).toBlob(function(blob){
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download=_imageCardFilename(m);
    a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},200);
    if(typeof liveToast==='function') liveToast('📥 이미지 다운로드 완료','ok');
  },'image/png');
}
// 공유 (Web Share API → 카카오톡 등 OS 공유시트, 미지원 시 다운로드 폴백)
function shareImageCard(){
  var m=S.members.find(function(x){return x.id===S.selectedMember;});
  if(!m) return;
  _drawImageCard(m).toBlob(function(blob){
    var fname=_imageCardFilename(m);
    try{
      var file=new File([blob], fname, {type:'image/png'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        navigator.share({files:[file], title:m.name+' 레슨카드', text:m.name+' 회원님 레슨 리포트'})
          .catch(function(){});
        return;
      }
    }catch(e){}
    // 폴백: 다운로드 + 안내
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download=fname; a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},200);
    alert('이 기기는 직접 공유를 지원하지 않습니다.\n이미지를 다운로드했어요 — 카카오톡에서 사진 첨부로 보내세요.');
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
    <div class="modal" style="width:380px">
      <div class="modal-title">레슨 카드</div>
      <p style="font-size:13.5px;color:var(--tx-2);margin-bottom:18px;line-height:1.6">${m.name} 회원님의 월간 레슨 리포트 카드입니다.<br>다운로드하거나 바로 공유하세요.</p>
      <div class="modal-actions card-actions">
        <button class="btn" onclick="closeImageCard()">닫기</button>
        <button class="btn" onclick="generateImageCard()">📥 다운로드</button>
        <button class="btn primary" onclick="shareImageCard()">📤 공유</button>
      </div>
    </div>
  </div>`;
}

function openReport(){
  // 성과 화면에서 호출되면 perfMember 우선, 아니면 selectedMember
  var mid = S.perfMember || S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m){ alert('리포트를 만들 회원이 선택되지 않았습니다.'); return; }
  var allSess = (S.sessions[mid]||[]).slice().sort(sessionCompare).slice(0,10);
  var cleaned = allSess.map(function(s){
    return {
      id:s.id, date:s.date, author:s.author, role:getRole(s.author),
      original:s.content,
      cleaned:cleanupContent(s.content, getRole(s.author)),
      ai:s._ai||null, approved:false,
      videos:(s.media||[]).filter(function(mm){var mt=mm.mimeType||inferMime(mm.name);return mt.indexOf('video/')!==-1 && (mm.r2Key||mm.mediaId);}).map(function(mm){return {key:mm.r2Key||mm.mediaId, view:mm.view||'other'};})
    };
  });
  S.reportDraft = {mid:mid, sessions:cleaned, step:'review', link:''};
  S.showReport = true; render();
}
function closeReport(){S.showReport=false; S.reportDraft=null; render();}

// ============ AI 리포트 확장 (1→3~4배) ============
var EXPAND_GOLF = {
  '하체턴':{t:'하체 턴 (Hip Rotation)',d:'다운스윙 시 하체 선행 회전을 유도하여 X-Factor를 극대화하고 클럽헤드 스피드 증가를 목표로 반복 훈련 진행. 골반 오픈 타이밍과 체중이동 시퀀스를 점검하며, 왼발 힐을 기준으로 한 회전축 설정 및 자연스러운 Transition 동작 패턴을 구축.'},
  '샬로윙':{t:'샬로윙 (Shallowing)',d:'다운스윙 초기 클럽을 플래트닝하여 인사이드-아웃 경로를 만드는 샬로윙 동작을 집중 훈련함. 오른팔꿈치를 몸통 가까이 유지하며 클럽이 자연스럽게 슬롯에 떨어지도록 반복하여, 오버더탑(Over the Top) 패턴을 교정.'},
  '스쿠핑':{t:'스쿠핑 방지 (Anti-Scooping)',d:'임팩트 시 왼손목이 꺾이면서 클럽이 볼 아래로 파고드는 스쿠핑 동작을 교정. 핸드 퍼스트 포지션을 유지한 상태에서 디센딩 블로(Descending Blow) 타격감을 익히며, 볼 컴프레션을 향상시키는 훈련 진행.'},
  '핸드퍼스트':{t:'핸드 퍼스트 (Hands First)',d:'임팩트 순간 손이 클럽헤드보다 앞에 위치하는 핸드 퍼스트 포지션을 반복 훈련. 샤프트 린(Shaft Lean)을 확보하여 일관된 볼 스트라이킹과 적정 발사각을 만들어내는 것을 목표로 함.'},
  '임팩트':{t:'임팩트 (Impact) 포지션 교정',d:'올바른 임팩트 자세를 만들기 위해 체중 배분(좌 70:우 30), 힙 오픈, 손 위치를 종합적으로 점검함. 임팩트 백 드릴을 활용하여 정확한 타격 감각을 체득하도록 반복 훈련 진행.'},
  '라그':{t:'라그 유지 (Lag Retention)',d:'다운스윙에서 손목 라그를 최대한 늦게까지 유지하여 임팩트 직전에 에너지를 폭발적으로 릴리스하는 훈련 진행. 지연 릴리스(Delayed Release)를 통해 클럽헤드 스피드를 극대화하는 감각을 습득.'},
  '슬라이스':{t:'슬라이스 교정',d:'아웃투인(Outside-In) 스윙 경로와 오픈 페이스가 복합적으로 작용하는 슬라이스의 근본 원인을 분석하고, 인사이드 어프로치 경로를 만드는 드릴과 임팩트 시 페이스 앵글 컨트롤 훈련을 병행함.'},
  '훅':{t:'훅 교정',d:'과도한 인투아웃(Inside-Out) 경로와 클로즈 페이스로 인한 훅 구질을 교정했습니다. 적절한 바디 릴리스와 페이스 로테이션 타이밍을 조정하여 볼의 곡률을 컨트롤하는 훈련 진행.'},
  '드로우':{t:'드로우 구질 연습',d:'인투아웃 경로에서 적절한 클로즈 페이스 앵글을 만들어 의도적인 드로우 구질을 구사하는 훈련 진행. 타겟 대비 오른쪽 시작 후 왼쪽으로 부드럽게 휘어지는 탄도를 만들기 위한 셋업과 스윙 경로를 반복 연습.'},
  '페이드':{t:'페이드 구질 연습',d:'아웃투인 경로에서 살짝 오픈된 페이스 앵글을 활용하여 컨트롤된 페이드 구질을 만드는 훈련 진행. 바람이나 핀 위치에 따라 전략적으로 활용할 수 있는 안정적인 페이드 샷을 목표로 함.'},
  '어드레스':{t:'어드레스 (Address) 자세 교정',d:'척추 앵글, 힙 힌지 각도, 무릎 굴곡 정도를 종합적으로 점검하고, 클럽별 최적의 어드레스 포스처를 설정. 일관된 셋업이 일관된 샷의 기본임을 강조하며 반복 훈련.'},
  '그립':{t:'그립 교정',d:'V자 라인 정렬과 그립 프레셔 균일화를 통해 스윙 전반의 안정성을 향상. 뉴트럴/스트롱/위크 그립 유형별 구질 차이를 이해하고, 회원의 스윙 특성에 맞는 최적 그립을 설정.'},
  '백스윙':{t:'백스윙 교정',d:'원피스 테이크어웨이로 시작하여 어깨 90도 회전을 목표로 하는 풀 백스윙을 반복 훈련. 상하체 분리를 통한 X-Factor 생성과 코킹 타이밍을 점검하며, 일관된 탑 포지션을 만드는 데 집중함.'},
  '템포':{t:'스윙 템포 교정',d:'백스윙과 다운스윙의 3:1 템포 비율을 목표로 메트로놈 기반 리듬 훈련 진행. 일정한 템포 유지가 타이밍과 볼 컨택의 일관성에 직결됨을 체감하도록 반복 연습.'},
  '체중이동':{t:'체중이동 (Weight Transfer) 훈련',d:'백스윙 시 오른발로의 체중 로딩과 다운스윙 시 왼발로의 체중 전환 타이밍을 체계적으로 훈련함. 스텝 드릴을 활용하여 자연스러운 체중이동 패턴을 구축.'},
  '칩':{t:'칩 샷 훈련',d:'그린 주변에서의 정밀한 칩 샷 기술을 훈련함. 좁은 스탠스, 체중 왼발 배분, 핸드 퍼스트 셋업을 기본으로 하여 볼 위치 변화에 따른 탄도와 런 조절 기술을 연습.'},
  '퍼팅':{t:'퍼팅 훈련',d:'펜듈럼 스트로크의 일관성을 높이는 훈련 진행. 거리감 재현력 향상을 위한 래그 퍼팅 드릴과 숏 퍼트 자신감 빌딩을 병행하며, 그린 리딩 능력도 함께 향상.'},
  '벙커':{t:'벙커 샷 훈련',d:'모래를 먼저 치는 익스플로전 샷의 기본 원리를 반복 훈련. 바운스 활용법, 페이스 오픈 정도에 따른 탄도 변화, 거리 조절 기법을 체계적으로 연습.'},
  '숏게임':{t:'숏게임 종합 훈련',d:'그린 주변 50m 이내에서의 다양한 숏게임 기술을 종합적으로 훈련함. 칩, 피치, 벙커, 로브 샷의 기본기를 점검하고 상황별 클럽 선택과 기술 적용 능력을 향상.'},
};
var EXPAND_PT = {
  '스쿼트':{t:'스쿼트 (Squat)',d:'하체 근력과 코어 안정성을 동시에 강화하는 스쿼트 훈련 진행. 적절한 깊이(대퇴부 수평)까지 내려가면서 무릎이 발끝 방향을 유지하도록 폼을 교정하고, 골프 스윙에 필요한 하체 파워 베이스를 구축.'},
  '데드리프트':{t:'데드리프트 (Deadlift)',d:'후면사슬(Posterior Chain) 전체를 강화하는 데드리프트 훈련 진행. 힙 힌지 패턴을 정확히 수행하여 둔근과 햄스트링의 협응력을 높이고,, 골프 어드레스 자세의 기반이 되는 척추 중립 유지 능력을 향상.'},
  '코어':{t:'코어 안정화 (Core Stability) 훈련',d:'골프 스윙의 기초가 되는 코어 안정화 훈련 진행. 플랭크, 데드버그, 팔로프 프레스 등을 통해 항회전(Anti-Rotation) 능력을 강화하고, 스윙 시 상하체 분리를 효과적으로 수행할 수 있는 몸통 안정성을 확보.'},
  '회전':{t:'회전력 (Rotational Power) 훈련',d:'메디신볼 회전 슬램과 케이블 우드찹을 활용한 회전 파워 훈련 진행. 골프 스윙과 동일한 회전 패턴에서 폭발적인 파워를 생성하고 효과적으로 감속하는 능력을 향상.'},
  '모빌리티':{t:'모빌리티 (Mobility) 향상 훈련',d:'흉추 회전, 고관절 내·외회전, 어깨 가동성을 종합적으로 개선하는 모빌리티 세션을 진행. FRC(Functional Range Conditioning) 기반의 능동적 가동 범위 확장을 통해 스윙의 제한 요소를 해소.'},
  '하체':{t:'하체 강화 훈련',d:'스쿼트, 런지, 힙 쓰러스트 등 다양한 하체 운동을 통해 골프 스윙의 파워 소스인 하체 근력을 체계적으로 강화함. 단측성(Unilateral) 훈련을 병행하여 좌우 밸런스도 함께 개선함.'},
  '상체':{t:'상체 근력 훈련',d:'푸쉬(벤치프레스, 숄더프레스)와 풀(로우, 랫풀다운) 동작을 균형 있게 수행하여 상체 전반의 근력을 향상. 견갑골 안정화와 회전근개 강화를 통해 스윙 시 안정적인 팔 동작의 기반을 마련.'},
  '밸런스':{t:'밸런스 & 안정성 훈련',d:'싱글 레그 운동과 불안정면 훈련을 통해 고유감각(Proprioception)과 동적 밸런스를 향상. 골프 스윙의 피니시에서 3초 이상 안정적으로 유지할 수 있는 밸런스 능력을 구축.'},
  '스트레치':{t:'스트레칭 & 유연성 훈련',d:'주요 근육군의 유연성 향상을 위한 정적·동적 스트레칭을 진행. 특히 고관절 굴근, 흉추, 어깨 관절낭의 가동 범위를 확보하여 스윙의 효율성을 높이는 데 집중함.'},
  '파워':{t:'파워 (Power) 트레이닝',d:'케틀벨 스윙, 메디신볼 슬램, 점프 스쿼트 등 폭발적인 파워 생성 훈련 진행. 근력을 속도로 전환하는 Rate of Force Development(RFD)를 향상시켜 클럽헤드 스피드 증가에 기여하도록 함.'},
  '기능성':{t:'기능성 (Functional) 트레이닝',d:'골프 동작 패턴에 특화된 기능성 훈련 진행. TPI(Titleist Performance Institute) 기반의 움직임 평가 결과를 반영하여 개인별 약점을 보완하는 맞춤형 프로그램으로 수행함.'},
  '폼롤링':{t:'근막 이완 (Myofascial Release)',d:'폼롤러와 라크로스볼을 활용한 자가 근막 이완(Self-Myofascial Release)을 진행. IT밴드, 둔근, 흉추, 종아리 등 주요 부위의 트리거 포인트를 해소하여 운동 후 회복을 촉진.'},
};

function cleanupContent(text, role){
  if(!text) return '';
  var content = text.toLowerCase();
  var output = [];
  var dict = role==='pro' ? EXPAND_GOLF : EXPAND_PT;
  var matched = {};
  Object.keys(dict).forEach(function(key){
    if(content.indexOf(key)!==-1 && !matched[key]){
      matched[key] = true;
      var e = dict[key];
      output.push('■ '+e.t+'\n'+e.d);
    }
  });
  if(output.length===0){
    var lines = text.split(/[,\n]/).filter(function(l){return l.trim();});
    lines.forEach(function(l){
      output.push('- '+l.trim());
    });
  }
  return output.join('\n\n');
}
function updateReportSession(idx, val){if(S.reportDraft&&S.reportDraft.sessions[idx]) S.reportDraft.sessions[idx].cleaned=val;}
function toggleReportApprove(idx){if(S.reportDraft&&S.reportDraft.sessions[idx]){S.reportDraft.sessions[idx].approved=!S.reportDraft.sessions[idx].approved;render();}}
function approveAllReport(){if(S.reportDraft){S.reportDraft.sessions.forEach(function(s){s.approved=true;});S.reportDraft.step='approved';render();}}
async function generateShareLink(){
  var mid = (S.reportDraft&&S.reportDraft.mid) || S.perfMember || S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m || !cloud.enabled || !S.reportDraft) return;
  var st = stats(mid);
  var reportId = 'rpt_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  var sessions = S.reportDraft.sessions.filter(function(s){return s.approved;}).map(function(s){
    return {date:s.date, author:s.author, role:s.role, content:s.cleaned, ai:s.ai, videos:s.videos};
  });
  var allSess = S.sessions[mid]||[];
  // 트랙맨 측정 요약 — 회원 공유 리포트에 실측 데이터·영상 포함
  var trackman=null;
  try{
    var perf = buildPerfData(mid);
    if(perf && perf.shots && perf.shots.length){
      var avgs=_buildClubAverages(perf.shots);
      var clubs=['driver','wood','iron','wedge'].map(function(g){return avgs[g];}).filter(function(a){return a.n>0;})
        .map(function(a){return {name:a.name,n:a.n,metric:!!a._metric,clubSpeed:a.clubSpeed,ballSpeed:a.ballSpeed,smash:a.smash,carry:a.carry,total:a.total,launch:a.launch,spin:a.spin};});
      var best=null,bc=-1; perf.shots.forEach(function(s){var c=parseFloat(s.data&&s.data.carry); if(!isNaN(c)&&c>bc){bc=c;best=s;}});
      // 추이는 드라이버 우선 — 클럽 혼합 추이는 오해를 부른다 (부족하면 전 클럽 fallback)
      var trendSrc=(perf.golf||[]).filter(function(g){return _carryM(g)!=null && _clubGroup(g.club)==='driver';});
      if(trendSrc.length<2) trendSrc=(perf.golf||[]).filter(function(g){return _carryM(g)!=null;});
      var trend=trendSrc.map(function(g){return {date:g.date, carryM:Math.round(_carryM(g)*10)/10};});
      var trendClub=trendSrc.length? (_clubKo(trendSrc[trendSrc.length-1].club)||'') : '';
      // 영상: 아이폰 재생 보장되는 mp4 변환본 우선, mkv 원본은 후순위 + 플래그
      var vids=perf.shots.filter(function(s){return s.videoR2Key||(s.data&&s.data.videoMp4R2Key);})
        .sort(function(a,b){
          var am=!!(a.data&&a.data.videoMp4R2Key), bm=!!(b.data&&b.data.videoMp4R2Key);
          if(am!==bm) return am?-1:1;
          return String(b.ts).localeCompare(String(a.ts));
        }).slice(0,6)
        .map(function(s){
          var key=(s.data&&s.data.videoMp4R2Key)||s.videoR2Key;
          return {ts:s.ts, club:s.data&&s.data.club, carry:s.data&&s.data.carry, metric:_isMetricShot(s.data), key:key, mkv:/\.mkv$/i.test(String(key||''))};
        });
      trackman={shotCount:perf.shots.length, clubs:clubs,
        best:best?{ts:best.ts,club:best.data.club,carry:best.data.carry,ballSpeed:best.data.ballSpeed,smash:best.data.smash,metric:_isMetricShot(best.data)}:null,
        trend:trend, trendClub:trendClub, videos:vids, measuredBy:APP_BRAND.measuredBy};
    }
  }catch(e){ console.warn('[report] trackman summary skip:', e); }
  var content = {
    member:{name:m.name, phone:m.phone||'', registeredDate:m.registeredDate||'', handicap:m.handicap||'', avgScore:m.avgScore||'', goal:m.goal||'', focusPoints:m.focusPoints||''},
    totalSessions:allSess.length, proSessions:st?st.pro:0, trainerSessions:st?st.trainer:0,
    sessions:sessions, trackman:trackman,
    brand:{name:APP_BRAND.name, nameKo:APP_BRAND.nameKo, measuredBy:APP_BRAND.measuredBy}
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
  var mid = S.reportDraft.mid || S.selectedMember;
  var m = S.members.find(function(x){return x.id===mid;});
  if(!m) return '';
  var d = S.reportDraft;
  var approvedCount = d.sessions.filter(function(s){return s.approved;}).length;
  if(d.step==='review'){
    return `<div class="modal-overlay" onclick="if(event.target===this)closeReport()"><div class="modal" style="width:680px;max-height:92vh;overflow-y:auto">
      <div class="modal-title">${m.name} 회원님 리포트 검토</div>
      <div style="font-size:12px;color:var(--tx-2);margin-bottom:14px;padding:10px 14px;background:var(--bg-3);border-radius:var(--r);line-height:1.6">
        AI가 세션 기록을 자동 정리함. 각 세션을 <strong>검토 후 수정</strong>하고 승인해주세요.
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
              '<button class="btn'+(s.approved?' primary':'')+'" style="font-size:10px;padding:5px 12px" onclick="toggleReportApprove('+i+')">'+(s.approved?'승인 ✓':'승인 필요')+'</button>'+
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
  // 세션 tombstone 도 같이 남겨 다른 기기 캐시가 세션을 되살리지 못하게
  if(!S.deletedSessionIds) S.deletedSessionIds={};
  (S.sessions[id]||[]).forEach(function(s){ S.deletedSessionIds[s.id]=Date.now(); });
  // R2 정리 — 이 회원의 세션 첨부 영상/사진 + 저장된 샷 영상(mkv+mp4)을 모두 삭제.
  // (기존엔 DB 행만 지우고 R2 객체는 남겨 삭제 회원의 영상이 영구 고아로 쌓이던 누수)
  try{
    (S.sessions[id]||[]).forEach(function(s){ (s.media||[]).forEach(function(m){ var k=m.r2Key||m.mediaId; if(k && typeof r2!=='undefined' && r2.enabled){ try{ r2.remove(k); }catch(e){} } if(m.mediaId){ try{ mediaDB.del(m.mediaId); }catch(e){} } }); });
    (S.shotEvents||[]).filter(function(s){ return s.memberId===id; }).forEach(r2RemoveShotVideos);
  }catch(e){ console.warn('[r2] 회원삭제 정리 실패', e); }
  // 회원 tombstone — 부팅 머지가 삭제된 회원을 재업로드해 부활시키는 것 차단
  if(!S.deletedMemberIds) S.deletedMemberIds={};
  S.deletedMemberIds[id]=Date.now();
  S.members=S.members.filter(function(x){return x.id!==id;});
  delete S.assessments[id];delete S.sessions[id];delete S.deleteRequests[id];
  if(S.selectedMember===id) S.selectedMember=S.members.length>0?S.members[0].id:null;
  logAudit('member','삭제 승인',mName,{id:id});
  save(); render();
  // 서버 전파 (회원+세션+평가+샷)
  try{ cloud.deleteMember(id); }catch(e){}
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

// ============ 녹음 원문 보관함 (관리자 전용) ============
// 레슨 녹음 원문은 지도자 화면에는 남기지 않고(당사자 프라이버시),
// 관리자만 이 보관함에서 신뢰도 검증용으로 열람한다.
function openTranscriptVault(){
  if(S.currentRole!=='admin'){alert('관리자 전용 기능입니다'); return;}
  S.showTranscriptVault=true; S.vaultAuthorFilter='all'; S.sidebarOpen=false;
  logAudit('system','녹음 원문 보관함 열람','',{});
  render();
}
function closeTranscriptVault(){S.showTranscriptVault=false; render();}
function renderTranscriptVault(){
  if(!S.showTranscriptVault || S.currentRole!=='admin') return '';
  var rows=[];
  S.members.forEach(function(m){
    (S.sessions[m.id]||[]).forEach(function(s){
      if(s.rawTranscript && s.rawTranscript.trim()) rows.push({member:m.name, s:s});
    });
  });
  rows.sort(function(a,b){return String(b.s.date||'').localeCompare(String(a.s.date||''));});
  var authors={}; rows.forEach(function(r){authors[r.s.author||'?']=(authors[r.s.author||'?']||0)+1;});
  var filt=S.vaultAuthorFilter||'all';
  var shown=filt==='all'?rows:rows.filter(function(r){return (r.s.author||'?')===filt;});
  return '<div class="modal-overlay" onclick="if(event.target===this)closeTranscriptVault()"><div class="modal" style="width:680px;max-height:92vh;overflow-y:auto">'
    +'<div class="modal-title">🎙 녹음 원문 보관함 <span style="font-size:11px;font-weight:400;color:var(--tx-3)">관리자 전용 · '+rows.length+'건</span></div>'
    +'<div style="font-size:12px;color:var(--tx-2);margin-bottom:12px;padding:10px 14px;background:var(--bg-3);border-radius:var(--r);line-height:1.6">레슨 녹음 원문은 지도자·회원 화면에는 표시되지 않습니다. AI 일지 정리가 정확했는지 검증할 때만 열람하세요.</div>'
    +'<div class="audit-filter" style="margin-bottom:10px"><button class="audit-filter-btn'+(filt==='all'?' active':'')+'" onclick="S.vaultAuthorFilter=\'all\';render()">전체 '+rows.length+'</button>'
    +Object.keys(authors).map(function(a){return '<button class="audit-filter-btn'+(filt===a?' active':'')+'" onclick="S.vaultAuthorFilter=\''+a.replace(/'/g,'')+'\';render()">'+a+' '+authors[a]+'</button>';}).join('')
    +'</div>'
    +(shown.length===0?'<div class="empty-state" style="padding:30px">녹음 원문이 저장된 세션이 없습니다</div>':
      shown.map(function(r){
        var s=r.s;
        return '<details class="raw-transcript" style="margin-bottom:8px"><summary>'+s.date+' · <b>'+r.member+'</b> 회원 · '+(s.author||'')+' · '+s.rawTranscript.trim().length+'자</summary>'
          +'<div class="raw-transcript-body">'+String(s.rawTranscript).replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div></details>';
      }).join(''))
    +'<div class="modal-actions"><button class="btn" onclick="closeTranscriptVault()">닫기</button></div>'
  +'</div></div>';
}

// ============ 스토리지 진단·정리 (관리자 전용) ============
// R2 버킷 전체를 훑어 구성(용량·개수)을 보여주고, mp4 재생본이 이미 있는
// 중복 mkv 원본을 안전하게 정리(삭제)할 수 있게 한다. — 워커 /__list 라우트 필요.
function _fmtBytes(b){
  b = b||0;
  if(b >= 1073741824) return (b/1073741824).toFixed(2)+' GB';
  if(b >= 1048576) return (b/1048576).toFixed(1)+' MB';
  if(b >= 1024) return (b/1024).toFixed(0)+' KB';
  return b+' B';
}
async function openStorageAudit(){
  if(S.currentRole!=='admin'){ alert('관리자 전용 기능입니다'); return; }
  if(typeof r2==='undefined' || !r2.enabled){ alert('R2 스토리지가 설정되지 않았습니다'); return; }
  S.storageAudit = { loading:true, error:'', data:null }; S.sidebarOpen=false; render();
  logAudit('system','스토리지 진단 열람','',{});
  try{
    var objects=[], cursor=null, pages=0;
    do{
      var res=await r2.list(cursor);
      if(!res){ throw new Error('목록 조회 실패 — 워커에 /__list 라우트가 배포됐는지 확인하세요 (worker/golf-pt-storage-worker.js 최신본을 Cloudflare 에 붙여넣기)'); }
      (res.objects||[]).forEach(function(o){ objects.push(o); });
      cursor=res.cursor; pages++;
    }while(cursor && pages<60);   // 최대 6만 객체 안전 상한
    // ⚠️ 오삭제 방지 1 — 정리 계산 직전에 샷 목록을 서버에서 새로 받는다.
    // (이 기기의 S.shotEvents 가 오래됐으면 방금 친 샷의 영상이 '미보관'으로 잘못 분류됨)
    try{ var lv=await cloud.loadLive(); if(lv && lv.shotEvents && lv.shotEvents.length) S.shotEvents=lv.shotEvents; }catch(e){}
    // 보관해야 할 샷 영상 키 = 선별 저장(_kept) 샷 + 최근 KEEP_DAYS 이내 샷의 영상
    var days=(window.APP_CONFIG&&APP_CONFIG.SHOT_VIDEO_KEEP_DAYS)||3;
    var recentCut=Date.now()-days*24*3600*1000;
    var keep={};
    (S.shotEvents||[]).forEach(function(s){
      var t=Date.parse(s.ts);
      var protect=(s.data&&s.data._kept) || (!isNaN(t)&&t>=recentCut);
      if(!protect) return;
      if(s.videoR2Key) keep[s.videoR2Key]=1;
      if(s.data&&s.data.videoMp4R2Key) keep[s.data.videoMp4R2Key]=1;
      if(s.data&&s.data.videoFO) keep[s.data.videoFO]=1;   // 정면 각도도 보호(선별 저장/최근 샷)
      if(s.data&&s.data.videoDL) keep[s.data.videoDL]=1;
    });
    // ⚠️ 오삭제 방지 2 — 업로드된 지 KEEP_DAYS 안 된 파일은 무조건 보호(워커가 uploaded 제공 시)
    S.storageAudit={ loading:false, error:'', data:analyzeStorage(objects, keep, recentCut), truncated: !!cursor };
  }catch(e){
    S.storageAudit={ loading:false, error:String(e&&e.message||e), data:null };
  }
  render();
}
function closeStorageAudit(){ S.storageAudit=null; render(); }
function analyzeStorage(objects, keepKeys, recentUploadCut){
  keepKeys = keepKeys || {};
  recentUploadCut = recentUploadCut || 0;
  var cat={ mkv:{n:0,b:0}, mp4:{n:0,b:0}, rec:{n:0,b:0}, manual:{n:0,b:0}, other:{n:0,b:0} };
  var total={ n:objects.length, b:0 };
  var mp4Bases={};
  objects.forEach(function(o){
    total.b += o.size||0;
    if(/_scene\.mp4$/i.test(o.key)) mp4Bases[o.key.replace(/_scene\.mp4$/i,'')]=1;
  });
  var reclaim={ n:0, b:0 }, reclaimKeys=[];          // mp4 재생본이 있는 중복 mkv
  var unkept={ n:0, b:0 }, unkeptKeys=[];            // 앱에서 저장(선별)하지 않은 샷 영상 (mkv+mp4)
  objects.forEach(function(o){
    var k=o.key, s=o.size||0;
    var isScene=/_scene\.(mkv|mp4)$/i.test(k);
    var recentlyUploaded = recentUploadCut && o.uploaded && o.uploaded >= recentUploadCut;   // 방금 올라온 파일 보호
    if(isScene && !keepKeys[k] && !recentlyUploaded){ unkept.n++; unkept.b+=s; unkeptKeys.push(k); }
    if(/_scene\.mkv$/i.test(k)){
      cat.mkv.n++; cat.mkv.b+=s;
      if(mp4Bases[k.replace(/_scene\.mkv$/i,'')]){ reclaim.n++; reclaim.b+=s; reclaimKeys.push(k); }
    } else if(/_scene\.mp4$/i.test(k)){ cat.mp4.n++; cat.mp4.b+=s; }
    else if(/^rec\//i.test(k)){ cat.rec.n++; cat.rec.b+=s; }
    else if(/^m_/i.test(k)){ cat.manual.n++; cat.manual.b+=s; }
    else { cat.other.n++; cat.other.b+=s; }
  });
  return { total:total, cat:cat, reclaim:reclaim, reclaimKeys:reclaimKeys, unkept:unkept, unkeptKeys:unkeptKeys };
}
// 공용 병렬 삭제 루프 (청크 8) — 진행률은 S.storageAudit.purging 에 기록
async function _purgeKeyList(keys){
  var A=S.storageAudit; if(!A) return;
  A.purging={ done:0, total:keys.length, fail:0, finished:false }; render();
  var CHUNK=8, chunkIdx=0;
  for(var i=0;i<keys.length;i+=CHUNK){
    var batch=keys.slice(i,i+CHUNK);
    await Promise.all(batch.map(function(k){
      return r2.remove(k).then(function(ok){ if(!ok) A.purging.fail++; }, function(){ A.purging.fail++; }).then(function(){ A.purging.done++; });
    }));
    if((++chunkIdx % 4)===0) render();
  }
  A.purging.finished=true; render();
}
// 앱에서 저장(선별)하지 않은 샷 영상 일괄 정리 — 측정 데이터(성과 그래프)는 유지, 영상 파일만 삭제
async function purgeUnkeptShotVideos(){
  var A=S.storageAudit; var a=A&&A.data;
  if(!a || !a.unkeptKeys || !a.unkeptKeys.length) return;
  if(!confirm('앱에서 저장(선별)하지 않은 샷 영상 '+a.unkept.n+'개('+_fmtBytes(a.unkept.b)+')를 삭제합니다.\n\n· 측정 수치·성과 그래프는 그대로 유지 (영상 파일만 삭제)\n· 선별 저장한 샷·최근 며칠 영상·일지 첨부는 보호됨\n· 되돌릴 수 없습니다\n\n계속할까요?')) return;
  await _purgeKeyList(a.unkeptKeys);
  logAudit('system','미보관 샷 영상 정리','',{count:a.unkept.n, bytes:a.unkept.b, fail:A.purging.fail});
  liveToastSafe && liveToastSafe('🎞 미보관 샷 영상 '+(a.unkept.n-A.purging.fail)+'개 정리 완료');
  setTimeout(openStorageAudit, 800);
}
// mp4 재생본이 이미 존재하는 mkv 원본만 삭제 — 재생본은 유지되므로 재생에 영향 없음(안전).
async function purgeReclaimableMkv(){
  var A=S.storageAudit; var a=A&&A.data;
  if(!a || !a.reclaimKeys || !a.reclaimKeys.length){ return; }
  if(!confirm('mp4 재생본이 이미 있는 중복 mkv 원본 '+a.reclaim.n+'개('+_fmtBytes(a.reclaim.b)+')를 삭제합니다.\n\n· 재생본(mp4)은 그대로 유지 → 영상 재생에는 전혀 영향 없음\n· 되돌릴 수 없습니다\n\n계속할까요?')) return;
  await _purgeKeyList(a.reclaimKeys);
  logAudit('system','스토리지 mkv 원본 정리','',{count:a.reclaim.n, bytes:a.reclaim.b, fail:A.purging.fail});
  liveToastSafe && liveToastSafe('🧹 mkv 원본 '+(a.reclaim.n-A.purging.fail)+'개 정리 완료 — 대시보드에 반영까지 잠시 걸립니다');
  setTimeout(openStorageAudit, 800);   // 재조회로 결과 갱신
}
function renderStorageAudit(){
  var A=S.storageAudit; if(!A || S.currentRole!=='admin') return '';
  var body;
  if(A.loading){
    body='<div style="padding:30px 0;text-align:center;color:var(--tx-2)">R2 버킷 목록을 불러오는 중…<div style="font-size:11px;color:var(--tx-3);margin-top:6px">객체가 많으면 몇 초 걸립니다</div></div>';
  } else if(A.error){
    body='<div style="padding:18px;background:#fdecec;border-radius:10px;color:#993c1d;font-size:13px;line-height:1.7">'+String(A.error).replace(/</g,'&lt;')+'</div>';
  } else if(A.data){
    var d=A.data, c=d.cat;
    var row=function(label,o,hint){ return '<tr><td style="padding:7px 4px">'+label+(hint?'<div style="font-size:10.5px;color:var(--tx-3)">'+hint+'</div>':'')+'</td><td style="text-align:right;padding:7px 4px;white-space:nowrap">'+o.n.toLocaleString()+'개</td><td style="text-align:right;padding:7px 4px;white-space:nowrap;font-weight:700">'+_fmtBytes(o.b)+'</td></tr>'; };
    body=''
      +'<div style="font-size:13px;color:var(--tx-2);margin-bottom:10px">전체 <b>'+d.total.n.toLocaleString()+'개</b> · <b>'+_fmtBytes(d.total.b)+'</b>'+(A.truncated?' <span style="color:#b8791d">(상한 도달 — 일부만 집계)</span>':'')+'</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:1px solid var(--line);color:var(--tx-3);font-size:11px"><th style="text-align:left;padding:4px">유형</th><th style="text-align:right;padding:4px">개수</th><th style="text-align:right;padding:4px">용량</th></tr></thead><tbody>'
      +row('🎥 스윙영상 mkv 원본', c.mkv, 'TrackMan 원본 (iOS 재생 불가)')
      +row('📱 스윙영상 mp4 재생본', c.mp4, '앱에서 실제 재생되는 버전')
      +row('🎙 음성 백업(rec/)', c.rec, 'STT 실패분 백업')
      +row('📎 세션 첨부(수동 업로드)', c.manual, '사진·영상 첨부')
      +row('❓ 기타', c.other, '')
      +'</tbody></table>';
    if(d.reclaim.n>0){
      body+='<div style="margin-top:16px;padding:14px;background:#eafaf3;border:1px solid #b6ead2;border-radius:12px">'
        +'<div style="font-weight:800;font-size:13.5px;color:#0f7a52;margin-bottom:4px">✅ 안전하게 정리 가능: '+d.reclaim.n.toLocaleString()+'개 · '+_fmtBytes(d.reclaim.b)+'</div>'
        +'<div style="font-size:12px;color:var(--tx-2);line-height:1.6;margin-bottom:10px">mp4 재생본이 <b>이미 있는</b> mkv 원본입니다. 삭제해도 재생본은 그대로라 영상 재생엔 영향이 없고, 저장 용량만 줄어듭니다.</div>';
      if(A.purging){
        var p=A.purging;
        body+='<div style="font-size:12.5px;color:'+(p.finished?'#0f7a52':'var(--tx-2)')+'">'+(p.finished?'완료 — ':'삭제 중 ')+p.done+' / '+p.total+(p.fail?(' · 실패 '+p.fail):'')+'</div>';
      } else {
        body+='<button class="btn primary" style="width:100%" onclick="purgeReclaimableMkv()">🧹 중복 mkv 원본 '+_fmtBytes(d.reclaim.b)+' 정리</button>';
      }
      body+='</div>';
    } else {
      body+='<div style="margin-top:16px;padding:12px;background:var(--bg-2);border-radius:10px;font-size:12px;color:var(--tx-2);line-height:1.6">중복 mkv 원본이 발견되지 않았습니다. (에이전트 mp4 변환이 꺼져 있거나 이미 정리된 상태)</div>';
    }
    if(d.unkept && d.unkept.n>0){
      body+='<div style="margin-top:12px;padding:14px;background:#fff7ea;border:1px solid #f0ddb8;border-radius:12px">'
        +'<div style="font-weight:800;font-size:13.5px;color:#8a5a10;margin-bottom:4px">🎞 앱 미저장 샷 영상: '+d.unkept.n.toLocaleString()+'개 · '+_fmtBytes(d.unkept.b)+'</div>'
        +'<div style="font-size:12px;color:var(--tx-2);line-height:1.6;margin-bottom:10px">연습 중 자동으로 쌓인, 앱에서 <b>저장(선별)하지 않은</b> 샷 영상입니다. 삭제해도 <b>측정 수치·성과 그래프는 그대로</b>이고 영상 파일만 지워집니다. 선별 저장 샷·최근 며칠 영상·일지 첨부는 보호됩니다.</div>';
      if(A.purging && !A.purging.finished){
        body+='<div style="font-size:12.5px;color:var(--tx-2)">삭제 중 '+A.purging.done+' / '+A.purging.total+(A.purging.fail?(' · 실패 '+A.purging.fail):'')+'</div>';
      } else {
        body+='<button class="btn" style="width:100%;background:#8a5a10;color:#fff" onclick="purgeUnkeptShotVideos()">🎞 미저장 샷 영상 '+_fmtBytes(d.unkept.b)+' 정리</button>';
      }
      body+='</div>';
    }
    body+='<div style="margin-top:14px;font-size:11px;color:var(--tx-3);line-height:1.7">· rec/ 오래된 음성 백업과 미완료 업로드는 Cloudflare 대시보드의 <b>라이프사이클 규칙</b>으로 자동 정리하세요 (docs/R2-비용-절감.md 참고).<br>· DB에서 사라진 회원/세션의 고아 영상 정리는 안전을 위해 별도 스크립트로 진행합니다 (문서 참고).</div>';
  } else {
    body='<div style="padding:20px;color:var(--tx-2)">데이터 없음</div>';
  }
  return '<div class="modal-overlay" onclick="if(event.target===this)closeStorageAudit()"><div class="modal" style="width:520px;max-height:92vh;overflow-y:auto">'
    +'<div class="modal-title">🧹 스토리지 진단·정리 <span style="font-size:11px;font-weight:400;color:var(--tx-3)">관리자 전용 · R2</span></div>'
    +body
    +'<div class="modal-actions"><button class="btn" onclick="closeStorageAudit()">닫기</button>'+(A.data?'<button class="btn" onclick="openStorageAudit()">새로고침</button>':'')+'</div>'
  +'</div></div>';
}
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
// ── 레슨 시간 유틸 ─────────────────────────────────────────
// 세션에 레슨 시각(time:'HH:MM')을 붙여 같은 날 여러 레슨을 순서대로 정렬한다.
function nowHalfHour(){ try{ var d=new Date(); var h=d.getHours(); var m=d.getMinutes()<30?'00':'30'; return (h<10?'0'+h:h)+':'+m; }catch(e){ return ''; } }
function timeLabel(t){ if(!t) return ''; var p=String(t).split(':'); var h=parseInt(p[0],10); var m=p[1]||'00'; if(isNaN(h)) return ''; var ap=h<12?'오전':'오후'; var hh=h%12; if(hh===0) hh=12; return ap+' '+hh+':'+m; }
function sessionTimeOptions(sel){
  sel=sel||'';
  var out='<option value=""'+(sel?'':' selected')+'>시간 미지정</option>';
  for(var h=6;h<=23;h++){ for(var mi=0;mi<60;mi+=30){ var v=(h<10?'0'+h:h)+':'+(mi===0?'00':'30'); out+='<option value="'+v+'"'+(sel===v?' selected':'')+'>'+timeLabel(v)+'</option>'; } }
  return out;
}
// 세션 정렬 — 날짜 최신순(내림차순). 같은 날은 레슨 시간 오름차순(먼저 한 레슨이 위).
// 시간 없는 세션은 시간 있는 세션보다 뒤로, 둘 다 없으면 기존 순서 유지(안정 정렬).
function sessionCompare(a,b){
  var dc=String(b.date||'').localeCompare(String(a.date||''));
  if(dc!==0) return dc;
  var ta=a.time||'', tb=b.time||'';
  if(ta&&tb) return ta.localeCompare(tb);
  if(ta) return -1; if(tb) return 1;
  return 0;
}

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
  syncAssessUp(mid, key, v);
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

function updateAssessAuthor(val){
  const mid = S.selectedMember;
  if(!S.assessments[mid]) S.assessments[mid] = {};
  S.assessments[mid]._author = val;
  if(!S.assessments[mid]._date) S.assessments[mid]._date = today();
  logActivity('평가자 지정', mid, val);
  save();
}
function toggleSession(id){
  if(!S.openSessions) S.openSessions = {};
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]);
  var cur = (S.openSessions[id]!==undefined) ? S.openSessions[id] : (sess.length>0 && sess.slice().sort(sessionCompare)[0].id===id);
  var willOpen = !cur;
  S.openSessions[id] = willOpen;
  var sc = document.querySelector('.content'); var top = sc ? sc.scrollTop : 0;
  S._animSession = willOpen ? id : null;
  render();
  S._animSession = null;
  var sc2 = document.querySelector('.content'); if(sc2) sc2.scrollTop = top; // 화면 위로 튐 방지
}
function toggleAllSessions(){
  if(!S.openSessions) S.openSessions = {};
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]);
  var allOpen = sess.length>0 && sess.every(function(s){return S.openSessions[s.id];});
  var sc = document.querySelector('.content'); var top = sc ? sc.scrollTop : 0;
  sess.forEach(function(s){ S.openSessions[s.id] = !allOpen; });
  render();
  var sc2 = document.querySelector('.content'); if(sc2) sc2.scrollTop = top;
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
  if(ns._aiPending && !confirm('🤖 AI 정리가 아직 진행 중입니다.\n지금 저장하면 받아쓰기 메모 상태로 저장됩니다.\n\n그래도 저장할까요? (취소 후 몇 초 기다리면 AI 정리가 반영됩니다)')) return;
  const mid = S.selectedMember;
  if(!S.sessions[mid]) S.sessions[mid] = [];
  var media = (ns.media||[]).slice();
  (ns.mediaUrls||[]).forEach(function(u){ u=(u||'').trim(); if(u) media.push({type:'url',name:u,data:u}); });
  const s = {
    id: suid(),
    date: ns.date,
    time: ns.time || undefined,
    author: ns.author,
    content: ns.content.trim(),
    rawTranscript: (ns.rawTranscript||'').trim() || undefined,   // 녹음 원문(신뢰도 담보)
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
  syncSessionUp(mid, s);
  generateLocalSummary(mid, s);
  render();
}

// ============ AI 세션 요약 + 운동 추천 ============

// ============ 데이터 백업 / 복구 (관리자) ============
// Supabase/R2 장애·오조작 대비 로컬 스냅샷. 회원·세션·평가·인수인계 전부 JSON 한 파일로.
function backupData(){
  try{
    var snap = {
      _type:'golfpt-backup', _ver:1, _at:new Date().toISOString(),
      members:S.members, assessments:S.assessments, sessions:S.sessions,
      handovers:S.handovers, deleteRequests:S.deleteRequests,
      deletedSessionIds:S.deletedSessionIds, deletedMemberIds:S.deletedMemberIds
    };
    var blob = new Blob([JSON.stringify(snap,null,2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date(); var stamp = d.getFullYear()+''+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');
    a.href=url; a.download='golfpt_backup_'+stamp+'.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    logAudit('system','데이터 백업 다운로드','',{members:(S.members||[]).length});
  }catch(e){ alert('백업 실패: '+(e.message||e)); }
}
function triggerRestore(){
  var inp=document.createElement('input'); inp.type='file'; inp.accept='application/json,.json';
  inp.onchange=function(){ var f=inp.files&&inp.files[0]; if(!f) return;
    var r=new FileReader();
    r.onload=function(){
      try{
        var snap=JSON.parse(r.result);
        if(snap._type!=='golfpt-backup') { if(!confirm('golfpt 백업 형식이 아닙니다. 그래도 복구를 시도할까요?')) return; }
        var mc=(snap.members||[]).length;
        if(!confirm('백업('+ (snap._at||'?') +')으로 복구합니다.\n회원 '+mc+'명 + 세션/평가.\n\n⚠️ 현재 이 기기의 회원/세션/평가가 백업 내용으로 덮어써지고, 서버에도 업로드됩니다.\n계속할까요?')) return;
        if(snap.members) S.members=snap.members;
        if(snap.assessments) S.assessments=snap.assessments;
        if(snap.sessions) S.sessions=snap.sessions;
        if(snap.handovers) S.handovers=snap.handovers;
        if(snap.deleteRequests) S.deleteRequests=snap.deleteRequests;
        if(snap.deletedSessionIds) S.deletedSessionIds=snap.deletedSessionIds;
        if(snap.deletedMemberIds) S.deletedMemberIds=snap.deletedMemberIds;
        save();
        // 서버로 밀어올리기(복구 반영)
        try{
          (S.members||[]).forEach(function(m){ syncMemberUp(m); });
          Object.keys(S.sessions||{}).forEach(function(mid){ (S.sessions[mid]||[]).forEach(function(s){ s._dirty=true; syncSessionUp(mid,s); }); });
          Object.keys(S.assessments||{}).forEach(function(mid){ Object.keys(S.assessments[mid]||{}).forEach(function(k){ if(k.indexOf('_')!==0) syncAssessUp(mid,k,S.assessments[mid][k]); }); });
        }catch(e){}
        logAudit('system','데이터 복구','',{members:mc});
        alert('복구 완료 — 회원 '+mc+'명. 서버 업로드는 백그라운드로 진행됩니다.');
        render();
      }catch(e){ alert('복구 실패: 잘못된 파일 ('+(e.message||e)+')'); }
    };
    r.readAsText(f);
  };
  inp.click();
}
