# ============================================================
#  Golf PT - 타석 PC 진단: "지금 누가 치고 있는지" 알아낼 단서 찾기
#   [1] 트랙맨 샷 파일에 플레이어(로그인) 정보가 들어 있는지
#   [2] 실행 중인 프로그램 - 레슨북 타석 프로그램이 무엇인지
#   [3] 그 프로그램(과 트랙맨) 화면 글자를 윈도우가 직접 읽을 수 있는지 (UI 자동화)
#   [4] 윈도우 내장 글자 인식(OCR)으로 "20:00 ~ 20:24 김*아" 같은 예약 표시를 읽을 수 있는지 (모니터·빔 전부)
#   [5] 그 프로그램이 남기는 기록 파일·레지스트리에 예약/로그인 정보가 있는지
#
#  [조용한 대기 모드 - 추천] 소리·창·바탕화면 아이콘 없이 조용히. 원격접속해서 실행해 두면 됩니다:
#    powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\golfpt-sync\player-diag.ps1" -Watch 240 -Quiet
#   ① 소리도 안 나고 창도 안 뜬다 (회원 화면에 아무것도 안 보임). 최대 240분 동안 조용히 기다린다
#   ② 화면에 "시간 ~ 이름" 예약 표시가 새로 뜨면 그 순간을 조용히 진단(진단 1)
#   ③ 그 뒤 트랙맨 샷이 들어오고 3분 조용해지면 한 번 더 진단(진단 2)
#  [바로 모드] 지금 상태 그대로 한 번만: -Watch 를 빼고 -Quiet 만. (-Quiet 도 빼면 창을 띄워 진행 - 세팅 때 확인용)
#
#  결과: C:\golfpt-sync\diag\player-diag-날짜-시각(-1-예약화면 / -2-샷이후).txt — 원격접속해서 열어 보세요. 맨 아래 [요약].
#  읽기만 합니다 - 파일을 바꾸거나 지우지 않고, 키보드·마우스 입력은 기록하지 않습니다.
#  화면은 글자만 읽고 찍은 그림은 바로 지웁니다. 카카오톡·브라우저·메신저 등 개인용 프로그램 글자는 읽지 않습니다.
#  -Quiet 모드에서는 소리·창·사용자 창 조작이 전혀 없습니다 (회원이 눈치채지 못하게). 그만두려면 작업 관리자에서 powershell 종료.
# ============================================================
param([int]$Watch = 0, [switch]$Quiet)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Add-Type -AssemblyName System.IO.Compression.FileSystem
# 결과는 바탕화면이 아니라 조용한 폴더에 저장한다 (회원 화면에 아이콘이 안 뜨게). 원격접속으로 열어 본다.
$outDir = $null
foreach ($cand in @('C:\golfpt-sync\diag', (Join-Path $env:LOCALAPPDATA 'golfpt-diag'), $env:TEMP)) {
  if (!$cand) { continue }
  try { if (-not (Test-Path $cand)) { New-Item -ItemType Directory -Path $cand -Force | Out-Null }; if (Test-Path $cand) { $outDir = $cand; break } } catch {}
}
if (!$outDir) { $outDir = (Get-Location).Path }
$lines = New-Object System.Collections.Generic.List[string]
$summary = New-Object System.Collections.Generic.List[string]
$savedFiles = New-Object System.Collections.Generic.List[string]
$watchNote = ''
function W($s, $c) { if (-not $Quiet) { if ($c) { Write-Host $s -ForegroundColor $c } else { Write-Host $s } }; [void]$lines.Add([string]$s) }   # -Quiet 면 화면에 아무것도 출력하지 않고 파일에만 기록
function S($s) { [void]$summary.Add([string]$s) }
function Cut($s, $n) { if ($null -eq $s) { return '' }; $s = ([string]$s -replace '\s+', ' ').Trim(); if ($s.Length -gt $n) { return $s.Substring(0, $n) + '...' }; return $s }
# 공유 전에 가린다: 전화번호 전체, 9자리 이상 숫자, 이메일, 비밀번호·토큰 값
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

# ==================== 화면·창 도우미 ====================
$win32 = $false; $win32Err = ''
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -Namespace GolfPT -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
'@
  [void][GolfPT.Win]::SetProcessDPIAware()   # 배율(125% 등)에서도 화면 전체가 찍히게
  $win32 = $true
} catch { $win32Err = $_.Exception.Message }
# 이 PowerShell 창(윈도우 터미널이면 그 창) = 실행 직후 맨 앞 창. 이 창만 내리고 올린다 - 다른 프로그램 창은 건드리지 않는다
$myWins = @()
if ($win32) { try { $myWins = @(@([GolfPT.Win]::GetForegroundWindow(), [GolfPT.Win]::GetConsoleWindow()) | Where-Object { $_ -ne [IntPtr]::Zero -and [GolfPT.Win]::IsWindowVisible($_) } | Select-Object -Unique) } catch {} }
function Set-MyWins($cmd) { if ($win32) { foreach ($h in $myWins) { try { [void][GolfPT.Win]::ShowWindow($h, $cmd) } catch {} } } }   # 6 내리기 / 9 되돌리기
# 모든 모니터(빔 포함)를 한 장씩 찍는다
function Capture-Screens {
  if (-not $win32) { return }
  $si = 0
  foreach ($sc in [System.Windows.Forms.Screen]::AllScreens) {
    $si++
    $b = $sc.Bounds
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try { $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size) } finally { $g.Dispose() }
    [pscustomobject]@{ No = $si; Bmp = $bmp; Primary = $sc.Primary; Size = ($b.Width.ToString() + 'x' + $b.Height) }
  }
}
# 맨 앞 창의 프로그램 이름 (이 PowerShell 창이면 빈 값)
function Get-FgProcName {
  if (-not $win32) { return '' }
  try {
    $fg = [GolfPT.Win]::GetForegroundWindow()
    if ($fg -eq [IntPtr]::Zero) { return '' }
    foreach ($m in $myWins) { if ($m -eq $fg) { return '' } }
    $procId = [uint32]0
    [void][GolfPT.Win]::GetWindowThreadProcessId($fg, [ref]$procId)
    return [string](Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue).ProcessName
  } catch { return '' }
}
# 맨 앞 창이 모니터 하나를 거의 다 덮는지 (예약 잠금 화면처럼)
function Test-FgFullscreen {
  if (-not $win32) { return $false }
  try {
    $fg = [GolfPT.Win]::GetForegroundWindow()
    if ($fg -eq [IntPtr]::Zero) { return $false }
    $r = New-Object 'GolfPT.Win+RECT'
    if (-not [GolfPT.Win]::GetWindowRect($fg, [ref]$r)) { return $false }
    $scr = [System.Windows.Forms.Screen]::FromHandle($fg).Bounds
    return ((($r.Right - $r.Left) * ($r.Bottom - $r.Top)) -ge (0.85 * $scr.Width * $scr.Height))
  } catch { return $false }
}
function Beep($n) { }   # 소리 없음 (회원이 쓰는 공간이라 삐 소리를 내지 않는다)

# ==================== 글자 인식(OCR) 도우미 - 윈도우 10/11 내장 ====================
$ocrEngine = $null; $ocrErr = ''; $ocrLangTags = ''; $ocrNoKo = $false; $ocrMaxDim = 0; $asTaskGeneric = $null
function Await($op, $type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(30000)) { throw '30초 안에 끝나지 않음' }
  return $task.Result
}
function OcrFile($path) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $sbm = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($ocrEngine.RecognizeAsync($sbm)) ([Windows.Media.Ocr.OcrResult])
    return @($res.Lines | ForEach-Object { $_.Text })
  } finally { try { $stream.Dispose() } catch {} }
}
# 찍은 화면을 임시 파일로 저장 → 글자만 읽고 → 바로 지운다
function OcrBitmap($bmp, $tag) {
  $png = Join-Path $env:TEMP ('golfpt-ocr-' + $tag + '.png')
  $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
  try { return @(OcrFile $png) } finally { Remove-Item $png -Force -ErrorAction SilentlyContinue }
}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Foundation.IAsyncOperation`1, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $langs = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)
  $ocrLangTags = ($langs | ForEach-Object { $_.LanguageTag }) -join ', '
  $ko = $langs | Where-Object { $_.LanguageTag -like 'ko*' } | Select-Object -First 1
  if ($ko) { $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($ko) }
  if (-not $ocrEngine) { $ocrNoKo = $true; $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }   # 숫자(시간)는 영어 OCR 로도 읽힌다
  $ocrMaxDim = [int][Windows.Media.Ocr.OcrEngine]::MaxImageDimension
  if (-not $ocrEngine) { $ocrErr = 'OCR 엔진을 만들 수 없음' }
} catch { $ocrErr = $_.Exception.Message; $ocrEngine = $null }

# ==================== 그 밖의 도우미 ====================
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
# 트랙맨 샷 파일 (에이전트 설정의 감시 폴더)
$roots = @('C:\ProgramData\TrackMan\TrackMan Performance Studio\Data')
try { $cfg = Get-Content 'C:\golfpt-sync\config.json' -Raw -ErrorAction Stop | ConvertFrom-Json; if ($cfg.watchDirs) { $roots = @($cfg.watchDirs) } } catch {}
function Get-ShotFiles($since) {
  $all = @()
  foreach ($r in $roots) { if (Test-Path $r) { $all += @(Get-ChildItem $r -Recurse -Include *.ftmf,*.stmf -File -ErrorAction SilentlyContinue) } }
  if ($since) { $all = @($all | Where-Object { $_.LastWriteTime -gt $since }) }
  return $all
}
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
# UI 자동화로 창 글자 읽기 - 별도 프로세스에서(멈춤 방지)
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

# ==================== 진단 한 번 ====================
function Invoke-Diag($label, $hideConsole) {
  $lines.Clear(); $summary.Clear()
  $tag = ''; $disp = ''; if ($label) { $tag = '-' + $label; $disp = ' ' + $label }
  $outPath = Join-Path $outDir ('player-diag-' + (Get-Date).ToString('MMdd-HHmmss') + $tag + '.txt')
  W ('진단' + $disp + ' 시각: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  /  PC: ' + $env:COMPUTERNAME + '  /  ' + $osName + '  /  관리자 권한: ' + $isAdmin)
  S ('진단' + $disp + ' ' + (Get-Date).ToString('MM-dd HH:mm:ss') + ' / PC ' + $env:COMPUTERNAME + ' / ' + $osName + ' / 관리자 ' + $isAdmin)
  if ($watchNote) { S ('[대기] ' + $watchNote) }

  # ---------- 화면부터 찍어 둔다 (예약 대기 화면이 사라지기 전에) ----------
  $shots = @(); $capErr = $win32Err
  if ($win32) {
    if ($hideConsole) { W '약 1분 걸립니다. 화면을 찍느라 이 창이 2초쯤 내려갔다가 돌아옵니다 - 창을 닫지 말고 기다려 주세요.' Yellow }
    try {
      if ($hideConsole) { Set-MyWins 6; Start-Sleep -Milliseconds 1800 }
      $shots = @(Capture-Screens)
    } catch { $capErr = $_.Exception.Message } finally { if ($hideConsole) { Set-MyWins 9 } }
  }

  # ---------- 실행 중인 프로그램 목록 (UI 읽기 대상 고르기) ----------
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
  $uiaJob = $null
  try { $uiaJob = Start-Job -ScriptBlock $uiaBlock -ArgumentList @(@($dumpPids), @($skipPids), $vendorRx, $timeRx) } catch { W ('UI 읽기 작업 시작 실패: ' + $_.Exception.Message) Yellow }

  # ==================== [1] 트랙맨 샷 파일 ====================
  W ''
  W '===== [1] 트랙맨 샷 파일의 플레이어(로그인) 정보 (최근 10개) =====' Cyan
  $files = @(Get-ShotFiles $null | Sort-Object LastWriteTime -Descending | Select-Object -First 10)
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
      if ($stmf) { $ms = New-Object System.IO.MemoryStream; $st = $stmf.Open(); $st.CopyTo($ms); $st.Dispose(); $ms.Position = 0; $inner = New-Object System.IO.Compression.ZipArchive($ms) }
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
    $k = ''; if ($row.Kind) { $k = '[' + $row.Kind + '] ' }
    W ('  ' + $k + $row.P.ProcessName + ' (PID ' + $row.P.Id + ', 창 ' + $row.HasWin + ') | 제목: ' + (Cut (Redact $t) 60) + ' | ' + (Cut ($row.Prod + ' / ' + $row.Co) 50) + ' | ' + $row.Path)
  }
  if (!$cands.Count) { W '  트랙맨·윈도우·개인용 말고 창이 있는 프로그램이 없습니다.' Yellow; S '[2] 레슨북/타석 프로그램 후보: 없음 (창 있는 프로그램 중)' }
  foreach ($c in $cands) {
    $hint = FrameworkHint $c.Path
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
  W '===== [4] 화면 글자 인식 (윈도우 내장 OCR, 모니터·빔 전부) =====' Cyan
  if ($capErr) { W ('  화면 찍기 실패: ' + $capErr) Yellow; S ('[4] 화면 찍기 실패: ' + (Cut $capErr 80)) }
  $ocrHits = New-Object System.Collections.ArrayList
  if ($shots.Count) {
    W ('  OCR 언어: ' + $ocrLangTags)
    if ($ocrNoKo) { W '  한국어 OCR 이 설치돼 있지 않아 기본 언어로 읽습니다 (한글은 못 읽을 수 있음).' Yellow; S ('[4] 한국어 OCR 없음 (설치된 OCR 언어: ' + $ocrLangTags + ')') }
    if (-not $ocrEngine) { W ('  OCR 준비 실패: ' + $ocrErr) Yellow; S ('[4] OCR 준비 실패: ' + (Cut $ocrErr 80)) }
    else {
      foreach ($sh in $shots) {
        try {
          $txt = @(OcrBitmap $sh.Bmp ([string]$sh.No))
          $how = '원본'
          $found = @($txt | Where-Object { $_ -match $timeRx })
          if (-not $found.Count -and ($sh.Bmp.Width * 2) -le $ocrMaxDim -and ($sh.Bmp.Height * 2) -le $ocrMaxDim) {   # 작은 글씨 대비 2배 확대해서 한 번 더
            $big = New-Object System.Drawing.Bitmap(($sh.Bmp.Width * 2), ($sh.Bmp.Height * 2))
            $g2 = [System.Drawing.Graphics]::FromImage($big)
            $g2.InterpolationMode = 'HighQualityBicubic'
            $g2.DrawImage($sh.Bmp, 0, 0, $big.Width, $big.Height); $g2.Dispose()
            try { $txt2 = @(OcrBitmap $big ([string]$sh.No + 'x2')) } finally { $big.Dispose() }
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
        } catch { W ('  화면 ' + $sh.No + ' OCR 실패: ' + $_.Exception.Message) Yellow; S ('[4] 화면' + $sh.No + ' OCR 실패: ' + (Cut $_.Exception.Message 80)) }
      }
    }
    foreach ($sh in $shots) { try { $sh.Bmp.Dispose() } catch {} }
    # 찍은 화면 파일이 잠겨서 못 지운 게 있으면 마저 지운다
    try { [GC]::Collect(); [GC]::WaitForPendingFinalizers(); Get-ChildItem $env:TEMP -Filter 'golfpt-ocr-*.png' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch {}
  }
  if ($ocrHits.Count) { foreach ($h in ($ocrHits | Select-Object -First 5)) { S ('[4] ◆ 예약/이름 표시 읽힘: ' + $h) } }
  elseif ($shots.Count) { S '[4] OCR 로는 "시간 ~ 이름" 표시를 못 찾음 (그 화면이 떠 있을 때였는지 확인)' }

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
  W ('===== [요약' + $disp + '] 이 부분을 사진 찍거나 복사해서 보내주세요 =====') Cyan
  foreach ($s in $summary) { W ('  ' + $s) }
  W ''
  try { $lines | Out-File -FilePath $outPath -Encoding UTF8; [void]$savedFiles.Add($outPath); W ('저장: ' + $outPath) Cyan } catch { W '저장 실패 - 이 화면을 캡처해서 공유해 주세요.' Yellow }
}

# ==================== 실행 ====================
if ($Watch -gt 0) {
  # 예약 화면이 "새로" 떴는지 - 화면(OCR)과 창 제목에서 "시간 ~ 시간" 글자를 찾는다
  function Get-ReservationTexts {
    $found = New-Object System.Collections.ArrayList
    foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
      $tt = ''; try { $tt = [string]$p.MainWindowTitle } catch {}
      if ($tt -and $tt -match $timeRx -and $p.ProcessName -notmatch $privRx) { [void]$found.Add(('창 제목 ' + $p.ProcessName + ': ' + $tt)) }
    }
    if ($ocrEngine) {
      $caps = @(Capture-Screens)
      try {
        foreach ($cp in $caps) { foreach ($ln in @(OcrBitmap $cp.Bmp ('probe' + $cp.No))) { if ($ln -match $timeRx) { [void]$found.Add(('화면' + $cp.No + ': ' + $ln)) } } }
      } finally { foreach ($cp in $caps) { try { $cp.Bmp.Dispose() } catch {} } }
    }
    return ,$found
  }
  function KeyOf($x) { return (([string]$x -replace '^[^:]*:\s*', '') -replace '\s', '') }

  if (-not $Quiet) {
    Write-Host ''
    Write-Host ('[대기 모드] 화면에 "시간 ~ 이름" 예약 표시가 새로 뜰 때까지 최대 ' + $Watch + '분 조용히 기다립니다 (소리·알림 없음).') -ForegroundColor Yellow
    Write-Host '  예약 표시가 뜨면 그 순간을 조용히 진단하고, 그 뒤 샷이 들어와 3분 조용해지면 한 번 더 진단합니다.' -ForegroundColor Yellow
    Write-Host ('  결과는 ' + $outDir + ' 에 조용히 저장됩니다 (회원 화면엔 아무것도 안 보임). 원격접속으로 열어 보세요.') -ForegroundColor Yellow
    if (-not $ocrEngine) { Write-Host ('  (OCR 을 쓸 수 없어 맨 앞 창이 바뀌는 것으로만 판단합니다: ' + $ocrErr + ')') -ForegroundColor Yellow }
  }
  Start-Sleep -Seconds 2
  if (-not $Quiet) { Set-MyWins 6 }   # 조용 모드에서는 창을 건드리지 않는다 (-Quiet 면 창 자체가 숨겨져 있음)
  Start-Sleep -Milliseconds 1200
  $baseKeys = @{}
  try { foreach ($x in (Get-ReservationTexts)) { $baseKeys[(KeyOf $x)] = 1 } } catch {}
  $fgLast = Get-FgProcName
  $deadline = (Get-Date).AddMinutes($Watch); $hit = ''; $nextProbe = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline -and -not $hit) {
    Start-Sleep -Seconds 3
    $fgNow = Get-FgProcName
    $fgChanged = ($fgNow -ne $fgLast); $fgLast = $fgNow
    if ($fgChanged -or (Get-Date) -ge $nextProbe) {
      $nextProbe = (Get-Date).AddSeconds(20)
      try { foreach ($x in (Get-ReservationTexts)) { if (-not $baseKeys.ContainsKey((KeyOf $x))) { $hit = $x; break } } } catch {}
      if (-not $hit -and $fgChanged -and $fgNow -and $fgNow -notmatch '(?i)trackman' -and $fgNow -notmatch $sysRx -and $fgNow -notmatch $privRx -and (Test-FgFullscreen)) { $hit = '전체 화면 창이 맨 앞에 뜸: ' + $fgNow }
    }
  }
  if ($hit) { $watchNote = '예약 화면 감지 ' + (Get-Date).ToString('HH:mm:ss') + ' / ' + (Cut (Redact $hit) 80); Start-Sleep -Seconds 3 }
  else { $watchNote = $Watch.ToString() + '분 안에 예약 화면을 못 찾아 그 상태 그대로 진단' }
  Invoke-Diag '1-예약화면' $false

  # 그 뒤 트랙맨 샷이 들어오고 3분 동안 더 안 들어오면(다 쳤으면) 진단 2. 최대 25분
  $t0 = Get-Date
  if (-not $Quiet) { Write-Host ''; Write-Host '[대기 모드] 이제 트랙맨 샷이 들어오기를 기다립니다 (조용히).' -ForegroundColor Yellow }
  $deadline = $t0.AddMinutes(25); $seenN = 0; $lastNew = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 30
    $n = @(Get-ShotFiles $t0).Count
    if ($n -gt $seenN) { $seenN = $n; $lastNew = Get-Date }
    if ($lastNew -and ((Get-Date) - $lastNew).TotalSeconds -ge 180) { break }
  }
  if ($seenN) { $watchNote = '예약 화면 뒤 새 샷 파일 ' + $seenN + '개, 마지막 샷 ' + $lastNew.ToString('HH:mm:ss') + ' 이후 3분 조용해서 진단' }
  else { $watchNote = '25분 동안 새 샷 파일이 없어 그 상태 그대로 진단' }
  Invoke-Diag '2-샷이후' $false
  if (-not $Quiet) { Set-MyWins 9 }
} else {
  Invoke-Diag '' (-not $Quiet)
}
if (-not $Quiet) {
  Write-Host ''
  Write-Host ('완료 - 저장한 결과 파일: ' + ($savedFiles -join ' , ')) -ForegroundColor Cyan
  if ($Host.Name -eq 'ConsoleHost' -and [Environment]::UserInteractive) { pause }
}
