#!/bin/bash
# ──────────────────────────────────────────────────────────────
# macOS 오프라인 데스크톱 앱(.app) 빌드 스크립트  (웹 버전 기반)
#
#   웹 버전(web_app.py)의 모든 기능을 담은 .app 을 만든다.
#   인터넷 없이 '내 컴퓨터 안 로컬 서버'로 돌고, 더블클릭하면
#   기본 브라우저가 자동으로 열린다. (Tk 검은화면 문제 없음)
#
# 사용법:  bash build_desktop_macos.sh
# 결과물:  dist/FarmSolarManager.app
#   데이터: ~/Documents/영농형태양광관리/farm_data.db
# ──────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
echo "==> 사용할 파이썬: $($PY --version)"

echo "==> 의존성(Flask, PyInstaller) 확인/설치..."
"$PY" -m pip install --quiet --upgrade flask pyinstaller

# 앱 아이콘(.icns) 생성 — static/icon-512.png 로부터 (있을 때만)
ICON_ARG=()
if command -v iconutil >/dev/null 2>&1 && [ -f static/icon-512.png ]; then
  echo "==> 앱 아이콘 생성..."
  ICONSET="build_AppIcon.iconset"
  rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  for s in 16 32 64 128 256 512; do
    sips -z $s $s static/icon-512.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    d=$((s*2))
    sips -z $d $d static/icon-512.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o build_AppIcon.icns
  rm -rf "$ICONSET"
  ICON_ARG=(--icon build_AppIcon.icns)
fi

echo "==> 빌드 시작 (몇 분 걸릴 수 있습니다)..."
"$PY" -m PyInstaller --noconfirm --clean --windowed \
  --name "FarmSolarManager" \
  --add-data "templates:templates" \
  --add-data "static:static" \
  --hidden-import encodings.idna \
  "${ICON_ARG[@]}" \
  desktop.py

rm -f build_AppIcon.icns
echo ""
echo "✅ 빌드 완료!  →  $(pwd)/dist/FarmSolarManager.app"
echo "   • 더블클릭하면 브라우저가 열리고 바로 사용할 수 있습니다."
echo "   • 인터넷 연결이 전혀 필요 없습니다(완전 오프라인)."
echo "   • 다른 Mac으로 복사해도 됩니다(파이썬 설치 불필요)."
