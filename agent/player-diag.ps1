# ============================================================
#  Golf PT - 타석 PC 진단: "지금 누가 치고 있는지" 알아낼 단서 찾기
#   [1] 트랙맨 샷 파일에 플레이어(로그인) 정보가 들어 있는지
#   [2] 실행 중인 프로그램 - 레슨북 타석 프로그램이 무엇인지
#   [3] 그 프로그램(과 트랙맨) 화면 글자를 윈도우가 직접 읽을 수 있는지 (UI 자동화)
#   [4] 윈도우 내장 글자 인식(OCR)으로 "20:00 ~ 20:24 김*아" 같은 예약 표시를 읽을 수 있는지
#   [5] 그 프로그램이 남기는 기록 파일·레지스트리에 예약/로그인 정보가 있는지
#  언제 실행:
#   (1) 모니터에 "시간 ~ 이름" 예약 대기 화면이 떠 있을 때 한 번
#   (2) 휴대폰 뒷자리로 로그인 → 트랙맨 플레이어 로그인 상태로 3구 + 게스트로 3구 친 뒤 한 번 더
#  사용법 - 타석 PC PowerShell 에 아래 두 줄:
#    iwr https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/player-diag.ps1 -OutFile "$env:TEMP\player-diag.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\player-diag.ps1"
#  결과: 화면 + 바탕화면 player-diag-날짜-시각.txt. 맨 아래 [요약]을 공유해 주세요.
#  읽기만 합니다 - 파일을 바꾸거나 지우지 않고, 키보드·마우스 입력은 기록하지 않습니다.
#  화면은 이 창을 약 2초 내려놓고 찍은 뒤 글자만 읽고, 찍은 그림은 바로 지웁니다.
#  카카오톡·브라우저·메신저 등 개인용 프로그램의 글자는 읽지 않습니다.
# ============================================================
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stamp = (Get-Date).ToString('MMdd-HHmmss')
$desk = [Environment]::GetFolderPath('Desktop'); if (!$desk) { $desk = $env:TEMP }; if (!$desk) { $desk = (Get-Location).Path }
$outPath = Join-Path $desk ('player-diag-' + $stamp + '.txt')
$lines = New-Object System.Collections.Generic.List[string]
$summary = New-Object System.Collections.Generic.List[string]
function W($s, $c) { if ($c) { Write-Host $s -ForegroundColor $c } else { Write-Host $s }; [void]$lines.Add([string]$s) }
function S($s) { [void]$summary.Add([string]$s) }
function Cut($s, $n) { if ($null -eq $s) { return '' }; $s = ([string]$s -replace '\s+', ' ').Trim(); if ($s.Length -gt $n) { return $s.Substring(0, $n) + '...' }; return $s }
# 공유 전에 가린다: 전화번호 전체, 9자리 이상 숫자, 비밀번호·토큰 값
function Redact($s) {
  if (!$s) { return $s }
  $s = [regex]::Replace([string]$s, '01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}', '[전화번호]')
  $s = [regex]::Replace($s, '(?i)(pass(?:word)?|pwd|token|secret|api_?key|authorization|cookie|session_?id)(["'']?\s*[:=]\s*["'']?)[^"'',;\s}]{3,}', '$1$2[가림]')
  $s = [regex]::Replace($s, '\d{9,}', '[긴숫자]')
  $s = [regex]::Replace($s, '[\w.+-]+@[\w-]+\.[\w.-]+', '[이메일]')
  return $s
}
$timeRx = '(\d{1,2})\s*[:;.]\s*(\d{2})\s*[~\-–〜∼]\s*(\d{1,2})\s*[:;.]\s*(\d{2})'   # 20:00 ~ 20:24
$maskRx = '[가-힣]\s*[\*＊●○]+\s*[가-힣]?'                                               # 김*아
$vendorRx = '(?i)lesson|레슨|pointbank|j3lab|hpos|smart\s*lesson|g72|netra'
$wordRx = '예약|로그인|휴대폰|번호|타석|레슨|입력|님|시작|종료|남은|이용'
$sysRx = '(?i)^(explorer|ApplicationFrameHost|SystemSettings|TextInputHost|ShellExperienceHost|SearchHost|SearchApp|SearchUI|StartMenuExperienceHost|LockApp|Widgets|powershell|powershell_ise|pwsh|WindowsTerminal|OpenConsole|conhost|cmd|Taskmgr|SecurityHealthSystray|ctfmon|node|wscript|cscript)$'
$privRx = '(?i)^(KakaoTalk|chrome|msedge|firefox|whale|opera|brave|iexplore|Teams|ms-teams|slack|Telegram|Discord|Zoom|AnyDesk|TeamViewer|notepad|notepad\+\+|EXCEL|WINWORD|POWERPNT|Hwp|HwpViewer|OUTLOOK|LINE|NateOn)$'

$isAdmin = $false
try { $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } catch {}
$osName = ''
try { $os = Get-CimInstance Win32_OperatingSystem; $osName = $os.Caption + ' ' + $os.BuildNumber } catch {}
W ('진단 시각: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  /  PC: ' + $env:COMPUTERNAME + '  /  ' + $osName + '  /  관리자 권한: ' + $isAdmin)
S ('시각 ' + (Get-Date).ToString('MM-dd HH:mm:ss') + ' / PC ' + $env:COMPUTERNAME + ' / ' + $osName + ' / 관리자 ' + $isAdmin)

W '약 1분 걸립니다. 화면을 찍느라 이 창이 2초쯤 내려갔다가 돌아옵니다 - 창을 닫지 말고 기다려 주세요.' Yellow

# ---------- 화면부터 찍어 둔다 (예약 대기 화면이 사라지기 전에). 이 창은 잠깐 내렸다가 되돌린다 ----------
$shots = New-Object System.Collections.ArrayList
$capErr = ''
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -Namespace GolfPT -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
'@
  [void][GolfPT.Win]::SetProcessDPIAware()   # 배율(125% 등)에서도 화면 전체가 찍히게
  # 이 PowerShell 창(윈도우 터미널이면 그 창)만 잠깐 내린다 - 보이는 창만
  $hide = @(@([GolfPT.Win]::GetForegroundWindow(), [GolfPT.Win]::GetConsoleWindow()) | Where-Object { $_ -ne [IntPtr]::Zero -and [GolfPT.Win]::IsWindowVisible($_) } | Select-Object -Unique)
  foreach ($h in $hide) { [void][GolfPT.Win]::ShowWindow($h, 6) }   # 최소화
  Start-Sleep -Milliseconds 1800
  $si = 0
  foreach ($sc in [System.Windows.Forms.Screen]::AllScreens) {
    $si++
    $b = $sc.Bounds
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
    $g.Dispose()
    [void]$shots.Add([pscustomobject]@{ No = $si; Bmp = $bmp; Primary = $sc.Primary; Size = ($b.Width.ToString() + 'x' + $b.Height) })
  }
  foreach ($h in $hide) { [void][GolfPT.Win]::ShowWindow($h, 9) }   # 되돌리기
} catch { $capErr = $_.Exception.Message }

# ---------- 실행 중인 프로그램 목록 (UI 읽기 대상 고르기) ----------
function FrameworkHint($exePath) {
  if (!$exePath) { return '' }
  $h = @()
  try {
    $dir = Split-Path $exePath -Parent
    $names = @(Get-ChildItem $dir -File -ErrorAction SilentlyContinue | ForEach-Object { $_.Name.ToLower() })
    if ($names -contains 'libcef.dll') { $h += 'CEF(크로미움 내장)' }
    if ($names | Where-Object { $_ -like 'cefsharp*' }) { $h += 'CefSharp' }
    if (Test-Path (Join-Path $dir 'resources\app.asar')) { $h += 'Electron' }
    if ($names | Where-Object { $_ -like 'qt5core*.dll' -or $_ -like 'qt6core*.dll' }) { $h += 'Qt' }
    if ($names -contains 'unityplayer.dll') { $h += 'Unity' }
    if ($names -contains 'flutter_windows.dll') { $h += 'Flutter' }
    if ($names | Where-Object { $_ -like 'microsoft.web.webview2*' -or $_ -eq 'webview2loader.dll' }) { $h += 'WebView2' }
    if ($names | Where-Object { $_ -eq 'borlndmm.dll' -or $_ -like 'rtl*.bpl' -or $_ -like 'vcl*.bpl' }) { $h += 'Delphi' }
  } catch {}
  try { $an = [System.Reflection.AssemblyName]::GetAssemblyName($exePath); $h += ('.NET ' + $an.Version) } catch {}
  return ($h -join ', ')
}
$procRows = New-Object System.Collections.ArrayList
$cands = New-Object System.Collections.ArrayList
$dumpPids = New-Object System.Collections.ArrayList
$tmPids = New-Object System.Collections.ArrayList
$skipPids = New-Object System.Collections.ArrayList
foreach ($p in @(Get-Process -ErrorAction SilentlyContinue | Sort-Object ProcessName)) {
  $path = ''; $co = ''; $prod = ''
  try { $path = [string]$p.Path } catch {}
  try { $co = [string]$p.Company; $prod = [string]$p.Product } catch {}
  $title = ''
  try { $title = [string]$p.MainWindowTitle } catch {}
  $hasWin = $false
  try { $hasWin = ($p.MainWindowHandle -ne [IntPtr]::Zero) } catch {}
  $blob = $p.ProcessName + ' ' + $title + ' ' + $co + ' ' + $prod + ' ' + $path
  $isVendor = $blob -match $vendorRx
  $isTm = $blob -match '(?i)trackman'
  $isPriv = ($p.ProcessName -match $privRx) -and -not $isVendor
  if ($isPriv) { [void]$skipPids.Add($p.Id) }
  if (-not $hasWin -and -not $isVendor) { continue }   # 창 없는 프로그램은 레슨북처럼 보일 때만
  $kind = ''
  if ($isVendor) { $kind = '★레슨북?' } elseif ($isTm) { $kind = '트랙맨' } elseif ($isPriv) { $kind = '개인용(안 읽음)' } elseif ($p.ProcessName -match $sysRx) { $kind = '윈도우' }
  [void]$procRows.Add([pscustomobject]@{ P = $p; Path = $path; Title = $title; Co = $co; Prod = $prod; Kind = $kind; HasWin = $hasWin })
  if ($isTm) { [void]$tmPids.Add($p.Id); [void]$dumpPids.Add($p.Id) }
  elseif (-not $isPriv -and $p.ProcessName -notmatch $sysRx) {
    [void]$cands.Add([pscustomobject]@{ Id = $p.Id; Name = $p.ProcessName; Path = $path; Title = $title; Co = $co; Prod = $prod; Vendor = $isVendor })
    [void]$dumpPids.Add($p.Id)
  }
}

# ---------- UI 자동화로 창 글자 읽기 - 별도 프로세스에서(멈춤 방지), 트랙맨 파일 읽는 동안 같이 돈다 ----------
$uiaBlock = {
  param($dumpPids, $skipPids, $vRx, $tRx)
  $ErrorActionPreference = 'SilentlyContinue'
  try { Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes } catch { 'ERR|UI 자동화 불러오기 실패: ' + $_.Exception.Message; return }
  $AE = [System.Windows.Automation.AutomationElement]
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $vpat = [System.Windows.Automation.ValuePattern]::Pattern
  $wins = $null
  try { $wins = $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition) } catch { 'ERR|창 목록 실패: ' + $_.Exception.Message; return }
  $total = 0
  foreach ($w in $wins) {
    $wpid = 0; $fw = ''; $wn = ''; $cls = ''
    try { $cur = $w.Current; $wpid = [int]$cur.ProcessId; $fw = $cur.FrameworkId; $wn = $cur.Name; $cls = $cur.ClassName } catch { continue }
    if ($skipPids -contains $wpid) { continue }
    if (-not (($dumpPids -contains $wpid) -or ($wn -match $vRx) -or ($wn -match $tRx))) { continue }
    if ($cls -match 'Chrome_WidgetWin|CefBrowserWindow') {   # 크로미움 계열은 처음 물어볼 때 글자 정보를 켠다 → 한 번 건드리고 잠깐 대기
      try { [void]$w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) } catch {}
      Start-Sleep -Milliseconds 1200
    }
    'WIN|' + $wpid + '|' + $fw + '|' + $cls + '|' + $wn
    $stack = New-Object System.Collections.Stack
    $stack.Push(@($w, 0))
    $n = 0
    while ($stack.Count -gt 0 -and $n -lt 600 -and $total -lt 3000) {
      $item = $stack.Pop(); $el = $item[0]; $d = [int]$item[1]
      $n++; $total++
      $nm = ''; $ct = ''; $val = ''
      try { $c = $el.Current; $nm = $c.Name; $ct = ($c.ControlType.ProgrammaticName -replace '^ControlType\.', '') } catch {}
      try { $o = $null; if ($el.TryGetCurrentPattern($vpat, [ref]$o) -and $o) { $val = $o.Current.Value } } catch {}
      if ($nm -or $val) { 'EL|' + $wpid + '|' + $d + '|' + $ct + '|' + $nm + '|' + $val }
      if ($d -lt 14) {
        $kids = New-Object System.Collections.ArrayList
        try { $ch = $walker.GetFirstChild($el); while ($null -ne $ch -and $kids.Count -lt 150) { [void]$kids.Add($ch); $ch = $walker.GetNextSibling($ch) } } catch {}
        for ($i = $kids.Count - 1; $i -ge 0; $i--) { $stack.Push(@($kids[$i], ($d + 1))) }
      }
    }
    'CNT|' + $wpid + '|' + $n
  }
}
$uiaJob = $null
try { $uiaJob = Start-Job -ScriptBlock $uiaBlock -ArgumentList @(@($dumpPids), @($skipPids), $vendorRx, $timeRx) } catch { W ('UI 읽기 작업 시작 실패: ' + $_.Exception.Message) Yellow }

# ==================== [1] 트랙맨 샷 파일 ====================
W ''
W '===== [1] 트랙맨 샷 파일의 플레이어(로그인) 정보 =====' Cyan
$roots = @('C:\ProgramData\TrackMan\TrackMan Performance Studio\Data')
try { $cfg = Get-Content 'C:\golfpt-sync\config.json' -Raw | ConvertFrom-Json; if ($cfg.watchDirs) { $roots = @($cfg.watchDirs) } } catch {}
$files = @()
foreach ($r in $roots) { if (Test-Path $r) { $files += Get-ChildItem $r -Recurse -Include *.ftmf,*.stmf -ErrorAction SilentlyContinue } }
$files = @($files | Sort-Object LastWriteTime -Descending | Select-Object -First 6)
# 플레이어·사용자·계정처럼 보이는 키와 값을 JSON 텍스트에서 찾아 보여준다 (값은 160자까지)
$playerRx = '"([^"]*(?:Player|User|Golfer|Member|Profile|Account|Email|Nick|FirstName|LastName|DisplayName|Login)[^"]*)"\s*:\s*("(?:[^"\\]|\\.)*"|[-0-9.]+|true|false|null|\{[^{}]{0,240}\})'
$fileKeys = @{}
function ReadEntryText($zip, $pattern) {
  $e = $zip.Entries | Where-Object { $_.FullName -match $pattern } | Select-Object -First 1
  if (!$e) { return $null }
  $rd = New-Object System.IO.StreamReader($e.Open()); $t = $rd.ReadToEnd(); $rd.Dispose(); return $t
}
function ScanPlayerKeys($label, $txt) {
  if (!$txt) { W ('  [' + $label + '] 없음') Yellow; return }
  W ('  [' + $label + '] ' + $txt.Length + '자 - 플레이어 관련 키:')
  $seen = @{}
  [regex]::Matches($txt, $playerRx) | ForEach-Object {
    $k = $_.Groups[1].Value; $v = $_.Groups[2].Value
    if ($v.Length -gt 160) { $v = $v.Substring(0, 160) + '...' }
    $key = $k + '=' + $v
    if (!$seen.ContainsKey($key)) {
      $seen[$key] = 1; W ('    ' + $k + ' : ' + (Redact $v)) Green
      if ($k -notmatch '^UserConditions$' -and -not $fileKeys.ContainsKey($k)) { $fileKeys[$k] = (Cut (Redact $v) 40) }
    }
  }
  if ($seen.Count -eq 0) { W '    (없음)' }
}
if (!$files.Count) { W '  ftmf/stmf 파일을 찾지 못했습니다 - 샷을 친 뒤 1분 기다렸다가 다시 실행해 주세요.' Yellow; S '[1] 트랙맨 샷 파일: 못 찾음' }
foreach ($f in $files) {
  W ''
  $rel = $f.FullName
  foreach ($r in $roots) { if ($rel.StartsWith($r)) { $rel = $rel.Substring($r.Length) } }
  W ('----- ' + $rel + '  (' + $f.LastWriteTime + ', ' + [math]::Round($f.Length/1KB) + 'KB) -----') Cyan
  $fileKeys.Clear()
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
        foreach ($pp in $last.PSObject.Properties) {
          if ($pp.Name -match 'Player|User|Golfer|Profile|Account|Session') { W ('  [' + $pp.Name + '] ' + (Redact ($pp.Value | ConvertTo-Json -Depth 6 -Compress))) Cyan }
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
  $kv = @($fileKeys.Keys | Select-Object -First 4 | ForEach-Object { $_ + '=' + $fileKeys[$_] })
  if ($kv.Count) { S ('[1] 샷 ' + $f.LastWriteTime.ToString('HH:mm:ss') + ' 플레이어 키: ' + ($kv -join ' | ')) } else { S ('[1] 샷 ' + $f.LastWriteTime.ToString('HH:mm:ss') + ' 플레이어 키 없음') }
}
# TPS 가 플레이어 프로필을 별도 파일로 두는지 - Data 폴더 상위에서 프로필/플레이어 폴더 이름만 훑는다
W ''
W '  [TPS 폴더에서 플레이어/프로필처럼 보이는 폴더·파일 (이름만)]'
try {
  $base = 'C:\ProgramData\TrackMan\TrackMan Performance Studio'
  if (Test-Path $base) {
    Get-ChildItem $base -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Player|Profile|User|Account|Golfer' } | Select-Object -First 20 | ForEach-Object { W ('    ' + $_.FullName.Substring($base.Length)) }
  }
} catch {}

# ==================== [2] 실행 중인 프로그램 ====================
W ''
W '===== [2] 실행 중인 프로그램 (창이 있는 것 + 레슨북처럼 보이는 것) =====' Cyan
foreach ($row in $procRows) {
  $t = $row.Title; if ($row.Kind -eq '개인용(안 읽음)') { $t = '(제목 생략)' }
  $tag = ''; if ($row.Kind) { $tag = '[' + $row.Kind + '] ' }
  W ('  ' + $tag + $row.P.ProcessName + ' (PID ' + $row.P.Id + ', 창 ' + $row.HasWin + ') | 제목: ' + (Cut (Redact $t) 60) + ' | ' + (Cut ($row.Prod + ' / ' + $row.Co) 50) + ' | ' + $row.Path)
}
if (!$cands.Count) { W '  트랙맨·윈도우·개인용 말고 창이 있는 프로그램이 없습니다.' Yellow; S '[2] 레슨북/타석 프로그램 후보: 없음 (창 있는 프로그램 중)' }
foreach ($c in $cands) {
  $hint = FrameworkHint $c.Path
  $c | Add-Member -NotePropertyName Hint -NotePropertyValue $hint -Force
  W ('  후보: ' + $c.Name + ' | ' + (Cut $c.Prod 30) + ' / ' + (Cut $c.Co 30) + ' | 만든 방식: ' + $hint) Green
  $star = ''; if ($c.Vendor) { $star = '★ ' }
  S ('[2] 후보 ' + $star + $c.Name + ' | 제목 "' + (Cut (Redact $c.Title) 40) + '" | ' + (Cut ($c.Prod + ' / ' + $c.Co) 40) + ' | ' + $hint + ' | ' + $c.Path)
}

# ==================== [3] UI 자동화 결과 ====================
W ''
W '===== [3] 창 글자 직접 읽기 (UI 자동화 - 화면에 안 보여도 읽힘) =====' Cyan
$uiaOut = @()
if ($uiaJob) {
  if (Wait-Job $uiaJob -Timeout 75) { $uiaOut = @(Receive-Job $uiaJob -ErrorAction SilentlyContinue) }
  else { W '  시간 초과(75초) - 읽은 데까지만 표시' Yellow; S '[3] UI 읽기 75초 시간 초과'; Stop-Job $uiaJob; $uiaOut = @(Receive-Job $uiaJob -ErrorAction SilentlyContinue) }
  Remove-Job $uiaJob -Force -ErrorAction SilentlyContinue
} else { W '  UI 읽기 작업을 시작하지 못했습니다.' Yellow; S '[3] UI 읽기 작업 시작 실패' }
$winInfo = @{}; $winTexts = @{}; $winCnt = @{}
foreach ($ln in $uiaOut) {
  $s = [string]$ln
  if ($s.StartsWith('ERR|')) { W ('  ' + $s.Substring(4)) Yellow; S ('[3] ' + $s.Substring(4)); continue }
  $parts = $s -split '\|', 6
  if ($parts.Count -lt 3) { continue }
  $wp = $parts[1]
  if ($parts[0] -eq 'WIN') { if (!$winInfo.ContainsKey($wp)) { $winInfo[$wp] = New-Object System.Collections.ArrayList; $winTexts[$wp] = New-Object System.Collections.ArrayList }; [void]$winInfo[$wp].Add(('창 "' + (Cut (Redact $parts[4]) 50) + '" / 프레임워크 ' + $parts[2] + ' / 클래스 ' + (Cut $parts[3] 40))) }
  elseif ($parts[0] -eq 'CNT') { $winCnt[$wp] = [int]$winCnt[$wp] + [int]$parts[2] }
  elseif ($parts[0] -eq 'EL' -and $parts.Count -ge 6) {
    $txt = (Cut $parts[4] 120); $val = (Cut $parts[5] 80)
    $full = $txt; if ($val -and $val -ne $txt) { $full = $txt + ' = ' + $val }
    if ($full -and $winTexts.ContainsKey($wp) -and -not $winTexts[$wp].Contains($full)) { [void]$winTexts[$wp].Add($full) }
  }
}
$uiaHits = New-Object System.Collections.ArrayList
foreach ($wp in $winInfo.Keys) {
  $pn = ''; try { $pn = (Get-Process -Id ([int]$wp) -ErrorAction SilentlyContinue).ProcessName } catch {}
  $isTmWin = $tmPids -contains [int]$wp
  W ('  ● ' + $pn + ' (PID ' + $wp + ') - 읽은 요소 ' + [int]$winCnt[$wp] + '개, 글자 있는 것 ' + $winTexts[$wp].Count + '개') Green
  foreach ($wi in $winInfo[$wp]) { W ('     ' + $wi) }
  $shown = 0
  foreach ($t in $winTexts[$wp]) {
    $hit = ($t -match $timeRx) -or ($t -match $maskRx)
    if ($hit) { [void]$uiaHits.Add(($pn + ': ' + (Redact $t))) }
    # 트랙맨 창은 숫자 표가 많으니 플레이어·한글·로그인 관련 글자만, 나머지 창은 앞에서부터
    if ($isTmWin -and -not ($hit -or $t -match '[가-힣]' -or $t -match '(?i)player|guest|login|sign|profile|user')) { continue }
    if ($shown -ge 60) { continue }
    $shown++
    $mark = '     · '; if ($hit) { $mark = '     ◆ ' }
    W ($mark + (Redact $t))
  }
  S ('[3] ' + $pn + ' 창: 글자 ' + $winTexts[$wp].Count + '개 (' + (($winInfo[$wp] | Select-Object -First 1) -replace '^창 ', '') + ')')
}
if (!$winInfo.Count) { W '  읽을 창이 없었습니다.' Yellow; S '[3] UI 자동화: 읽은 창 없음' }
if ($uiaHits.Count) { foreach ($h in ($uiaHits | Select-Object -First 5)) { S ('[3] ◆ 예약/이름 표시 읽힘: ' + $h) } }
elseif ($winInfo.Count) { S '[3] UI 자동화로는 "시간 ~ 이름" 표시를 못 찾음' }
if (-not $isAdmin) { W '  (참고) 타석 프로그램이 관리자 권한으로 돌고 있으면 글자가 0개로 나옵니다. 그때는 "관리자 PowerShell" 로 다시 실행해 주세요.' }

# ==================== [4] 화면 글자 인식 (OCR) ====================
W ''
W '===== [4] 화면 글자 인식 (윈도우 내장 OCR) =====' Cyan
if ($capErr) { W ('  화면 찍기 실패: ' + $capErr) Yellow; S ('[4] 화면 찍기 실패: ' + (Cut $capErr 80)) }
$ocrHits = New-Object System.Collections.ArrayList
if ($shots.Count) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Foundation.IAsyncOperation`1, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    function Await($op, $type) {
      $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
      if (-not $task.Wait(30000)) { throw '30초 안에 끝나지 않음' }
      return $task.Result
    }
    function OcrFile($path, $engine) {
      $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
      $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
      try {
        $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $sbm = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $res = Await ($engine.RecognizeAsync($sbm)) ([Windows.Media.Ocr.OcrResult])
        return @($res.Lines | ForEach-Object { $_.Text })
      } finally { try { $stream.Dispose() } catch {} }
    }
    $langs = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)
    $langTags = ($langs | ForEach-Object { $_.LanguageTag }) -join ', '
    W ('  OCR 언어: ' + $langTags)
    $ko = $langs | Where-Object { $_.LanguageTag -like 'ko*' } | Select-Object -First 1
    $engine = $null
    if ($ko) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($ko) }
    if (-not $engine) {
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
      W '  한국어 OCR 이 설치돼 있지 않아 기본 언어로 시도합니다 (한글은 못 읽을 수 있음).' Yellow
      S ('[4] 한국어 OCR 없음 (설치된 OCR 언어: ' + $langTags + ')')
    }
    if (-not $engine) { throw 'OCR 엔진을 만들 수 없음' }
    $maxDim = [int][Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    foreach ($sh in $shots) {
      $png = Join-Path $env:TEMP ('golfpt-ocr-' + $sh.No + '.png')
      $sh.Bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
      $txt = @(OcrFile $png $engine)
      Remove-Item $png -Force -ErrorAction SilentlyContinue
      $how = '원본'
      $found = @($txt | Where-Object { $_ -match $timeRx })
      if (-not $found.Count -and ($sh.Bmp.Width * 2) -le $maxDim -and ($sh.Bmp.Height * 2) -le $maxDim) {   # 작은 글씨 대비 2배 확대해서 한 번 더
        $big = New-Object System.Drawing.Bitmap(($sh.Bmp.Width * 2), ($sh.Bmp.Height * 2))
        $g2 = [System.Drawing.Graphics]::FromImage($big)
        $g2.InterpolationMode = 'HighQualityBicubic'
        $g2.DrawImage($sh.Bmp, 0, 0, $big.Width, $big.Height); $g2.Dispose()
        $png2 = Join-Path $env:TEMP ('golfpt-ocr-' + $sh.No + 'x2.png')
        $big.Save($png2, [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
        $txt2 = @(OcrFile $png2 $engine)
        Remove-Item $png2 -Force -ErrorAction SilentlyContinue
        if (@($txt2 | Where-Object { $_ -match $timeRx }).Count -or $txt2.Count -gt $txt.Count) { $txt = $txt2; $how = '2배 확대' }
      }
      $prim = ''; if ($sh.Primary) { $prim = ', 주 모니터' }
      W ('  ● 화면 ' + $sh.No + ' (' + $sh.Size + $prim + ') - 읽은 줄 ' + $txt.Count + '개 (' + $how + ')') Green
      $shown = 0
      foreach ($t in $txt) {
        $hit = ($t -match $timeRx) -or ($t -match $maskRx)
        if ($hit) { [void]$ocrHits.Add(('화면' + $sh.No + ': ' + (Cut (Redact $t) 100))) }
        # 개인정보가 섞일 수 있어 예약·로그인 관련 줄만 보여준다
        if (($hit -or $t -match $wordRx) -and $shown -lt 25) { $shown++; $mark = '     · '; if ($hit) { $mark = '     ◆ ' }; W ($mark + (Cut (Redact $t) 100)) }
      }
      S ('[4] 화면' + $sh.No + ' ' + $sh.Size + ': 글자 ' + $txt.Count + '줄 (' + $how + ')')
    }
  } catch { W ('  OCR 실패: ' + $_.Exception.Message) Yellow; S ('[4] OCR 실패: ' + (Cut $_.Exception.Message 80)) }
  foreach ($sh in $shots) { try { $sh.Bmp.Dispose() } catch {} }
  # 찍은 화면 파일이 잠겨서 못 지운 게 있으면 마저 지운다
  try { [GC]::Collect(); [GC]::WaitForPendingFinalizers(); Get-ChildItem $env:TEMP -Filter 'golfpt-ocr-*.png' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch {}
}
if ($ocrHits.Count) { foreach ($h in ($ocrHits | Select-Object -First 5)) { S ('[4] ◆ 예약/이름 표시 읽힘: ' + $h) } }
elseif ($shots.Count) { S '[4] OCR 로는 "시간 ~ 이름" 표시를 못 찾음 (그 화면이 떠 있을 때 실행했는지 확인)' }

# ==================== [5] 기록 파일·레지스트리 ====================
W ''
W '===== [5] 레슨북/타석 프로그램 기록 파일·레지스트리 (최근 3일) =====' Cyan
$dirSet = [ordered]@{}
foreach ($c in $cands) { if ($c.Path) { $d = Split-Path $c.Path -Parent; if ($d -and $d -notmatch '(?i)^C:\\Windows') { $dirSet[$d] = 1 } } }
$nameAlts = @($cands | ForEach-Object { $_.Name; $_.Prod } | Where-Object { $_ -and $_.Length -ge 4 } | Select-Object -Unique | ForEach-Object { [regex]::Escape($_) })
$candRx = ''; if ($nameAlts.Count) { $candRx = '(?i)^(' + ($nameAlts -join '|') + ')$' }
foreach ($bse in @($env:APPDATA, $env:LOCALAPPDATA, $env:ProgramData, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:PUBLIC, 'C:\')) {
  if (!$bse -or !(Test-Path $bse)) { continue }
  Get-ChildItem $bse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $vendorRx -or ($candRx -and $_.Name -match $candRx) } | ForEach-Object { $dirSet[$_.FullName] = 1 }
}
function ReadTail($path, $max) {
  try {
    $fs = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]'ReadWrite, Delete')
    $n = [int][math]::Min($max, $fs.Length)
    [void]$fs.Seek(-$n, [System.IO.SeekOrigin]::End)
    $buf = New-Object byte[] $n
    $read = $fs.Read($buf, 0, $n); $fs.Dispose()
    $zeros = 0; for ($i = 0; $i -lt [math]::Min(400, $read); $i++) { if ($buf[$i] -eq 0) { $zeros++ } }
    if ($zeros -gt 60) { return [System.Text.Encoding]::Unicode.GetString($buf, 0, $read) }   # UTF-16 기록
    $u = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
    if ([regex]::Matches($u, '\uFFFD').Count -gt 20) { $u = [System.Text.Encoding]::GetEncoding(949).GetString($buf, 0, $read) }   # 한글 윈도우 기본 인코딩
    return $u
  } catch { return $null }
}
$textExt = '(?i)\.(log|txt|json|ini|xml|cfg|config|csv)$'
$keyRx = '(?i)login|logon|로그인|member|회원|reserv|예약|booking|phone|휴대|checkin|체크인|입실|user'
$fileHits = 0
if (!$dirSet.Count) { W '  레슨북/타석 프로그램 폴더를 찾지 못했습니다.' Yellow }
foreach ($d in $dirSet.Keys) {
  W ('  [폴더] ' + $d) Green
  $recent = @(Get-ChildItem $d -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-3) } | Sort-Object LastWriteTime -Descending | Select-Object -First 12)
  if (!$recent.Count) { W '    최근 3일 안에 바뀐 파일 없음'; continue }
  foreach ($f in $recent) {
    W ('    ' + $f.LastWriteTime.ToString('MM-dd HH:mm:ss') + '  ' + [math]::Round($f.Length / 1KB, 1) + 'KB  ' + $f.FullName.Substring($d.Length).TrimStart('\'))
    if ($f.Name -match $textExt -and $f.Length -lt 50MB -and $fileHits -lt 80) {
      $t = ReadTail $f.FullName 262144
      if (!$t) { continue }
      $hits = @($t -split "`r?`n" | Where-Object { $_ -match $timeRx -or $_ -match $maskRx -or $_ -match $keyRx } | Select-Object -Last 6)
      foreach ($h in $hits) { $fileHits++; $mark = '      › '; if ($h -match $timeRx -or $h -match $maskRx) { $mark = '      ◆ ' }; W ($mark + (Cut (Redact $h) 180)) }
    }
  }
}
W '  [레지스트리]'
foreach ($hive in @('HKCU:\Software', 'HKLM:\SOFTWARE', 'HKLM:\SOFTWARE\WOW6432Node')) {
  Get-ChildItem $hive -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match $vendorRx -or ($candRx -and $_.PSChildName -match $candRx) } | ForEach-Object {
    W ('    ' + $_.Name) Green
    $keys = @($_) + @(Get-ChildItem $_.PSPath -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 20)
    foreach ($k in $keys) {
      try {
        foreach ($vn in @($k.GetValueNames() | Select-Object -First 15)) {
          $vv = [string]$k.GetValue($vn)
          if ($vn -match '(?i)pass|pwd|token|secret|key|auth|cookie') { $vv = '[가림]' }
          W ('      ' + $k.PSChildName + ' \ ' + $vn + ' = ' + (Cut (Redact $vv) 60))
        }
      } catch {}
    }
  }
}
S ('[5] 살펴본 폴더 ' + $dirSet.Count + '개, 예약/로그인 관련 기록 줄 ' + $fileHits + '개')

# ==================== 요약 ====================
W ''
W '===== [요약] 이 부분을 사진 찍거나 복사해서 보내주세요 =====' Cyan
foreach ($s in $summary) { W ('  ' + $s) }
W ''
try { $lines | Out-File -FilePath $outPath -Encoding UTF8; W ('완료 - 전체 결과를 바탕화면에 저장했습니다: ' + $outPath) Cyan } catch { W '완료 - 이 화면을 캡처해서 공유해 주세요.' Cyan }
pause
