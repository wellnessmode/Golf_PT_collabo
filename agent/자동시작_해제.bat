@echo off
chcp 65001 >nul
title Golf PT 에이전트 - 자동시작 해제
echo.
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GolfPT-Agent.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo  [완료] 자동시작 해제됨 - 다음 부팅부터 자동 실행 안 됨.
) else (
  echo  자동시작이 등록되어 있지 않습니다.
)
echo.
echo  현재 실행 중인 에이전트도 지금 중지합니다...
echo stop> "%~dp0agent.stop"
taskkill /F /IM node.exe >nul 2>nul
echo  [완료] 중지했습니다.
echo.
pause
