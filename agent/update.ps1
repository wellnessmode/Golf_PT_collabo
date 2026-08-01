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

Write-Host ''
Write-Host '=== Golf PT 에이전트 올인원 업데이트 ===' -ForegroundColor Cyan
if (!(Test-Path "$dir\start-hidden.vbs")) { Write-Host "[오류] $dir 에 에이전트가 설치되어 있지 않습니다." -ForegroundColor Red; pause; exit 1 }
Set-Location $dir

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
