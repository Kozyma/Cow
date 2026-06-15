@echo off
REM ==============================================================
REM  웹 버전 실행 (Windows) - 더블클릭하면 서버가 켜지고
REM  브라우저가 열린다. 같은 와이파이 휴대폰에서도 접속 가능.
REM ==============================================================
cd /d "%~dp0"
chcp 65001 >nul

where py >nul 2>nul && (set PY=py) || (set PY=python)

%PY% -c "import flask" >nul 2>nul
if errorlevel 1 (
  echo ==^> Flask 설치 중(최초 1회)...
  %PY% -m pip install Flask
)

echo.
echo ================================================================
echo   브라우저에서 열기:        http://localhost:8000
echo   같은 와이파이 휴대폰에서:  http://[이 PC의 IP]:8000
echo   ( IP 확인:  cmd 에서 ipconfig - IPv4 주소 )
echo   (종료하려면 이 창에서 Ctrl+C)
echo ================================================================

start "" http://localhost:8000
%PY% web_app.py
pause
