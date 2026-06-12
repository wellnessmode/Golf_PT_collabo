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
  echo   상태 :  [ 중지됨 ]  에이전트가 실행되고 있지 않습니다.
  echo           '설치_자동시작.bat' 을 실행하거나 PC 를 재부팅하세요.
) else (
  echo   상태 :  [ 실행 중 ]  에이전트가 백그라운드에서 동작 중입니다.
)
echo.

REM --- PC 시계 + 최근 로그 ---
echo   현재 PC 시각 : %date% %time%
echo.
echo  ====================  최근 로그 (마지막 18줄)  ====================
powershell -NoProfile -Command "if(Test-Path '%~dp0agent.log'){Get-Content '%~dp0agent.log' -Tail 18 -Encoding UTF8}else{'  (아직 로그가 없습니다)'}"
echo  ===================================================================
echo.
echo   * 위 로그에서 '시계 정확' 또는 '어긋남' 결과를 확인하세요.
echo.
pause
