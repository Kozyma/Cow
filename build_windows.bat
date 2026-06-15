@echo off
REM ──────────────────────────────────────────────────────────────
REM Windows용 실행 파일(.exe) 빌드 스크립트
REM
REM 사용법: 이 파일을 더블클릭하거나, 명령 프롬프트에서 build_windows.bat 실행
REM
REM 결과물: dist\FarmSolarManager.exe
REM   - 더블클릭으로 실행 (파이썬 설치 안 된 Windows PC에서도 동작)
REM   - 데이터는 사용자 문서\영농형태양광관리\farm_data.db 에 저장됨
REM
REM ※ .exe는 Windows에서만 빌드됩니다(맥에서 .exe를 만들 수 없음).
REM ──────────────────────────────────────────────────────────────
cd /d "%~dp0"

echo ==^> PyInstaller 설치 확인...
python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo     PyInstaller가 없어 설치합니다...
    python -m pip install pyinstaller
)

echo ==^> 빌드 시작 (몇 분 걸릴 수 있습니다)...
python -m PyInstaller --noconfirm --clean --windowed --onefile ^
    --name "FarmSolarManager" ^
    app.py

echo.
echo [완료] dist\FarmSolarManager.exe 를 확인하세요.
echo        더블클릭하거나 다른 PC로 복사해 사용하세요 (파이썬 불필요).
pause
