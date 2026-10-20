# ============================================================
#  Golf PT - 타석 PC 원격 유지보수 명령 (headless, 화면 공유 없음)
#  SSH 로 접속해 이 스크립트를 돌리면 창·아이콘·콘솔·비프음 없이 백그라운드 작업만 합니다.
#  회원이 쓰는 데스크톱 세션·트랙맨 화면/포커스/해상도에는 영향을 주지 않습니다.
#  (SSH 명령은 대화형 데스크톱에 창을 띄우지 않습니다 — 숨기는 게 아니라 원래 안 보입니다.)
#
#  사용 예 (관리 PC/폰에서 Tailscale 로 연결된 뒤):
#    ssh <사용자>@<타석PC-Tailscale-IP> "powershell -NoProfile -File C:\golfpt-sync\gpt-admin.ps1 status"
#    ssh ... "powershell -NoProfile -File C:\golfpt-sync\gpt-admin.ps1 logs -Tail 40"
#    ssh ... "powershell -NoProfile -File C:\golfpt-sync\gpt-admin.ps1 restart"
#    ssh ... "powershell -NoProfile -File C:\golfpt-sync\gpt-admin.ps1 diag -Watch 240"
#    ssh ... "powershell -NoProfile -File C:\golfpt-sync\gpt-admin.ps1 update"
#
#  명령: status(기본) | start | stop | restart | logs | diag | update | health | version
#  이 스크립트는 화면을 공유하거나 회원 세션을 조작하지 않습니다. 그런 기능은 범위에 없습니다.
# ============================================================
param(
  [Parameter(Position = 0)][string]$Command = 'status',
  [int]$Tail = 30,
  [int]$Watch = 240,
  [switch]$NotifyIfDown,
  [switch]$Json
)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$dir = 'C:\golfpt-sync'
$base = 'https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent'
function Out-Line($s) { Write-Output ([string]$s) }

# ---------- 공통 상태 조회 ----------
function Get-AgentState {
  $node = @(Get-Process node -ErrorAction SilentlyContinue)
  $running = $node.Count -gt 0
  $logPath = Join-Path $dir 'agent.log'
  $logAgeMin = $null; $lastLog = ''
  if (Test-Path $logPath) {
    try { $logAgeMin = [int]((Get-Date) - (Get-Item $logPath).LastWriteTime).TotalMinutes } catch {}
    try { $lastLog = (Get-Content $logPath -Tail 1 -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -Last 1) } catch {}
  }
  $bay = ''
  try { $cfg = Get-Content (Join-Path $dir 'config.json') -Raw -ErrorAction Stop | ConvertFrom-Json; $bay = [string]$cfg.defaultBay } catch {}
  $diskFreeGB = $null
  try { $d = Get-PSDrive C -ErrorAction SilentlyContinue; if ($d) { $diskFreeGB = [math]::Round($d.Free / 1GB, 1) } } catch {}
  $nodeVer = ''
  try { $nodeVer = (& node -v 2>$null) } catch {}
  $installed = (Test-Path (Join-Path $dir 'start-hidden.vbs')) -and (Test-Path (Join-Path $dir 'agent.js'))
  return [pscustomobject]@{
    running = $running; pids = ($node | ForEach-Object { $_.Id }); installed = $installed
    bay = $bay; logAgeMin = $logAgeMin; lastLog = $lastLog; diskFreeGB = $diskFreeGB; nodeVer = $nodeVer
    host = $env:COMPUTERNAME; at = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  }
}

# ---------- 에이전트 중지/시작 (중지.bat / update.ps1 과 같은 방식) ----------
function Stop-Agent {
  try { 'stop' | Out-File -FilePath (Join-Path $dir 'agent.stop') -Encoding ascii } catch {}
  try {
    Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match 'start-hidden' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch {}
  try { taskkill /F /IM node.exe 2>$null | Out-Null } catch {}
  Start-Sleep -Seconds 2
  Remove-Item (Join-Path $dir 'agent.stop') -ErrorAction SilentlyContinue
}
function Start-Agent {
  $vbs = Join-Path $dir 'start-hidden.vbs'
  if (-not (Test-Path $vbs)) { Out-Line '[오류] start-hidden.vbs 가 없습니다 - 에이전트가 설치돼 있지 않습니다.'; return $false }
  # 창 없이 백그라운드로 — 대화형 화면에 아무것도 뜨지 않음
  Start-Process wscript.exe -ArgumentList "`"$vbs`"" -WorkingDirectory $dir -WindowStyle Hidden
  Start-Sleep -Seconds 8
  return ((Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
}

# ---------- 장애 알림 (관리자에게 푸시) — config 에 PUSH_WORKER_URL 있을 때만 ----------
function Send-DownAlert($state) {
  $cfg = $null
  try { $cfg = Get-Content (Join-Path $dir 'config.json') -Raw -ErrorAction Stop | ConvertFrom-Json } catch {}
  $url = $null; $key = $null; $to = @('관리자')
  if ($cfg) {
    if ($cfg.PUSH_WORKER_URL) { $url = [string]$cfg.PUSH_WORKER_URL }
    if ($cfg.R2_API_KEY) { $key = [string]$cfg.R2_API_KEY }
    if ($cfg.adminNames) { try { $to = @($cfg.adminNames) } catch {} }
  }
  if (-not $url -or -not $key) { Out-Line '[알림] PUSH_WORKER_URL/R2_API_KEY 가 config 에 없어 푸시는 건너뜁니다(로그만).'; return }
  $body = @{ to = $to; title = ('⚠️ 타석 에이전트 중단 — ' + $state.host); body = ('베이 ' + $state.bay + ' 에이전트가 멈췄습니다. 마지막 로그 ' + ($(if ($null -ne $state.logAgeMin) { $state.logAgeMin.ToString() + '분 전' } else { '없음' })) + '. 원격으로 restart 필요.'); tag = 'agent-down'; url = './index.html' } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Uri ($url.TrimEnd('/') + '/push/notify') -Method Post -Headers @{ 'X-API-Key' = $key; 'Content-Type' = 'application/json' } -Body $body -TimeoutSec 20 | Out-Null
    Out-Line '[알림] 관리자에게 중단 알림을 보냈습니다.'
  } catch { Out-Line ('[알림] 전송 실패: ' + $_.Exception.Message) }
}

# ---------- 업데이트 (headless — pause/notepad 없음. 이미 설치된 PC 전용) ----------
function Update-Agent {
  $st = Get-AgentState
  if (-not $st.installed) { Out-Line '[오류] 설치가 안 된 PC 입니다. 설치는 update.ps1(대화형)로 먼저 하세요.'; return $false }
  Out-Line '[1/4] 중지...'; Stop-Agent
  $tmp = Join-Path $env:TEMP 'gpt-agent-dl'; New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  $files = @('agent.js', 'ftmf-parser.js'); $ok = $true
  Out-Line '[2/4] 다운로드·검증...'
  foreach ($f in $files) {
    try { Invoke-WebRequest -Uri "$base/$f" -OutFile "$tmp\$f" -UseBasicParsing -TimeoutSec 60 } catch { Out-Line ("[오류] $f 다운로드 실패: " + $_.Exception.Message); $ok = $false; continue }
    $p = "$tmp\$f"
    if (!(Test-Path $p) -or (Get-Item $p).Length -lt 10240) { Out-Line "[오류] $f 크기 비정상"; $ok = $false; continue }
    if ((Get-Content $p -TotalCount 1 -Encoding UTF8) -match '^\s*<') { Out-Line "[오류] $f 가 HTML 로 저장됨"; $ok = $false; continue }
    & node --check $p 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Out-Line "[오류] $f 문법검사 실패"; $ok = $false }
  }
  if ($ok) {
    Out-Line '[3/4] 교체(_old 백업)...'
    foreach ($f in $files) {
      if (Test-Path "$dir\$f") { Copy-Item "$dir\$f" "$dir\$($f -replace '\.js$','_old.js')" -Force }
      Copy-Item "$tmp\$f" "$dir\$f" -Force
    }
  } else { Out-Line '[유지] 검증 실패 - 기존 파일 그대로 재시작만 합니다.' }
  Out-Line '[4/4] 재시작...'
  $up = Start-Agent
  Out-Line ($(if ($up) { '[성공] 에이전트 실행 중' } else { '[실패] 에이전트가 안 떴습니다 - logs 로 node-crash.log 확인' }))
  return $up
}

# ==================== 명령 처리 ====================
switch ($Command.ToLower()) {
  'status' {
    $st = Get-AgentState
    if ($Json) { Out-Line ($st | ConvertTo-Json -Compress); if (-not $st.running) { exit 1 } else { exit 0 } }
    Out-Line ('PC         : ' + $st.host + '  (' + $st.at + ')')
    Out-Line ('에이전트   : ' + $(if ($st.running) { '실행 중 (PID ' + ($st.pids -join ',') + ')' } else { '중지됨' }))
    Out-Line ('설치       : ' + $(if ($st.installed) { '예' } else { '아니오 (C:\golfpt-sync 미구성)' }))
    Out-Line ('베이       : ' + $st.bay)
    Out-Line ('마지막 로그: ' + $(if ($null -ne $st.logAgeMin) { $st.logAgeMin.ToString() + '분 전' } else { '없음' }))
    Out-Line ('디스크 여유: ' + $(if ($null -ne $st.diskFreeGB) { $st.diskFreeGB.ToString() + ' GB' } else { '?' }) + '   node ' + $st.nodeVer)
    if ($st.lastLog) { Out-Line ('최근 한 줄 : ' + $st.lastLog) }
    if (-not $st.running) { exit 1 } else { exit 0 }
  }
  'start'   { $up = Start-Agent; Out-Line ($(if ($up) { '[성공] 실행 중' } else { '[실패] 안 떴습니다' })); exit ($(if ($up) { 0 } else { 1 })) }
  'stop'    { Stop-Agent; Out-Line '[완료] 중지했습니다. (자동시작은 그대로 — 재부팅 시 다시 켜짐)'; exit 0 }
  'restart' { Stop-Agent; $up = Start-Agent; Out-Line ($(if ($up) { '[성공] 재시작됨' } else { '[실패] 재시작 후 안 떴습니다 - logs 확인' })); exit ($(if ($up) { 0 } else { 1 })) }
  'logs' {
    foreach ($f in @('agent.log', 'node-crash.log')) {
      $p = Join-Path $dir $f
      Out-Line ('===== ' + $f + ' (최근 ' + $Tail + '줄) =====')
      if (Test-Path $p) { Get-Content $p -Tail $Tail -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { Out-Line $_ } } else { Out-Line '(없음)' }
      Out-Line ''
    }
    exit 0
  }
  'diag' {
    $p = Join-Path $dir 'player-diag.ps1'
    if (-not (Test-Path $p)) {
      try { Invoke-WebRequest -Uri "$base/player-diag.ps1" -OutFile $p -UseBasicParsing -TimeoutSec 60 } catch { Out-Line ('[오류] 진단 스크립트 다운로드 실패: ' + $_.Exception.Message); exit 1 }
    }
    # 조용한 진단을 백그라운드로 — 창·소리 없음. 결과는 C:\golfpt-sync\diag
    Start-Process powershell.exe -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $p, '-Watch', "$Watch", '-Quiet') -WindowStyle Hidden
    Out-Line ('[시작] 조용한 진단을 백그라운드로 켰습니다 (최대 ' + $Watch + '분). 결과: C:\golfpt-sync\diag\player-diag-*.txt')
    Out-Line '      나중에 logs 대신 그 폴더의 파일을 scp 로 내려받으면 됩니다.'
    exit 0
  }
  'update'  { $up = Update-Agent; exit ($(if ($up) { 0 } else { 1 })) }
  'health'  {
    $st = Get-AgentState
    $down = (-not $st.running) -or (-not $st.installed)
    if ($down) { Out-Line ('[장애] 에이전트 중단 — ' + $st.host + ' 베이 ' + $st.bay); if ($NotifyIfDown) { Send-DownAlert $st }; exit 1 }
    Out-Line ('[정상] 에이전트 실행 중 — ' + $st.host + ' 베이 ' + $st.bay); exit 0
  }
  'version' {
    $av = ''
    try { $m = Select-String -Path (Join-Path $dir 'agent.js') -Pattern "AGENT_VERSION\s*=\s*['""]?([^'"";]+)" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) { $av = $m.Matches[0].Groups[1].Value } } catch {}
    Out-Line ('gpt-admin 1.0 / agent.js ' + $(if ($av) { $av } else { '(버전 표기 없음)' }))
    exit 0
  }
  default {
    Out-Line ('알 수 없는 명령: ' + $Command)
    Out-Line '사용: status | start | stop | restart | logs [-Tail N] | diag [-Watch N] | update | health [-NotifyIfDown] | version'
    exit 2
  }
}
