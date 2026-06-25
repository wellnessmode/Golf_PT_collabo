' ============================================================
'  Golf PT Bay Agent - hidden background launcher + auto-restart
'  (no window/tray/icon. restarts node if it stops.)
'  stop: create agent.stop in this folder ( handled by 중지.bat )
' ============================================================
Option Explicit
Dim fso, sh, scriptDir, stopFile, nodeCmd, p, tf, cands, i, lf
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir
stopFile = scriptDir & "\agent.stop"

' --- resolve node.exe robustly (background launch has a different PATH) ---
nodeCmd = ""
' 1) node-path.txt written by the installer (absolute path)
If fso.FileExists(scriptDir & "\node-path.txt") Then
  Set tf = fso.OpenTextFile(scriptDir & "\node-path.txt", 1)
  If Not tf.AtEndOfStream Then p = Trim(tf.ReadLine)
  tf.Close
  If Len(p) > 0 And fso.FileExists(p) Then nodeCmd = """" & p & """"
End If
' 2) standard install locations
If nodeCmd = "" Then
  cands = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramW6432%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"))
  For i = 0 To UBound(cands)
    If nodeCmd = "" And fso.FileExists(cands(i)) Then nodeCmd = """" & cands(i) & """"
  Next
End If
' 3) last resort: rely on PATH
If nodeCmd = "" Then nodeCmd = "node"

' clear stale stop flag from a previous stop
If fso.FileExists(stopFile) Then fso.DeleteFile stopFile

' launcher trace (diagnose auto-start failures)
On Error Resume Next
Set lf = fso.OpenTextFile(scriptDir & "\launcher.log", 8, True)
lf.WriteLine Now & "  launcher start, node=" & nodeCmd
lf.Close
On Error GoTo 0

Do
    If fso.FileExists(stopFile) Then
        fso.DeleteFile stopFile
        Exit Do
    End If
    ' 0 = hidden, True = wait until node exits
    sh.Run nodeCmd & " agent.js", 0, True
    ' node exited (crash/kill) -> wait 4s and restart
    WScript.Sleep 4000
Loop
