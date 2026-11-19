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

REM --- agent.js 버전 : agent.js 의 AGENT_VERSION 숫자를 읽어 GitHub 최신본의 숫자와 비교 ---
REM     예전엔 표식 문자열만 봐서 구버전(v10)도 '최신'으로 보였다. 인터넷이 안 되면 설치된 버전만 표시.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%~dp0agent.js'; $v=0; if(Test-Path -LiteralPath $p){ $m=Select-String -LiteralPath $p -Pattern 'AGENT_VERSION\s*=\s*(\d+)' | Select-Object -First 1; if($m){ $v=[int]$m.Matches[0].Groups[1].Value } }; $l=0; try{ [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor 3072; $t=(Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/agent/agent.js' -UseBasicParsing -TimeoutSec 8).Content; if($t -match 'AGENT_VERSION\s*=\s*(\d+)'){ $l=[int]$Matches[1] } }catch{}; if($v -le 0){ '  agent.js :  [ 구버전!! ]  버전 표기가 없는 아주 옛 버전 - update.ps1 로 교체 필요' } elseif($l -le 0){ '  agent.js :  v' + $v + '  (최신 버전 확인 불가 - 인터넷 연결 확인)' } elseif($v -lt $l){ '  agent.js :  [ 구버전!! ]  v' + $v + '  (최신 v' + $l + ') - update.ps1 실행 필요' } else { '  agent.js :  [ 최신 ]  v' + $v }"
echo.
echo   현재 PC 시각 : %date% %time%
echo.
REM --- 마지막 '감시 중' 줄 (5분마다) : 하트비트 전송 결과, 레슨 상태, 영상 대기 건수 ---
powershell -NoProfile -Command "if(Test-Path -LiteralPath '%~dp0agent.log'){ $b=Select-String -LiteralPath '%~dp0agent.log' -Pattern '감시 중' -Encoding UTF8 | Select-Object -Last 1; if($b){ '  마지막 감시 기록 : ' + $b.Line } else { '  마지막 감시 기록 : (아직 없음 - 시작 후 5분 안에 생김)' } }"
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
