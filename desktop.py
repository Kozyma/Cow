"""
desktop.py — 영농형 태양광 관리 (오프라인 데스크톱 실행기)

웹 버전(web_app.py)의 모든 기능을 그대로 쓰되, 인터넷 없이
'내 컴퓨터 안에서만' 도는 작은 서버를 띄우고 기본 브라우저를 자동으로 연다.

- 인터넷 연결이 전혀 필요 없다(로컬 서버 + SQLite 파일).
- 데이터는 ~/Documents/영농형태양광관리/farm_data.db 에 저장된다.
- PyInstaller 로 .app(macOS) / .exe(Windows) 로 묶으면
  파이썬이 없는 컴퓨터에서도 더블클릭으로 실행된다.

빌드:  bash build_desktop_macos.sh   또는   build_desktop_windows.bat
실행(개발 중):  python3 desktop.py
"""

import os
import socket
import sys
import threading
import time
import webbrowser

# PyInstaller 패키징 시 누락되기 쉬운 지연-로딩 인코딩을 명시적으로 포함.
#   (없으면 .app/.exe 에서 'unknown encoding: idna' 로 서버가 죽는다)
import encodings.idna  # noqa: F401

# 데스크톱(단일 사용자, 로컬)에서는 비밀번호 보호가 필요 없으므로 강제로 끈다.
os.environ.setdefault("APP_PASSWORD", "")

from web_app import app  # noqa: E402  (환경변수 설정 후 import)


def _free_port(preferred=8765):
    """가능하면 preferred 포트를, 점유돼 있으면 빈 포트를 찾아 반환."""
    for port in (preferred, 0):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", port))
            chosen = s.getsockname()[1]
            s.close()
            return chosen
        except OSError:
            continue
    return preferred


def _open_browser(url):
    """서버가 응답할 때까지 잠깐 기다렸다가 브라우저를 연다."""
    for _ in range(50):                      # 최대 ~5초 대기
        try:
            with socket.create_connection(("127.0.0.1", _PORT), timeout=0.3):
                break
        except OSError:
            time.sleep(0.1)
    webbrowser.open(url)


_PORT = _free_port()


def main():
    url = f"http://127.0.0.1:{_PORT}/"
    print("=" * 56)
    print("  영농형 태양광 관리 (오프라인 데스크톱)")
    print(f"  브라우저가 자동으로 열립니다 → {url}")
    print("  창을 닫아도 이 프로그램을 종료하면 서버도 멈춥니다.")
    print("=" * 56)

    threading.Thread(target=_open_browser, args=(url,), daemon=True).start()
    # 로컬 전용: 127.0.0.1 에만 바인딩(외부에서 접근 불가, 안전).
    app.run(host="127.0.0.1", port=_PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
