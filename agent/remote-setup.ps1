# ============================================================
#  Golf PT - PC 원격접속 세팅 (RustDesk, 무인 접속) - 타석 PC·업무용 PC 공용
#  대표님이 밖에서 폰·노트북으로 이 PC에 원격 접속해 작업할 수 있게 합니다.
#  RustDesk = 오픈소스·무료(상업적 사용 가능)·계정 가입 불필요. PC마다 한 번만 실행하세요.
#
#  사용법 (설치는 관리자 권한 필요 - 처음 한 번은 PC 앞에서):
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/remote-setup.ps1 -OutFile "$env:TEMP\remote-setup.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\remote-setup.ps1"
#  실행하면 ① RustDesk 를 설치하고 ② 접속 비밀번호를 물어보고 ③ 이 PC의 접속 ID 를 알려줍니다.
#  그 ID + 비밀번호를 폰/노트북의 RustDesk 앱에 넣으면 언제든 이 PC에 접속됩니다.
#  타석 PC(트랙맨 있음)는 조용한 진단 스크립트도 같이 받아 두고,
#  업무용 PC(트랙맨 없음, 예: 서초점)는 진단 없이 원격접속만 세팅하고 절전 모드를 막을지 물어봅니다.
#
#  * 비밀번호는 대표님이 직접 정하고, 이 스크립트·파일 어디에도 저장하지 않습니다 (ID만 저장).
#  * 숨기지 않습니다 - RustDesk 는 작업표시줄 아이콘·서비스로 정상 설치됩니다 (대표님이 쓰는 도구이니 투명하게).
#  * 비밀번호는 길고 추측 어렵게. PC 화면엔 회원 정보·업무 자료가 보일 수 있으니 아무에게도 알려주지 마세요.
# ============================================================
param(
  [string]$Password,                  # 비워 두면 실행 중에 직접 입력받습니다 (권장)
  [string]$DiagWatchMinutes = '240'   # 원격접속해서 조용히 진단을 돌릴 때 쓸 기본 대기 시간
)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
function Say($s, $c) { if ($c) { Write-Host $s -ForegroundColor $c } else { Write-Host $s } }
# GitHub 는 TLS 1.2 만 받는다. 구형 윈도우10(.NET 4.6대)·LTSC 는 기본값이 TLS 1.0 이라 다운로드가 실패하므로 켜 준다.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# ---------- 관리자 권한 확인 (서비스 설치에 필요) ----------
$admin = $false
try { $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } catch {}
if (-not $admin) {
  Say '이 설치는 관리자 권한이 필요합니다. 관리자 권한으로 다시 열어 실행합니다 (UAC 창이 뜨면 [예]).' Yellow
  try {
    if ($PSCommandPath) { Start-Process powershell -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'); return }
  } catch {}
  Say '자동 전환이 안 되면, 시작 메뉴에서 "Windows PowerShell" 을 마우스 오른쪽 → "관리자 권한으로 실행" 후 이 스크립트를 다시 실행해 주세요.' Yellow
  return
}

# ---------- 비밀번호 받기 (스크립트에 저장하지 않음) ----------
$plain = $Password
if (-not $plain) {
  Say ''
  Say '원격접속 비밀번호를 정하세요. (영문+숫자 8자 이상 권장. 화면에 안 보이게 입력됩니다.)' Cyan
  $sec = Read-Host '비밀번호 입력' -AsSecureString
  $sec2 = Read-Host '한 번 더 입력' -AsSecureString
  $b1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $b2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec2)
  try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b1); $plain2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b2) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b1); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b2) }
  if ($plain -ne $plain2) { Say '두 비밀번호가 다릅니다. 다시 실행해 주세요.' Red; return }
}
if (-not $plain -or $plain.Length -lt 6) { Say '비밀번호가 너무 짧습니다 (6자 이상). 다시 실행해 주세요.' Red; return }

# ---------- RustDesk 설치 ----------
function Find-RustDesk {
  $cands = @("$env:ProgramFiles\RustDesk\rustdesk.exe", "${env:ProgramFiles(x86)}\RustDesk\rustdesk.exe", "$env:LOCALAPPDATA\RustDesk\rustdesk.exe")
  foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}
$exe = Find-RustDesk
if ($exe) { Say ('RustDesk 가 이미 설치돼 있습니다: ' + $exe) Green }
else {
  # 1) winget (윈도우 10/11 내장) 으로 시도
  try {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Say 'winget 으로 RustDesk 설치 중... (1~2분)' Cyan
      winget install --id RustDesk.RustDesk -e --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
      Start-Sleep -Seconds 3
      $exe = Find-RustDesk
    }
  } catch { Say ('winget 설치 실패: ' + $_.Exception.Message) Yellow }
  # 2) 공식 GitHub 최신 릴리스 직접 내려받아 조용히 설치
  if (-not $exe) {
    try {
      Say 'RustDesk 공식 최신판을 내려받아 설치 중...' Cyan
      $rel = Invoke-RestMethod 'https://api.github.com/repos/rustdesk/rustdesk/releases/latest' -Headers @{ 'User-Agent' = 'golfpt-setup' }
      $asset = $rel.assets | Where-Object { $_.name -match 'x86_64\.exe$' } | Select-Object -First 1
      if (-not $asset) { throw '설치 파일을 찾지 못함' }
      $dl = Join-Path $env:TEMP $asset.name
      Invoke-WebRequest $asset.browser_download_url -OutFile $dl -UseBasicParsing
      Start-Process -FilePath $dl -ArgumentList '--silent-install' -Wait
      Start-Sleep -Seconds 3
      $exe = Find-RustDesk
    } catch { Say ('직접 설치 실패: ' + $_.Exception.Message) Red }
  }
}
if (-not $exe) {
  Say '' ; Say 'RustDesk 설치를 확인하지 못했습니다. https://rustdesk.com 에서 직접 설치한 뒤 이 스크립트를 다시 실행하거나,' Red
  Say 'RustDesk 를 열어 좌측 하단 ☰ → 설정 → 보안에서 "영구 비밀번호"를 직접 설정해 주세요 (아래 수동 안내 참고).' Red
  return
}

# ---------- 서비스(무인 접속)·영구 비밀번호 설정 ----------
try { & $exe --install-service 2>&1 | Out-Null } catch {}   # 부팅 시 자동 시작·화면 잠겨도 접속 (버전에 따라 설치 때 이미 됨)
Start-Sleep -Seconds 5
# 영구 비밀번호 설정. 네이티브 종료코드는 예외를 안 던지므로 $LASTEXITCODE 로 확인하고, 두 플래그 다 시도한다
# (버전마다 이름이 --password / --set-password 로 다름). GUI 실행 파일이라 0 을 돌려줄 수도 있어, 확실치 않으면 아래에서 수동 확인을 안내한다.
$pwOk = $false
foreach ($flag in @('--password', '--set-password')) {
  try { $global:LASTEXITCODE = 0; & $exe $flag $plain 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) { $pwOk = $true } } catch {}
}
$plain = $null   # 메모리에서 비밀번호 비움

# ---------- 접속 ID 읽기 ----------
$id = ''
try { $id = (& $exe --get-id 2>$null | Select-Object -First 1); $id = ([string]$id).Trim() } catch {}

# ---------- 이 PC가 타석 PC(트랙맨)인지, 일반 업무용 PC인지 ----------
# 타석 PC면 조용한 진단 스크립트도 받아 두고, 업무용 PC(트랙맨 없음, 예: 서초점)면 원격접속만 세팅한다.
$isBay = (Test-Path 'C:\ProgramData\TrackMan') -or (Test-Path 'C:\golfpt-sync\config.json')
$syncDir = 'C:\golfpt-sync'
if ($isBay) {
  try { if (-not (Test-Path $syncDir)) { New-Item -ItemType Directory -Path $syncDir -Force | Out-Null } } catch {}
  try { Invoke-WebRequest 'https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/player-diag.ps1' -OutFile (Join-Path $syncDir 'player-diag.ps1') -UseBasicParsing } catch {}
  $noteDir = Join-Path $syncDir 'diag'
} else {
  $noteDir = [Environment]::GetFolderPath('Desktop'); if (-not $noteDir) { $noteDir = $env:USERPROFILE }
}

# ---------- 결과 안내 (ID만 저장, 비밀번호는 저장 안 함) ----------
try { if (-not (Test-Path $noteDir)) { New-Item -ItemType Directory -Path $noteDir -Force | Out-Null } } catch {}
$noteFile = Join-Path $noteDir 'RustDesk-접속정보.txt'
$note = @()
$note += '이 PC 원격접속 정보 (' + $env:COMPUTERNAME + ', ' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + ')'
$note += 'RustDesk ID : ' + ($(if ($id) { $id } else { 'RustDesk 창 메인 화면에서 확인' }))
$note += '비밀번호   : 대표님이 방금 정한 비밀번호 (여기에 저장하지 않음)'
$note += '접속 방법  : 폰/노트북에 RustDesk 앱 설치 → 위 ID 입력 → 비밀번호 입력'
try { $note | Out-File $noteFile -Encoding UTF8 } catch {}

Say ''
Say '================= 완료 =================' Green
Say ('이 PC(' + $env:COMPUTERNAME + ') RustDesk ID : ' + $(if ($id) { $id } else { '(RustDesk 창 메인 화면 숫자 9~10자리)' })) Cyan
# 자동 설정이 0을 돌려줘도 실제 반영은 버전마다 다를 수 있어, 성공 여부와 무관하게 한 번 확인하도록 안내한다
if (-not $pwOk) { Say '※ 비밀번호 자동 설정이 안 됐을 수 있습니다.' Yellow }
Say '※ 접속 전에 꼭 확인: RustDesk 창 → ☰ → 설정 → 보안 → "영구 비밀번호"가 방금 정한 값으로 돼 있는지 보세요. 비어 있거나 다르면 거기서 직접 정하면 됩니다.' Yellow
Say '폰/노트북에 RustDesk 앱(rustdesk.com)을 설치하고, 위 ID + 그 영구 비밀번호로 접속하면 됩니다.' Cyan
Say ('ID 는 ' + $noteFile + ' 에도 적어 뒀습니다 (비밀번호는 저장 안 함).') Cyan
if (-not $isBay) {
  Say ''
  Say '※ 밖에서 접속하려면 이 PC가 꺼지거나 절전(잠자기)에 들어가면 안 됩니다. 윈도우 설정 → 시스템 → 전원 → "절전"을 "안 함"으로 두세요 (스크립트가 전원 설정을 바꾸지는 않습니다).' Yellow
}
if ($isBay) {
  Say ''
  Say '원격접속한 뒤 "지금 누가 치는지" 조용히 진단하려면 (소리·창 없음):' Cyan
  Say ('  powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $syncDir 'player-diag.ps1') + '" -Watch ' + $DiagWatchMinutes + ' -Quiet') Cyan
  Say ('  결과는 ' + (Join-Path $syncDir 'diag') + ' 폴더의 player-diag-*.txt') Cyan
}
if ($Host.Name -eq 'ConsoleHost' -and [Environment]::UserInteractive) { pause }
