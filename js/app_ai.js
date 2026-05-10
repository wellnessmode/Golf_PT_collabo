async function generateAISummary(memberId, session){
  var apiKey = (window.APP_CONFIG||{}).ANTHROPIC_API_KEY;
  if(!apiKey) return;
  var m = S.members.find(function(x){return x.id===memberId;});
  if(!m) return;
  var assess = S.assessments[memberId]||{};
  var warnings = [];
  ASSESSMENT_ITEMS.forEach(function(item){
    var v = assess[item.key];
    if(v && (v.result==='제한'||v.result==='주의 필요')){
      warnings.push(item.name+': '+v.result+(v.note?' ('+v.note+')':''));
    }
  });
  var recentSessions = (S.sessions[memberId]||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,5);
  var prompt = '당신은 골프 코칭 AI 어시스턴트입니다. 아래 세션 기록을 분석하고 JSON으로 응답하세요.\n\n'+
    '회원: '+m.name+'\n'+
    (m.handicap?'핸디캡: '+m.handicap+'\n':'')+
    (m.avgScore?'평균 타수: '+m.avgScore+'\n':'')+
    (m.focusPoints?'주력 교정: '+m.focusPoints+'\n':'')+
    (warnings.length>0?'체형평가 주의: '+warnings.join(', ')+'\n':'')+
    '\n오늘 세션:\n'+session.date+' ('+session.author+'): '+session.content+'\n'+
    (recentSessions.length>1?'\n최근 세션:\n'+recentSessions.slice(1).map(function(s){return s.date+' ('+s.author+'): '+s.content.slice(0,60);}).join('\n')+'\n':'')+
    '\n다음 JSON 형식으로 응답하세요:\n'+
    '{"summary":"오늘 세션 2-3줄 요약","golf_drills":["추천 골프 훈련 1","추천 골프 훈련 2","추천 골프 훈련 3"],"weight_training":["추천 웨이트 1","추천 웨이트 2","추천 웨이트 3"],"next_focus":"다음 세션 집중 포인트"}';
  try{
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens:500,
        messages:[{role:'user',content:prompt}]
      })
    });
    if(!resp.ok) throw new Error('API '+resp.status);
    var data = await resp.json();
    var text = (data.content&&data.content[0]&&data.content[0].text)||'';
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if(!jsonMatch) return;
    var ai = JSON.parse(jsonMatch[0]);
    // 세션에 AI 요약 저장
    session._ai = ai;
    save();
    render();
    cloud.upsertSession(memberId, session);
  }catch(e){
    console.warn('[AI] summary failed:', e);
  }
}

// ============ 세션 수정 ============
function openEditSession(sid){
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(s){return s.id===sid;});
  if(!sess) return;
  S.editSessionId = sid;
  S.newSession = {
    date: sess.date,
    author: sess.author,
    content: sess.content,
    media: (sess.media||[]).slice(),
    mediaUrls:['','']
  };
  S.showAddSession = true;
  render();
}
function saveEditSession(){
  var mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(s){return s.id===S.editSessionId;});
  if(!sess) return;
  if(!S.newSession.content.trim()){alert('내용을 입력하세요');return;}
  sess.date = S.newSession.date;
  sess.content = S.newSession.content.trim();
  sess.media = (S.newSession.media||[]).slice();
  logActivity('세션 수정', mid, sess.content.slice(0,40));
  logAudit('session','세션 수정',(S.members.find(function(x){return x.id===mid;})||{}).name||'',{date:sess.date,content:sess.content.slice(0,80)});
  S.editSessionId = null;
  S.showAddSession = false;
  save(); render();
  cloud.upsertSession(mid, sess);
}

// ============ 대시보드 ============
function openDashboard(){S.showDashboard=true;S.selectedMember=null;render();}
function closeDashboard(){S.showDashboard=false;render();}
function renderDashboard(){
  if(!S.showDashboard) return '';
  var isInfo = S.currentRole==='infodesk'||S.currentRole==='admin';
  var visibleMembers = S.members.filter(function(m){
    if(isInfo) return true;
    return m.assignedTo && m.assignedTo.indexOf(S.currentUser)!==-1;
  });
  var totalMembers = visibleMembers.length;
  var totalSessions = 0;
  var proSessions = 0;
  var trainerSessions = 0;
  var thisMonthSessions = 0;
  var thisMonth = today().slice(0,7);
  var expiringMembers = [];
  var recentActivity = [];
  visibleMembers.forEach(function(m){
    var sess = S.sessions[m.id]||[];
    totalSessions += sess.length;
    sess.forEach(function(s){
      if(getRole(s.author)==='pro') proSessions++;
      else trainerSessions++;
      if(s.date.slice(0,7)===thisMonth) thisMonthSessions++;
      recentActivity.push({member:m.name, date:s.date, author:s.author, content:s.content});
    });
    // 레슨/PT 각각 만료 임박 체크
    ['golfLessonExpiry','golfPTExpiry','expiry'].forEach(function(key){
      var val = m[key];
      if(!val) return;
      // expiry는 레슨/PT 값이 있으면 건너뜀 (하위호환용)
      if(key==='expiry' && (m.golfLessonExpiry||m.golfPTExpiry)) return;
      var d = daysUntilExpiry(val);
      if(d!==null && d>=0 && d<=30){
        var label = key==='golfPTExpiry'?'PT':(key==='golfLessonExpiry'?'레슨':'');
        expiringMembers.push({name:m.name+(label?' ('+label+')':''), days:d, expiry:val});
      }
    });
  });
  recentActivity.sort(function(a,b){return b.date.localeCompare(a.date);});
  recentActivity = recentActivity.slice(0,15);
  expiringMembers.sort(function(a,b){return a.days-b.days;});
  // 지도자별 세션 수
  var instructorStats = {};
  INSTRUCTORS.forEach(function(i){instructorStats[i.name]=0;});
  visibleMembers.forEach(function(m){
    (S.sessions[m.id]||[]).forEach(function(s){
      if(instructorStats.hasOwnProperty(s.author)) instructorStats[s.author]++;
    });
  });
  // 회원별 진행률
  var memberProgress = visibleMembers.map(function(m){
    var sess = (S.sessions[m.id]||[]);
    var st = stats(m.id);
    var lessonTotal = parseInt(m.golfLessonCount)||0;
    var ptTotal = parseInt(m.golfPTCount)||0;
    var lessonPct = lessonTotal>0?Math.min(100,Math.round(st.pro/lessonTotal*100)):0;
    var ptPct = ptTotal>0?Math.min(100,Math.round(st.trainer/ptTotal*100)):0;
    return {name:m.name, id:m.id, total:sess.length, lessonPct:lessonPct, ptPct:ptPct, pro:st.pro, trainer:st.trainer, lessonTotal:lessonTotal, ptTotal:ptTotal};
  }).sort(function(a,b){return b.total-a.total;});

  return `
  <div class="dashboard">
    <div class="dash-header">
      <h2>대시보드</h2>
      <button class="btn" onclick="closeDashboard()">닫기</button>
    </div>
    <div class="dash-stats">
      <div class="dash-stat"><div class="ds-val">${totalMembers}</div><div class="ds-lbl">회원</div></div>
      <div class="dash-stat"><div class="ds-val">${totalSessions}</div><div class="ds-lbl">총 세션</div></div>
      <div class="dash-stat"><div class="ds-val blue">${thisMonthSessions}</div><div class="ds-lbl">이번 달</div></div>
      <div class="dash-stat"><div class="ds-val green">${proSessions}</div><div class="ds-lbl">프로 세션</div></div>
      <div class="dash-stat"><div class="ds-val amber">${trainerSessions}</div><div class="ds-lbl">PT 세션</div></div>
    </div>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>지도자별 세션</h3>
        <div class="dash-bar-list">${Object.keys(instructorStats).map(function(name){
          var cnt = instructorStats[name];
          var pct = totalSessions>0?Math.round(cnt/totalSessions*100):0;
          return '<div class="dash-bar-row"><span class="dbr-name">'+name+'</span><div class="dbr-bar-wrap"><div class="dbr-bar '+(name.indexOf('프로')!==-1?'pro':'trainer')+'" style="width:'+pct+'%"></div></div><span class="dbr-cnt">'+cnt+'</span></div>';
        }).join('')}</div>
      </div>
      <div class="dash-card">
        <h3>만료 임박 회원</h3>
        ${expiringMembers.length>0?'<div class="dash-expire-list">'+expiringMembers.map(function(e){
          return '<div class="dash-expire-item"><span>'+e.name+'</span><span class="exp-badge exp-soon">D-'+e.days+'</span><span class="de-date">~'+e.expiry+'</span></div>';
        }).join('')+'</div>':'<div class="empty-state" style="padding:20px">30일 이내 만료 회원이 없습니다</div>'}
      </div>
    </div>
    <div class="dash-card" style="margin-top:12px">
      <h3>회원별 진행률</h3>
      <div class="dash-progress-list">
        ${memberProgress.map(function(p){
          return '<div class="dash-prog-row" onclick="selectMember(\''+p.id+'\');closeDashboard()">'+
            '<span class="dp-name">'+p.name+'</span>'+
            '<div class="dp-bars">'+
              '<div class="dp-bar-group"><span class="dp-lbl">레슨</span><div class="dp-bar-wrap"><div class="dp-bar pro" style="width:'+p.lessonPct+'%"></div></div><span class="dp-pct">'+p.pro+'/'+p.lessonTotal+'</span></div>'+
              '<div class="dp-bar-group"><span class="dp-lbl">PT</span><div class="dp-bar-wrap"><div class="dp-bar trainer" style="width:'+p.ptPct+'%"></div></div><span class="dp-pct">'+p.trainer+'/'+p.ptTotal+'</span></div>'+
            '</div>'+
          '</div>';
        }).join('')}
      </div>
    </div>
    <div class="dash-card" style="margin-top:12px">
      <h3>최근 활동 (최근 15건)</h3>
      <div class="dash-recent">
        ${recentActivity.map(function(a){
          return '<div class="dash-recent-item"><span class="dr-date">'+a.date+'</span><span class="dr-member">'+a.member+'</span><span class="dr-author role-tag '+(getRole(a.author)==='pro'?'pro':'trainer')+'">'+(getRole(a.author)==='pro'?'PRO':'PT')+'</span><span class="dr-content">'+a.content.slice(0,50)+(a.content.length>50?'…':'')+'</span></div>';
        }).join('')||'<div class="empty-state" style="padding:20px">최근 활동이 없습니다</div>'}
      </div>
    </div>
  </div>`;
}

function addMember(){
  const name = S.newMember.name.trim();
  if(!name){alert('이름을 입력하세요'); return;}
  const id = uid();
  const color = AVATAR_COLORS[S.members.length % AVATAR_COLORS.length];
  const m = {
    id, name, color,
    phone:S.newMember.phone||'', email:S.newMember.email||'',
    registeredDate:S.newMember.registeredDate||today(),
    golfLessonCount:S.newMember.golfLessonCount,
    golfPTCount:S.newMember.golfPTCount,
    golfLessonAmount:S.newMember.golfLessonAmount,
    golfPTAmount:S.newMember.golfPTAmount,
    expiry:S.newMember.expiry||'',
    golfLessonExpiry:S.newMember.golfLessonExpiry||'',
    golfPTExpiry:S.newMember.golfPTExpiry||'',
    assignedTo:S.newMember.assignedTo||[],
    memberType:S.newMember.memberType||'pt_lesson',
    handicap:S.newMember.handicap||'',
    avgScore:S.newMember.avgScore||'',
    goal:S.newMember.goal||'',
    focusPoints:S.newMember.focusPoints||''
  };
  S.members.push(m);
  S.assessments[id] = {};
  S.sessions[id] = [];
  S.selectedMember = id;
  S.showAddMember = false;
  logActivity('회원 등록', id, name);
  logAudit('member','회원 등록',name,{phone:m.phone,email:m.email,registeredDate:m.registeredDate,expiry:m.expiry});
  save(); render();
  cloud.upsertMember(m);
}


async function handleFileUpload(input, view){
  var files=Array.from(input.files||[]);
  if(!files.length)return;
  var existing=S.newSession.media||[];
  // view별로 1개만 허용
  if(view){
    var exists = existing.find(function(x){return x.view===view;});
    if(exists){alert(view==='front'?'정면 영상이 이미 있습니다':'측면 영상이 이미 있습니다');input.value='';return;}
  }
  var MAX_FILE_SIZE = 100*1024*1024;
  if(!mediaDB.db){
    var ok = await mediaDB.init();
    if(!ok){alert('브라우저가 IndexedDB를 지원하지 않습니다.\nURL 입력을 사용해주세요.');input.value='';return;}
  }
  if(navigator.storage && navigator.storage.persist){
    try{await navigator.storage.persist();}catch(e){}
  }
  var est = await getStorageEstimate();
  if(est && est.quota){
    var totalWanted = files.reduce(function(a,f){return a+f.size;},0);
    var remaining = est.quota - est.usage;
    if(totalWanted > remaining * 0.8){
      console.warn('storage low');
      input.value=''; return;
    }
  }
  input.value='';
  for(var i=0;i<files.length;i++){
    var origFile = files[i];
    if(origFile.size > MAX_FILE_SIZE){
      alert(origFile.name+' : '+(origFile.size/1024/1024).toFixed(1)+'MB\n파일당 최대 100MB까지 가능합니다.');
      continue;
    }
    S.uploading++;
    S.uploadMsg = '저장 중...';
    render();
    var file = origFile;
    var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    var saved = await mediaDB.put(mediaId, file, {mimeType:file.type, name:file.name});
    S.uploading--;
    S.uploadMsg = '';
    if(!saved){
      console.warn('file save failed');
      render();
      continue;
    }
    var verify = await mediaDB.get(mediaId);
    if(!verify || !verify.blob){
      console.warn('file verify failed');
      render();
      continue;
    }
    try{S.mediaUrls[mediaId] = URL.createObjectURL(file);}catch(e){}
    var mediaItem = {type:'file', view:view||'other', name:file.name, mimeType:file.type, size:file.size, mediaId:mediaId};
    // R2 업로드 (백그라운드) — 성공 시 r2Key 기록
    if(r2.enabled){
      mediaItem.r2Key = mediaId;
      mediaItem.r2Status = 'uploading';
      (function(item, blob, sessDraft){
        r2.upload(mediaId, blob).then(function(ok){
          item.r2Status = ok ? 'synced' : 'failed';
          render();
          // 이미 세션이 저장된 이후라면 세션 메타를 재업로드해서 r2Key 동기화
          try{
            var sid = S.selectedMember;
            var stored = sid && (S.sessions[sid]||[]).find(function(x){
              return (x.media||[]).some(function(mm){return mm.mediaId===mediaId;});
            });
            if(stored) cloud.upsertSession(sid, stored);
          }catch(e){}
        });
      })(mediaItem, file, S.newSession);
    }
    S.newSession.media.push(mediaItem);
    render();
    if(view) break; // view별 1개만
  }
}
async function handleExerciseVideoUpload(input){
  var files = Array.from(input.files||[]);
  if(!files.length) return;
  input.value='';
  for(var i=0;i<files.length;i++){
    await handleFileUploadSingle(files[i], 'exercise');
  }
}
async function handleFileUploadSingle(file, view){
  var MAX_FILE_SIZE = 100*1024*1024;
  if(file.size > MAX_FILE_SIZE){
    alert(file.name+' : '+(file.size/1024/1024).toFixed(1)+'MB\n파일당 최대 100MB까지 가능합니다.');
    return;
  }
  if(!mediaDB.db){
    var ok = await mediaDB.init();
    if(!ok){alert('브라우저가 IndexedDB를 지원하지 않습니다.');return;}
  }
  S.uploading++;
  S.uploadMsg = '저장 중...';
  render();
  var processed = file;
  var mediaId = 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  var saved = await mediaDB.put(mediaId, processed, {mimeType:processed.type, name:file.name});
  S.uploading--;
  S.uploadMsg = '';
  if(!saved){console.warn('file save failed'); render(); return;}
  try{S.mediaUrls[mediaId] = URL.createObjectURL(processed);}catch(e){}
  var mediaItem = {type:'file', view:view, name:file.name, mimeType:processed.type, size:processed.size, mediaId:mediaId};
  if(r2.enabled){
    mediaItem.r2Key = mediaId;
    mediaItem.r2Status = 'uploading';
    (function(item, blob){
      r2.upload(mediaId, blob).then(function(ok){
        item.r2Status = ok ? 'synced' : 'failed';
        render();
      });
    })(mediaItem, processed);
  }
  S.newSession.media.push(mediaItem);
  render();
}
async function removeMediaFile(idx){
  var m = S.newSession.media[idx];
  if(m && m.mediaId){
    await mediaDB.del(m.mediaId);
        if(m.r2Key || m.mediaId) r2.remove(m.r2Key||m.mediaId);
    if(S.mediaUrls[m.mediaId]){URL.revokeObjectURL(S.mediaUrls[m.mediaId]); delete S.mediaUrls[m.mediaId];}
  }
  S.newSession.media.splice(idx,1);
  render();
}
function updateMediaUrl(idx,val){S.newSession.mediaUrls[idx]=val;}
function toggleLoop(vid){
  var v=document.getElementById(vid);
  var btn=document.getElementById('loop_'+vid);
  if(!v)return;
  v.loop=!v.loop;
  if(btn){btn.classList.toggle('active',v.loop);}
}
function setSpeed(vid,spd){
  var v=document.getElementById(vid);
  var label=document.getElementById('spd_'+vid);
  if(!v)return;
  v.playbackRate=spd;
  if(label) label.textContent=spd+'x';
  var wrap=document.getElementById('wrap_'+vid);
  if(wrap){
    wrap.querySelectorAll('.vc-btn').forEach(function(b){
      if(b.textContent.indexOf('x')!==-1 && b.textContent.indexOf('반복')===-1){
        b.classList.toggle('active', parseFloat(b.textContent)===spd);
      }
    });
  }
}
function openMediaView(src){
  var d=document.createElement('div');d.className='media-overlay';
  d.onclick=function(){d.remove();};
  d.innerHTML='<img src="'+src+'" style="max-width:92vw;max-height:92vh;border-radius:8px">';
  document.body.appendChild(d);
}


async function deleteSession(id){
  if(!confirm('이 세션 기록을 삭제하시겠습니까?')) return;
  const mid = S.selectedMember;
  var sess = (S.sessions[mid]||[]).find(function(x){return x.id===id;});
  if(sess && sess.media){
    for(var i=0;i<sess.media.length;i++){
      var m = sess.media[i];
      if(m.mediaId){
        await mediaDB.del(m.mediaId);
                if(m.r2Key || m.mediaId) r2.remove(m.r2Key||m.mediaId);
        if(S.mediaUrls[m.mediaId]){URL.revokeObjectURL(S.mediaUrls[m.mediaId]); delete S.mediaUrls[m.mediaId];}
      }
    }
  }
  S.sessions[mid] = (S.sessions[mid]||[]).filter(s => s.id!==id);
  logActivity('세션 삭제', mid, '');
  logAudit('session','세션 삭제', (S.members.find(function(x){return x.id===mid;})||{}).name||'', {sessionId:id, date:sess&&sess.date, author:sess&&sess.author});
  save(); render();
  cloud.deleteSession(id);
}

// ============ 기존 세션 AI 요약 일괄 처리 ============
async function analyzeExistingSessions(){
  var apiKey = (window.APP_CONFIG||{}).ANTHROPIC_API_KEY;
  if(!apiKey) return;
  var count = 0;
  for(var mid in S.sessions){
    var sessions = S.sessions[mid]||[];
    for(var i=0;i<sessions.length;i++){
      if(sessions[i]._ai) continue;
      if(!sessions[i].content || sessions[i].content.trim().length<5) continue;
      await generateAISummary(mid, sessions[i]);
      count++;
      if(count>=3){ return; } // 한 번에 최대 3개 (API 부담 방지)
    }
  }
}

// ============ 시작 ============
init();
// 기존 세션 AI 분석 (백그라운드, 로그인 후 자동 실행)
setTimeout(function(){ analyzeExistingSessions(); }, 5000);
