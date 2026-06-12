@echo off
title Golf PT 에이전트 - 중지
echo.
echo  에이전트를 중지합니다...
echo.
REM 1) 중지 플래그 생성 → 백그라운드 루프가 이를 보고 스스로 종료
echo stop> "%~dp0agent.stop"
REM 2) 현재 돌고 있는 node 종료 (루프가 깨어나 플래그 확인 후 재시작 안 함)
taskkill /F /IM node.exe >nul 2>nul
if errorlevel 1 (
  echo  실행 중인 에이전트가 없었습니다.
) else (
  echo  [완료] 에이전트를 중지했습니다.
)
echo.
echo  ※ 자동시작은 그대로입니다 - 다음 부팅 때 다시 켜집니다.
echo     완전히 끄려면 '자동시작_해제.bat' 실행.
echo.
pause
