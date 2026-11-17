@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -c "import flask" 2>nul || python -m pip install -r requirements.txt
start "" http://localhost:8100
python shop_app.py
pause
