@echo off
chcp 65001 >nul
title Golf PT 에이전트 - 자동시작 설치
echo.
echo  ========================================================
echo    Golf PT 베이 에이전트 - 자동시작 설치
echo  ========================================================
echo.

REM --- Node.js 설치 확인 ---
where node >nul 2>nul
if errorlevel 1 (
  echo  [오류] Node.js 가 설치되어 있지 않습니다.
  echo         https://nodejs.org 에서 LTS 버전 설치 후 다시 실행하세요.
  echo.
  pause
  exit /b
)

REM --- config.json 존재 확인 ---
if not exist "%~dp0config.json" (
  echo  [주의] config.json 이 없습니다.
  echo         config.sample.json 을 config.json 으로 복사하고 내용을 채워주세요.
  echo.
  pause
  exit /b
)

set "VBS=%~dp0start-hidden.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\GolfPT-Agent.lnk"

REM --- 시작프로그램 폴더에 바로가기 생성 (창 없이 wscript 로 VBS 실행) ---
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%'); $s.TargetPath='wscript.exe'; $s.Arguments='\"%VBS%\"'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='Golf PT Bay Agent'; $s.Save()"

if exist "%LNK%" (
  echo  [완료] 자동시작 등록됨.
  echo         이제 PC 를 켤 때마다 에이전트가 창 없이 자동 실행됩니다.
  echo.
  echo  지금 바로 실행할까요? 아무 키나 누르면 백그라운드로 시작합니다.
  pause >nul
  REM 혹시 이미 돌고 있던 인스턴스 정리 (중복 실행 방지)
  echo stop> "%~dp0agent.stop"
  taskkill /F /IM node.exe >nul 2>nul
  ping -n 6 127.0.0.1 >nul
  del "%~dp0agent.stop" >nul 2>nul
  REM 새 인스턴스 1개만 백그라운드 시작
  wscript "%VBS%"
  echo.
  echo  [실행됨] 에이전트가 백그라운드에서 동작 중입니다.
  echo           이 창은 닫아도 됩니다.  (상태확인.bat 으로 확인 가능)
) else (
  echo  [오류] 자동시작 등록 실패. 관리자에게 문의하세요.
)
echo.
pause
