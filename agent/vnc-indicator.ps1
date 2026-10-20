# ============================================================
#  Golf PT - 원격 접속 중 "비차단형 표시" (화면을 가리지 않는 작은 구석 표시)
#  VNC 뷰어가 이 PC에 접속해 있는 동안에만, 화면 구석에 작은 빨간 알약(● 원격 접속 중)을 띄운다.
#  - 트랙맨 화면 중앙을 가리지 않는다(작은 구석 표시). 접속이 없으면 아무것도 안 보인다.
#  - 클릭하면 "연결 끊기" 확인 후 VNC 서버를 재시작해 뷰어를 끊는다(연결 종료 기능).
#  로그인 시 숨겨진 상태로 자동 실행(설치 스크립트가 등록). 창·소리 없음.
#  ※ 전체화면 독점(Exclusive Fullscreen) 게임/앱 위에는 최상위 창이 안 보일 수 있음 → 실제 타석에서 확인 필요.
# ============================================================
param([int]$Port = 5900, [int]$PollSec = 2)
$ErrorActionPreference = 'SilentlyContinue'
try { Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing } catch { return }

# 이 PC의 VNC 포트(5900)에 "확립된" 들어온 연결이 있으면 = 누군가 원격으로 보고 있는 중
function Test-VncConnected {
  try { return (@(Get-NetTCPConnection -LocalPort $Port -State Established -ErrorAction SilentlyContinue).Count -gt 0) }
  catch { return $false }
}

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Size = New-Object System.Drawing.Size(160, 30)
$form.BackColor = [System.Drawing.Color]::FromArgb(200, 30, 30)
$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = '● 원격 접속 중'
$lbl.ForeColor = [System.Drawing.Color]::White
$lbl.Dock = [System.Windows.Forms.DockStyle]::Fill
$lbl.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$lbl.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($lbl)
# 우측 상단 구석(작업영역 기준) — 중앙 트랙맨 화면을 안 가리게
try {
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Location = New-Object System.Drawing.Point(($wa.Right - $form.Width - 8), ($wa.Top + 8))
} catch {}

# 클릭 → 연결 끊기. 권한이 있으면 VNC 서비스 재시작으로 끊고, 없으면 확실한 방법을 안내한다.
$disconnect = {
  if ([System.Windows.Forms.MessageBox]::Show('원격 접속을 끊을까요?', '연결 종료', [System.Windows.Forms.MessageBoxButtons]::YesNo) -eq [System.Windows.Forms.DialogResult]::Yes) {
    $done = $false
    try { Restart-Service tvnserver -Force -ErrorAction Stop; $done = $true } catch {}
    if (-not $done) {
      [System.Windows.Forms.MessageBox]::Show("바로 끊을 권한이 없습니다. 아래 중 하나로 끊어 주세요:`n· 작업표시줄 TightVNC 아이콘 우클릭 → Disconnect all clients`n· Tailscale 에서 이 기기 내리기", '연결 종료', [System.Windows.Forms.MessageBoxButtons]::OK) | Out-Null
    }
  }
}
$lbl.Add_Click($disconnect)
$form.Add_Click($disconnect)

# 2초마다 접속 상태 확인 → 접속 중이면 표시, 아니면 숨김. Run(ApplicationContext) 라 평소엔 창이 안 뜸.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [math]::Max(1, $PollSec) * 1000
$timer.Add_Tick({
    try {
      if (Test-VncConnected) { if (-not $form.Visible) { $form.Show() }; $form.TopMost = $true }
      else { if ($form.Visible) { $form.Hide() } }
    } catch {}
  })
$timer.Start()
$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)
