# ============================================================
#  Golf PT - 원격 화면 제어(비차단 표시) 세팅 : TightVNC(서비스) + Tailscale
#  목적: 폰·노트북에서 매장 PC 화면을 실시간 보고 조작하되, 접속 중 뜨는 커다란 창으로
#        트랙맨 화면을 가리지 않게 한다.
#    - VNC 는 콘솔 화면을 그대로 공유(미러링)한다 → 트랙맨 전체화면·해상도·입력 그대로 유지.
#    - 접속해도 "수락 팝업"이 없고(암호 인증, 무인), 소리·콘솔 창도 없다.
#    - 접속 중 표시는 "커다란 창" 대신 작은 구석 알약(vnc-indicator.ps1)으로 — 비차단형.
#    - 연결 종료는 그 알약 클릭 또는 VNC 서버 트레이 메뉴.
#    - 서비스로 설치 → 재부팅 후에도 인증된 관리자가 접속.
#    - VNC 는 Tailscale 망에서만 접속 허용(공개 인터넷 미개방) → 약한 VNC 암호를 WireGuard 로 감쌈.
#  RustDesk(기존)·SSH 관리도구(PR#132)·golfpt-sync 에이전트와 충돌 없음(포트·서비스·작업 다름).
#
#  사용법 (관리자 권한, 처음 한 번은 PC 앞에서):
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/remote-vnc-setup.ps1 -OutFile "$env:TEMP\remote-vnc-setup.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\remote-vnc-setup.ps1" -Branch "3호점 1번타석"
#  옵션: -Password "<VNC 암호>"  -TailscaleAuthKey "<tskey-...>"  -VncMsiUrl "<다른 버전 MSI>"
#  ※ 미검증: TightVNC/Tailscale 설치·방화벽·구석 표시의 실제 화면 동작은 Windows 에서만 확인 가능.
# ============================================================
param(
  [string]$Password,
  [string]$Branch,
  [string]$TailscaleAuthKey,
  [string]$VncMsiUrl = 'https://www.tightvnc.com/download/2.8.84/tightvnc-2.8.84-gpl-setup-64bit.msi'
)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
function Say($s, $c) { if ($c) { Write-Host $s -ForegroundColor $c } else { Write-Host $s } }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# ---------- 관리자 권한(승격 시 파라미터 유지) ----------
$admin = $false
try { $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } catch {}
if (-not $admin) {
  Say '관리자 권한이 필요합니다. 관리자 권한으로 다시 엽니다 (UAC 뜨면 [예]).' Yellow
  try {
    if ($PSCommandPath) {
      $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
      if ($Branch) { $a += @('-Branch', ('"' + ($Branch -replace '"', '') + '"')) }
      if ($Password) { $a += @('-Password', ('"' + ($Password -replace '"', '') + '"')) }
      if ($TailscaleAuthKey) { $a += @('-TailscaleAuthKey', ('"' + ($TailscaleAuthKey -replace '"', '') + '"')) }
      if ($VncMsiUrl) { $a += @('-VncMsiUrl', ('"' + ($VncMsiUrl -replace '"', '') + '"')) }
      Start-Process powershell -Verb RunAs -ArgumentList ($a -join ' '); return
    }
  } catch {}
  Say '"Windows PowerShell" 을 마우스 오른쪽 → "관리자 권한으로 실행" 후 다시 실행해 주세요.' Yellow
  return
}

# ---------- VNC 암호 받기 (저장 안 함. VNC 는 앞 8자만 유효) ----------
$plain = $Password
if (-not $plain) {
  Say ''
  Say 'VNC 접속 암호를 정하세요. (VNC 규격상 앞 8자만 쓰입니다. 접속은 Tailscale 망에서만 됩니다.)' Cyan
  $s1 = Read-Host '암호 입력' -AsSecureString
  $s2 = Read-Host '한 번 더' -AsSecureString
  $b1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s1); $b2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s2)
  try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b1); $p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b2) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b1); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b2) }
  if ($plain -ne $p2) { Say '두 암호가 다릅니다. 다시 실행해 주세요.' Red; return }
}
if (-not $plain -or $plain.Length -lt 6) { Say '암호가 너무 짧습니다(6자 이상).' Red; return }
if ($plain -match '[\s"]') { Say '암호에 공백·따옴표는 쓰지 마세요(영문+숫자 권장). 설치 명령줄 처리에 문제가 됩니다.' Red; return }

$dir = 'C:\golfpt-sync'
try { if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null } } catch {}

# ---------- ① TightVNC 서버를 서비스로 조용히 설치 ----------
Say ''; Say '[1/5] TightVNC 서버 설치(서비스)...' Cyan
function Find-Tvn { foreach ($p in @("$env:ProgramFiles\TightVNC\tvnserver.exe", "${env:ProgramFiles(x86)}\TightVNC\tvnserver.exe")) { if (Test-Path $p) { return $p } }; return $null }
$tvn = Find-Tvn
if (-not $tvn) {
  try {
    $msi = Join-Path $env:TEMP 'tightvnc-setup.msi'
    Say '  TightVNC 내려받는 중...' Cyan
    Invoke-WebRequest $VncMsiUrl -OutFile $msi -UseBasicParsing
    # 서버만 설치, 서비스 등록, 제어암호 설정, HTTP/Java 접속 끔. 방화벽은 아래에서 Tailscale 로만 열므로 MSI 예외는 끔.
    $props = @(
      'ADDLOCAL=Server', 'SERVER_REGISTER_AS_SERVICE=1', 'SERVER_ADD_FIREWALL_EXCEPTION=0', 'SERVER_ALLOW_SAS=1',
      'SET_USEVNCAUTHENTICATION=1', 'VALUE_OF_USEVNCAUTHENTICATION=1',
      'SET_PASSWORD=1', ('VALUE_OF_PASSWORD=' + $plain),
      'SET_USECONTROLAUTHENTICATION=1', 'VALUE_OF_USECONTROLAUTHENTICATION=1',
      'SET_CONTROLPASSWORD=1', ('VALUE_OF_CONTROLPASSWORD=' + $plain),
      'SET_ACCEPTHTTPCONNECTIONS=1', 'VALUE_OF_ACCEPTHTTPCONNECTIONS=0',
      'SET_RUNCONTROLINTERFACE=1', 'VALUE_OF_RUNCONTROLINTERFACE=1'
    )
    $args = @('/i', "`"$msi`"", '/quiet', '/norestart') + $props
    Start-Process msiexec.exe -ArgumentList $args -Wait
    Start-Sleep -Seconds 4
    $tvn = Find-Tvn
  } catch { Say ('  TightVNC 설치 실패: ' + $_.Exception.Message) Red }
}
$plain = $null   # 메모리에서 암호 비움
$pwSet = $false
if ($tvn) {
  # 서비스가 MSI 에서 조용히 등록 안 되는 경우가 있어 보강(이미 돼 있으면 무해)
  try { & $tvn -install -silent 2>$null | Out-Null } catch {}
  try { Set-Service -Name tvnserver -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service tvnserver -ErrorAction SilentlyContinue } catch {}
  try { & $tvn -start -silent 2>$null | Out-Null } catch {}
  # 암호가 실제로 설정됐는지 레지스트리로 확인(MSI 가 암호 속성을 무시하는 경우가 있음)
  foreach ($rk in @('HKLM:\SOFTWARE\TightVNC\Server', 'HKLM:\SOFTWARE\WOW6432Node\TightVNC\Server')) {
    try { $pw = (Get-ItemProperty $rk -Name Password -ErrorAction SilentlyContinue).Password; if ($pw -and $pw.Length -gt 0) { $pwSet = $true } } catch {}
  }
  # 접속 끊기(연결 종료)를 일반 사용자 표시 프로그램이 할 수 있게, Users 에 서비스 start/stop 권한 부여(append-only)
  try {
    $sd = ((& sc.exe sdshow tvnserver 2>$null) -join '') -replace '\s', ''
    if ($sd -match '^D:' -and $sd -notmatch '\(A;;[A-Z]*;;;BU\)') {
      $ace = '(A;;LCRPWP;;;BU)'   # Users: 상태조회(LC)·시작(RP)·정지(WP)
      $new = if ($sd -match 'S:') { $sd -replace '(S:)', ($ace + '$1') } else { $sd + $ace }
      & sc.exe sdset tvnserver $new 2>$null | Out-Null
    }
  } catch {}
} else {
  Say '  TightVNC 설치를 확인하지 못했습니다. https://www.tightvnc.com/download.php 에서 설치 후 다시 실행하세요.' Red
}
if ($tvn -and -not $pwSet) { Say '  ⚠ VNC 암호가 설정되지 않았을 수 있습니다. TightVNC 아이콘 → Configuration → Server → "Primary password"에서 직접 정해 주세요.' Yellow }

# ---------- ② 방화벽: VNC(5900) 는 Tailscale 망에서만 ----------
Say '[2/5] 방화벽 — VNC 를 Tailscale 망으로만 제한...' Cyan
try {
  if (-not (Get-NetFirewallRule -DisplayName 'GolfPT VNC (Tailscale only)' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'GolfPT VNC (Tailscale only)' -Direction Inbound -Protocol TCP -LocalPort 5900 -Action Allow -RemoteAddress '100.64.0.0/10' -Profile Any | Out-Null
  }
  # TightVNC 가 혹시 만든 공개 허용 규칙은 끈다(공개 인터넷 노출 방지)
  Get-NetFirewallRule -DisplayName '*TightVNC*' -ErrorAction SilentlyContinue | Disable-NetFirewallRule -ErrorAction SilentlyContinue
  $r = Get-NetFirewallRule -DisplayName 'GolfPT VNC (Tailscale only)' -ErrorAction SilentlyContinue
  if ($r -and $r.Enabled -eq 'True') { Say '  VNC 는 Tailscale 로 연결된 기기에서만 접속됩니다(공개 인터넷에 안 열림).' Green }
  else { Say '  ⚠ 방화벽 규칙 확인 실패 — 수동 확인 필요.' Yellow }
} catch { Say ('  방화벽 설정 실패(수동 확인 권장): ' + $_.Exception.Message) Yellow }

# ---------- ③ Tailscale 설치·연결 ----------
Say '[3/5] Tailscale(사설 메시 VPN) 설치·연결...' Cyan
function Find-Ts { foreach ($p in @("$env:ProgramFiles\Tailscale\tailscale.exe", "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe")) { if (Test-Path $p) { return $p } }; try { $g = Get-Command tailscale.exe -ErrorAction SilentlyContinue; if ($g) { return $g.Source } } catch {}; return $null }
$ts = Find-Ts
if (-not $ts) {
  try { if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id Tailscale.Tailscale -e --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null } } catch {}
  for ($i = 0; $i -lt 40 -and -not $ts; $i += 4) { Start-Sleep -Seconds 4; $ts = Find-Ts }
  if (-not $ts) {
    try {
      $msi2 = Join-Path $env:TEMP 'tailscale-setup.msi'
      Invoke-WebRequest 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' -OutFile $msi2 -UseBasicParsing
      Start-Process msiexec.exe -ArgumentList @('/i', "`"$msi2`"", '/quiet', '/norestart') -Wait
      for ($i = 0; $i -lt 30 -and -not $ts; $i += 3) { Start-Sleep -Seconds 3; $ts = Find-Ts }
    } catch { Say ('  Tailscale 설치 실패: ' + $_.Exception.Message) Red }
  }
}
$tsIp = ''
if ($ts) {
  try {
    if ($TailscaleAuthKey) { & $ts up --authkey $TailscaleAuthKey --accept-routes 2>&1 | Out-Null }
    else { Say '  브라우저가 열리면 대표님 계정으로 1회 로그인하세요.' Cyan; Start-Process $ts -ArgumentList 'up' }
    for ($i = 0; $i -lt 20 -and -not $tsIp; $i += 2) { Start-Sleep -Seconds 2; try { $tsIp = ((& $ts ip -4 2>$null) | Select-Object -First 1).Trim() } catch {} }
  } catch { Say ('  tailscale up 실패: ' + $_.Exception.Message) Yellow }
} else { Say '  Tailscale 설치 실패 — https://tailscale.com/download 에서 직접 설치 후 로그인.' Red }

# ---------- ④ 접속 중 비차단 표시(구석 알약) 설치 + 로그인 자동실행 ----------
Say '[4/5] 접속 중 표시(비차단 구석 알약) 설치...' Cyan
try { Invoke-WebRequest 'https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/vnc-indicator.ps1' -OutFile (Join-Path $dir 'vnc-indicator.ps1') -UseBasicParsing } catch { Say ('  표시 스크립트 다운로드 실패: ' + $_.Exception.Message) Yellow }
try {
  $indCmd = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $dir 'vnc-indicator.ps1') + '"'
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $indCmd
  $trg = New-ScheduledTaskTrigger -AtLogOn
  # 대화형 로그인 사용자로 실행해야 회원 화면(콘솔 세션)에 표시가 뜬다
  $prin = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited   # Users
  Register-ScheduledTask -TaskName 'GolfPT-VNC-Indicator' -Action $act -Trigger $trg -Principal $prin -Force | Out-Null
  # 지금도 바로 뜨게 한 번 실행(이미 로그인 상태)
  Start-Process powershell.exe -ArgumentList $indCmd -WindowStyle Hidden
  Say '  접속 중에만 화면 구석에 "● 원격 접속 중" 표시가 뜹니다(클릭하면 연결 끊김).' Green
} catch { Say ('  표시 자동실행 등록 실패: ' + $_.Exception.Message) Yellow }

# ---------- ⑤ 지점 이름표 + 접속 정보 ----------
Say '[5/5] 접속 정보 기록...' Cyan
if (-not $Branch) { try { $Branch = Read-Host '이 PC의 지점/타석 이름 (예: 3호점 1번타석). 엔터로 건너뜀' } catch {} }
$note = @()
$note += '이 PC VNC 원격정보 (' + $env:COMPUTERNAME + ', ' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + ')'
if ($Branch) { $note += '지점/타석     : ' + $Branch }
$note += 'Tailscale IP  : ' + $(if ($tsIp) { $tsIp } else { 'tailscale ip -4 로 확인' })
$note += 'VNC 포트      : 5900 (Tailscale 망에서만)'
$note += '암호          : 대표님이 정한 VNC 암호(앞 8자) — 여기 저장 안 함'
try { $note | Out-File (Join-Path $dir 'VNC-접속정보.txt') -Encoding UTF8 } catch {}

Say ''
if ($tvn -and $pwSet) { Say '================= 완료 =================' Green }
else { Say '============ 완료(일부 수동 확인 필요) ============' Yellow }
if ($Branch) { Say ('지점/타석 : ' + $Branch) Cyan }
Say ('이 PC Tailscale IP : ' + $(if ($tsIp) { $tsIp } else { '(tailscale ip -4)' }) + '  / VNC 포트 5900') Cyan
Say ('VNC 서버 : ' + $(if ($tvn) { '설치됨' } else { '설치 확인 안 됨 — 수동 설치 필요' }) + ' / 암호 : ' + $(if ($pwSet) { '설정됨' } else { '미확인 — 위 안내대로 직접 설정' })) Cyan
Say ''
Say '폰·노트북에서 (Tailscale 로그인 되어 있어야 함):' Cyan
Say '  - 폰: "RealVNC Viewer"(아이폰/안드로이드) 또는 "bVNC"(안드로이드) 앱 설치' Cyan
Say ('  - 주소: ' + $(if ($tsIp) { $tsIp } else { '<Tailscale IP>' }) + ':5900  → VNC 암호 입력 → 매장 화면이 뜨고 마우스·키보드 조작') Cyan
Say ''
Say '※ 접속해도 "수락 팝업"·소리·큰 창이 없습니다. 접속 중에만 화면 구석에 작은 "● 원격 접속 중" 표시가 뜨고, 클릭하면 끊깁니다.' Yellow
Say '※ 트랙맨 화면·해상도·입력은 그대로 유지됩니다(화면을 미러링만 함).' Yellow
Say '※ 미검증: 설치·방화벽·구석 표시가 실제로 뜨는지는 이 타석 PC에서 직접 확인해 주세요(특히 전체화면 독점 앱 위 표시).' Yellow
if ($Host.Name -eq 'ConsoleHost' -and [Environment]::UserInteractive) { pause }
