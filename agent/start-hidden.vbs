' Golf PT Bay Agent — 콘솔창 없이 백그라운드 실행
' (창/트레이/아이콘 없음. 화면에 아무것도 안 띄움)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "node agent.js", 0, False
