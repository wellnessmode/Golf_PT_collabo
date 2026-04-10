// Golf PT Collaboration — 내셔널짐
// 정P(골프 프로) ↔ 최T(PT 트레이너) 동일 회원 세션 협업 웹앱
//
// 저장 모드:
//  - config.js 에 Supabase URL/KEY 가 채워져 있으면: Supabase 에 동기화 (정P/최T 실시간 공유)
//  - 비어 있거나 네트워크 실패 시: localStorage 기반 로컬 모드 (file:// 로도 동작)

// ============ 상수 ============
const ASSESSMENT_ITEMS = [
  {key:'static_posture',name:'Static Posture Assessment',cp:'Anterior / L-Lateral / Posterior / R-Lateral'},
  {key:'overhead_squat',name:'Overhead Squat',cp:'Ankle Inversion / Pelvic Rotation'},
  {key:'pelvic_tilt',name:'Pelvic Tilt',cp:'Anterior / Posterior Tilt'},
  {key:'pelvic_rotation',name:'Pelvic Rotation',cp:'Lt. / Rt.'},
  {key:'thoracic_rotation',name:'Thoracic Rotation',cp:'Lt. / Rt.'},
  {key:'slr_test',name:'SLR Test',cp:'Lt. / Rt. O.A / Shortness'},
  {key:'90_90_standing',name:'90/90 Test - Standing',cp:'Lt. / Rt.'},
  {key:'90_90_address',name:'90/90 Test - Address',cp:'Lt. / Rt.'},
  {key:'patrick_test',name:'Patrick Test',cp:'Ant. / Post.'},
  {key:'hip_extension',name:'Hip Extension Test',cp:'Ant. Tilt / Post. Tilt'},
  {key:'ql_palpation',name:'Q.L Palpation',cp:'Lt. / Rt.'},
  {key:'one_leg_bridge',name:'One Leg Bridge',cp:'Under 10s / 30s / Over 60s'},
  {key:'neck_palpation',name:'Neck Palpation',cp:'Cervical Curve / S.C.M / Scalene / U.Trap (Lt./Rt.)'},
  {key:'calf_palpation',name:'Calf Palpation',cp:'Bump / Achilles / Calf Palpation (Lt./Rt.)'}
];

const RESULT_OPTIONS = ['미검사','정상','경미한 제한','주의 필요','제한'];
const AVATAR_COLORS = ['av-green','av-blue','av-amber','av-coral'];

const BODY_SWING_MAP = {
  static_posture:'정적 자세 불균형 — 어드레스 셋업 일관성 저하',
  overhead_squat:'어드레스 하체 균형 불안정 — 발목/무릎 보상동작 유발',
  pelvic_tilt:'어드레스 척추각도 불안정 — S/C-Posture 위험',
  pelvic_rotation:'다운스윙 골반 회전 감소 — X-Factor 감소, 비거리 손실',
  thoracic_rotation:'백스윙 상체 회전 부족 — 팔로만 올리는 동작 유발',
  slr_test:'팔로스루 시 하체 안정성 저하 — 체중이동 불완전',
  '90_90_standing':'백스윙 탑 포지션 제한 — 어깨 회전 범위 감소',
  '90_90_address':'어드레스 어깨 가동성 부족 — 플라잉 엘보 연관',
  patrick_test:'다운스윙 골반 회전 제한 — 스웨이/슬라이드 발생 가능',
  hip_extension:'임팩트 후 얼리 익스텐션(Early Extension) 위험',
  ql_palpation:'요방형근 긴장 — 스윙 시 옆구리 제한',
  one_leg_bridge:'고관절 신전근 약화 — 지면반력 감소, 하체 드라이브 부족',
  neck_palpation:'경추/승모근 긴장 — 헤드업 경향, 임팩트 시선 불안정',
  calf_palpation:'종아리/아킬레스 긴장 — 체중이동 시 발뒤꿈치 들림'
};

const SAMPLE_DATA = {
  members:[
    {id:'m1',name:'로버트',color:'av-green'},
    {id:'m2',name:'윤명숙',color:'av-blue'}
  ],
  assessments:{
    m1:{static_posture:{result:'정상',note:''},overhead_squat:{result:'정상',note:''},pelvic_tilt:{result:'정상',note:''},pelvic_rotation:{result:'정상',note:''},thoracic_rotation:{result:'경미한 제한',note:'우측 회전 제한'},slr_test:{result:'정상',note:''},'90_90_standing':{result:'정상',note:''},'90_90_address':{result:'경미한 제한',note:'어드레스 시 좌측 제한'},patrick_test:{result:'경미한 제한',note:''},hip_extension:{result:'정상',note:''},ql_palpation:{result:'정상',note:''},one_leg_bridge:{result:'정상',note:''},neck_palpation:{result:'정상',note:''},calf_palpation:{result:'정상',note:''}},
    m2:{static_posture:{result:'정상',note:''},overhead_squat:{result:'경미한 제한',note:'발목 내번'},pelvic_tilt:{result:'정상',note:''},pelvic_rotation:{result:'경미한 제한',note:''},thoracic_rotation:{result:'정상',note:''},slr_test:{result:'정상',note:''},'90_90_standing':{result:'정상',note:''},'90_90_address':{result:'정상',note:''},patrick_test:{result:'정상',note:''},hip_extension:{result:'정상',note:''},ql_palpation:{result:'정상',note:''},one_leg_bridge:{result:'정상',note:''},neck_palpation:{result:'정상',note:''},calf_palpation:{result:'정상',note:''}}
  },
  sessions:{
    m1:[
      {id:'s1',date:'2025-06-16',author:'정P',content:'스윙 중에 팔만 내리면서 몸회전을 안해서 문제 발생',supplement:'상하체 분리하는 힘 더 만들어주면 좋을 것 같습니다'},
      {id:'s2',date:'2025-06-17',author:'최T',content:'상하체 분리운동, 코어운동 진행',supplement:'스윙 시 왼어깨 들리면서 플레인이 바뀌는 느낌'},
      {id:'s3',date:'2025-06-23',author:'정P',content:'볼 포지션 수정 집중',supplement:''},
      {id:'s4',date:'2025-06-27',author:'최T',content:'스텝박스 리듬트레이닝, 플라이오메트릭 점프순발력트레이닝, 상체 푸쉬운동',supplement:''},
      {id:'s5',date:'2025-07-01',author:'최T',content:'발가락, 햄스트링 및 엉덩이 트레이닝',supplement:''},
      {id:'s6',date:'2025-07-08',author:'최T',content:'회전근개, 코어, 견갑골 안정화 및 어깨근육운동',supplement:''},
      {id:'s7',date:'2025-08-04',author:'정P',content:'하체랑 코어 연결시켜서 움직여주기',supplement:''}
    ],
    m2:[
      {id:'s8',date:'2025-06-25',author:'최T',content:'삼두근, 흉근, 코어근육 위주로 진행',supplement:'필드를 자주 나가서인지 팔로스루 때 왼쪽 어깨 앞면이 통증. 1달간 회복될 수 있도록 다른 방향의 운동 필요'},
      {id:'s9',date:'2025-07-01',author:'정P',content:'팔로우에서 넘어오는 힘을 만들어주는 동작',supplement:'상체로 비틀어내는 힘이 더 강하면 좋을 것 같습니다'},
      {id:'s10',date:'2025-07-05',author:'최T',content:'상체 코어운동, 어깨, 가슴, 삼두 기능성운동',supplement:''},
      {id:'s11',date:'2025-07-07',author:'정P',content:'템포 맞추면서 오른팔 내리는 공간 확보',supplement:''},
      {id:'s12',date:'2025-07-09',author:'최T',content:'전완, 이두, 등 근비대 견갑골 안정화운동',supplement:''},
      {id:'s13',date:'2025-07-14',author:'정P',content:'하체랑 상체 팔 싱크가 떨어져서 싱크에 집중',supplement:''},
      {id:'s14',date:'2025-07-22',author:'정P',content:'등이랑 팔안쪽 힘 강조하고 상하체 분리',supplement:'상하체 분리 힘이 조금 더 필요합니다'},
      {id:'s15',date:'2025-07-23',author:'최T',content:'상체 근력운동, 상하체 분리 훈련(케이블)',supplement:''},
      {id:'s16',date:'2025-07-29',author:'정P',content:'상하체 분리 동작 강조',supplement:'상하체 분리하면서 골반 기울기가 확보가 잘 안됩니다'}
    ]
  }
};

// ============ Supabase 연동 모듈 ============
const cloud = {
  client:null,
  enabled:false,
  init(){
    try{
      const cfg = window.APP_CONFIG || {};
      if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return false;
      if(typeof window.supabase === 'undefined' || !window.supabase.createClient){
        console.warn('[cloud] supabase-js SDK 를 로드하지 못했습니다. 로컬 모드로 동작합니다.');
        return false;
      }
      this.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      this.enabled = true;
      return true;
    }catch(e){console.warn('[cloud] init 실패:',e);return false;}
  },
  async loadAll(){
    if(!this.enabled) return null;
    try{
      const [mRes, aRes, sRes] = await Promise.all([
        this.client.from('members').select('*').order('created_at',{ascending:true}),
        this.client.from('assessments').select('*'),
        this.client.from('sessions').select('*').order('date',{ascending:true})
      ]);
      if(mRes.error) throw mRes.error;
      if(aRes.error) throw aRes.error;
      if(sRes.error) throw sRes.error;
      const members = (mRes.data||[]).map(r=>({id:r.id,name:r.name,color:r.color||'av-green'}));
      const assessments = {};
      (aRes.data||[]).forEach(r=>{
        if(!assessments[r.member_id]) assessments[r.member_id] = {};
        assessments[r.member_id][r.item_key] = {result:r.result||'미검사', note:r.note||''};
      });
      const sessions = {};
      (sRes.data||[]).forEach(r=>{
        if(!sessions[r.member_id]) sessions[r.member_id] = [];
        sessions[r.member_id].push({
          id:r.id, date:r.date, author:r.author,
          content:r.content||'', supplement:r.supplement||''
        });
      });
      return {members, assessments, sessions};
    }catch(e){console.warn('[cloud] loadAll 실패:',e);return null;}
  },
  async upsertMember(m){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('members').upsert({id:m.id,name:m.name,color:m.color});
      if(error) throw error;
    }catch(e){console.warn('[cloud] upsertMember 실패:',e);}
  },
  async upsertAssessment(memberId, itemKey, result, note){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('assessments').upsert({
        member_id: memberId,
        item_key: itemKey,
        result: result||'미검사',
        note: note||'',
        updated_at: new Date().toISOString()
      });
      if(error) throw error;
    }catch(e){console.warn('[cloud] upsertAssessment 실패:',e);}
  },
  async upsertSession(memberId, s){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('sessions').upsert({
        id: s.id,
        member_id: memberId,
        date: s.date,
        author: s.author,
        content: s.content||'',
        supplement: s.supplement||''
      });
      if(error) throw error;
    }catch(e){console.warn('[cloud] upsertSession 실패:',e);}
  },
  async deleteSession(id){
    if(!this.enabled) return;
    try{
      const {error} = await this.client.from('sessions').delete().eq('id',id);
      if(error) throw error;
    }catch(e){console.warn('[cloud] deleteSession 실패:',e);}
  }
};

// ============ 상태 ============
let S = {
  members:[], assessments:{}, sessions:{},
  selectedMember:null, assessOpen:true, filterAuthor:'all',
  showAddSession:false, showAddMember:false, editSessionId:null,
  newSession:{date:today(), author:'정P', content:'', supplement:'', media:[], mediaUrls:['','']},
  newMemberName:'',
  cloudSync:'local',  // 'local' | 'loading' | 'connected' | 'error'
  warningBannerCollapsed:false
};

// ============ Helpers ============
function today(){return new Date().toISOString().slice(0,10);}
function uid(){return 'm'+Date.now()+Math.random().toString(36).slice(2,5);}
function suid(){return 's'+Date.now()+Math.random().toString(36).slice(2,5);}
function initials(name){
  if(!name) return '?';
  const p = name.trim().split(/\s+/);
  if(p.length>=2) return p[0][0]+p[1][0];
  return name.slice(0,2);
}
function save(){
  try{
    localStorage.setItem('golf_pt_v2', JSON.stringify({
      members:S.members, assessments:S.assessments, sessions:S.sessions
    }));
  }catch(e){}
}

function loadLocal(){
  try{
    const d = localStorage.getItem('golf_pt_v2');
    if(d){
      const p = JSON.parse(d);
      S.members = p.members || SAMPLE_DATA.members;
      S.assessments = p.assessments || SAMPLE_DATA.assessments;
      S.sessions = p.sessions || SAMPLE_DATA.sessions;
    } else {
      S.members = SAMPLE_DATA.members;
      S.assessments = SAMPLE_DATA.assessments;
      S.sessions = SAMPLE_DATA.sessions;
    }
  }catch(e){
    S.members = SAMPLE_DATA.members;
    S.assessments = SAMPLE_DATA.assessments;
    S.sessions = SAMPLE_DATA.sessions;
  }
  if(S.members.length>0 && !S.selectedMember) S.selectedMember = S.members[0].id;
}

async function init(){
  // 1) localStorage 로 초기 렌더 (file:// 오프라인에서도 즉시 동작)
  loadLocal();
  render();

  // 2) Supabase 가 설정되어 있으면 원격 동기화 시도
  if(cloud.init()){
    S.cloudSync = 'loading';
    render();
    const remote = await cloud.loadAll();
    if(remote){
      if(remote.members.length > 0){
        // 원격 데이터로 덮어씀
        S.members = remote.members;
        S.assessments = remote.assessments;
        S.sessions = remote.sessions;
        if(!S.members.find(m => m.id === S.selectedMember)){
          S.selectedMember = S.members[0].id;
        }
      } else {
        // 원격이 비어있으면 현재 로컬 데이터를 초기 업로드
        await seedRemote();
      }
      save();
      S.cloudSync = 'connected';
    } else {
      S.cloudSync = 'error';
    }
    render();
  } else {
    S.cloudSync = 'local';
  }
}

async function seedRemote(){
  try{
    for(const m of S.members) await cloud.upsertMember(m);
    for(const mid in S.assessments){
      for(const key in S.assessments[mid]){
        const v = S.assessments[mid][key];
        await cloud.upsertAssessment(mid, key, v.result, v.note);
      }
    }
    for(const mid in S.sessions){
      for(const s of S.sessions[mid]){
        await cloud.upsertSession(mid, s);
      }
    }
  }catch(e){console.warn('[cloud] seedRemote 실패:',e);}
}

async function refreshFromCloud(){
  if(!cloud.enabled) return;
  S.cloudSync = 'loading'; render();
  const remote = await cloud.loadAll();
  if(remote){
    S.members = remote.members;
    S.assessments = remote.assessments;
    S.sessions = remote.sessions;
    if(S.members.length>0 && !S.members.find(m => m.id === S.selectedMember)){
      S.selectedMember = S.members[0].id;
    }
    save();
    S.cloudSync = 'connected';
  } else {
    S.cloudSync = 'error';
  }
  render();
}

function stats(mid){
  const sess = S.sessions[mid] || [];
  return {
    total: sess.length,
    pro: sess.filter(s => s.author==='정P').length,
    trainer: sess.filter(s => s.author==='최T').length,
    supp: sess.filter(s => s.supplement && s.supplement.trim()).length
  };
}

function calcFitness(assess){
  var PTS = {'정상':7,'경미한 제한':5,'주의 필요':2,'제한':0,'미검사':0};
  var total = 0, untested = 0;
  for(var i=0;i<ASSESSMENT_ITEMS.length;i++){
    var v = assess[ASSESSMENT_ITEMS[i].key];
    if(!v || !v.result || v.result==='미검사'){ untested++; }
    else { total += (PTS[v.result]||0); }
  }
  var score = Math.round((total/98)*100);
  var cls = score>=85?'fit-good':score>=60?'fit-warn':'fit-danger';
  return {score:score, cls:cls, untested:untested};
}

function syncBadge(){
  const map = {
    local:    {cls:'local',     label:'로컬 모드'},
    loading:  {cls:'loading',   label:'동기화 중...'},
    connected:{cls:'connected', label:'Supabase 동기화됨'},
    error:    {cls:'error',     label:'동기화 오류'}
  };
  const s = map[S.cloudSync] || map.local;
  const refresh = (S.cloudSync==='connected' || S.cloudSync==='error')
    ? `<button class="sync-refresh" onclick="refreshFromCloud()">새로고침</button>` : '';
  return `<div class="sync-indicator ${s.cls}">
    <div class="sync-dot"></div>
    <div>${s.label}</div>
    ${refresh}
  </div>`;
}

// ============ Render ============
function render(){
  const root = document.getElementById('root');
  const mid = S.selectedMember;
  const member = mid ? S.members.find(m => m.id===mid) : null;
  const allSess = mid ? (S.sessions[mid]||[]).slice().sort((a,b) => b.date.localeCompare(a.date)) : [];
  const sessions = S.filterAuthor==='all' ? allSess : allSess.filter(s => s.author===S.filterAuthor);
  const assess = mid ? (S.assessments[mid]||{}) : {};
  const st = mid ? stats(mid) : null;
  const fit = mid ? calcFitness(assess) : null;
  const warnings = mid ? ASSESSMENT_ITEMS.filter(function(item){
    var v = assess[item.key]; return v && (v.result==='제한'||v.result==='주의 필요');
  }).map(function(item){ return {name:item.name, result:assess[item.key].result, impact:BODY_SWING_MAP[item.key]||''}; }) : [];

  root.innerHTML = `
  <div class="sidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">NG</div>
      <div><div class="logo-text">내셔널짐</div><div class="logo-sub">Golf PT 협업</div></div>
    </div>
    <div class="sidebar-section-label">회원 목록</div>
    <div class="member-list">
      ${S.members.map(m => `
        <div class="member-item${m.id===mid?' active':''}" onclick="selectMember('${m.id}')">
          <div class="member-avatar ${m.color}">${initials(m.name)}</div>
          <div class="member-name">${m.name}</div>
          <div class="session-badge">${(S.sessions[m.id]||[]).length}</div>
        </div>`).join('')}
    </div>
    <div class="add-member-btn" onclick="openAddMember()">+ 새 회원 등록</div>
    ${syncBadge()}
  </div>

  <div class="main">
    ${member ? `
    <div class="topbar">
      <div class="member-title-wrap">
        <div class="topbar-avatar ${member.color}">${initials(member.name)}</div>
        <div>
          <div class="member-title">${member.name} 회원님</div>
          <div class="member-subtitle">골프레슨 + 골프PT 패키지</div>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="btn primary" onclick="openAddSession()">+ 세션 기록</button>
      </div>
    </div>
    <div class="content">
      ${st ? `
      <div class="stat-row">
        <div class="stat"><div class="stat-val">${st.total}</div><div class="stat-lbl">총 세션</div></div>
        <div class="stat"><div class="stat-val blue">${st.pro}</div><div class="stat-lbl">골프 레슨 (정P)</div></div>
        <div class="stat"><div class="stat-val green">${st.trainer}</div><div class="stat-lbl">골프 PT (최T)</div></div>
        <div class="stat"><div class="stat-val amber">${st.supp}</div><div class="stat-lbl">보완 요청</div></div>
        <div class="stat ${fit.cls}"><div class="stat-val">${fit.score}</div><div class="stat-lbl">Golf Fit${fit.untested>0?' · 일부 미검사':''}</div></div>
      </div>` : ''}

      <div class="section-card">
        <div class="section-header${S.assessOpen?' open':''}" onclick="toggleAssess()">
          <div class="section-label">
            <div class="dot dot-green"></div>
            체형 기능 평가
            <span class="sec-count">(${ASSESSMENT_ITEMS.filter(i=>{const v=assess[i.key];return v&&v.result&&v.result!=='미검사'}).length}/${ASSESSMENT_ITEMS.length})</span>
          </div>
          <div class="chevron">▼</div>
        </div>
        ${S.assessOpen ? `
        <div class="assessment-grid">
          ${ASSESSMENT_ITEMS.map(item => {
            const v = assess[item.key] || {result:'미검사', note:''};
            const warn = v.result && v.result!=='정상' && v.result!=='미검사';
            return `<div class="assess-item${warn?' warn':''}">
              <div class="assess-name">${item.name}</div>
              <div class="assess-cp">${item.cp}</div>
              <div class="assess-row">
                <select class="assess-select" onchange="updateAssess('${item.key}','result',this.value)">
                  ${RESULT_OPTIONS.map(o => `<option value="${o}"${v.result===o?' selected':''}>${o}</option>`).join('')}
                </select>
              </div>
              <input class="assess-note-input" placeholder="특이사항" value="${(v.note||'').replace(/"/g,'&quot;')}" onchange="updateAssess('${item.key}','note',this.value)" />
              ${warn && BODY_SWING_MAP[item.key] ? `<div class="body-swing-alert"><span class="bsa-icon">⚠</span> ${BODY_SWING_MAP[item.key]}</div>` : ''}
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>

      <div class="section-card">
        <div class="section-header open" style="cursor:default">
          <div class="section-label">
            <div class="dot dot-amber"></div>
            세션 기록
            <span class="sec-count">(${sessions.length}건)</span>
          </div>
          <div class="section-right">
            <div class="filter-btn${S.filterAuthor==='all'?' active':''}" onclick="setFilter('all')">전체</div>
            <div class="filter-btn${S.filterAuthor==='정P'?' pro-active':''}" onclick="setFilter('정P')">정P</div>
            <div class="filter-btn${S.filterAuthor==='최T'?' trainer-active':''}" onclick="setFilter('최T')">최T</div>
          </div>
        </div>
        ${warnings.length>0 ? `<div class="warning-banner${S.warningBannerCollapsed?' collapsed':''}">
          <div class="wb-head" onclick="toggleWarningBanner()"><span>⚠ 체형 제한 ${warnings.length}개 확인 — 레슨/운동 전 검토 필요</span><span class="wb-chevron">▼</span></div>
          <div class="wb-body">${warnings.map(function(w){ return '<div class="wb-item"><strong>'+w.name+'</strong> ('+w.result+'): '+w.impact+'</div>'; }).join('')}</div>
        </div>` : ''}
        <div class="sessions-list">
          ${sessions.length===0 ? `<div class="empty-state">기록된 세션이 없습니다<br><span style="font-size:11px">상단 '+ 세션 기록' 버튼으로 추가하세요</span></div>` :
          sessions.map(s => `
            <div class="session-card">
              <div class="session-hd ${s.author==='정P'?'pro':'trainer'}">
                <div class="role-tag ${s.author==='정P'?'pro':'trainer'}">${s.author==='정P'?'GOLF PRO':'GOLF PT'}</div>
                <div class="session-author">${s.author}</div>
                <div class="session-date">${s.date}</div>
                ${s.supplement?`<div class="supp-badge">보완요청</div>`:''}
              </div>
              <div class="session-bd">
                <div class="session-content">${s.content}</div>
                ${s.media&&s.media.length>0?'<div class="session-media">'+s.media.map(function(m,mi){
                  if(m.type==='file'&&m.data&&m.data.indexOf('image/')!==-1) return '<img class="sm-thumb" src="'+m.data+'" onclick="openMediaView(this.src)" alt="'+((m.name||'').replace(/"/g,'&quot;'))+'">';
                  if(m.type==='file'&&m.data&&m.data.indexOf('video/')!==-1) return '<video class="sm-video" src="'+m.data+'" controls></video>';
                  if(m.type==='url') return '<a class="sm-link" href="'+((m.data||'').replace(/"/g,'&quot;'))+'" target="_blank" rel="noopener">▶ 영상 보기</a>';
                  return '';
                }).join('')+'</div>':''}
                ${s.supplement ? `
                <div class="supplement-box">
                  <div class="supp-label">보완점</div>
                  <div class="supp-text">${s.supplement}</div>
                </div>` : ''}
                <div class="session-actions">
                  <button class="small-btn del" onclick="deleteSession('${s.id}')">삭제</button>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    ` : `
    <div class="no-member">
      <div class="no-member-icon">⛳</div>
      <div style="font-size:14px;font-weight:600;color:#6b7a70">회원을 선택하세요</div>
      <div style="font-size:12px">좌측에서 회원을 클릭하거나 새 회원을 등록하세요</div>
    </div>`}
  </div>

  ${S.showAddSession ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">세션 기록 추가 — ${member?member.name+' 회원님':''}</div>
      <div class="form-group">
        <label class="form-label">날짜</label>
        <input type="date" class="form-input" value="${S.newSession.date}" onchange="updateNS('date',this.value)">
      </div>
      <div class="form-group">
        <label class="form-label">담당자</label>
        <div class="radio-group">
          <div class="radio-opt${S.newSession.author==='정P'?' sel-pro':''}" onclick="updateNS('author','정P')">
            <span>정P</span>&nbsp;<span style="font-size:11px;opacity:.7">골프 프로</span>
          </div>
          <div class="radio-opt${S.newSession.author==='최T'?' sel-trainer':''}" onclick="updateNS('author','최T')">
            <span>최T</span>&nbsp;<span style="font-size:11px;opacity:.7">골프 PT</span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">운동 / 레슨 내용</label>
        <textarea class="form-textarea" placeholder="오늘 진행한 내용을 입력하세요" oninput="updateNS('content',this.value)">${S.newSession.content}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">스윙 영상 / 사진 첨부</label>
        <div class="media-input-box">
          <div class="media-sub-label">파일 업로드 (최대 2개)</div>
          <div class="media-file-list">${S.newSession.media.map(function(m,i){
            return '<div class="media-file-item"><span>'+(m.name||'파일')+'</span><span class="mf-remove" onclick="removeMediaFile('+i+')">×</span></div>';
          }).join('')}</div>
          ${S.newSession.media.length<2?'<label class="media-upload-btn">+ 파일 선택<input type="file" accept="video/*,image/*" onchange="handleFileUpload(this)" style="display:none"></label>':''}
          <div class="media-sub-label" style="margin-top:10px">또는 URL 직접 입력 (최대 2개)</div>
          <input class="form-input media-url" placeholder="영상 링크 붙여넣기 (유튜브, 드라이브 등)" value="${(S.newSession.mediaUrls[0]||'').replace(/"/g,'&quot;')}" oninput="updateMediaUrl(0,this.value)" style="margin-bottom:6px">
          <input class="form-input media-url" placeholder="영상 링크 붙여넣기 (유튜브, 드라이브 등)" value="${(S.newSession.mediaUrls[1]||'').replace(/"/g,'&quot;')}" oninput="updateMediaUrl(1,this.value)">
          <div class="media-hint">영상은 짧게 촬영하세요. 5MB 초과 시 URL 입력을 권장합니다.</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label accent">보완점 <span style="font-weight:400;opacity:.7;text-transform:none">(상대 담당자에게 전달 — 선택사항)</span></label>
        <textarea class="form-textarea accent" style="border-color:#e9c06a;background:#fffbf2" placeholder="상대방이 보완해주면 좋을 내용 (비워도 됩니다)" oninput="updateNS('supplement',this.value)">${S.newSession.supplement}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn primary" onclick="addSession()">기록 저장</button>
      </div>
    </div>
  </div>` : ''}

  ${S.showAddMember ? `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-title">새 회원 등록</div>
      <div class="form-group">
        <label class="form-label">회원 이름</label>
        <input class="form-input" placeholder="예: 김민수" oninput="S.newMemberName=this.value" autofocus>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn primary" onclick="addMember()">등록</button>
      </div>
    </div>
  </div>` : ''}
  `;
}

// ============ 이벤트 핸들러 ============
function selectMember(id){S.selectedMember=id; S.filterAuthor='all'; render();}
function toggleAssess(){S.assessOpen=!S.assessOpen; render();}
function toggleWarningBanner(){S.warningBannerCollapsed=!S.warningBannerCollapsed; render();}
function setFilter(f){S.filterAuthor=f; render();}
function openAddSession(){S.newSession={date:today(),author:'정P',content:'',supplement:'',media:[],mediaUrls:['','']}; S.showAddSession=true; render();}
function openAddMember(){S.newMemberName=''; S.showAddMember=true; render();}
function closeModal(){S.showAddSession=false; S.showAddMember=false; render();}
function updateNS(k,v){S.newSession[k]=v;}

function updateAssess(key, field, val){
  const mid = S.selectedMember;
  if(!S.assessments[mid]) S.assessments[mid] = {};
  if(!S.assessments[mid][key]) S.assessments[mid][key] = {result:'미검사', note:''};
  S.assessments[mid][key][field] = val;
  save();
  const v = S.assessments[mid][key];
  cloud.upsertAssessment(mid, key, v.result, v.note);
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
    supplement: ns.supplement.trim(),
    media: media.length>0 ? media : undefined
  };
  S.sessions[mid].push(s);
  S.showAddSession = false;
  save(); render();
  cloud.upsertSession(mid, s);
}

function addMember(){
  const name = S.newMemberName.trim();
  if(!name){alert('이름을 입력하세요'); return;}
  const id = uid();
  const color = AVATAR_COLORS[S.members.length % AVATAR_COLORS.length];
  const m = {id, name, color};
  S.members.push(m);
  S.assessments[id] = {};
  S.sessions[id] = [];
  S.selectedMember = id;
  S.showAddMember = false;
  save(); render();
  cloud.upsertMember(m);
}

function handleFileUpload(input){
  var files=Array.from(input.files||[]);
  var existing=S.newSession.media||[];
  if(existing.length+files.length>2){alert('파일은 최대 2개까지 첨부 가능합니다');input.value='';return;}
  files.forEach(function(file){
    if(file.size>5*1024*1024){alert(file.name+' 용량이 큽니다. URL 입력을 권장합니다.');}
    var reader=new FileReader();
    reader.onload=function(e){
      S.newSession.media.push({type:'file',name:file.name,data:e.target.result});
      render();
    };
    reader.readAsDataURL(file);
  });
  input.value='';
}
function removeMediaFile(idx){S.newSession.media.splice(idx,1);render();}
function updateMediaUrl(idx,val){S.newSession.mediaUrls[idx]=val;}
function openMediaView(src){
  var d=document.createElement('div');d.className='media-overlay';
  d.onclick=function(){d.remove();};
  d.innerHTML='<img src="'+src+'" style="max-width:92vw;max-height:92vh;border-radius:8px">';
  document.body.appendChild(d);
}

function deleteSession(id){
  if(!confirm('이 세션 기록을 삭제하시겠습니까?')) return;
  const mid = S.selectedMember;
  S.sessions[mid] = (S.sessions[mid]||[]).filter(s => s.id!==id);
  save(); render();
  cloud.deleteSession(id);
}

// ============ 시작 ============
init();
