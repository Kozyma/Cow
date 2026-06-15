#!/bin/bash
# ──────────────────────────────────────────────────────────────
# macOS용 데스크톱 실행 파일(.app) 빌드 스크립트
#
# ⚠ 검은 화면 문제 안내
#   macOS 기본 파이썬(/usr/bin/python3)은 오래된 Tk 8.5 를 쓰는데,
#   최신 macOS에서 창이 '검게만' 뜨는 알려진 버그가 있습니다.
#   → 이 스크립트는 Tk 8.6 이상을 가진 파이썬을 자동으로 찾아 빌드합니다.
#
# 사용법:  bash build_macos.sh        결과물: dist/FarmSolarManager.app
#   데이터는 ~/Documents/영농형태양광관리/farm_data.db 에 저장됨
# ──────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

# Tk 8.6 이상을 가진 파이썬 후보들을 순서대로 시도
CANDIDATES=(
  "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3"
  "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3"
  "/opt/homebrew/bin/python3.12"
  "/opt/homebrew/bin/python3"
  "/usr/local/bin/python3"
  "python3"
)

tk_version() { "$1" -c "import tkinter; print(tkinter.TkVersion)" 2>/dev/null; }
ge_86() { awk "BEGIN{exit !($1>=8.6)}"; }

PY=""
for c in "${CANDIDATES[@]}"; do
  command -v "$c" >/dev/null 2>&1 || [ -x "$c" ] || continue
  v=$(tk_version "$c") || continue
  if [ -n "$v" ] && ge_86 "$v"; then PY="$c"; TKV="$v"; break; fi
done

if [ -z "$PY" ]; then
  echo "✗ Tk 8.6 이상을 가진 파이썬을 찾지 못했습니다(현재 것은 Tk 8.5 → 검은 화면)."
  echo ""
  echo "  다음 중 하나로 Tk 8.6 파이썬을 준비한 뒤 다시 실행하세요:"
  echo "   (A) Homebrew:   brew install python@3.12 python-tk@3.12"
  echo "   (B) python.org: https://www.python.org/downloads/ 에서 설치"
  echo "       (python.org 설치본은 Tk 8.6 이 기본 포함됩니다)"
  echo ""
  echo "  ※ 휴대폰까지 쓰시려면 데스크톱(.app) 대신 웹 버전(web_app.py)을"
  echo "     권장합니다. README의 '웹 버전' 안내를 보세요."
  exit 1
fi

echo "==> 사용할 파이썬: $PY  (Tk $TKV) ✅"

echo "==> PyInstaller 설치 확인..."
if ! "$PY" -m PyInstaller --version >/dev/null 2>&1; then
  echo "    PyInstaller 설치 중..."
  "$PY" -m pip install --user pyinstaller
fi

echo "==> 빌드 시작 (몇 분 걸릴 수 있습니다)..."
"$PY" -m PyInstaller --noconfirm --clean --windowed \
  --name "FarmSolarManager" \
  app.py

echo ""
echo "✅ 빌드 완료!  →  $(pwd)/dist/FarmSolarManager.app"
echo "   더블클릭하거나 다른 Mac으로 복사해 사용하세요 (파이썬 불필요)."
