"""
app.py — 영농형 태양광 관리 프로그램 진입점

실행:  python3 app.py

5개 탭(대시보드 / 농축산 / 태양광 / 재무 / 통계)을 하나의 창에 묶는다.
데이터는 이 파일과 같은 폴더의 farm_data.db(SQLite)에 저장된다.
"""

import os
import sys
import random
from datetime import datetime, timedelta

import tkinter as tk
from tkinter import ttk, messagebox, filedialog

import exporter
from database import Database
from charts import KFONT
from tab_dashboard import DashboardTab
from tab_livestock import LivestockTab
from tab_solar import SolarTab
from tab_finance import FinanceTab
from tab_reports import ReportsTab


def get_data_dir():
    """
    데이터 파일(farm_data.db)을 저장할 폴더를 정한다.

    - 패키징된 실행파일(.app/.exe)로 실행한 경우:
        프로그램 내부는 읽기 전용이라 쓸 수 없으므로, 사용자 '문서' 폴더 아래
        '영농형태양광관리' 폴더에 저장한다(영구 보관·백업 용이).
    - 일반 파이썬 스크립트로 실행한 경우:
        이 스크립트와 같은 폴더에 저장한다.
    """
    if getattr(sys, "frozen", False):
        base = os.path.join(os.path.expanduser("~"), "Documents", "영농형태양광관리")
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(base, exist_ok=True)
    return base


DATA_DIR = get_data_dir()
DB_PATH = os.path.join(DATA_DIR, "farm_data.db")


class App(tk.Tk):
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.geometry("1000x760")
        self.minsize(860, 640)
        self._setup_style()
        self._build_menu()

        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=6, pady=6)

        # (클래스, 탭 이름) 순서대로 추가
        self.tabs = []
        for cls, title in [
            (DashboardTab, "🏠 대시보드"),
            (LivestockTab, "🐄 농축산"),
            (SolarTab, "☀ 태양광"),
            (FinanceTab, "💰 재무"),
            (ReportsTab, "📊 통계"),
        ]:
            tab = cls(self.notebook, self.db, self)
            self.notebook.add(tab, text=title)
            self.tabs.append(tab)

        self.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.set_title_farm(self.db.get_setting("farm_name", ""))

    # ── 외관 ─────────────────────────────────────────────────────
    def _setup_style(self):
        style = ttk.Style()
        # clam 테마는 색상/폰트 커스텀이 잘 먹고 플랫폼 간 외관이 일관적이다.
        if "clam" in style.theme_names():
            style.theme_use("clam")
        base = (KFONT, 11)
        style.configure(".", font=base)
        style.configure("TNotebook.Tab", font=(KFONT, 12), padding=(16, 7))
        style.configure("Treeview", rowheight=24, font=(KFONT, 10))
        style.configure("Treeview.Heading", font=(KFONT, 10, "bold"))
        style.configure("TLabelframe.Label", font=(KFONT, 11, "bold"))
        self.option_add("*Font", base)   # messagebox 등 클래식 위젯용

    def _build_menu(self):
        menubar = tk.Menu(self)

        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="CSV로 내보내기…", command=self.export_csv)
        file_menu.add_separator()
        file_menu.add_command(label="예시 데이터 채우기", command=self.seed_sample)
        file_menu.add_command(label="전체 데이터 초기화", command=self.reset_all)
        file_menu.add_separator()
        file_menu.add_command(label="종료", command=self._on_close)
        menubar.add_cascade(label="파일", menu=file_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="사용 안내", command=self._show_help)
        help_menu.add_command(label="정보", command=self._show_about)
        menubar.add_cascade(label="도움말", menu=help_menu)

        self.config(menu=menubar)

    def set_title_farm(self, name):
        self.title(f"영농형 태양광 관리 — {name}" if name else "영농형 태양광 관리")

    # ── 이벤트 ───────────────────────────────────────────────────
    def _on_tab_changed(self, _event):
        """탭을 전환할 때마다 해당 탭을 최신 데이터로 갱신."""
        idx = self.notebook.index(self.notebook.select())
        tab = self.tabs[idx]
        if hasattr(tab, "refresh"):
            tab.refresh()

    def refresh_all(self):
        for tab in self.tabs:
            if hasattr(tab, "refresh"):
                tab.refresh()

    def _on_close(self):
        self.db.close()
        self.destroy()

    # ── 메뉴 동작 ────────────────────────────────────────────────
    def _show_help(self):
        messagebox.showinfo(
            "사용 안내",
            "1) [태양광] 탭에서 설비용량·단가를 먼저 설정하세요.\n"
            "2) [농축산] 탭에서 키우는 품목과 영농일지를 기록합니다.\n"
            "3) [태양광] 탭에서 매일 발전량(kWh)을 입력하면\n"
            "    설정한 단가로 예상 수익이 자동 계산됩니다.\n"
            "4) [재무] 탭에서 수입/지출을 부문별로 정리합니다.\n"
            "5) [통계] 탭과 [대시보드]에서 월별 추이를 확인하세요.\n\n"
            "처음이라면 [파일 > 예시 데이터 채우기]로 화면을 미리 볼 수 있습니다.",
        )

    def _show_about(self):
        messagebox.showinfo(
            "정보",
            "영농형 태양광 관리 프로그램\n"
            "Python + Tkinter + SQLite (외부 설치 불필요)\n\n"
            f"데이터 파일 위치:\n{DB_PATH}",
        )

    def export_csv(self):
        folder = filedialog.askdirectory(title="CSV 파일을 저장할 폴더를 선택하세요")
        if not folder:
            return
        try:
            files = exporter.export_all(self.db, folder)
        except Exception as e:
            messagebox.showerror("내보내기 오류", f"내보내는 중 문제가 발생했습니다.\n{e}")
            return
        names = "\n".join("· " + os.path.basename(p) for p in files)
        messagebox.showinfo(
            "내보내기 완료",
            f"{len(files)}개의 CSV 파일을 저장했습니다.\n\n"
            f"저장 위치:\n{folder}\n\n{names}\n\n"
            "엑셀에서 바로 열 수 있습니다.",
        )

    def reset_all(self):
        if not messagebox.askyesno(
            "전체 초기화",
            "모든 농축산·태양광·재무 데이터가 삭제됩니다.\n"
            "정말 초기화할까요? (설비 설정은 유지)",
        ):
            return
        for table in ("farm_log", "livestock", "solar_log", "finance"):
            self.db.conn.execute(f"DELETE FROM {table}")
        self.db.conn.commit()
        self.refresh_all()
        messagebox.showinfo("완료", "데이터를 초기화했습니다.")

    def seed_sample(self):
        """처음 사용자가 화면을 미리 볼 수 있도록 예시 데이터를 넣는다."""
        if self.db.list_livestock() or self.db.list_solar() or self.db.list_finance():
            if not messagebox.askyesno(
                "예시 데이터",
                "이미 데이터가 있습니다. 예시 데이터를 추가로 더 넣을까요?",
            ):
                return

        db = self.db
        # 품목
        cow = db.add_livestock("가축", "한우", 32, "두", _days_ago(400), "진행중", "비육우")
        db.add_livestock("작물", "벼", 2000, "㎡", _days_ago(120), "진행중", "친환경 재배")
        db.add_livestock("작물", "고추", 300, "주", _days_ago(80), "진행중", "")

        # 영농 일지
        db.add_farm_log(_days_ago(2), cow, "급여/관리", 240, "kg", "배합사료")
        db.add_farm_log(_days_ago(1), cow, "방역/병해충", 0, "", "구제역 백신 접종")

        # 발전 기록 (최근 30일) — 계절/날씨 변동을 흉내
        for i in range(30, -1, -1):
            d = _days_ago(i)
            base = float(db.get_setting_float("capacity_kw", 100)) * 3.8
            kwh = round(base * random.uniform(0.55, 1.05), 1)
            db.add_or_update_solar(d, kwh, "")

        # 재무
        db.add_finance(_days_ago(20), "수입", "농축산", "한우 출하", 4_800_000, "2두")
        db.add_finance(_days_ago(15), "지출", "농축산", "사료 구입", 1_200_000, "")
        month_kwh = db.solar_month_total(datetime.now().year, datetime.now().month)
        db.add_finance(_days_ago(5), "수입", "태양광", "발전 정산금",
                       db.solar_revenue(month_kwh), "전월분")
        db.add_finance(_days_ago(10), "지출", "공통", "전기·수도료", 180_000, "")

        self.refresh_all()
        messagebox.showinfo("완료", "예시 데이터를 채웠습니다. 각 탭을 둘러보세요!")


def _days_ago(n):
    return (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")


def main():
    db = Database(DB_PATH)
    app = App(db)
    app.mainloop()


if __name__ == "__main__":
    main()
