#!/bin/bash
# ──────────────────────────────────────────────────────────────
# 웹 버전 실행 (macOS) — 더블클릭하면 서버가 켜지고 브라우저가 열린다.
# 같은 와이파이의 휴대폰에서도 접속할 수 있다(아래 안내 참고).
# ──────────────────────────────────────────────────────────────
cd "$(dirname "$0")"

# 파이썬 찾기 (python3 우선)
PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then
  echo "파이썬이 설치되어 있지 않습니다. https://www.python.org 에서 설치하세요."
  read -p "엔터를 누르면 닫힙니다..."; exit 1
fi

# Flask 설치 확인 → 없으면 설치
if ! "$PY" -c "import flask" >/dev/null 2>&1; then
  echo "==> Flask 설치 중(최초 1회)..."
  "$PY" -m pip install --user Flask || "$PY" -m pip install Flask
fi

# 이 컴퓨터의 와이파이 IP(휴대폰 접속용) 안내
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "================================================================"
echo "  브라우저에서 열기:        http://localhost:8000"
if [ -n "$IP" ]; then
echo "  같은 와이파이 휴대폰에서:  http://$IP:8000"
fi
echo "  (종료하려면 이 창에서 Ctrl+C)"
echo "================================================================"

# 잠시 후 기본 브라우저 열기
( sleep 2; open "http://localhost:8000" ) &

"$PY" web_app.py
