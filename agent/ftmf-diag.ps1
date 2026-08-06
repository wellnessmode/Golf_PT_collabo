# ============================================================
#  Golf PT - ftmf 파싱 진단 (최근 파일 3개의 내부 구조를 출력)
#  사용법 - PowerShell 에 아래 두 줄:
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/ftmf-diag.ps1 -OutFile "$env:TEMP\ftmf-diag.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\ftmf-diag.ps1"
# ============================================================
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$roots = @('C:\ProgramData\TrackMan\TrackMan Performance Studio\Data')
try {
  $cfg = Get-Content 'C:\golfpt-sync\config.json' -Raw | ConvertFrom-Json
  if ($cfg.watchDirs) { $roots = @($cfg.watchDirs) }
} catch {}

$files = @()
foreach ($r in $roots) {
  if (Test-Path $r) {
    $files += Get-ChildItem $r -Recurse -Filter *.ftmf -ErrorAction SilentlyContinue
  }
}
$files = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 3
if (!$files) { Write-Host '[오류] ftmf 파일을 찾지 못했습니다.' -ForegroundColor Red; pause; exit 1 }

foreach ($f in $files) {
  Write-Host ''
  Write-Host ('===== ' + $f.Name + '  (' + $f.LastWriteTime + ', ' + [math]::Round($f.Length/1KB) + 'KB) =====') -ForegroundColor Cyan
  try {
    $z = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
    Write-Host '[겉 zip 내용]'
    $z.Entries | ForEach-Object { Write-Host ('  ' + $_.FullName + '  ' + $_.Length + 'B') }
    $stmf = $z.Entries | Where-Object { $_.FullName -match '\.stmf$' } | Select-Object -First 1
    if ($stmf) {
      $ms = New-Object System.IO.MemoryStream
      $s = $stmf.Open(); $s.CopyTo($ms); $s.Dispose(); $ms.Position = 0
      $z2 = New-Object System.IO.Compression.ZipArchive($ms)
      Write-Host '[속 stmf 내용]'
      $z2.Entries | ForEach-Object { Write-Host ('  ' + $_.FullName + '  ' + $_.Length + 'B') }
      $fj = $z2.Entries | Where-Object { $_.FullName -match 'Fusion_OutputMessages\.json$' } | Select-Object -First 1
      if ($fj) {
        $rd = New-Object System.IO.StreamReader($fj.Open()); $txt = $rd.ReadToEnd(); $rd.Dispose()
        Write-Host '[Fusion 메시지 타입별 개수]'
        [regex]::Matches($txt, '"#Type"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } |
          Group-Object | Sort-Object Count -Descending |
          ForEach-Object { Write-Host ('  ' + $_.Name + '  x' + $_.Count) }
        $hasCS = $txt -match '"ClubSpeed"'
        $hasMeas = $txt -match '"Measurement"'
        Write-Host ('[Measurement 포함: ' + $hasMeas + ' / ClubSpeed 포함: ' + $hasCS + ']')
      } else {
        Write-Host '[Fusion_OutputMessages.json 없음]' -ForegroundColor Yellow
      }
      $z2.Dispose()
    } else {
      Write-Host '[.stmf 없음 - 겉 zip 이 최종 구조]' -ForegroundColor Yellow
    }
    $z.Dispose()
  } catch {
    Write-Host ('[읽기 실패] ' + $_.Exception.Message) -ForegroundColor Red
  }
}
Write-Host ''
Write-Host '완료 - 이 화면을 캡처해서 공유해주세요.' -ForegroundColor Cyan
pause
