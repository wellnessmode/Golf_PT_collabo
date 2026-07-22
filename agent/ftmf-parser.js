// ============================================================
//  TrackMan FTMF 파서 — .ftmf(ZIP) 안의 Fusion JSON에서 샷 메트릭 추출
// ------------------------------------------------------------
//  의존성 0 (Node 내장 zlib만 사용). ftmf = ZIP(store/deflate),
//  안에 .stmf(또 ZIP) → Fusion/Fusion_OutputMessages.json
//
//  추출 결과는 우리 앱 shotEvents.data 스키마로 정규화:
//   {club, clubSpeed, ballSpeed, smash, carry, total, launch, spin,
//    clubPath, faceAngle, attack, side, sideTotal, landAngle, ...}
//  단위: 트랙맨 원본 m·m/s 그대로 저장 (앱에서 yd/mph 변환)
// ============================================================
const zlib = require('zlib');

// ---- 최소 ZIP 리더 (중앙 디렉터리 파싱, store+deflate 지원) ----
function readZipEntries(buf){
  // End of Central Directory 찾기 (뒤에서부터)
  var eocd = -1;
  for (var i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP (no EOCD)');
  var cdCount = buf.readUInt16LE(eocd + 10);
  var cdOffset = buf.readUInt32LE(eocd + 16);
  var entries = {};
  var p = cdOffset;
  for (var n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    var method = buf.readUInt16LE(p + 10);
    var compSize = buf.readUInt32LE(p + 20);
    var nameLen = buf.readUInt16LE(p + 28);
    var extraLen = buf.readUInt16LE(p + 30);
    var commentLen = buf.readUInt16LE(p + 32);
    var localOff = buf.readUInt32LE(p + 42);
    var name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries[name] = { method: method, compSize: compSize, localOff: localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function extractEntry(buf, ent){
  // local header에서 실제 데이터 시작 계산
  var lo = ent.localOff;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('bad local header');
  var nameLen = buf.readUInt16LE(lo + 26);
  var extraLen = buf.readUInt16LE(lo + 28);
  var dataStart = lo + 30 + nameLen + extraLen;
  var raw = buf.slice(dataStart, dataStart + ent.compSize);
  if (ent.method === 0) return raw;            // store
  if (ent.method === 8) return zlib.inflateRawSync(raw); // deflate
  throw new Error('unsupported zip method ' + ent.method);
}
function findEntry(entries, suffix){
  var keys = Object.keys(entries);
  for (var i=0;i<keys.length;i++){ if (keys[i].indexOf(suffix) !== -1) return keys[i]; }
  return null;
}

// TrackMan SessionState 의 ClubType(예: "7Iron","Driver","PitchingWedge","3Wood")을
// 앱/일지에서 읽기 좋은 한글 라벨로. 못 맞추면 원문을 그대로 둔다(정보 손실 없음).
function normalizeClub(raw){
  if (!raw) return null;
  var s = String(raw).trim();
  var map = {
    Driver:'드라이버',
    '2Wood':'2번 우드','3Wood':'3번 우드','4Wood':'4번 우드','5Wood':'5번 우드','7Wood':'7번 우드',
    '2Hybrid':'2번 유틸','3Hybrid':'3번 유틸','4Hybrid':'4번 유틸','5Hybrid':'5번 유틸','6Hybrid':'6번 유틸',
    '1Iron':'1번 아이언','2Iron':'2번 아이언','3Iron':'3번 아이언','4Iron':'4번 아이언','5Iron':'5번 아이언',
    '6Iron':'6번 아이언','7Iron':'7번 아이언','8Iron':'8번 아이언','9Iron':'9번 아이언',
    PitchingWedge:'피칭웨지', GapWedge:'갭웨지', ApproachWedge:'어프로치웨지',
    SandWedge:'샌드웨지', LobWedge:'로브웨지', Putter:'퍼터'
  };
  if (map[s]) return map[s];
  // "48Degree"/"52Degree"/"56Degree" 형태(로프트 표기 웨지)
  var deg = s.match(/^(\d{2})\s*(?:도|deg|degree)?$/i);
  if (deg) return deg[1] + '도 웨지';
  return s;
}

// ---- 메인: ftmf/stmf Buffer → 정규화된 샷 객체 ----
// 두 형식 지원:
//  (a) .ftmf = ZIP( .stmf + 영상 ) — TPS가 Data 폴더에 쓰던 기존 형식
//  (b) .stmf 그 자체 — TrackMan iO 가 tmfs\timed_out_* 폴더에 버리는 형식.
//      (7/21 카메라 설치 후 TPS 전달이 시간초과로 전부 실패 → ftmf가 안 생기는
//       고장의 산물. 내용물은 (a)의 내부와 동일해서 그대로 먹을 수 있다)
function parseFtmf(ftmfBuffer){
  var outer = readZipEntries(ftmfBuffer);

  // 1) .stmf 찾기 (또 ZIP) — 없으면 이 파일 자체가 stmf 인지 확인
  var stmfBuf, isDirectStmf = false;
  var stmfName = findEntry(outer, '.stmf');
  if (stmfName) {
    stmfBuf = extractEntry(ftmfBuffer, outer[stmfName]);
  } else if (findEntry(outer, 'TmfInfo.json') || findEntry(outer, 'Fusion_OutputMessages.json')) {
    stmfBuf = ftmfBuffer; isDirectStmf = true;
  } else {
    throw new Error('no .stmf inside ftmf');
  }

  // 2) stmf 안의 Fusion JSON
  // direct-stmf 는 완성된 최종 파일 — Fusion 이 없으면 영영 없다(샷이 아닌 잡음
  // 번들). '(stmf-final)' 마커로 에이전트가 재시도 없이 즉시 스킵하게 한다.
  var inner = readZipEntries(stmfBuf);
  var fusionName = findEntry(inner, 'Fusion_OutputMessages.json');
  if (!fusionName) throw new Error(isDirectStmf ? 'no Fusion_OutputMessages.json (stmf-final)' : 'no Fusion_OutputMessages.json');
  var fusionJson = JSON.parse(extractEntry(stmfBuf, inner[fusionName]).toString('utf8'));

  // 2.5) SessionState.json — TPS에서 사용자가 고른 클럽/볼/플레이어가 그대로 들어있다.
  // (레이더 추측 DetectedClubCategory 와 달리 이것이 진짜 선택 클럽)
  var userCond = {};
  var ssHeader = {};
  try {
    var ssName = findEntry(inner, 'SessionState.json');
    if (ssName) {
      var ss = JSON.parse(extractEntry(stmfBuf, inner[ssName]).toString('utf8'));
      var ssLast = Array.isArray(ss) ? ss[ss.length - 1] : ss;
      if (ssLast) {
        userCond = ssLast.UserConditions || {};
        ssHeader = ssLast['#Header'] || {};
      }
    }
  } catch (e) {}

  // 3) TmfInfo (시간·MeasurementId)
  var tmfInfo = {};
  var tmfName = findEntry(inner, 'TmfInfo.json');
  if (tmfName) { try { tmfInfo = JSON.parse(extractEntry(stmfBuf, inner[tmfName]).toString('utf8')); } catch(e){} }

  // 4) Measurement 메시지(가장 완전한 것 = ClubSpeed 포함) 선택
  var meas = null;
  fusionJson.forEach(function(m){
    var t = (m['#Header']||{})['#Type']||'';
    if (t.indexOf('FusionData/Measurement') === 0 && m.Measurement && m.Measurement.ClubSpeed != null) {
      meas = m.Measurement;
    }
  });
  // ClubSpeed 없는 경우라도 LaunchData라도 잡기
  if (!meas) {
    fusionJson.forEach(function(m){
      if (m.Measurement && meas == null) meas = m.Measurement;
    });
  }
  // direct-stmf(고장 상태의 timed_out 파일)는 완성본이라 측정이 없으면 영영 없다
  // → 'stmf-final' 마커로 에이전트가 재시도 없이 즉시·영구 스킵 (수천 개 잡음 방지)
  if (!meas) throw new Error(isDirectStmf ? 'no Measurement (stmf-final)' : 'no Measurement in fusion json');

  // 5) ftmf 내부 영상 파일 목록 (scene/peek mkv)
  var videos = Object.keys(outer).filter(function(k){ return /\.(mkv|mov|mp4)$/i.test(k); });

  var measurementId = (meas.Id) || tmfInfo.MeasurementId ||
    ((fusionJson[0]||{})['#Header']||{}).MeasurementId || ssHeader.MeasurementId || null;
  var trackingUnit = ((fusionJson[0]||{})['#Header']||{}).TrackingUnit || ssHeader.TrackingUnit || null;
  var eventTime = tmfInfo.TimeStart || meas.Time ||
    ((fusionJson[0]||{})['#Header']||{}).EventTime || ssHeader.EventTime || null;

  function num(v){ return (v==null||isNaN(v)) ? null : Math.round(v*1000)/1000; }

  // ---- 클럽: "사용자가 TPS에서 선택한 클럽"을 최우선으로 찾는다 ----
  // DetectedClubCategory 는 레이더가 스윙 데이터로 '추측'한 클럽이라 자주 틀린다
  // (52도 웨지→Iron, 7아이언→Driver 오인 사례). 선택 클럽 후보를 전체 JSON에서 수집.
  var clubCands = {};
  function collectClubCandidates(obj, pathStr, depth){
    if (!obj || typeof obj !== 'object' || depth > 6) return;
    Object.keys(obj).forEach(function(k){
      var v = obj[k];
      var p = pathStr ? pathStr + '.' + k : k;
      if (/club/i.test(k) && !/speed|path|category/i.test(k)){
        if (typeof v === 'string' && v.trim()) clubCands[p] = v.trim();
        else if (v && typeof v === 'object' && typeof v.Name === 'string' && v.Name.trim()) clubCands[p + '.Name'] = v.Name.trim();
      }
      if (v && typeof v === 'object') collectClubCandidates(v, p, depth + 1);
    });
  }
  try {
    fusionJson.forEach(function(m, i){ collectClubCandidates(m, 'msg' + i, 0); });
    collectClubCandidates(tmfInfo, 'tmf', 0);
  } catch (e) {}
  // 선택 클럽 우선순위:
  //  1) SessionState.UserConditions.ClubType — TPS 화면에서 사용자가 실제 고른 클럽 (최우선·정답)
  //  2) Measurement.Club(문자열) → TmfInfo.Club → 후보 중 '.Club'/'ClubName' 끝나는 첫 값
  var selectedClub = null;
  if (typeof userCond.ClubType === 'string' && userCond.ClubType.trim()) selectedClub = normalizeClub(userCond.ClubType.trim());
  else if (typeof meas.Club === 'string' && meas.Club.trim()) selectedClub = meas.Club.trim();
  else if (meas.Club && typeof meas.Club === 'object' && typeof meas.Club.Name === 'string') selectedClub = meas.Club.Name.trim();
  else if (typeof tmfInfo.Club === 'string' && tmfInfo.Club.trim()) selectedClub = tmfInfo.Club.trim();
  else {
    var ck = Object.keys(clubCands).find(function(p){ return /(\.|^)(Club|ClubName|SelectedClub)(\.Name)?$/i.test(p); });
    if (ck) selectedClub = clubCands[ck];
  }
  // 후보 로그용 — 선택(SessionState)값과 감지값을 나란히
  clubCands._SessionClub = userCond.ClubType || null;
  clubCands._Detected = meas.DetectedClubCategory || null;
  // _SessionClub·_Detected 는 진단에 꼭 필요하니 항상 포함 + 나머지 후보는 6개까지
  var clubCandsSmall = { _SessionClub: clubCands._SessionClub, _Detected: clubCands._Detected };
  Object.keys(clubCands).forEach(function(k){
    if (k==='_SessionClub'||k==='_Detected') return;
    if (Object.keys(clubCandsSmall).length < 8) clubCandsSmall[k] = clubCands[k];
  });

  // 트랙맨 원본 단위: 거리=m, 속도=m/s, 각도=°, 스핀=rpm
  var data = {
    club: selectedClub || meas.DetectedClubCategory || null,
    _clubDetected: meas.DetectedClubCategory || null,
    _clubSelected: selectedClub || null,
    dexterity: meas.PlayerDexterity || null,
    // 클럽
    clubSpeed: num(meas.ClubSpeed),
    smash: num(meas.SmashFactor),
    attack: num(meas.AttackAngle),
    clubPath: num(meas.ClubPath),
    faceAngle: num(meas.FaceAngle),
    faceToPath: num(meas.FaceToPath),
    dynamicLoft: num(meas.DynamicLoft),
    impactOffset: num(meas.ImpactOffset),
    impactHeight: num(meas.ImpactHeight),
    // 볼
    ballSpeed: num(meas.BallSpeed),
    launch: num(meas.LaunchAngle),
    launchDir: num(meas.LaunchDirection),
    spin: num(meas.SpinRate),
    spinAxis: num(meas.SpinAxis),
    // 탄도
    maxHeight: num(meas.MaxHeight),
    hangTime: num(meas.HangTime),
    landAngle: num(meas.LandingAngle),
    carry: num(meas.Carry),
    carrySide: num(meas.CarrySide),
    total: num(meas.Total),
    totalSide: num(meas.TotalSide),
    // 토탈 후보 키들 — TPS 화면이 어떤 키를 보여주는지 확인용. 진단 후 결정.
    // (TrackMan ftmf 는 버전에 따라 TotalDistance/CarryAndRoll/FinalDistance/Roll 등이 더 있을 수 있음)
    _totalCandidates: {
      Total: num(meas.Total),
      TotalDistance: num(meas.TotalDistance),
      CarryAndRoll: num(meas.CarryAndRoll),
      FinalDistance: num(meas.FinalDistance),
      Roll: num(meas.Roll),
      RollDistance: num(meas.RollDistance),
      Carry: num(meas.Carry)
    },
    curve: num(meas.Curve),
    _units: { dist:'m', speed:'m/s', angle:'deg', spin:'rpm' },
    _src: 'trackman_io'
  };

  return {
    measurementId: measurementId,
    trackingUnit: trackingUnit,
    eventTime: eventTime,
    data: data,
    videos: videos,                 // ftmf 내부 영상 경로(상대)
    clubCandidates: clubCandsSmall, // 클럽 후보 진단 (agent.log 확인용)
    raw: { tmfInfo: tmfInfo }
  };
}

module.exports = { parseFtmf: parseFtmf, readZipEntries: readZipEntries, extractEntry: extractEntry, findEntry: findEntry, normalizeClub: normalizeClub };
