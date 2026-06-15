@echo off
REM ──────────────────────────────────────────────────────────────
REM Windows 오프라인 데스크톱 앱(.exe) 빌드 스크립트  (웹 버전 기반)
REM
REM   웹 버전(web_app.py)의 모든 기능을 담은 .exe 를 만든다.
REM   인터넷 없이 로컬 서버로 돌고, 더블클릭하면 기본 브라우저가 열린다.
REM
REM 사용법: 이 파일을 더블클릭하거나, 명령 프롬프트에서 실행
REM 결과물: dist\FarmSolarManager.exe
REM   데이터: 사용자 문서\영농형태양광관리\farm_data.db
REM
REM ※ .exe 는 Windows 에서만 빌드됩니다(맥에서 .exe 생성 불가).
REM ──────────────────────────────────────────────────────────────
cd /d "%~dp0"

echo ==^> 의존성(Flask, PyInstaller) 확인/설치...
python -m pip install --quiet --upgrade flask pyinstaller

set ICON_ARG=
if exist static\icon-512.png (
    if exist static\app.ico set ICON_ARG=--icon static\app.ico
)

echo ==^> 빌드 시작 (몇 분 걸릴 수 있습니다)...
python -m PyInstaller --noconfirm --clean --windowed --onefile ^
    --name "FarmSolarManager" ^
    --add-data "templates;templates" ^
    --add-data "static;static" ^
    --hidden-import encodings.idna ^
    %ICON_ARG% ^
    desktop.py

echo.
echo [완료] dist\FarmSolarManager.exe 를 확인하세요.
echo        - 더블클릭하면 브라우저가 열리고 바로 사용할 수 있습니다.
echo        - 인터넷 연결이 전혀 필요 없습니다(완전 오프라인).
echo        - 다른 PC로 복사해도 됩니다(파이썬 설치 불필요).
pause
