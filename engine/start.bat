@echo off
chcp 65001 >nul
rem powerDeck 변환 엔진 — 창을 닫으면 멈춘다. 로그인 시 자동 실행은 README 참고.
cd /d "%~dp0"
:loop
py worker.py
echo 엔진이 멈췄습니다. 10초 뒤 다시 시작합니다...
timeout /t 10 >nul
goto loop
