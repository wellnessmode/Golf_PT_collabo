' ============================================================
'  Golf PT Bay Agent — 콘솔창 없이 백그라운드 실행 + 자동 재시작
'  (창/트레이/아이콘 없음. node 가 멈춰도 스스로 다시 켜짐.)
'  중지: 같은 폴더에 agent.stop 파일이 생기면 루프 종료 ('중지.bat' 이 처리)
' ============================================================
Option Explicit
Dim fso, sh, scriptDir, stopFile
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
stopFile = scriptDir & "\agent.stop"

' 시작 시 오래된 중지플래그 제거 (이전 중지의 잔재 무시)
If fso.FileExists(stopFile) Then fso.DeleteFile stopFile

Do
    If fso.FileExists(stopFile) Then
        fso.DeleteFile stopFile
        Exit Do
    End If
    ' node 실행 — 0=창 숨김, True=node 가 끝날 때까지 대기
    sh.Run "node agent.js", 0, True
    ' 여기 도달 = node 종료됨(크래시/강제종료) → 4초 뒤 재시작
    WScript.Sleep 4000
Loop
