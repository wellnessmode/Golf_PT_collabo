# ============================================================
#  Golf PT 에이전트 - 올인원 업데이트 (중지 → 최신 교체 → 재시작 → 진단)
#  사용법(관리자 아니어도 됨) - PowerShell 에 아래 두 줄만 붙여넣기:
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/update.ps1 -OutFile "$env:TEMP\gpt-update.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\gpt-update.ps1"
# ============================================================
$ErrorActionPreference = 'Continue'
$dir  = 'C:\golfpt-sync'
$base = 'https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent'
$files = @('agent.js','ftmf-parser.js')

# >>> gpt-fresh-config — 신규 설치 때만 쓰는 config.json 생성 (기존 config.json 은 절대 건드리지 않음)
#     config.sample.json 은 공개 저장소라 키 대신 "<...>" 자리표시자만 들어 있다 → 여기서 키 2개를 입력받아 채운다.
function Read-GptKey([string]$label) {
  for ($i = 0; $i -lt 3; $i++) {
    $v = Read-Host ('  ' + $label + ' 붙여넣고 Enter')
    if ($null -eq $v) { $v = '' }
    $v = ([string]$v).Trim().Trim('"').Trim("'").Trim()
    if ($v -match '^[A-Za-z0-9._~+/=-]{8,4096}$') { return $v }
    if ($v) { Write-Host '  [다시] 키에 쓸 수 없는 문자(공백·따옴표·한글 등)가 들어 있습니다.' -ForegroundColor Yellow }
    else { Write-Host '  [다시] 비어 있습니다.' -ForegroundColor Yellow }
  }
  return $null
}
function Set-GptConfigValue([string]$text, [string]$name, [string]$value) {
  # "이름": "값" 한 줄의 값만 바꾼다 (값은 Read-GptKey 가 영문·숫자·._~+/=- 만 허용 → 따옴표·$·역슬래시 없음)
  $pat = '("' + [regex]::Escape($name) + '"\s*:\s*)"[^"]*"'
  return [regex]::Replace($text, $pat, '${1}"' + $value + '"')
}
function New-GptConfig([string]$samplePath, [string]$outPath) {
  if (Test-Path $outPath) { return $false }
  $text = [System.IO.File]::ReadAllText($samplePath, [System.Text.Encoding]::UTF8)
  Write-Host ''
  Write-Host ' [필수] 키 2개를 입력합니다 - 관리자에게 받거나, 다른 타석 PC 의 C:\golfpt-sync\config.json 에서 복사.' -ForegroundColor Yellow
  Write-Host '        (입력한 키는 화면에 보입니다. 주변에 다른 사람이 없을 때 입력하세요.)'
  $anon = Read-GptKey 'Supabase anon 키(SUPABASE_ANON_KEY)'
  $r2   = Read-GptKey '스토리지 키(R2_API_KEY)'
  if ($anon) { $text = Set-GptConfigValue $text 'SUPABASE_ANON_KEY' $anon }
  else { Write-Host '  [주의] Supabase 키 미입력 - 메모장에서 "<Supabase anon 키>" 자리에 직접 넣어야 샷이 전송됩니다.' -ForegroundColor Red }
  if ($r2) { $text = Set-GptConfigValue $text 'R2_API_KEY' $r2 }
  else { Write-Host '  [주의] 스토리지 키 미입력 - 메모장에서 "<스토리지 키>" 자리에 직접 넣어야 영상이 올라갑니다.' -ForegroundColor Red }
  [System.IO.File]::WriteAllText($outPath, $text, (New-Object System.Text.UTF8Encoding($false)))
  return $true
}
# <<< gpt-fresh-config

Write-Host ''
Write-Host '=== Golf PT 에이전트 올인원 업데이트 ===' -ForegroundColor Cyan
# 신규 타석 PC 지원 — 폴더/런처가 없으면 "신규 설치 모드"로 전부 받아서 구성한다.
$fresh = !(Test-Path "$dir\start-hidden.vbs")
if ($fresh) {
  Write-Host '[신규 설치 모드] C:\golfpt-sync 를 새로 구성합니다.' -ForegroundColor Yellow
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Set-Location $dir
# Node.js 필수 — 없으면 여기서 안내 후 중단
$nodeChk = (Get-Command node -ErrorAction SilentlyContinue).Source
if (!$nodeChk) {
  Write-Host '[오류] Node.js 가 설치되어 있지 않습니다.' -ForegroundColor Red
  Write-Host '       https://nodejs.org 에서 초록색 LTS 버튼으로 설치 후, 이 두 줄을 다시 실행하세요.'
  pause; exit 1
}

# ── 1. 중지 (중지.bat 과 동일 + 떠돌이 런처까지 정리) ──────────
Write-Host '[1/6] 에이전트 중지...'
'stop' | Out-File -FilePath "$dir\agent.stop" -Encoding ascii
# 우리 vbs 를 돌리는 wscript 런처(중복 실행 포함) 전부 종료
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'start-hidden' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
taskkill /F /IM node.exe 2>$null | Out-Null
Start-Sleep -Seconds 2
Remove-Item "$dir\agent.stop" -ErrorAction SilentlyContinue

# ── 2. 최신본 다운로드 (임시폴더에 먼저) ──────────────────────
Write-Host '[2/6] 최신본 다운로드...'
$tmp = Join-Path $env:TEMP 'gpt-agent-dl'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$ok = $true
foreach ($f in $files) {
  try { Invoke-WebRequest -Uri "$base/$f" -OutFile "$tmp\$f" -UseBasicParsing }
  catch { Write-Host "[오류] $f 다운로드 실패: $($_.Exception.Message)" -ForegroundColor Red; $ok = $false }
}

# ── 3. 다운로드 검증 (HTML 오류페이지/깨진 파일이 그대로 들어가 크래시 루프 되는 사고 방지) ──
if ($ok) {
  Write-Host '[3/6] 파일 검증...'
  foreach ($f in $files) {
    $p = "$tmp\$f"
    if (!(Test-Path $p) -or (Get-Item $p).Length -lt 10240) { Write-Host "[오류] $f 크기 비정상 - 중단" -ForegroundColor Red; $ok = $false; continue }
    $head = (Get-Content $p -TotalCount 1 -Encoding UTF8)
    if ($head -match '^\s*<') { Write-Host "[오류] $f 가 웹페이지(HTML)로 저장됨 - 중단" -ForegroundColor Red; $ok = $false; continue }
    $chk = & node --check $p 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host "[오류] $f 문법검사 실패 - 중단`n$chk" -ForegroundColor Red; $ok = $false }
  }
}

# ── 4. 교체 (백업 후) — 검증 실패 시 기존 파일 유지 ──────────
if ($ok) {
  Write-Host '[4/6] 교체(기존본은 _old 백업)...'
  foreach ($f in $files) {
    if (Test-Path "$dir\$f") { Copy-Item "$dir\$f" "$dir\$($f -replace '\.js$','_old.js')" -Force }
    Copy-Item "$tmp\$f" "$dir\$f" -Force
  }
} else {
  Write-Host '[유지] 다운로드/검증 실패 - 기존 파일 그대로 재시작만 합니다.' -ForegroundColor Yellow
}

# ── 4b. 런처(vbs) 없으면 받기 — 신규 설치용 ─────────────────
if (!(Test-Path "$dir\start-hidden.vbs")) {
  Write-Host '[신규] 런처(start-hidden.vbs) 다운로드...'
  try {
    Invoke-WebRequest -Uri "$base/start-hidden.vbs" -OutFile "$tmp\start-hidden.vbs" -UseBasicParsing
    $vp = "$tmp\start-hidden.vbs"
    $vhead = (Get-Content $vp -TotalCount 1 -Encoding UTF8)
    if ((Get-Item $vp).Length -lt 200 -or $vhead -match '^\s*<') { throw '런처 파일이 비정상입니다(HTML/빈파일)' }
    Copy-Item $vp "$dir\start-hidden.vbs" -Force
  } catch {
    Write-Host "[오류] 런처 다운로드 실패: $($_.Exception.Message)" -ForegroundColor Red
    pause; exit 1
  }
}

# ── 4b2. 상태확인.bat 갱신 (선택 — 실패해도 업데이트는 계속) ──
#      새 상태확인.bat 은 agent.js 의 AGENT_VERSION 숫자를 읽어 GitHub 최신 버전과 비교한다
#      (옛 것은 표식 문자열만 봐서 구버전도 '최신'으로 표시했다). 파일명이 한글이라 URL 인코딩으로 받는다.
try {
  $stTmp = Join-Path $tmp 'status-check.bat'
  Invoke-WebRequest -Uri "$base/%EC%83%81%ED%83%9C%ED%99%95%EC%9D%B8.bat" -OutFile $stTmp -UseBasicParsing
  $stHead = (Get-Content $stTmp -TotalCount 1)
  if ((Get-Item $stTmp).Length -gt 500 -and $stHead -match '^\s*@echo off') { Copy-Item $stTmp (Join-Path $dir '상태확인.bat') -Force }
  else { Write-Host '[참고] 상태확인.bat 새 파일이 비정상이라 기존 것을 유지합니다.' -ForegroundColor DarkYellow }
} catch { Write-Host "[참고] 상태확인.bat 갱신 건너뜀: $($_.Exception.Message)" -ForegroundColor DarkYellow }

# ── 4c. config.json 없으면 샘플로 생성 후, 타석 설정을 받고 종료 ──
#      (bay3 기본값 그대로 돌면 샷이 3번룸으로 잘못 귀속되므로 시작하지 않는다)
#      이미 있는 config.json 은 절대 바꾸지 않는다 — 이 블록은 config.json 이 없을 때(신규 설치)만 실행.
if (!(Test-Path "$dir\config.json")) {
  Write-Host '[신규] config.json 이 없어 샘플로 생성합니다...' -ForegroundColor Yellow
  $smp = Join-Path $tmp 'config.sample.json'
  try { Invoke-WebRequest -Uri "$base/config.sample.json" -OutFile $smp -UseBasicParsing }
  catch { Write-Host "[오류] 샘플 설정 다운로드 실패: $($_.Exception.Message)" -ForegroundColor Red; pause; exit 1 }
  try { New-GptConfig $smp "$dir\config.json" | Out-Null }
  catch { Write-Host "[오류] config.json 생성 실패: $($_.Exception.Message)" -ForegroundColor Red; pause; exit 1 }
  Write-Host ''
  Write-Host '=====================================================' -ForegroundColor Yellow
  Write-Host ' [필수] 지금 메모장이 열립니다 - 이 PC 타석에 맞게 수정:' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  1) "defaultBay": "bay3"   ->  "bay1" (1번타석) 또는 "bay2" (2번타석)'
  Write-Host '  2) "bayMap": { ... }      ->  "bayMap": {}'
  Write-Host '  3) "ffmpegPath": ""       ->  3번룸 PC 의 config.json 과 같은 값'
  Write-Host '     (예: "C:\\ffmpeg\\bin\\ffmpeg.exe" - 그 위치에 ffmpeg 도 복사해둘 것)'
  Write-Host '  4) "SUPABASE_ANON_KEY" / "R2_API_KEY" 가 아직 "<...>" 이면 -> 키 붙여넣기'
  Write-Host ''
  Write-Host '  저장(Ctrl+S) 후, 아까 그 두 줄을 다시 실행하면 시작됩니다.' -ForegroundColor Yellow
  Write-Host '=====================================================' -ForegroundColor Yellow
  Start-Process notepad.exe "$dir\config.json"
  pause; exit 0
}

# ── 5. 자동시작 등록 보장 (설치_자동시작.bat 과 동일 — 이미 있으면 그대로 갱신) ──
#     이게 있어야 PC 를 껐다 켜도 백그라운드 실행이 유지된다.
Write-Host '[5/6] 자동시작 등록 확인...'
# node.exe 절대경로 기록 — 부팅 시 PATH 없이도 런처가 node 를 찾도록
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($nodeExe) { $nodeExe | Out-File -FilePath "$dir\node-path.txt" -Encoding ascii }
$lnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\GolfPT-Agent.lnk'
try {
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath       = 'wscript.exe'
  $sc.Arguments        = "`"$dir\start-hidden.vbs`""
  $sc.WorkingDirectory = $dir
  $sc.WindowStyle      = 7
  $sc.Description      = 'Golf PT Bay Agent'
  $sc.Save()
} catch { Write-Host "[주의] 자동시작 등록 실패: $($_.Exception.Message)" -ForegroundColor Yellow }

# ── 6. 재시작 + 실행 확인 + 진단 ─────────────────────────────
Write-Host '[6/6] 백그라운드 재시작...'
Start-Process wscript.exe -ArgumentList "`"$dir\start-hidden.vbs`"" -WorkingDirectory $dir -WindowStyle Hidden
Start-Sleep -Seconds 8
$node = Get-Process node -ErrorAction SilentlyContinue
Write-Host ''
if ($node) {
  Write-Host "[성공] 에이전트 실행 중 (PID $($node.Id -join ','))" -ForegroundColor Green
} else {
  Write-Host '[실패] 에이전트가 실행되지 않았습니다 - 아래 오류 로그를 사진 찍어 공유해주세요.' -ForegroundColor Red
}
if (Test-Path $lnk) {
  Write-Host '[자동시작] 등록됨 - PC 를 껐다 켜도 자동 실행됩니다.' -ForegroundColor Green
} else {
  Write-Host '[자동시작] 미등록 - 재부팅 시 자동 실행 안 됨(설치_자동시작.bat 실행 필요).' -ForegroundColor Yellow
}
if (Test-Path "$dir\agent.log") {
  Write-Host ''; Write-Host '--- agent.log 최근 6줄 ---' -ForegroundColor Cyan
  Get-Content "$dir\agent.log" -Tail 6 -Encoding UTF8
}
if (Test-Path "$dir\node-crash.log") {
  Write-Host ''; Write-Host '--- node-crash.log 최근 12줄 (시작 실패 사유) ---' -ForegroundColor Cyan
  Get-Content "$dir\node-crash.log" -Tail 12 -Encoding UTF8
}
Write-Host ''
Write-Host '완료. 이 창은 닫아도 됩니다.' -ForegroundColor Cyan
pause
