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
function openAddMember(){S.newMember=Object.assign({name:'',phone:'',email:'',registeredDate:today(),golfLessonCount:'',golfPTCount:'',golfLessonAmount:'',golfPTAmount:'',expiry:'',golfLessonExpiry:'',golfPTExpiry:'',assignedTo:[],memberType:S.sidebarTab||'pt_lesson',handicap:'',avgScore:'',goal:'',focusPoints:''},_rcFormState(null)); S.editMemberId=null; S.showAddMember=true; render();}
// ============ 녹음·AI 정리 동의 (v9.99) ============
// 회원 폼(인포데스크)과 회원 화면의 동의 배지 → 동의 창(인포데스크·관리자·프로·트레이너)이 같은 입력 칸을 쓴다.
// 입력 상태: rcMode 'yes'|'no'|'' · rcHow '서면'|'구두' · rcDate — _rc0 은 연 순간의 값(손대지 않았으면 저장 안 함)
function _rcFormState(m){
  var st=recConsentState(m);
  var o={rcMode:st, rcHow:(m&&m.recConsentHow==='구두')?'구두':'서면', rcDate:String((m&&(st==='no'?m.recConsentNo:m.recConsent))||'')||_rcToday()};
  o._rc0={mode:o.rcMode, how:o.rcHow, date:o.rcDate};
  return o;
}
// 입력한 동의 상태를 회원에 반영 — 바뀌었으면 true (기록한 직원·시각을 함께 남김)
function _rcApply(m, st){
  if(!m || !st) return false;
  var mode=st.rcMode||'', r0=st._rc0||{};
  if(mode===(r0.mode||'') && st.rcHow===r0.how && st.rcDate===r0.date) return false;   // 손대지 않음
  var d=/^\d{4}-\d{2}-\d{2}$/.test(String(st.rcDate||''))?String(st.rcDate):_rcToday();
  var y=mode==='yes'?d:'', h=mode==='yes'?(st.rcHow==='구두'?'구두':'서면'):'', n=mode==='no'?d:'';
  if((m.recConsent||'')===y && (m.recConsentHow||'')===h && (m.recConsentNo||'')===n) return false;
  m.recConsent=y; m.recConsentHow=h; m.recConsentNo=n; m.recConsentBy=mode?(S.currentUser||''):''; m.recConsentAt=new Date().toISOString();
  return true;
}
function _rcLog(m){
  var st=recConsentState(m), d=(st==='no'?m.recConsentNo:m.recConsent)||'';
  try{ logActivity('녹음 동의 기록', m.id, st==='yes'?('동의 · '+(m.recConsentHow||'')+' '+d):(st==='no'?('거부 · '+d):'기록 지움')); }catch(e){}
  try{ logAudit('member','녹음 동의 기록', m.name, {state:st||'none', how:m.recConsentHow||'', date:d}); }catch(e){}
}
// 동의 입력 칸 — path 는 상태 객체의 전역 경로(코드 상수 'S.newMember' / 'S.consentEdit')
function _rcFormHtml(path, st){
  var mode=st.rcMode||'';
  var opt=function(field, val, label, cls){ return '<div class="radio-opt'+(((st[field]||'')===val)?' '+cls:'')+'" onclick="'+path+'.'+field+'=\''+val+'\';render()">'+label+'</div>'; };
  var dateIn=function(lbl){ return '<div class="form-group"><label class="form-label">'+lbl+'</label><input type="date" class="form-input" value="'+esc(st.rcDate||'')+'" oninput="'+path+'.rcDate=this.value"></div>'; };
  var h='<div class="rc-form"><div class="radio-group rc-modes">'+opt('rcMode','yes','동의','sel-trainer')+opt('rcMode','no','거부','sel-no')+opt('rcMode','','기록 없음','sel-pro')+'</div>';
  if(mode==='yes') h+='<div class="member-info-row rc-row"><div class="form-group"><label class="form-label">받은 방법</label><div class="radio-group">'+opt('rcHow','서면','서면','sel-trainer')+opt('rcHow','구두','구두','sel-trainer')+'</div></div>'+dateIn('동의한 날')+'</div>';
  else if(mode==='no') h+='<div class="rc-row">'+dateIn('거부한 날')+'</div>';
  h+='<div class="rc-hint">'+(mode==='no'?'녹음하지 않고, 수업 메모도 AI로 정리하지 않아요. 레슨은 그대로 진행돼요.':(mode==='yes'?'서명한 동의서가 있으면 서면, 말로 동의하셨으면 구두를 골라 주세요.':'아직 여쭤보지 않았으면 그대로 두세요 — 녹음을 시작할 때 다시 물어봐요.'))+'</div></div>';
  return h;
}
// 회원 화면 이름 옆 배지 — 누르면 동의 창
function recConsentBadge(m){
  if(!m || m.ownerWatch) return '';
  var st=recConsentState(m);
  var sub=st==='yes'?((m.recConsentHow?m.recConsentHow+' ':'')+String(m.recConsent||'').slice(2).replace(/-/g,'.')):(st==='no'?String(m.recConsentNo||'').slice(2).replace(/-/g,'.'):'');
  return ' <button type="button" class="rc-badge rc-'+(st||'none')+'" onclick="event.stopPropagation();openConsentEdit(\''+safeId(m.id)+'\')" title="녹음·AI 정리 동의 — 눌러서 기록">🎙 '+(st==='yes'?'녹음 동의':(st==='no'?'녹음 거부':'녹음 동의 미기록'))+(sub?' <small>'+esc(sub)+'</small>':'')+'</button>';
}
function openConsentForm(){ try{ window.open('consent.html','_blank'); }catch(e){} }   // 인쇄용 동의서
function openConsentEdit(mid){
  var m=S.members.find(function(x){return x.id===mid;});
  if(!m || m.ownerWatch) return;
  S.consentEdit=Object.assign({mid:mid}, _rcFormState(m)); render();
}
function closeConsentEdit(){ S.consentEdit=null; render(); }
function saveConsentEdit(){
  var st=S.consentEdit; if(!st) return;
  var m=S.members.find(function(x){return x.id===st.mid;});
  S.consentEdit=null;
  if(m && _rcApply(m, st)){ _rcLog(m); save(); syncConsentUp(m); }   // 동의 칸만 서버에 (이 기기의 낡은 회원 정보로 다른 칸을 되돌리지 않게)
  render();
}
function renderConsentEdit(){
  var st=S.consentEdit; if(!st) return '';
  var m=S.members.find(function(x){return x.id===st.mid;}); if(!m) return '';
  var cur=recConsentState(m), isInfo=(S.currentRole==='infodesk'||S.currentRole==='admin');
  var now=cur?('지금 기록: '+(cur==='yes'?('동의 · '+(m.recConsentHow||'')+' · '+(m.recConsent||'')):('거부 · '+(m.recConsentNo||'')))+(m.recConsentBy?' · '+m.recConsentBy:'')):'지금 기록: 없음';
  return '<div class="modal-overlay" onclick="if(event.target===this)closeConsentEdit()"><div class="modal rc-modal">'
    +'<div class="modal-title">🎙 녹음·AI 정리 동의 — '+esc(m.name)+'님</div>'
    +'<div class="rc-now">'+esc(now)+'</div>'
    +_rcFormHtml('S.consentEdit', st)
    +(isInfo?'<button type="button" class="rc-print" onclick="openConsentForm()">🖨 동의서 인쇄</button>':'')
    +'<div class="modal-actions"><button class="btn" onclick="closeConsentEdit()">취소</button><button class="btn primary" onclick="saveConsentEdit()">저장</button></div>'
    +'</div></div>';
}
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
  Object.assign(S.newMember, _rcFormState(m));   // 녹음·AI 정리 동의
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
  if(_rcApply(m, S.newMember)) _rcLog(m);   // 녹음·AI 정리 동의 — 바꿨을 때만
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
      <div class="modal-title">인수인계 기록 — ${esc(list[0].memberName)}</div>
      ${list.map(function(h,i){
        return '<div class="handover-card'+(i===0?' latest':'')+'">' +
          '<div class="ho-header">' +
            '<span class="ho-date">'+esc(h.date)+'</span>' +
            '<span class="ho-badge">'+esc((h.from||[]).join(', '))+' → '+esc((h.to||[]).join(', '))+'</span>' +
          '</div>' +
          '<div class="ho-section"><strong>세션 현황:</strong> 총 '+h.totalSessions+'회 (프로 '+h.proSessions+' / PT '+h.trainerSessions+')</div>' +
          (h.warnings.length>0?'<div class="ho-section ho-warn"><strong>Body-Swing 주의 항목:</strong><ul>'+h.warnings.map(function(w){return '<li>'+esc(w)+'</li>';}).join('')+'</ul></div>':'') +
          (h.assessSummary.length>0?'<div class="ho-section"><strong>체형평가 이상 소견 ('+esc(h.assessDate)+'):</strong><ul>'+h.assessSummary.map(function(a){return '<li>'+esc(a)+'</li>';}).join('')+'</ul></div>':'') +
          '<div class="ho-section"><strong>최근 세션 (최대 10개):</strong><ol>'+h.recentSessions.map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ol></div>' +
          (h.videoLinks.length>0?'<div class="ho-section"><strong>최근 스윙 영상:</strong><ul>'+h.videoLinks.map(function(v){return '<li>'+esc(v)+'</li>';}).join('')+'</ul></div>':'') +
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
  S.quickNote={date:today(),time:nowHalfHour(),memo:'',tags:[],author:S.currentUser||''};
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
    id:suid(), date:S.quickNote.date, time:S.quickNote.time||undefined, author:S.quickNote.author,
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
      <div class="modal-title">레슨 노트 — ${m?esc(m.name)+' 회원님':''}</div>
      <div class="member-info-row">
        <div class="form-group">
          <label class="form-label">날짜</label>
          <input type="date" class="form-input" value="${esc(S.quickNote.date)}" onchange="S.quickNote.date=this.value">
        </div>
        <div class="form-group">
          <label class="form-label">레슨 시간</label>
          <select class="form-input" onchange="S.quickNote.time=this.value">${sessionTimeOptions(S.quickNote.time)}</select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" rows="3" placeholder="오늘 레슨 내용을 간단히..." oninput="S.quickNote.memo=this.value" autofocus>${esc(S.quickNote.memo)}</textarea>
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
  ctx.fillText(APP_BRAND.appName+' · '+today(),40,920);
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
      <p style="font-size:13.5px;color:var(--tx-2);margin-bottom:18px;line-height:1.6">${esc(m.name)} 회원님의 월간 레슨 리포트 카드입니다.<br>다운로드하거나 바로 공유하세요.</p>
      <div class="modal-actions card-actions">
        <button class="btn" onclick="closeImageCard()">닫기</button>
        <button class="btn" onclick="generateImageCard()">📥 다운로드</button>
        <button class="btn primary" onclick="shareImageCard()">📤 공유</button>
      </div>
    </div>
  </div>`;
}

// (v9.99) 옛 리포트 생성기(openReport → generateShareLink · renderReportModal) 삭제 — 부르는 곳이 없던 코드로, 회원 전화번호를 anon 으로 reports 에 쓰고
// 추측 가능한 'rpt_<시각>' 링크를 만들었다. 지금 회원 리포트는 js/app_dashboard.js 의 고정 링크(/r/) 흐름 하나뿐.

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
  // R2 정리 — 이 회원의 세션 첨부 영상/사진 + 샷 영상(전 앵글)을 모두 삭제. 서버 전파(cloud.deleteMember)가 서버에서 그 회원의
  // 샷(member_id)·첨부를 찾아 파일부터 지우고, 다 지워진 뒤에 행을 지운다(A2). 이 기기에만 있는 첨부·샷도 같이 넘긴다.
  // (기존엔 DB 행만 지우고 R2 객체는 남겨 삭제 회원의 영상이 영구 고아로 쌓이던 누수 → 그 뒤엔 보내고 잊기라 실패하면 남았다)
  var _keys=[], _shots=[];
  try{
    (S.sessions[id]||[]).forEach(function(s){ (s.media||[]).forEach(function(m){ var k=m.r2Key||m.mediaId; if(k && _keys.indexOf(k)===-1) _keys.push(k); if(m.mediaId){ try{ mediaDB.del(m.mediaId); }catch(e){} } }); });
    _shots=(S.shotEvents||[]).filter(function(s){ return s.memberId===id; });
  }catch(e){ console.warn('[r2] 회원삭제 정리 실패', e); }
  // 회원 tombstone — 부팅 머지가 삭제된 회원을 재업로드해 부활시키는 것 차단
  if(!S.deletedMemberIds) S.deletedMemberIds={};
  S.deletedMemberIds[id]=Date.now();
  S.members=S.members.filter(function(x){return x.id!==id;});
  delete S.assessments[id];delete S.sessions[id];delete S.deleteRequests[id];
  S.shotEvents=(S.shotEvents||[]).filter(function(s){ return s.memberId!==id; });
  if(S.selectedMember===id) S.selectedMember=S.members.length>0?S.members[0].id:null;
  logAudit('member','삭제 승인',mName,{id:id});
  save(); render();
  // 서버 전파 (파일 → 샷 → 세션·평가 → 회원)
  try{ cloud.deleteMember(id, {keys:_keys, shots:_shots}); }catch(e){}
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
function openPasswordChange(){S._pwForce=null; S.pwChange={current:'',newPw:'',confirm:''}; S.pwChangeError=''; S.showPwChange=true; render();}
function closePasswordChange(){S.showPwChange=false; S._pwForce=null; S.pwChangeError=''; render();}
// 비밀번호 변경 — 서버가 있으면 서버에(앱을 다시 깔아도 유지), SQL 실행 전이면 예전처럼 이 기기에.
// 초기 비밀번호로 막 로그인한 경우(S._pwForce)는 방금 친 비밀번호를 현재 비밀번호로 쓴다(다시 묻지 않음).
async function submitPasswordChange(){
  if(S.pwChangeBusy) return;
  var f=S._pwForce;
  var key = f ? f.key : pwKeyOf(S.currentRole, S.currentUser);
  var cur = f ? f.current : (S.pwChange.current||'');
  var nw = S.pwChange.newPw||'';
  var minLen = (key==='관리자') ? 8 : 6;   // 서버(pw_change)와 같은 기준
  var fail=function(msg){ S.pwChangeError=msg; render(); };
  if(!nw || nw.length<minLen) return fail('새 비밀번호는 '+minLen+'자 이상이어야 합니다');
  if(nw.length>64) return fail('새 비밀번호는 64자 이하로 해 주세요');
  if(nw !== S.pwChange.confirm) return fail('새 비밀번호가 일치하지 않습니다');
  if(nw === cur) return fail('지금 비밀번호와 다른 비밀번호로 정해 주세요');
  S.pwChangeBusy=true;   // 기기 캐시 기록까지 끝날 때까지 유지(두 번 눌러 옛 비밀번호로 재요청되는 것 방지)
  try{
    var r; try{ r=await pwServer.call('pw_change', {p_key:key, p_old:cur, p_new:nw}, 15000); }catch(e){ r={offline:true}; }
    var done=function(where){
      S.showPwChange=false; S.pwChangeError=''; S._pwForce=null; S.pwChange={current:'',newPw:'',confirm:''};
      alert(where==='server' ? '비밀번호가 변경되었습니다\n(서버에 저장 — 앱을 다시 깔거나 다른 기기에서도 이 비밀번호로 들어옵니다)' : '비밀번호가 변경되었습니다');
      render();
    };
    var legacy=function(){
      if(cur !== getPassword(key)) return fail('현재 비밀번호가 일치하지 않습니다');
      setPassword(key, nw); done('local');
    };
    if(r.error) return fail(r.error.message);   // 서버가 이유를 적어 거절
    if(r.data){
      var d=r.data;
      if(d.ok){ _tokFromPw(d, key, true); _forgetLegacyPw(key); await pwCache.put(key, nw); logAudit('auth','비밀번호 변경', key, {server:true}); return done('server'); }
      if(d.locked) return fail(_pwLockedMsg(d));
      if(d.busy) return fail('잠시 후 다시 시도해 주세요');
      if(d.expired) return fail(_pwExpiredMsg);
      if(d.weak) return fail(d.reuse ? '공개된 초기 비밀번호나 지금 비밀번호는 쓸 수 없어요' : '새 비밀번호는 '+minLen+'~64자로 해 주세요');
      if(d.unknown) return legacy();   // 서버에 아직 없는 계정 → 이 기기에 (관리자가 '직원 비밀번호 초기화'로 서버에 만들 수 있음)
      // '현재 비밀번호'가 이 기기에서 바꿔 쓰던 값이고 서버는 아직 초기값이면 → 초기값→새 비밀번호로 바로 이전
      var lg=_legacyStoredPw(key), df=DEFAULT_PASSWORDS[key];
      if(!f && lg && cur===lg && df && lg!==df){
        var m; try{ m=await pwServer.call('pw_change', {p_key:key, p_old:df, p_new:nw}, 15000); }catch(e){ m={offline:true}; }
        if(m.data && m.data.ok){ _tokFromPw(m.data, key, true); _forgetLegacyPw(key); await pwCache.put(key, nw); logAudit('auth','비밀번호 변경', key, {server:true, migrated:true}); return done('server'); }
        if(m.data && m.data.locked) return fail(_pwLockedMsg(m.data));
        if(m.data && !m.data.ok && !m.data.busy && !m.data.expired && !m.data.weak) _forgetLegacyPw(key);   // 서버는 이미 다른 값
      }
      return fail('현재 비밀번호가 일치하지 않습니다');
    }
    if(r.missing) return legacy();
    // 서버를 이미 쓰는데 연결이 안 되면 기기에만 바꾸지 않는다(서버와 어긋나므로). 시간 초과였다면 서버엔 반영됐을 수도 있음
    if(pwServer.known()) return fail('서버 확인이 안 됐어요 — 인터넷을 확인하고 다시 시도하거나, 새 비밀번호로 로그인이 되는지 확인해 주세요');
    return legacy();
  } finally { S.pwChangeBusy=false; }
}
// ===== 관리자: 직원 비밀번호 초기화 (서버) — 잊어버린 직원에게 임시 비밀번호를 정해 주면, 그 직원이 다음 로그인 때 새로 정한다
function openPwReset(){ S.pwReset={target:'', adminPw:'', newPw:'', error:'', busy:false}; render(); }
function closePwReset(){ S.pwReset=null; render(); }
function pwResetTargets(){
  var list=[{key:'infodesk', label:'인포데스크'}];
  (INSTRUCTORS||[]).forEach(function(i){ if(i && i.name) list.push({key:i.name, label:i.name}); });
  return list;
}
async function submitPwReset(){
  var R=S.pwReset; if(!R || R.busy) return;
  var fail=function(msg){ R.error=msg; render(); };
  if(!R.target) return fail('초기화할 직원을 고르세요');
  if(!pwResetTargets().some(function(t){ return t.key===R.target; })) return fail('목록에 있는 직원만 초기화할 수 있어요');
  if(!R.adminPw) return fail('관리자 비밀번호를 입력하세요');
  if(!R.newPw || R.newPw.length<6 || R.newPw.length>64) return fail('임시 비밀번호는 6~64자로 정하세요');
  R.busy=true; R.error=''; render();
  var r; try{ r=await pwServer.call('pw_admin_reset', {p_admin_pw:R.adminPw, p_target:R.target, p_new:R.newPw}, 15000); }catch(e){ r={offline:true}; }
  R.busy=false;
  if(S.pwReset!==R) return;
  if(r.missing) return fail('서버 비밀번호 설정(worker/supabase_passwords.sql)을 먼저 실행해야 쓸 수 있어요');
  if(r.error) return fail(r.error.message);   // 서버가 이유를 적어 거절 (예: 공개된 초기 비밀번호는 임시 비밀번호로 못 씀)
  if(!r.data) return fail('인터넷 연결을 확인한 뒤 다시 시도해 주세요');
  var d=r.data;
  if(d.locked) return fail(_pwLockedMsg(d));
  if(d.busy) return fail('잠시 후 다시 시도해 주세요');
  if(d.weak) return fail('임시 비밀번호는 6~64자로 정하세요');
  if(d.bad_target) return fail('관리자 계정은 여기서 초기화할 수 없어요 (SQL Editor 에서 — 안내문 참고)');
  if(!d.ok) return fail('관리자 비밀번호가 일치하지 않습니다');
  var label=(pwResetTargets().find(function(t){ return t.key===R.target; })||{}).label||R.target;
  logAudit('auth','직원 비밀번호 초기화', R.target, {});
  S.pwReset=null;
  alert(label+' 비밀번호를 초기화했습니다.\n\n그 직원이 방금 정한 임시 비밀번호로 들어가면, 바로 새 비밀번호를 정하는 창이 뜹니다.');
  render();
}
function openAuditLog(){S.showAuditLog=true; S.auditFilter=S.auditFilter||'all'; S.auditUserSelected=null; render();}

// ============ 녹음 원문 — 볼 때만 서버에서 (B3) ============
// 앱을 켤 때는 원문을 받지 않는다(받는 양의 94%). 관리자가 회원 화면을 열면 그 회원의 '원문이 있는 일지' id 목록만,
// [🎙 녹음 원문 전체 보기]를 누르면 그 일지 원문 하나만 받는다. 받은 원문은 이 화면 메모리에만 둔다(기기에 저장 안 함).
var _rawTx={}, _rawBusy={}, _rawIdx={};   // 일지id → 원문('' = 없음, null = 못 받음) · 받는 중 · 회원id → {ids, at, busy}
function _rawIdxReset(){ _rawIdx={}; }
function _rawIdxFor(mid){
  var x=_rawIdx[mid];
  if(x && (x.busy || Date.now()-x.at < (x.ids?5*60000:30000))) return x.ids;   // 받은 목록은 5분, 실패는 30초 동안 다시 안 물음
  if(!(typeof cloud!=='undefined' && cloud.enabled)) return null;
  var keep=x?x.ids:null;
  _rawIdx[mid]={busy:true, at:Date.now(), ids:keep};
  Promise.resolve(cloud.transcripts({mid:mid, idsOnly:true})).then(function(ids){
    _rawIdx[mid]={busy:false, at:Date.now(), ids:ids||keep};
    if(ids && S.currentRole==='admin' && S.selectedMember===mid) render();
  }, function(){ _rawIdx[mid]={busy:false, at:Date.now(), ids:keep}; });
  return keep;
}
// 관리자 회원 화면 일지 카드 안의 원문 칸 (app_render) — 원문이 없는 일지는 빈 문자열
function sessionRawBlock(mid, s){
  if(S.currentRole!=='admin' || !s) return '';
  var local=String(s.rawTranscript||'').trim() ? String(s.rawTranscript) : '';   // 이 기기에서 쓴 일지(아직 업로드 전 등)는 기기에 원문이 있음
  if(local && local.trim()===String(s.content||'').trim()) return '';            // 본문과 똑같으면 따로 안 보임(예전 규칙)
  if(!local){ var ids=_rawIdxFor(mid); if(!(ids && ids[s.id])) return ''; }
  var tx=local || _rawTx[s.id];
  var open=!!(S._rawOpen && S._rawOpen[s.id]);
  var has=(typeof tx==='string' && tx.trim());
  var body=!open ? '' : '<div class="raw-transcript-body">'+(has ? esc(tx).replace(/\n/g,'<br>') : (tx===null ? '원문을 불러오지 못했어요 — 접었다가 다시 눌러 주세요' : (tx===undefined ? '불러오는 중…' : '녹음 원문이 없어요')))+'</div>';
  return '<details class="raw-transcript"'+(open?' open':'')+'><summary onclick="event.preventDefault();toggleSessionRaw('+jsq(s.id)+')">🎙 녹음 원문 전체 보기'+(has?' ('+tx.trim().length+'자)':'')+' · 관리자 전용</summary>'+body+'</details>';
}
function toggleSessionRaw(sid){
  if(S.currentRole!=='admin' || !sid) return;
  if(!S._rawOpen) S._rawOpen={};
  S._rawOpen[sid]=!S._rawOpen[sid];
  var own=(S.sessions[S.selectedMember]||[]).find(function(x){ return x.id===sid; });
  var local=!!(own && String(own.rawTranscript||'').trim());   // 기기에 원문이 있는 일지(업로드 전 등)는 받지 않음
  if(S._rawOpen[sid] && !local && typeof _rawTx[sid]!=='string' && !_rawBusy[sid] && typeof cloud!=='undefined' && cloud.enabled){
    _rawBusy[sid]=1; delete _rawTx[sid];   // 못 받았던(null) 것은 다시 받기
    Promise.resolve(cloud.fetchSessionRaw(sid, true)).then(function(raw){ delete _rawBusy[sid]; _rawTx[sid]=(typeof raw==='string')?raw:null; render(); }, function(){ delete _rawBusy[sid]; _rawTx[sid]=null; render(); });
  }
  render();
}

// ============ 녹음 원문 보관함 (관리자 전용) ============
// 레슨 녹음 원문은 지도자 화면에는 남기지 않고(당사자 프라이버시),
// 관리자만 이 보관함에서 신뢰도 검증용으로 열람한다.
// 원문은 앱을 켤 때 받지 않으므로(B3) 보관함을 열 때 원문이 있는 일지의 id·원문만 한 번 받아 온다(닫으면 메모리에서도 버림).
function openTranscriptVault(){
  if(S.currentRole!=='admin'){alert('관리자 전용 기능입니다'); return;}
  S.showTranscriptVault=true; S.vaultAuthorFilter='all'; S.sidebarOpen=false;
  logAudit('system','녹음 원문 보관함 열람','',{});
  var v=S._vault={loading:true, tx:null, err:false};
  render();
  if(!(typeof cloud!=='undefined' && cloud.enabled)){ v.loading=false; v.tx={}; render(); return; }
  Promise.resolve(cloud.transcripts()).then(function(tx){ if(S._vault!==v) return; v.loading=false; v.tx=tx||{}; v.err=!tx; render(); },
    function(){ if(S._vault!==v) return; v.loading=false; v.tx={}; v.err=true; render(); });
}
function closeTranscriptVault(){S.showTranscriptVault=false; S._vault=null; render();}
function renderTranscriptVault(){
  if(!S.showTranscriptVault || S.currentRole!=='admin') return '';
  var v=S._vault||{loading:false, tx:{}, err:false};
  var rows=[];
  S.members.forEach(function(m){
    (S.sessions[m.id]||[]).forEach(function(s){
      var tx=String(s.rawTranscript||'').trim() ? String(s.rawTranscript) : String((v.tx&&v.tx[s.id])||'');
      if(tx.trim()) rows.push({member:m.name, s:s, tx:tx});
    });
  });
  rows.sort(function(a,b){return sessionCompare(a.s,b.s);});
  var authors={}; rows.forEach(function(r){authors[r.s.author||'?']=(authors[r.s.author||'?']||0)+1;});
  var filt=S.vaultAuthorFilter||'all';
  var shown=filt==='all'?rows:rows.filter(function(r){return (r.s.author||'?')===filt;});
  return '<div class="modal-overlay" onclick="if(event.target===this)closeTranscriptVault()"><div class="modal" style="width:680px;max-height:92vh;overflow-y:auto">'
    +'<div class="modal-title">🎙 녹음 원문 보관함 <span style="font-size:11px;font-weight:400;color:var(--tx-3)">관리자 전용 · '+rows.length+'건</span></div>'
    +'<div style="font-size:12px;color:var(--tx-2);margin-bottom:12px;padding:10px 14px;background:var(--bg-3);border-radius:var(--r);line-height:1.6">레슨 녹음 원문은 지도자·회원 화면에는 표시되지 않습니다. AI 일지 정리가 정확했는지 검증할 때만 열람하세요.</div>'
    +'<div class="audit-filter" style="margin-bottom:10px"><button class="audit-filter-btn'+(filt==='all'?' active':'')+'" onclick="S.vaultAuthorFilter=\'all\';render()">전체 '+rows.length+'</button>'
    +Object.keys(authors).map(function(a){return '<button class="audit-filter-btn'+(filt===a?' active':'')+'" onclick="S.vaultAuthorFilter='+jsq(a)+';render()">'+esc(a)+' '+authors[a]+'</button>';}).join('')
    +'</div>'
    +(v.loading?'<div class="empty-state vault-loading" style="padding:30px">녹음 원문을 불러오는 중…</div>':'')
    +(v.err?'<div class="empty-state vault-err" style="padding:12px;color:#993c1d">서버에서 원문을 불러오지 못했어요 — 네트워크 확인 후 다시 열어 주세요</div>':'')
    +(v.loading?'':(shown.length===0?'<div class="empty-state" style="padding:30px">녹음 원문이 저장된 세션이 없습니다</div>':
      shown.map(function(r){
        var s=r.s;
        return '<details class="raw-transcript" style="margin-bottom:8px"><summary>'+esc(s.date)+' · <b>'+esc(r.member)+'</b> 회원 · '+esc(s.author||'')+' · '+r.tx.trim().length+'자</summary>'
          +'<div class="raw-transcript-body">'+esc(r.tx).replace(/\n/g,'<br>')+'</div></details>';
      }).join('')))
    +'<div class="modal-actions"><button class="btn" onclick="closeTranscriptVault()">닫기</button></div>'
  +'</div></div>';
}

// ============ 스토리지 진단·정리 (관리자 전용, A6 · v9.99) ============
// R2 버킷 전체를 훑어 구성(종류별 개수·용량)을 보여주고, 아무 데도 안 쓰이는 '고아' 타석 영상만 골라 지울 수 있게 한다 — 워커 /__list 필요.
// 예전 도구는 이 기기의 최근 샷 1000개만 보고 리포트·일지를 보지 않아, 정면·클럽 영상(가장 큰 쓰레기)은 못 보고
// 리포트·저장 샷이 쓰는 영상을 지울 수 있었다. 이제 정리 후보는 네 조건을 모두 만족하는 파일뿐이다(A1):
//  ① DB 의 모든 표·모든 행(1000행 넘게 끝까지, 리포트 본문 포함) 어디에도 그 키가 적혀 있지 않음
//  ② 올린 지 7일이 지남(최근 업로드 보호)  ③ 타석 폴더의 샷 영상(<타석>/<샷id>_scene|fo|club) — rec/·orig/·일지 첨부(m_)·hb/ 는 제외
//  ④ 파일 이름의 샷 id 로 된 행이 없음(측정ID 파일은 'tm_'+측정ID 행)
// 지우기 전에 후보 목록(CSV)을 내려받아 확인하고, 지우기 직전에 DB 를 한 번 더 대조한다. 6개씩 동시에, 실패가 1%를 넘으면 멈춘다.
// 목록은 관리자 열쇠(X-Admin-Key)·관리자 토큰으로(wFetch), 지우기는 관리자 토큰 또는 공용 열쇠로(r2.removeSure — 없는 파일 404 = 성공).
var SA_KEEP_DAYS = 7, SA_CONC = 6;
var _SA_CLS = { scene:'측면·내장 카메라 영상', fo:'정면 영상', club:'클럽 영상', mov:'원본 형식 영상(.mov·.mkv)', rec:'녹음·전사 백업(rec/)', orig:'요청한 원본(orig/)', root:'일지 첨부 등', hb:'타석 PC 신호(hb/)', other:'기타' };
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
  if(S.storageAudit && S.storageAudit.purging && !S.storageAudit.purging.finished) return;   // 지우는 중에는 다시 진단하지 않음
  var A={ loading:true, step:'list', listed:0, error:'', data:null };
  S.storageAudit=A; S.sidebarOpen=false; render();
  logAudit('system','스토리지 진단 열람','',{});
  try{
    var objects=[], cursor=null, pages=0;
    do{
      var res=await r2.list(cursor);
      if(S.storageAudit!==A) return;   // 그사이 창을 닫았거나 다시 열었음
      // 워커 v2 에 관리자 열쇠(ADMIN_KEY)를 넣은 뒤 — 관리자 토큰이 없으면 열쇠를 물어본다
      if(!res && (r2.lastListStatus===401 || r2.lastListStatus===403)){ S.storageAudit={ loading:false, error:'', data:null, needKey:true, badKey:!!_adminKey() }; render(); return; }
      if(!res){ throw new Error('목록 조회 실패 — 워커에 /__list 라우트가 배포됐는지 확인하세요 (worker/golf-pt-storage-worker.js 최신본을 Cloudflare 에 붙여넣기)'); }
      (res.objects||[]).forEach(function(o){ objects.push(o); });
      cursor=res.cursor; pages++; A.listed=objects.length; render();
    }while(cursor && pages<60);   // 최대 6만 객체 안전 상한
    // 보호 목록 — 이 기기의 사본이 아니라 서버 DB 의 모든 표·모든 행을 지금 끝까지 다시 읽는다
    var noDb=!(typeof cloud!=='undefined' && cloud.enabled);
    A.step='db'; render();
    var P=noDb ? null : await cloud.storageProtect();
    if(S.storageAudit!==A) return;
    S.storageAudit={ loading:false, error:'', data:analyzeStorage(objects, P, Date.now()), truncated:!!cursor, noDb:noDb };
  }catch(e){
    if(S.storageAudit!==A) return;
    S.storageAudit={ loading:false, error:String(e&&e.message||e), data:null };
  }
  render();
}
function closeStorageAudit(){ S.storageAudit=null; render(); }
// 관리자 열쇠 입력 → 이 탭에만 보관(sessionStorage) 후 다시 조회
function submitAdminKey(){ var el=document.getElementById('adm-key-in'); var v=el ? String(el.value||'').trim() : ''; if(!v) return; setAdminKey(v); openStorageAudit(); }
function _saClass(k){
  if(/^rec\//.test(k)) return 'rec';
  if(/^orig\//.test(k)) return 'orig';
  if(/^hb\//.test(k)) return 'hb';
  if(k.indexOf('/')===-1) return 'root';
  if(/\.(mov|mkv)$/i.test(k)) return 'mov';
  if(/_scene\.[A-Za-z0-9]+$/.test(k)) return 'scene';
  if(/_fo\.[A-Za-z0-9]+$/.test(k)) return 'fo';
  if(/_club\.[A-Za-z0-9]+$/.test(k)) return 'club';
  return 'other';
}
// 파일 이름의 샷 id — '<타석>/<샷id>_(scene|fo|club).(mp4|mov|mkv)' 만(대소문자까지 에이전트·워커 v2 의 키 규칙 그대로). 1·2번 타석 내장 영상은
// '<측정ID>_scene' → 행은 'tm_'+측정ID. 다른 모양(rec/·orig/·첨부·hb/·모르는 이름)은 null → 정리 후보가 될 수 없다
function _saShotIds(k){
  var m=/^bay[A-Za-z0-9_-]{1,29}\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})_(?:scene|fo|club)\.(?:mp4|mov|mkv)$/.exec(k);
  if(!m) return null;
  return m[1].indexOf('tm_')===0 ? [m[1]] : [m[1], 'tm_'+m[1]];
}
// 지우지 않는 이유 — 'ref'(DB·리포트에 적힘) | 'excl'(정리 대상 아님) | 'recent'(7일 안 됨·업로드 시각 모름) | 'row'(샷 행 있음) | ''(정리 후보)
function _saWhy(o, P, now){
  var k=String(o.key||'');
  if(P.strs[k]) return 'ref';
  var ids=_saShotIds(k);
  if(!ids) return 'excl';
  if(!(+o.uploaded>0) || now-(+o.uploaded) < SA_KEEP_DAYS*86400000) return 'recent';
  for(var i=0;i<ids.length;i++){ if(P.shotIds[ids[i]]) return 'row'; }
  return '';
}
function _saKst(ms){ return ms ? new Date(ms+9*3600000).toISOString().slice(0,16).replace('T',' ') : ''; }
// objects: /__list 결과 [{key,size,uploaded}] · P: cloud.storageProtect() (null 이면 구성만, 정리 후보 계산 안 함)
function analyzeStorage(objects, P, now){
  now=now||Date.now();
  var cls={}; Object.keys(_SA_CLS).forEach(function(k){ cls[k]={n:0, b:0, c:0}; });
  var total={n:objects.length, b:0}, why={ref:{n:0,b:0}, excl:{n:0,b:0}, recent:{n:0,b:0}, row:{n:0,b:0}};
  var cand={n:0, b:0, list:[], month:{}};
  objects.forEach(function(o){
    var k=String(o.key||''), s=+o.size||0, c=_saClass(k);
    total.b+=s; cls[c].n++; cls[c].b+=s;
    if(!P) return;
    var w=_saWhy(o, P, now);
    if(w){ why[w].n++; why[w].b+=s; return; }
    cls[c].c++; cand.n++; cand.b+=s;
    var it={key:k, size:s, uploaded:+o.uploaded, cls:c}; cand.list.push(it);
    var mo=_saKst(it.uploaded).slice(0,7); if(!cand.month[mo]) cand.month[mo]={n:0, b:0}; cand.month[mo].n++; cand.month[mo].b+=s;
  });
  cand.list.sort(function(a,b){ return (a.uploaded-b.uploaded) || (a.key<b.key?-1:(a.key>b.key?1:0)); });
  return {total:total, cls:cls, why:why, cand:cand, protect:!!P, rows:P?P.rows:null};
}
// 정리 후보 목록 CSV (키·크기·업로드 시각·분류) — 회원 영상 주소 목록이므로 밖으로 공유하지 않는다. 내려받아야 [지우기]가 켜진다
function storageCandCsv(){
  var A=S.storageAudit, d=A&&A.data; if(S.currentRole!=='admin' || !d || !d.cand || !d.cand.list.length) return;
  var cell=function(v){ v=String(v==null?'':v); if(/^[=+\-@\t\r]/.test(v)) v="'"+v; return '"'+v.replace(/"/g,'""')+'"'; };   // 엑셀 수식으로 읽히지 않게
  var rows=[['키','크기(바이트)','업로드(한국 시간)','분류']].concat(d.cand.list.map(function(o){ return [o.key, o.size, _saKst(o.uploaded), o.cls]; }));
  var csv=rows.map(function(r){ return r.map(cell).join(','); }).join('\n');
  try{
    var blob=new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='storage_cleanup_'+today()+'.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }catch(e){ alert('목록을 내려받지 못했어요'); return; }
  A.csvAt=Date.now();
  logAudit('system','스토리지 정리 후보 목록 내려받기','',{count:d.cand.n, bytes:d.cand.b});
  render();
}
var _saRT=null;
function _saRenderSoon(){ if(_saRT) return; _saRT=setTimeout(function(){ _saRT=null; try{ render(); }catch(e){} }, 400); }
// 정리 후보 지우기 — 지우기 직전에 DB 를 다시 대조(그사이 리포트·샷이 쓰게 된 파일은 남김) → 첫 파일은 혼자(지금 워커 v1 의 CORS 거절을 한 번만),
// 나머지는 6개씩 동시에. 실패가 1%를 넘으면(전체의 1%, 또는 100개 넘게 지운 뒤 지금까지의 1%) 멈춘다. 창을 닫아도 멈춘다
async function purgeStorageOrphans(){
  var A=S.storageAudit, d=A&&A.data;
  if(S.currentRole!=='admin' || !d || !d.protect || !d.cand || !d.cand.n || A.purging) return;
  if(!A.csvAt){ alert('먼저 후보 목록(CSV)을 내려받아 확인해 주세요'); return; }
  if(!confirm('정리 후보 '+d.cand.n.toLocaleString()+'개('+_fmtBytes(d.cand.b)+')를 저장소에서 지웁니다.\n\n· DB 어디에도 안 쓰이고 7일이 지난, 샷 기록 없는 타석 영상만\n· 지우기 직전에 서버 자료를 한 번 더 대조해요\n· 레슨이 없는 시간에 해 주세요 · 되돌릴 수 없습니다\n\n계속할까요?')) return;
  var R={checking:true, done:0, fail:0, total:0, bytes:0, skipped:0, stopped:false, finished:false};
  A.purging=R; render();
  var P=null; try{ P=await cloud.storageProtect(); }catch(e){ P=null; }
  if(S.storageAudit!==A) return;
  if(!P){ A.purging=null; render(); alert('서버 자료를 다시 확인하지 못해 아무것도 지우지 않았어요 — 잠시 후 다시 해 주세요'); return; }
  var now=Date.now(), list=d.cand.list.filter(function(o){ return !_saWhy(o, P, now); });
  // 마지막으로 후보 파일 이름의 샷 id 를 서버에 콕 집어 다시 묻는다(80개씩) — 전체 대조 중에 놓쳤거나 그 뒤에 생긴 샷 행이 있으면 지우지 않는다
  var sids=[], seen={}; list.forEach(function(o){ (_saShotIds(o.key)||[]).forEach(function(id){ if(!seen[id]){ seen[id]=1; sids.push(id); } }); });
  var have=sids.length ? await cloud.shotsByIds(sids, true) : {};
  if(S.storageAudit!==A) return;
  if(!have){ A.purging=null; render(); alert('서버 자료를 다시 확인하지 못해 아무것도 지우지 않았어요 — 잠시 후 다시 해 주세요'); return; }
  list=list.filter(function(o){ return !(_saShotIds(o.key)||[]).some(function(id){ return have[id]; }); });
  R.checking=false; R.total=list.length; R.skipped=d.cand.list.length-list.length; render();
  var i=0, closed=false;
  var tooMany=function(){ var at=R.done+R.fail; return R.fail>R.total*0.01 || (at>=100 && R.fail>at*0.01); };
  var alive=function(){ if(S.storageAudit!==A) closed=true; return !closed && !R.stopped; };
  var one=async function(o){ var ok=false; try{ ok=await r2.removeSure(o.key); }catch(e){ ok=false; } if(ok){ R.done++; R.bytes+=o.size||0; } else R.fail++; if(tooMany()) R.stopped=true; _saRenderSoon(); };
  if(list.length && alive()) await one(list[i++]);
  var lane=async function(){ while(i<list.length && alive()){ await one(list[i++]); } };
  var lanes=[]; for(var k=0;k<SA_CONC;k++) lanes.push(lane());
  await Promise.all(lanes);
  R.finished=true; R.left=list.length-R.done-R.fail; R.closed=closed;
  logAudit('system','스토리지 고아 정리','',{count:R.done, bytes:R.bytes, fail:R.fail, stopped:R.stopped, closed:closed, skipped:R.skipped});
  render();
}
function renderStorageAudit(){
  var A=S.storageAudit; if(!A || S.currentRole!=='admin') return '';
  var body;
  if(A.loading){
    body='<div class="sa-loading">'+(A.step==='db' ? '서버 자료(모든 표·모든 행)와 대조하는 중…' : '저장소 목록을 불러오는 중…'+(A.listed?' '+(+A.listed).toLocaleString()+'개':''))+'<small>파일이 많으면 몇십 초 걸릴 수 있어요</small></div>';
  } else if(A.error){
    body='<div style="padding:18px;background:#fdecec;border-radius:10px;color:#993c1d;font-size:13px;line-height:1.7">'+String(A.error).replace(/</g,'&lt;')+'</div>';
  } else if(A.needKey){
    body='<div style="padding:16px;background:#fff7ea;border:1px solid #f0ddb8;border-radius:12px;font-size:13px;line-height:1.7">'
      +'<div style="font-weight:800;color:#8a5a10">🔑 관리자 열쇠가 필요해요'+(A.badKey?' — 넣은 열쇠가 맞지 않아요':'')+'</div>'
      +'<div style="font-size:11.5px;color:var(--tx-2);margin:2px 0 10px">저장 워커 설정(Cloudflare)의 ADMIN_KEY 값 · 이 기기에 남지 않고 앱을 닫으면 지워져요</div>'
      +'<input type="password" class="form-input" id="adm-key-in" autocomplete="off" placeholder="관리자 열쇠" onkeydown="if(event.key===\'Enter\')submitAdminKey()">'
      +'<button class="btn primary" style="width:100%;margin-top:8px" onclick="submitAdminKey()">확인</button></div>';
  } else if(A.data){
    var d=A.data, R=A.purging, N=function(n){ return (+n||0).toLocaleString(); };
    var rows=Object.keys(_SA_CLS).filter(function(k){ return d.cls[k] && d.cls[k].n; }).map(function(k){ var c=d.cls[k];
      return '<tr><td>'+_SA_CLS[k]+'</td><td class="n">'+N(c.n)+'개</td><td class="n b">'+_fmtBytes(c.b)+'</td><td class="n">'+(d.protect?(c.c?'<b>'+N(c.c)+'개</b>':'0'):'-')+'</td></tr>'; }).join('');
    body='<div class="sa-sum">전체 <b>'+N(d.total.n)+'개</b> · <b>'+_fmtBytes(d.total.b)+'</b>'+(A.truncated?' <span class="sa-warn">(목록 상한 도달 — 일부만 집계)</span>':'')+'</div>'
      +'<table class="sa-tbl"><thead><tr><th>종류</th><th class="n">개수</th><th class="n">용량</th><th class="n">정리 후보</th></tr></thead><tbody>'+rows+'</tbody></table>';
    if(!d.protect){
      body+='<div class="sa-box warn">'+(A.noDb ? '서버 DB 에 연결되지 않아 정리 후보를 계산하지 않았어요.' : '⚠️ 서버 자료를 끝까지 확인하지 못해 정리 후보를 계산하지 않았어요 — 네트워크·로그인 상태를 확인하고 [새로고침]을 눌러 주세요.')+'</div>';
    } else {
      var w=d.why;
      body+='<div class="sa-keep">지우지 않는 파일 — DB·리포트에 적힌 파일 '+N(w.ref.n)+'개 · 올린 지 7일 안 됨 '+N(w.recent.n)+'개 · 샷 기록이 남은 영상 '+N(w.row.n)+'개 · 정리 대상 아님(녹음 백업·원본·일지 첨부 등) '+N(w.excl.n)+'개</div>';
      if(!d.cand.n){
        body+='<div class="sa-box ok">✅ 지울 고아 파일이 없어요</div>';
      } else {
        var months=Object.keys(d.cand.month).sort().map(function(m){ var x=d.cand.month[m]; return '<span>'+m.replace('-','.')+' <b>'+N(x.n)+'개</b> '+_fmtBytes(x.b)+'</span>'; }).join('');
        body+='<div class="sa-box cand"><div class="sa-h">🧹 정리 후보 '+N(d.cand.n)+'개 · '+_fmtBytes(d.cand.b)+'</div>'
          +'<div>DB 어디에도 안 쓰이고, 올린 지 7일이 지났고, 그 샷 기록도 없는 타석 영상만 골랐어요 (녹음 백업·원본·일지 첨부는 제외).</div>'
          +'<div class="sa-months">'+months+'</div>';
        if(R){
          if(R.checking) body+='<div class="sa-prog">지우기 전에 서버 자료를 다시 대조하는 중…</div>';
          else if(!R.finished) body+='<div class="sa-prog">지우는 중 '+N(R.done+R.fail)+' / '+N(R.total)+(R.fail?' · 실패 '+N(R.fail):'')+'</div>';
          else if(R.stopped) body+='<div class="sa-prog err">⚠️ 실패가 1%를 넘어 멈췄어요 — '+N(R.done)+'개 지움 · 실패 '+N(R.fail)+'개 · 나머지 '+N(R.left)+'개는 그대로예요</div>';
          else if(R.closed) body+='<div class="sa-prog err">정리를 멈췄어요 — '+N(R.done)+'개 지움</div>';
          else body+='<div class="sa-prog ok">완료 — '+N(R.done)+'개 지움 ('+_fmtBytes(R.bytes)+')'+(R.fail?' · 실패 '+N(R.fail)+'개':'')+'</div>';
          if(R.skipped && !R.checking) body+='<div class="sa-note">그사이 DB 에 적힌 '+N(R.skipped)+'개는 남겼어요</div>';
          if(R.finished) body+='<div class="sa-note">[새로고침]으로 다시 진단할 수 있어요</div>';
        } else {
          body+='<div class="sa-acts"><button class="btn sa-csv" onclick="storageCandCsv()">⬇ 후보 목록(CSV)</button>'
            +'<button class="btn primary sa-del"'+(A.csvAt?'':' disabled')+' onclick="purgeStorageOrphans()">🧹 후보 '+N(d.cand.n)+'개 지우기</button></div>'
            +(A.csvAt?'':'<div class="sa-note">지우기 전에 후보 목록을 내려받아 확인해 주세요</div>');
        }
        body+='<div class="sa-note">후보 목록은 회원 영상 주소 목록이라 밖으로 공유하지 마세요 · 지우기 직전에 서버 자료를 한 번 더 대조하고, 실패가 1%를 넘으면 멈춰요 · 레슨이 없는 시간에 해 주세요</div></div>';
      }
    }
  } else {
    body='<div style="padding:20px;color:var(--tx-2)">데이터 없음</div>';
  }
  var busy=!!(A.purging && !A.purging.finished);
  return '<div class="modal-overlay" onclick="if(event.target===this)closeStorageAudit()"><div class="modal sa-modal" style="width:520px;max-height:92vh;overflow-y:auto">'
    +'<div class="modal-title">🧹 스토리지 진단·정리 <span style="font-size:11px;font-weight:400;color:var(--tx-3)">관리자 전용 · R2</span></div>'
    +body
    +'<div class="modal-actions"><button class="btn" onclick="closeStorageAudit()">'+(busy?'멈추고 닫기':'닫기')+'</button>'+(A.data&&!busy?'<button class="btn" onclick="openStorageAudit()">새로고침</button>':'')+'</div>'
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
function timeLabel(t){ if(!t) return ''; var p=String(t).split(':'); var h=parseInt(p[0],10); var m=(/^\d{1,2}/.exec(p[1]||'')||['00'])[0]; if(isNaN(h)) return ''; var ap=h<12?'오전':'오후'; var hh=h%12; if(hh===0) hh=12; return ap+' '+hh+':'+m; }
function sessionTimeOptions(sel){
  sel=sel||'';
  var out='<option value=""'+(sel?'':' selected')+'>시간 미지정</option>';
  for(var h=6;h<=23;h++){ for(var mi=0;mi<60;mi+=30){ var v=(h<10?'0'+h:h)+':'+(mi===0?'00':'30'); out+='<option value="'+v+'"'+(sel===v?' selected':'')+'>'+timeLabel(v)+'</option>'; } }
  return out;
}
// ═══════════════════════════════════════════════════════════════
// 세션 정렬 — 앱 전체의 단 하나뿐인 기준. 목록/리포트/보관함 모두 이걸 쓴다.
// 규칙: "언제나 최신이 맨 위".
//   ① 날짜 내림차순            (07-16 → 07-15)
//   ② 같은 날은 시간 내림차순  (오후 3:30 → 오전 10:00)
//   ③ 시간 미지정은 그 날의 맨 아래
//   ④ 그래도 같으면 기록을 만든 순서 내림차순 (나중에 쓴 일지가 위)
// ⚠️ 이 규칙을 고치면 아래 selfTestSessionOrder() 도 같이 고칠 것.
//    ?selftest=1 로 앱을 열면 콘솔에서 정렬이 자동 검증된다.
// ═══════════════════════════════════════════════════════════════
function sessionCompare(a,b){
  var dc=String(b.date||'').localeCompare(String(a.date||''));
  if(dc!==0) return dc;
  var ta=a.time||'', tb=b.time||'';
  if(ta&&tb&&ta!==tb) return tb.localeCompare(ta);   // ② 늦게 한 레슨이 위
  if(ta&&!tb) return -1;                             // ③ 시간 있는 기록이 위
  if(!ta&&tb) return 1;
  return sessionCreatedAt(b)-sessionCreatedAt(a);    // ④ 나중에 만든 기록이 위
}
// 차트·추이용 — 오래된 것부터. sessionCompare 의 정확한 역순이라 규칙이 어긋날 일이 없다.
function sessionCompareAsc(a,b){ return -sessionCompare(a,b); }
// 기록이 만들어진 시각(ms). _addedAt(ISO) 우선, 없으면 id('s'+Date.now()+랜덤)에서 추출.
// 클라우드에서 받아온 옛 기록엔 _addedAt 이 없어도 id 로 순서가 잡힌다.
function sessionCreatedAt(s){
  if(!s) return 0;
  if(s._addedAt){ var t=Date.parse(s._addedAt); if(!isNaN(t)) return t; }
  var m=/^s(\d{10,})/.exec(String(s.id||''));
  return m?parseInt(m[1],10):0;
}

// 정렬 자기검증 — 규칙이 다시 뒤집히는 사고를 막는 안전장치.
// 앱 주소 뒤에 ?selftest=1 을 붙여 열면 실행되고, 실패하면 콘솔에 에러 + 화면 상단 배너.
function selfTestSessionOrder(){
  var CASES=[
    { name:'같은 날 — 늦은 시간이 위 (현장 신고 케이스)',
      input:[{id:'s1',date:'2026-07-15',time:'10:00'},{id:'s2',date:'2026-07-15',time:'15:30'}],
      want:['s2','s1'] },
    { name:'날짜 우선 — 최신 날짜가 위',
      input:[{id:'s1',date:'2026-07-14',time:'23:00'},{id:'s2',date:'2026-07-15',time:'06:00'}],
      want:['s2','s1'] },
    { name:'시간 미지정은 그 날의 맨 아래',
      input:[{id:'s1',date:'2026-07-15'},{id:'s2',date:'2026-07-15',time:'09:00'}],
      want:['s2','s1'] },
    { name:'날짜·시간 같으면 나중에 쓴 일지가 위',
      input:[{id:'sA',date:'2026-07-15',time:'10:00',_addedAt:'2026-07-15T01:00:00.000Z'},
             {id:'sB',date:'2026-07-15',time:'10:00',_addedAt:'2026-07-15T02:00:00.000Z'}],
      want:['sB','sA'] },
    { name:'_addedAt 없어도 id 로 생성순 판별',
      input:[{id:'s1752300000000abc',date:'2026-07-15',time:'10:00'},
             {id:'s1752400000000xyz',date:'2026-07-15',time:'10:00'}],
      want:['s1752400000000xyz','s1752300000000abc'] },
    { name:'하루 3건 뒤죽박죽 입력 → 최신순 정렬',
      input:[{id:'s1',date:'2026-07-15',time:'10:00'},{id:'s2',date:'2026-07-16',time:'08:00'},
             {id:'s3',date:'2026-07-15',time:'15:30'},{id:'s4',date:'2026-07-15'}],
      want:['s2','s3','s1','s4'] },
    { name:'차트용 오름차순은 최신순의 정확한 역순',
      input:[{id:'s1',date:'2026-07-15',time:'10:00'},{id:'s2',date:'2026-07-15',time:'15:30'},
             {id:'s3',date:'2026-07-16',time:'08:00'}],
      want:['s1','s2','s3'], asc:true },
  ];
  var fails=[];
  CASES.forEach(function(c){
    var got=c.input.slice().sort(c.asc?sessionCompareAsc:sessionCompare).map(function(s){return s.id;});
    if(got.join(',')!==c.want.join(',')) fails.push(c.name+' → 기대 ['+c.want+'] 실제 ['+got+']');
  });
  if(fails.length){
    console.error('❌ 세션 정렬 자기검증 실패 ('+fails.length+'/'+CASES.length+')');
    fails.forEach(function(f){console.error('   · '+f);});
    try{
      var d=document.createElement('div');
      d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;font:600 13px/1.5 system-ui;padding:10px 14px;white-space:pre-wrap';
      d.textContent='❌ 세션 정렬 자기검증 실패 '+fails.length+'건 — 콘솔 확인\n'+fails.join('\n');
      document.body.appendChild(d);
    }catch(e){}
  }else{
    console.log('✅ 세션 정렬 자기검증 통과 ('+CASES.length+'/'+CASES.length+') — 최신 기록이 항상 맨 위');
  }
  return fails;
}
try{
  if(typeof location!=='undefined' && /[?&]selftest=1/.test(location.search)){
    if(typeof document!=='undefined' && document.readyState==='loading') document.addEventListener('DOMContentLoaded',selfTestSessionOrder);
    else setTimeout(selfTestSessionOrder,0);
  }
}catch(e){}

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
  // AI 정리 진행 중이어도 그냥 저장 — 결과가 도착하면 저장된 일지에 자동 반영된다(아래 _savedTo).
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
    // 기기 저장 공간이 꽉 차도 방금 쓴 일지를 버리지 않는다(예전엔 조용히 사라짐) — 서버로 바로 올리고 알린다 (v9.98)
    try{ liveToast('⚠️ 이 기기 저장 공간이 부족해요 — 일지는 서버로 바로 올립니다(인터넷 연결 필요). 계속되면 관리자에게 알려주세요','err'); }catch(e){}
  }
  S.showAddSession = false;
  render();
  syncSessionUp(mid, s);
  generateLocalSummary(mid, s);
  try{ if(typeof autoPublishReport==='function') autoPublishReport(mid, s.author); }catch(e){}   // 고정 리포트 링크 자동 갱신 — 검토 담당 = 일지 작성자
  try{ if(typeof notifyCoInstructors==='function') notifyCoInstructors(mid, s); }catch(e){}   // 같이 맡은 담당자에게 알림
  render();
  // 녹음 일지를 AI 정리 전(원문 조각 상태)으로 저장한 경우:
  // (1) AI 요청이 이미 진행 중이면 → 저장 위치만 남기고(_savedTo) 그 결과를 재사용 (요청 중복 없음)
  // (2) 진행 중인 요청이 없으면(실패 후 저장 등) → 새로 백그라운드 정리
  try{
    if(String(s.content||'').indexOf('AI 정리 대기')!==-1 && typeof aiEnabled==='function' && aiEnabled()){
      if(ns._aiPending){
        ns._savedTo={ mid:mid, sessId:s.id, tmSummary:ns._tmSummary||'' };
        _aiInflight[s.id]=Date.now();   // 진행 중 표시 — 스위퍼 중복 호출·SW 리로드 방지
        try{ liveToastSafe('💾 저장 완료 — AI 정리가 끝나면 자동 반영됩니다'); }catch(e){}
      } else if(s.rawTranscript){
        bgAiCleanupSaved(mid, s.id, s.rawTranscript, s.author, ns._tmSummary||'');
      }
      // 안전망: 진행 중이던 요청이 어떤 이유로든 결과를 못 돌려주면(네트워크 끊김·탭 절전·
      // 조용한 실패) 앱이 켜져 있는 동안 몇 번 더 스스로 재시도한다 — 부팅·복귀 트리거만으로는
      // "저장하고 앱을 계속 보고 있는" 경우를 못 잡았다
      [25000, 75000, 180000].forEach(function(ms){ setTimeout(function(){ try{ retryPendingAiSummaries(true); }catch(e){} }, ms); });
    }
  }catch(e){}
}

// 받아쓰기 메모(본문)에서 AI 정리 소스 추출 — 원문(rawTranscript)이 없을 때의 폴백.
// 헤더([레슨 녹음 메모 …]), 불릿 기호, 트랙맨 요약 줄을 걷어낸 조각 텍스트.
function _aiSourceFromContent(content){
  return String(content||'').replace(/^\[레슨 녹음 메모[^\]]*\]\s*/,'').replace(/^[•\-·]\s*/gm,'').replace(/\n\[트랙맨\][\s\S]*$/,'').trim();
}
// 재시도용 소스 결정 (Promise<string>): 기기의 원문 → 클라우드 원문(그 순간만 읽고 저장 안 함)
// → 본문의 받아쓰기 조각. 프로 기기는 loadAll 이 원문을 안 싣기 때문에 두 번째 단계가 핵심.
function _aiSourceForSession(s, opts){
  var rawOnly=!!(opts && opts.rawOnly);   // true: 녹음 원문이 있을 때만(받아쓰기 조각 폴백 안 함) — 오래된 일지 재정리용
  var local=String((s&&s.rawTranscript)||'').trim();
  if(local) return Promise.resolve(local);
  var fb=rawOnly ? '' : _aiSourceFromContent(s&&s.content);
  var p=(typeof cloud!=='undefined' && cloud && typeof cloud.fetchSessionRaw==='function') ? cloud.fetchSessionRaw(s.id) : Promise.resolve('');
  return Promise.resolve(p).then(function(raw){ raw=String(raw||'').trim(); return raw.length>fb.length ? raw : fb; }, function(){ return fb; });
}
// 일지를 만든 시각(ms) — 이 기기에서 쓴 일지는 _addedAt, 서버에서 받은 일지는 id('s'+13자리 시각, suid)에서.
// 둘 다 없으면 그 날짜가 끝나는 시각으로 본다(늦게 잡을수록 '실패'로 덜 단정). 모르면 0
function _sessMadeAt(s){
  if(!s) return 0;
  var t=s._addedAt?Date.parse(s._addedAt):NaN; if(!isNaN(t)) return t;
  var m=/^s(\d{13})/.exec(String(s.id||'')); if(m){ t=parseInt(m[1],10); if(t>1500000000000 && t<Date.now()+86400000) return t; }
  t=s.date?Date.parse(String(s.date).slice(0,10)+'T23:59:59'):NaN;
  return isNaN(t)?0:t;
}
// 'AI 정리 대기' 일지 상태 — ''(아님) · 'pending'(정리 중) · 'failed'(하루가 지나도 정리 안 됨 = 사실상 실패 → '눌러서 다시')
// 일지 카드 배지·대시보드 'AI 정리 대기 N건'·고객 리포트 제외가 같은 기준을 쓴다 (D3)
function aiPendingState(s){
  if(!s || String(s.content||'').indexOf('AI 정리 대기')===-1) return '';
  if(typeof _aiInflightActive==='function' && _aiInflightActive(s.id)) return 'pending';   // 지금 다시 정리하는 중
  var t=_sessMadeAt(s);
  return (t && Date.now()-t>86400000) ? 'failed' : 'pending';
}
// 손대지 않은 자동 생성 '정리 대기' 본문인지 — [레슨 녹음 메모 … AI 정리 대기] 머리줄 + 받아쓰기 불릿(+[트랙맨] 줄)만 있는 상태.
// 오래된 일지(7일+)는 이 형태 그대로일 때만 자동 교체한다(사람이 고친 일지를 AI 결과로 덮지 않게, v9.98).
var _AI_PENDING_UNTOUCHED = /^\[레슨 녹음 메모[^\n]*AI 정리 대기[^\n]*\]\n([•\-·] [^\n]*\n?)+(\n\[트랙맨\][^\n]*)?$/;
function _aiPendingUntouched(content){ return _AI_PENDING_UNTOUCHED.test(String(content||'').trim()); }
// 오래된 일지용 소스 — 서버의 최신 본문·원문을 그 자리에서 읽어, 서버 본문도 손대지 않은 상태이고 원문이 있을 때만 원문을 돌려준다.
function _aiOldSource(s){
  if(!(typeof cloud!=='undefined' && cloud && cloud.enabled && cloud.client)) return Promise.resolve('');
  try{
    return Promise.resolve(cloud.client.from('sessions').select('content,supplement').eq('id', s.id).maybeSingle()).then(function(r){
      var row=r && r.data; if(!row) return '';
      if(!_aiPendingUntouched(row.content)) return '';
      return String(row.supplement||'').trim();
    }, function(){ return ''; });
  }catch(e){ return Promise.resolve(''); }
}
// 진행 중인 AI 정리 요청 (sessId → 시작 시각). 90초 지나면 죽은 것으로 본다.
var _aiInflight = {};
function _aiInflightActive(sid){ var t=_aiInflight[sid]; return !!(t && Date.now()-t<90000); }
// SW 자동 리로드 가드용 — 일지 AI 요청이 하나라도 살아 있으면 리로드 보류
window.__aiBusy = function(){
  try{
    if(S && S.newSession && S.newSession._aiPending) return true;
    return Object.keys(_aiInflight).some(_aiInflightActive);
  }catch(e){ return false; }
};

// AI 정리 결과를 '저장된 일지'에 반영 — 사람이 이미 수정했으면 건드리지 않는다.
function applyAiResultToSaved(mid, sessId, better, tmSummary, opts){
  var arr = S.sessions[mid]||[]; var s = arr.find(function(x){return x.id===sessId;});
  if(!s || !better) return false;
  if(String(s.content||'').indexOf('AI 정리 대기')===-1) return false;   // 그 사이 정리됨/사람이 수정 → 건드리지 않음
  var _old = !!(opts && opts.old);
  if(_old && !_aiPendingUntouched(s.content)) return false;              // 오래된 일지: 사람이 손댄 흔적이 있으면 자동 교체 안 함
  // 저장된 일지에는 핵심 항목만 (폼과 동일 정책 — 전체는 녹음 원문으로 확인 가능)
  var bt=better;
  try{
    if(typeof aiParseSummary==='function'){
      var pr=aiParseSummary(better);
      if(pr.items.length||pr.head) bt=aiBuildContent(pr.head, pr.items);
    }
  }catch(e){}
  var rawBefore = s.content;
  s.content = bt + (tmSummary||'');
  delete _aiInflight[sessId];
  // 'AI 분석' 박스(로컬 요약)도 정리된 본문 기준으로 다시 — 받아쓰기 조각 기반 요약이 남지 않게
  try{ delete s._ai; if(typeof generateLocalSummary==='function') generateLocalSummary(mid, s); }catch(e){}
  // 이 일지의 수정 폼이 열려 있고 아직 손대지 않은 상태면 폼 내용도 갱신 — 폼의 옛 조각을
  // 그대로 [수정 저장]해서 방금 된 정리를 되돌리는 경합 방지
  try{
    if(S.showAddSession && S.editSessionId===sessId && S.newSession && String(S.newSession.content||'').trim()===String(rawBefore||'').trim()){
      S.newSession.content = s.content;
    }
  }catch(e){}
  try{ logActivity('AI 일지 정리', mid, s.content.slice(0,40)); }catch(e){}
  if(save()){ try{ syncSessionUp(mid, s); }catch(e){} }
  if(!_old){ try{ if(typeof autoPublishReport==='function') autoPublishReport(mid, s.author); }catch(e){} }   // 고정 리포트 링크 자동 갱신 — 검토 담당 = 일지 작성자 (오래된 일지 재정리는 검토 독촉을 만들지 않음)
  try{ render(); }catch(e){}
  try{ var nm=(S.members.find(function(m){return m.id===mid;})||{}).name||''; liveToastSafe('🤖 '+nm+' 일지 AI 정리 완료'); }catch(e){}
  return true;
}

// 저장된 녹음 일지를 백그라운드에서 AI 정리 → 자동 교체 (프로가 저장 후 기다릴 필요 없음)
function bgAiCleanupSaved(mid, sessId, transcript, author, tmSummary, opts){
  if(typeof aiEnabled!=='function' || !aiEnabled() || !transcript) return Promise.resolve(false);
  if(_rcRefusedId(mid)) return Promise.resolve(false);   // 녹음·AI 정리를 거부한 회원 — AI 로 보내지 않는다 (v9.99)
  if(typeof aiSummarizeWithClaude!=='function') return Promise.resolve(false);
  _aiInflight[sessId]=Date.now();
  return aiSummarizeWithClaude(transcript, author).then(function(better){
    delete _aiInflight[sessId];
    if(!better){
      // 실패 — 원문 조각 상태 유지. 스위퍼(retryPendingAiSummaries)가 재시도.
      try{ if(window.__aiLastError) console.warn('[ai] bg cleanup fail:', window.__aiLastError); }catch(e){}
      return false;
    }
    return applyAiResultToSaved(mid, sessId, better, tmSummary, opts);
  }, function(){ delete _aiInflight[sessId]; return false; });
}

// 일지 카드의 [🤖 AI 정리 중] 배지 탭 — 수정 폼을 거치지 않고 그 자리에서 즉시 재시도
function retryAiForSession(mid, sid){
  try{
    var s=(S.sessions[mid]||[]).find(function(x){return x.id===sid;}); if(!s) return;
    if(_rcRefusedId(mid)){ alert('녹음·AI 정리를 거부한 회원이에요.\nAI 정리를 하지 않으니 일지를 [수정]으로 직접 정리해 주세요.'); return; }
    if(_aiInflightActive(sid)){ liveToastSafe('🤖 AI 정리 진행 중 — 잠시만요'); return; }
    if(typeof aiEnabled!=='function' || !aiEnabled()){ alert('AI 정리가 설정되지 않았습니다. 관리자에게 알려주세요.'); return; }
    var tm=''; try{ var m=String(s.content||'').match(/\n\n\[트랙맨\][^\n]*/); tm=m?m[0]:''; }catch(e){}
    _aiInflight[sid]=Date.now();   // 소스 조회 중에도 겹쳐 탭/스위퍼 방지
    liveToastSafe('🤖 AI 정리 시작 — 약 10~20초');
    _aiSourceForSession(s).then(function(src){
      if(!src){ delete _aiInflight[sid]; liveToastSafe('정리할 내용이 없습니다'); return; }
      return bgAiCleanupSaved(mid, sid, src, s.author, tm).then(function(ok){
        if(!ok) liveToastSafe('⚠️ AI 정리 실패 — '+(window.__aiLastError||'잠시 후 다시 탭해주세요'));
      });
    });
  }catch(e){}
}

// ============ 'AI 정리 대기' 잔존 일지 자동 재시도 (스위퍼) ============
// 프로가 저장 직후 앱을 닫으면(레슨 종료 → 폰 주머니) 진행 중이던 AI 요청이
// 브라우저와 함께 죽어 일지가 받아쓰기 조각 상태로 영구히 남았다
// (2026-08-24 오지영 일지 실사고 — "종종 정리가 안 된다"의 원인).
// 실패·중단된 정리를 부팅과 앱 복귀 시점에 찾아 다시 돌린다.
var _aiSweepAttempts = {};   // sessId → 시도 횟수 (앱 실행당)
var _aiSweepBusy = false;
var _aiSweepLastRun = 0;
// force=true: 저장 직후 예약 재시도 등 — 60초 스로틀을 건너뛴다
function retryPendingAiSummaries(force){
  try{
    if(_aiSweepBusy) return;
    if(!force && Date.now()-_aiSweepLastRun < 60000) return;   // 60초 스로틀 (복귀 연타 방지)
    if(typeof aiEnabled!=='function' || !aiEnabled()) return;
    if(S.currentRole!=='pro' && S.currentRole!=='trainer' && S.currentRole!=='admin') return;
    _aiSweepLastRun = Date.now();
    // 최근 7일: 원문 → 받아쓰기 조각 순으로 정리. 7일~180일 된 '정리 대기' 일지(v9.98): 녹음 원문이 있을 때만 정리
    // (예전엔 7일이 지나면 영영 재시도되지 않아 7~8월 일지 11건이 '정리 대기'로 굳었다). 원문 칸은 v9.98 부터 비워 올리지 않으므로 안전.
    var cutoff = Date.now() - 7*24*3600*1000;
    var oldCutoff = Date.now() - 180*24*3600*1000;
    var cands = [];
    Object.keys(S.sessions||{}).forEach(function(mid){
      if(_rcRefusedId(mid)) return;   // 녹음·AI 정리를 거부한 회원의 일지는 AI 로 보내지 않는다
      (S.sessions[mid]||[]).forEach(function(s){
        if(String(s.content||'').indexOf('AI 정리 대기')===-1) return;
        // 원문이 기기에 없어도(어느 기기도 loadAll 로 원문을 받지 않음 — v9.99) 건너뛰지 않는다 —
        // 실행 시점에 _aiSourceForSession 이 클라우드 원문 → 본문 조각 순으로 소스를 정하고, 그래도 20자가 안 되면 그때 건너뛴다(아래).
        // 예전엔 이 자리에서 '기기의 원문 없음 + 조각 20자 미만'이면 건너뛰어, 조각은 짧아도 서버에 원문이 있는 일지가 영영 정리되지 않았다.
        // 담당자 본인 기기 또는 관리자 기기만 — 여러 기기의 중복 API 호출 억제
        // (겹쳐 돌아도 applyAiResultToSaved 가 '대기' 마커 확인 후 교체하므로 안전)
        if(S.currentRole!=='admin' && s.author!==S.currentUser) return;
        if(_aiInflightActive(s.id)) return;           // 이미 요청 진행 중 — 겹쳐 쏘지 않음
        var t = Date.parse(s._addedAt||s.date); if(isNaN(t) || t<oldCutoff) return;
        if((_aiSweepAttempts[s.id]||0)>=3) return;   // 앱 실행당 세션별 3회까지
        var old = (t<cutoff);
        // 오래된 일지: 서버와 동기화가 끝난 뒤에만, 손대지 않은 자동 생성 본문일 때만 (사람이 고친 일지는 칩으로 직접 재시도)
        if(old && (S.cloudSync!=='connected' || !_aiPendingUntouched(s.content))) return;
        cands.push({mid:mid, s:s, rawOnly:old});
      });
    });
    if(!cands.length) return;
    cands.sort(function(a,b){ return (a.rawOnly?1:0)-(b.rawOnly?1:0); });   // 최근 일지 먼저
    _aiSweepBusy = true;
    var used = 0;   // 실제로 AI 를 부른 건수 — 원문이 없어 건너뛴 오래된 일지는 세지 않는다
    var next = function(i){
      if(i>=cands.length || used>=5){ _aiSweepBusy=false; return; }   // 한 번에 최대 5건, 순차
      var c=cands[i], s=c.s;
      _aiSweepAttempts[s.id]=(_aiSweepAttempts[s.id]||0)+1;
      var tm=''; try{ var m=String(s.content||'').match(/\n\n\[트랙맨\][^\n]*/); tm=m?m[0]:''; }catch(e){}
      var go=function(){ setTimeout(function(){ next(i+1); }, 1500); };
      var skip=function(){ setTimeout(function(){ next(i+1); }, 30); };
      _aiInflight[s.id]=Date.now();
      (c.rawOnly ? _aiOldSource(s) : _aiSourceForSession(s)).then(function(src){
        if(!src){ delete _aiInflight[s.id]; if(c.rawOnly) _aiSweepAttempts[s.id]=3; return 'skip'; }   // 원문 없는 오래된 일지 — 이번 실행에선 다시 안 봄
        if(!c.rawOnly && !String(s.rawTranscript||'').trim() && String(src).trim()===_aiSourceFromContent(s.content) && String(src).trim().length < 20){ delete _aiInflight[s.id]; _aiSweepAttempts[s.id]=3; return 'skip'; }   // 원문이 어디에도 없고(받아쓰기 조각으로 대신) 조각도 너무 짧음 — AI 로 보내지 않음(이번 실행에선 다시 안 봄)
        used++;
        return bgAiCleanupSaved(c.mid, s.id, src, s.author, tm, c.rawOnly ? {old:true} : null);
      }).then(function(r){ if(r==='skip') skip(); else go(); }, go);
    };
    next(0);
  }catch(e){ _aiSweepBusy=false; }
}

// ============ AI 세션 요약 + 운동 추천 ============

// ============ 데이터 백업 / 복구 (관리자) ============
// Supabase/R2 장애·오조작 대비 로컬 스냅샷. 회원·세션·평가·인수인계 전부 JSON 한 파일로.
async function backupData(){
  try{
    // 녹음 원문은 기기에 두지 않으므로(B3·B4) 백업할 때 서버에서 받아 각 일지에 함께 담는다(rawTranscript). 못 받으면 원문 없이 백업하고 알려 준다
    var tx=null, txFail=false;
    if(typeof cloud!=='undefined' && cloud.enabled){ liveToastSafe('💾 백업 준비 중 — 녹음 원문 받는 중'); tx=await cloud.transcripts(); if(!tx) txFail=true; }
    var nTx=0, sessions={};
    Object.keys(S.sessions||{}).forEach(function(mid){
      sessions[mid]=(S.sessions[mid]||[]).map(function(s){
        var o=Object.assign({}, s), t=String(s.rawTranscript||'').trim() ? s.rawTranscript : ((tx&&tx[s.id])||'');
        delete o.supplement; delete o.rawTranscript;
        if(String(t).trim()){ o.rawTranscript=t; nTx++; }
        return o;
      });
    });
    var snap = {
      _type:'golfpt-backup', _ver:1, _at:new Date().toISOString(), transcripts:nTx,
      members:S.members, assessments:S.assessments, sessions:sessions,
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
    logAudit('system','데이터 백업 다운로드','',{members:(S.members||[]).length, transcripts:nTx});
    if(txFail) alert('백업 파일은 저장했어요. 다만 녹음 원문은 서버에서 받지 못해 빠졌어요 — 네트워크 확인 후 다시 백업해 주세요');
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
        // 녹음 원문: 서버에 이미 원문이 있는 일지는 백업 원문으로 덮어쓰지 않는다 — 그 칸을 빼고 올리면(upsert 는 보낸 칸만 바꿈) 서버 원문이 그대로 남는다.
        // 서버에 원문이 없는(지워졌거나 빈) 일지만 백업 원문으로 되살린다. 서버 확인이 안 되면 원문은 하나도 올리지 않는다(파일에는 그대로 있음)
        var withTx=[];
        Object.keys(S.sessions||{}).forEach(function(mid){ (S.sessions[mid]||[]).forEach(function(s){ if(String(s.rawTranscript||s.supplement||'').trim()) withTx.push(s); }); });
        var push=function(srvHas){
          var revived=0;
          withTx.forEach(function(s){ if(!srvHas || srvHas[s.id]){ delete s.rawTranscript; s.supplement=''; } else revived++; });
          // 서버로 밀어올리기(복구 반영)
          try{
            (S.members||[]).forEach(function(m){ syncMemberUp(m); });
            Object.keys(S.sessions||{}).forEach(function(mid){ (S.sessions[mid]||[]).forEach(function(s){ s._dirty=true; syncSessionUp(mid,s); }); });
            Object.keys(S.assessments||{}).forEach(function(mid){ Object.keys(S.assessments[mid]||{}).forEach(function(k){ if(k.indexOf('_')!==0) syncAssessUp(mid,k,S.assessments[mid][k]); }); });
          }catch(e){}
          logAudit('system','데이터 복구','',{members:mc, transcripts:revived});
          alert('복구 완료 — 회원 '+mc+'명'+(withTx.length?(srvHas?' · 녹음 원문 '+revived+'건 되살림(서버에 있는 원문은 그대로 둠)':' · 녹음 원문은 서버 확인이 안 돼 올리지 않았어요'):'')+'. 서버 업로드는 백그라운드로 진행됩니다.');
          render();
        };
        if(withTx.length && typeof cloud!=='undefined' && cloud.enabled) Promise.resolve(cloud.transcripts({idsOnly:true})).then(push, function(){ push(null); });
        else push({});
      }catch(e){ alert('복구 실패: 잘못된 파일 ('+(e.message||e)+')'); }
    };
    r.readAsText(f);
  };
  inp.click();
}
