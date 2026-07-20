@echo off
title Golf PT 에이전트 - 상태확인
echo.
echo  ========================================================
echo    Golf PT 베이 에이전트 - 상태 확인
echo  ========================================================
echo.

REM --- 실행 여부 ---
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if errorlevel 1 (
  echo   상태 :  [ 멈춰있음 ]  에이전트가 실행되고 있지 않습니다.
  echo           '설치_자동시작.bat' 을 실행하거나 PC 를 재부팅하세요.
) else (
  echo   상태 :  [ 실행 중 ]  에이전트가 백그라운드에서 동작 중입니다.
)
echo.

REM --- agent.js 버전 판별 (신버전 마커: _watchdogTick) ---
findstr /m /c:"_watchdogTick" "%~dp0agent.js" >nul 2>nul
if errorlevel 1 (
  echo   agent.js :  [ 구버전!! ]  최신 파일로 교체가 필요합니다.
) else (
  echo   agent.js :  [ 최신 ]  워치독 포함 버전.
)
echo.
echo   현재 PC 시각 : %date% %time%
echo.
echo  ====================  최근 로그 ^(마지막 18줄^)  ====================
powershell -NoProfile -Command "if(Test-Path '%~dp0agent.log'){Get-Content '%~dp0agent.log' -Tail 18 -Encoding UTF8}else{'  (아직 로그가 없습니다)'}"
echo  ===================================================================
echo.
echo  ==============  시작 오류 로그 ^(node-crash.log^)  =================
powershell -NoProfile -Command "if(Test-Path '%~dp0node-crash.log'){Get-Content '%~dp0node-crash.log' -Tail 12 -Encoding UTF8}else{'  (없음)'}"
echo  ===================================================================
echo.
echo  ================  런처 기록 ^(launcher.log^)  ======================
powershell -NoProfile -Command "if(Test-Path '%~dp0launcher.log'){Get-Content '%~dp0launcher.log' -Tail 3}else{'  (없음 - 백그라운드 런처가 실행된 적 없습니다)'}"
echo  ===================================================================
echo.
echo   * 최근 로그 시각이 안 올라가면 -^> '시작 오류 로그'에 원인이 찍힙니다.
echo   * 이 창은 실시간이 아닙니다. 다시 보려면 다시 실행하세요.
echo.
pause
