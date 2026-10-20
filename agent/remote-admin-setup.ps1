# ============================================================
#  Golf PT - 타석 PC 원격 유지보수(headless) 세팅
#  화면 공유 없이, 회원 트랙맨 세션을 건드리지 않고 외부에서 관리만 하기 위한 구성:
#    ① Windows OpenSSH 서버 — 백그라운드 명령 전용. 키 인증만, Tailscale 망에서만 접속 허용
#    ② Tailscale — 포트 개방 없이 사설 메시 VPN 으로 PC에 도달(소유자 계정 인증)
#    ③ gpt-admin.ps1 설치 — status/logs/restart/diag/update 를 SSH 로 실행
#    ④ (선택) 상태 점검 스케줄 — 에이전트가 멈추면 관리자에게 알림
#  SSH 명령은 대화형 데스크톱에 창을 띄우지 않습니다(숨기는 게 아니라 원래 안 보임).
#  화면 공유가 필요한 작업은 별도(RustDesk 등)로 하고, 그 접속 표시는 건드리지 않습니다.
#
#  보안 순서: 키 등록 → 비밀번호 로그인 차단 → 방화벽을 Tailscale 망으로 제한 → 그 다음에야 sshd 시작.
#  (sshd 를 공개로 먼저 띄웠다가 나중에 잠그는 창을 만들지 않는다.)
#
#  사용법 (관리자 권한 필요, 처음 한 번은 PC 앞에서):
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/remote-admin-setup.ps1 -OutFile "$env:TEMP\remote-admin-setup.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\remote-admin-setup.ps1"
#  -AdminPublicKey "<관리 PC/폰 SSH 공개키>"  (안 주면 실행 중 붙여넣기)
#  -TailscaleAuthKey "<tskey-...>"            (안 주면 브라우저로 1회 로그인)
# ============================================================
param(
  [string]$AdminPublicKey,
  [string]$TailscaleAuthKey
)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
function Say($s, $c) { if ($c) { Write-Host $s -ForegroundColor $c } else { Write-Host $s } }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# ---------- 관리자 권한 (승격 시 넘겨준 파라미터 유지) ----------
$admin = $false
try { $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } catch {}
if (-not $admin) {
  Say '관리자 권한이 필요합니다. 관리자 권한으로 다시 엽니다 (UAC 뜨면 [예]).' Yellow
  try {
    if ($PSCommandPath) {
      $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
      if ($AdminPublicKey) { $argList += @('-AdminPublicKey', ('"' + ($AdminPublicKey -replace '"', '') + '"')) }
      if ($TailscaleAuthKey) { $argList += @('-TailscaleAuthKey', ('"' + ($TailscaleAuthKey -replace '"', '') + '"')) }
      Start-Process powershell -Verb RunAs -ArgumentList ($argList -join ' '); return
    }
  } catch {}
  Say '"Windows PowerShell" 을 마우스 오른쪽 → "관리자 권한으로 실행" 후 다시 실행해 주세요.' Yellow
  return
}

# ---------- ① OpenSSH 서버 설치 (아직 시작하지 않음) ----------
Say ''; Say '[1/6] OpenSSH 서버 설치...' Cyan
try {
  $cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*' -ErrorAction SilentlyContinue
  if ($cap -and $cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null }
} catch { Say ('  OpenSSH 설치 확인 실패: ' + $_.Exception.Message) Yellow }
# sshd 가 처음 한 번 떠야 sshd_config 가 생성되는 버전이 있다 → 설정만 만들고 바로 멈춰서 공개 노출 창을 없앤다.
$sshDir = Join-Path $env:ProgramData 'ssh'
$cfgPath = Join-Path $sshDir 'sshd_config'
if (-not (Test-Path $cfgPath)) {
  try { Start-Service sshd -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3; Stop-Service sshd -ErrorAction SilentlyContinue } catch {}
}
try { if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null } } catch {}

# ---------- ② 관리자 공개키 등록 (키 인증만) ----------
Say '[2/6] 관리자 공개키 등록...' Cyan
if (-not $AdminPublicKey) {
  Say '  관리 PC/폰에서 만든 SSH 공개키를 붙여넣으세요. (예: ssh-ed25519 AAAA... 이름)' Cyan
  Say '  키가 없으면 관리 PC에서:  ssh-keygen -t ed25519   그다음 .pub 내용을 붙여넣기.' Cyan
  $AdminPublicKey = Read-Host '공개키 붙여넣기'
}
$AdminPublicKey = ([string]$AdminPublicKey).Trim()
$keyOk = $false
if ($AdminPublicKey -notmatch '^(ssh-ed25519|ssh-rsa|ecdsa-)') {
  Say '  공개키 형식이 아닙니다(ssh-ed25519/ssh-rsa 로 시작). 등록을 건너뜁니다.' Red
} else {
  $akFile = Join-Path $sshDir 'administrators_authorized_keys'
  try {
    $existing = ''
    if (Test-Path $akFile) { $existing = (Get-Content $akFile -Raw -ErrorAction SilentlyContinue) }
    if ($existing -notmatch [regex]::Escape($AdminPublicKey)) { Add-Content -Path $akFile -Value $AdminPublicKey -Encoding ascii }
    # ACL: 상속 제거 + Administrators(S-1-5-32-544)·SYSTEM(S-1-5-18) 만. 한글 윈도우에서도 되게 SID 사용.
    # 이게 틀리면 OpenSSH 가 StrictModes 로 키를 무시하므로, 성공(0)했을 때만 키인증 가능으로 본다.
    icacls $akFile /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null
    $aclOk = ($LASTEXITCODE -eq 0)
    icacls $akFile /setowner '*S-1-5-32-544' | Out-Null
    if ($aclOk -and (Test-Path $akFile) -and (Select-String -Path $akFile -SimpleMatch $AdminPublicKey -Quiet)) { $keyOk = $true; Say '  공개키 등록 완료.' Green }
    else { Say '  공개키 등록/권한 설정 확인 실패.' Red }
  } catch { Say ('  공개키 등록 실패: ' + $_.Exception.Message) Red }
}
# 키 등록이 확인됐을 때만 비밀번호 로그인을 끈다. (안 그러면 자물쇠만 걸고 열쇠가 없어 잠겨버림)
if ($keyOk) {
  try {
    if (Test-Path $cfgPath) {
      Copy-Item $cfgPath ($cfgPath + '.golfpt-bak') -Force -ErrorAction SilentlyContinue
      $c = Get-Content $cfgPath -Raw
      $c = ($c -replace '(?im)^\s*#?\s*PasswordAuthentication\b.*$', 'PasswordAuthentication no')
      $c = ($c -replace '(?im)^\s*#?\s*PubkeyAuthentication\b.*$', 'PubkeyAuthentication yes')
      if ($c -notmatch '(?im)^\s*PasswordAuthentication\s+no') { $c += "`r`nPasswordAuthentication no" }
      if ($c -notmatch '(?im)^\s*PubkeyAuthentication\s+yes') { $c += "`r`nPubkeyAuthentication yes" }
      Set-Content -Path $cfgPath -Value $c -Encoding ascii
    }
  } catch { Say ('  sshd_config 수정 실패(수동 확인 필요): ' + $_.Exception.Message) Yellow }
} else {
  Say '  ⚠ 공개키가 확인되지 않아 비밀번호 로그인을 끄지 않았습니다(잠김 방지). 키 등록 후 다시 실행하세요.' Yellow
}

# ---------- ③ 방화벽: SSH 를 Tailscale 망에서만 (sshd 시작 전에 먼저 잠금) ----------
Say '[3/6] 방화벽 — SSH 를 Tailscale 망으로만 제한...' Cyan
$fwOk = $false
try {
  # 1) 허용 범위를 좁힌 규칙을 먼저 만든다(차단부터 하면 잠길 수 있으므로 순서 중요)
  if (-not (Get-NetFirewallRule -DisplayName 'GolfPT SSH (Tailscale only)' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'GolfPT SSH (Tailscale only)' -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -RemoteAddress '100.64.0.0/10' -Profile Any | Out-Null
  }
  # 2) OpenSSH 가 자동 생성하는 공개(전체 대역) 허용 규칙을 끈다
  Get-NetFirewallRule -DisplayName 'OpenSSH SSH Server*' -ErrorAction SilentlyContinue | Disable-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -Name '*OpenSSH-Server-In-TCP*' -ErrorAction SilentlyContinue | Disable-NetFirewallRule -ErrorAction SilentlyContinue
  # 3) 끝 상태 확인 — 좁힌 규칙이 켜져 있고, 공개 규칙이 꺼져 있어야 함
  $scoped = Get-NetFirewallRule -DisplayName 'GolfPT SSH (Tailscale only)' -ErrorAction SilentlyContinue
  $fwOk = ($scoped -and $scoped.Enabled -eq 'True')
  if ($fwOk) { Say '  SSH 는 이제 Tailscale 로 연결된 기기에서만 접속됩니다(공개 인터넷에 안 열림).' Green }
  else { Say '  ⚠ 방화벽 규칙 확인 실패 — 수동 확인 필요.' Yellow }
} catch { Say ('  방화벽 설정 실패(수동 확인 권장): ' + $_.Exception.Message) Yellow }

# ---------- ④ 이제야 sshd 시작 (키·방화벽 다 잠근 뒤) ----------
Say '[4/6] OpenSSH 서버 시작...' Cyan
try { Set-Service -Name sshd -StartupType Automatic -ErrorAction SilentlyContinue; Restart-Service sshd -ErrorAction SilentlyContinue } catch {}
$sshdRunning = $false
try { $sshdRunning = ((Get-Service sshd -ErrorAction SilentlyContinue).Status -eq 'Running') } catch {}
if (-not $sshdRunning) { Say '  ⚠ sshd 가 안 떴습니다. 설정 → 앱 → 선택적 기능에서 "OpenSSH 서버" 추가 후 재실행하세요.' Yellow }
# 기본 셸은 cmd 그대로 둔다 — DefaultShell 을 powershell 로 바꾸면 scp/sftp 가 깨진다.
# 명령은 항상 `powershell -File ...` 로 명시 실행하므로 문제 없음.

# ---------- ⑤ Tailscale 설치·연결 ----------
Say '[5/6] Tailscale(사설 메시 VPN) 설치·연결...' Cyan
function Find-Tailscale { foreach ($p in @("$env:ProgramFiles\Tailscale\tailscale.exe", "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe")) { if (Test-Path $p) { return $p } }; try { $g = Get-Command tailscale.exe -ErrorAction SilentlyContinue; if ($g) { return $g.Source } } catch {}; return $null }
$ts = Find-Tailscale
if (-not $ts) {
  try { if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id Tailscale.Tailscale -e --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null } } catch {}
  for ($i = 0; $i -lt 40 -and -not $ts; $i += 4) { Start-Sleep -Seconds 4; $ts = Find-Tailscale }
  if (-not $ts) {
    try {
      Say '  winget 실패 - 공식 설치 파일로 설치...' Yellow
      $msi = Join-Path $env:TEMP 'tailscale-setup.msi'
      Invoke-WebRequest 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' -OutFile $msi -UseBasicParsing
      Start-Process msiexec.exe -ArgumentList @('/i', "`"$msi`"", '/quiet', '/norestart') -Wait
      for ($i = 0; $i -lt 30 -and -not $ts; $i += 3) { Start-Sleep -Seconds 3; $ts = Find-Tailscale }
    } catch { Say ('  Tailscale 설치 실패: ' + $_.Exception.Message) Red }
  }
}
$tsIp = ''
if ($ts) {
  try {
    if ($TailscaleAuthKey) { & $ts up --authkey $TailscaleAuthKey --accept-routes 2>&1 | Out-Null }
    else { Say '  브라우저가 열리면 대표님 계정으로 1회 로그인하세요(이 PC를 메시에 등록).' Cyan; Start-Process $ts -ArgumentList 'up' }
    for ($i = 0; $i -lt 20 -and -not $tsIp; $i += 2) { Start-Sleep -Seconds 2; try { $tsIp = ((& $ts ip -4 2>$null) | Select-Object -First 1).Trim() } catch {} }
  } catch { Say ('  tailscale up 실패: ' + $_.Exception.Message) Yellow }
} else { Say '  Tailscale 를 설치하지 못했습니다. https://tailscale.com/download 에서 직접 설치 후 로그인하세요.' Red }

# ---------- ⑥ gpt-admin.ps1 설치 + 상태점검 스케줄 ----------
Say '[6/6] 관리 명령 설치 + 상태 점검 스케줄...' Cyan
$dir = 'C:\golfpt-sync'
try { if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null } } catch {}
try { Invoke-WebRequest 'https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/gpt-admin.ps1' -OutFile (Join-Path $dir 'gpt-admin.ps1') -UseBasicParsing } catch { Say ('  gpt-admin.ps1 다운로드 실패: ' + $_.Exception.Message) Yellow }
try {
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $dir 'gpt-admin.ps1') + '" health -NotifyIfDown')
  # -RepetitionDuration 을 명시하지 않으면 일부 빌드에서 1회만 뛰고 반복이 저장 안 됨 → 길게 지정
  $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
  $prin = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName 'GolfPT-Agent-Health' -Action $act -Trigger $trg -Principal $prin -Force | Out-Null
  Say '  상태 점검 스케줄 등록(30분마다, 멈추면 알림).' Green
} catch { Say ('  상태 점검 스케줄 등록 실패(선택 기능): ' + $_.Exception.Message) Yellow }

# ---------- 결과 안내 ----------
$waysUser = $env:USERNAME
Say ''
Say '================= 완료 =================' Green
Say ('이 PC(' + $env:COMPUTERNAME + ')') Cyan
Say ('  Tailscale IP : ' + $(if ($tsIp) { $tsIp } else { '(tailscale 로그인 후 `tailscale ip -4` 로 확인)' })) Cyan
Say ('  SSH 사용자    : ' + $waysUser) Cyan
Say ('  키 인증       : ' + $(if ($keyOk) { '등록됨(비밀번호 로그인 차단)' } else { '미등록 — 공개키 다시 등록 필요' })) Cyan
Say ('  방화벽        : ' + $(if ($fwOk) { 'Tailscale 망에서만 허용' } else { '수동 확인 필요' })) Cyan
Say ''
Say '관리 PC/폰에서 (Tailscale 로그인 되어 있어야 함):' Cyan
if ($tsIp) {
  Say ('  ssh ' + $waysUser + '@' + $tsIp) Cyan
  Say ('  ssh ' + $waysUser + '@' + $tsIp + ' "powershell -NoProfile -File C:\golfpt-sync\gpt-admin.ps1 status"') Cyan
}
Say '  명령: status / logs -Tail 40 / restart / diag / update / health' Cyan
Say ''
Say '※ 이 방식은 화면을 보지 않습니다. 회원 트랙맨 화면·포커스·해상도에 영향 없고, 새 창도 안 뜹니다.' Yellow
Say '※ 회원 화면을 실제로 봐야 할 때만 RustDesk 로 접속하세요(그때는 접속 표시가 정상적으로 뜹니다).' Yellow
if ($Host.Name -eq 'ConsoleHost' -and [Environment]::UserInteractive) { pause }
