# ============================================================
#  Golf PT - 트랙맨 파일에 "플레이어(로그인) 정보"가 들어 있는지 진단
#  준비: TPS 에서 플레이어 로그인(빠른 로그인)한 상태로 1구, 로그인 없이(게스트) 1구 치고 1분 기다린 뒤
#  사용법 - 타석 PC PowerShell 에 아래 두 줄:
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/player-diag.ps1 -OutFile "$env:TEMP\player-diag.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\player-diag.ps1"
#  결과는 화면과 바탕화면 player-diag.txt 에 저장됩니다. 그 파일(또는 화면 캡처)을 공유해 주세요.
#  이 스크립트는 읽기만 합니다 - 트랙맨 파일을 바꾸거나 지우지 않습니다.
# ============================================================
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$outPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'player-diag.txt'
$lines = New-Object System.Collections.Generic.List[string]
function W($s, $c) { if ($c) { Write-Host $s -ForegroundColor $c } else { Write-Host $s }; [void]$lines.Add($s) }

$roots = @('C:\ProgramData\TrackMan\TrackMan Performance Studio\Data')
try { $cfg = Get-Content 'C:\golfpt-sync\config.json' -Raw | ConvertFrom-Json; if ($cfg.watchDirs) { $roots = @($cfg.watchDirs) } } catch {}
$files = @()
foreach ($r in $roots) { if (Test-Path $r) { $files += Get-ChildItem $r -Recurse -Include *.ftmf,*.stmf -ErrorAction SilentlyContinue } }
$files = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 4
if (!$files) { W '[오류] ftmf/stmf 파일을 찾지 못했습니다.' Red; pause; exit 1 }

# 플레이어·사용자·계정처럼 보이는 키와 값을 JSON 텍스트에서 찾아 보여준다 (값은 160자까지)
$playerRx = '"([^"]*(?:Player|User|Golfer|Member|Profile|Account|Email|Nick|FirstName|LastName|DisplayName|Login)[^"]*)"\s*:\s*("(?:[^"\\]|\\.)*"|[-0-9.]+|true|false|null|\{[^{}]{0,240}\})'
function ReadEntryText($zip, $pattern) {
  $e = $zip.Entries | Where-Object { $_.FullName -match $pattern } | Select-Object -First 1
  if (!$e) { return $null }
  $rd = New-Object System.IO.StreamReader($e.Open()); $t = $rd.ReadToEnd(); $rd.Dispose(); return $t
}
function ScanPlayerKeys($label, $txt) {
  if (!$txt) { W ("  [" + $label + "] 없음") Yellow; return }
  W ("  [" + $label + "] " + $txt.Length + "자 - 플레이어 관련 키:")
  $seen = @{}
  [regex]::Matches($txt, $playerRx) | ForEach-Object {
    $k = $_.Groups[1].Value; $v = $_.Groups[2].Value
    if ($v.Length -gt 160) { $v = $v.Substring(0, 160) + '...' }
    $key = $k + '=' + $v
    if (!$seen.ContainsKey($key)) { $seen[$key] = 1; W ('    ' + $k + ' : ' + $v) Green }
  }
  if ($seen.Count -eq 0) { W '    (없음)' }
}

W ('진단 시각: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  /  PC: ' + $env:COMPUTERNAME)
foreach ($f in $files) {
  W ''
  $rel = $f.FullName
  foreach ($r in $roots) { if ($rel.StartsWith($r)) { $rel = $rel.Substring($r.Length) } }
  W ('===== ' + $rel + '  (' + $f.LastWriteTime + ', ' + [math]::Round($f.Length/1KB) + 'KB) =====') Cyan
  try {
    # 같은 폴더의 다른 파일 이름 - 플레이어별 폴더/파일이 따로 있는지 보기 위해
    $sib = Get-ChildItem $f.Directory -ErrorAction SilentlyContinue | Select-Object -First 15 | ForEach-Object { $_.Name }
    W ('  [같은 폴더] ' + ($sib -join ', '))
    $z = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
    $inner = $z
    $stmf = $z.Entries | Where-Object { $_.FullName -match '\.stmf$' } | Select-Object -First 1
    $ms = $null
    if ($stmf) { $ms = New-Object System.IO.MemoryStream; $s = $stmf.Open(); $s.CopyTo($ms); $s.Dispose(); $ms.Position = 0; $inner = New-Object System.IO.Compression.ZipArchive($ms) }
    W ('  [파일 목록] ' + (($inner.Entries | ForEach-Object { $_.FullName }) -join ', '))
    # SessionState.json - TPS 화면에서 고른 클럽·볼·플레이어가 들어 있다고 알려진 파일
    $ss = ReadEntryText $inner 'SessionState\.json$'
    if ($ss) {
      try {
        $j = $ss | ConvertFrom-Json
        $last = if ($j -is [array]) { $j[$j.Count - 1] } else { $j }
        W ('  [SessionState 최상위 키] ' + (($last.PSObject.Properties | ForEach-Object { $_.Name }) -join ', '))
        if ($last.UserConditions) { W ('  [UserConditions 전체] ' + ($last.UserConditions | ConvertTo-Json -Depth 6 -Compress)) Cyan }
        foreach ($p in $last.PSObject.Properties) {
          if ($p.Name -match 'Player|User|Golfer|Profile|Account|Session') { W ('  [' + $p.Name + '] ' + ($p.Value | ConvertTo-Json -Depth 6 -Compress)) Cyan }
        }
      } catch { W ('  SessionState 파싱 실패: ' + $_.Exception.Message) Yellow }
    }
    ScanPlayerKeys 'SessionState.json' $ss
    ScanPlayerKeys 'TmfInfo.json' (ReadEntryText $inner 'TmfInfo\.json$')
    $fu = ReadEntryText $inner 'Fusion_OutputMessages\.json$'
    if ($fu) { ScanPlayerKeys 'Fusion_OutputMessages.json (앞 20000자)' $fu.Substring(0, [math]::Min(20000, $fu.Length)) } else { W '  [Fusion_OutputMessages.json] 없음' Yellow }
    # 그 밖의 json 파일도 전부 훑는다 (Player.json 같은 별도 파일이 있을 수 있음)
    foreach ($e in $inner.Entries) {
      if ($e.FullName -match '\.json$' -and $e.FullName -notmatch 'SessionState|TmfInfo|Fusion_OutputMessages') {
        $rd = New-Object System.IO.StreamReader($e.Open()); $t = $rd.ReadToEnd(); $rd.Dispose()
        ScanPlayerKeys $e.FullName $t.Substring(0, [math]::Min(20000, $t.Length))
      }
    }
    if ($inner -ne $z) { $inner.Dispose() }
    if ($ms) { $ms.Dispose() }
    $z.Dispose()
  } catch { W ('[읽기 실패] ' + $_.Exception.Message) Red }
}
# TPS 가 플레이어 프로필을 별도 파일로 두는지 - Data 폴더 상위에서 프로필/플레이어 폴더 이름만 훑는다
W ''
W '[TPS 폴더에서 플레이어/프로필처럼 보이는 폴더·파일 (이름만)]'
try {
  $base = 'C:\ProgramData\TrackMan\TrackMan Performance Studio'
  if (Test-Path $base) {
    Get-ChildItem $base -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Player|Profile|User|Account|Golfer' } | Select-Object -First 20 | ForEach-Object { W ('  ' + $_.FullName.Substring($base.Length)) }
  }
} catch {}
W ''
try { $lines | Out-File -FilePath $outPath -Encoding UTF8; W ('완료 - 결과를 바탕화면 player-diag.txt 에 저장했습니다. 이 파일을 공유해 주세요: ' + $outPath) Cyan } catch { W '완료 - 이 화면을 캡처해서 공유해 주세요.' Cyan }
pause
