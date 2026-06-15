"""
tab_solar.py — ☀️ 태양광 탭

상단: 발전 설비 설정 (설비용량, SMP/REC 단가, REC 가중치, 농장명)
하단: 일별 발전량(kWh) 기록 — 단가를 적용한 예상 수익이 자동 계산된다.
같은 날짜를 다시 입력하면 덮어쓴다(하루 1건 원칙).
"""

import tkinter as tk
from tkinter import ttk, messagebox

from database import today_str
from charts import won
from ui_helpers import parse_float, valid_date, build_tree, selected_id


class SolarTab(ttk.Frame):
    def __init__(self, parent, db, app):
        super().__init__(parent, padding=10)
        self.db = db
        self.app = app
        self._cache = {}

        self._build_settings(self)
        self._build_records(self)
        self.refresh()

    # ── 설비 설정 ────────────────────────────────────────────────
    def _build_settings(self, root):
        frame = ttk.LabelFrame(root, text=" 발전 설비 설정 ", padding=8)
        frame.pack(fill="x")

        ttk.Label(frame, text="농장명").grid(row=0, column=0, padx=3, pady=4, sticky="e")
        self.s_farm = ttk.Entry(frame, width=24)
        self.s_farm.grid(row=0, column=1, columnspan=3, padx=3, pady=4, sticky="we")

        ttk.Label(frame, text="설비용량(kW)").grid(row=1, column=0, padx=3, pady=4, sticky="e")
        self.s_capacity = ttk.Entry(frame, width=10)
        self.s_capacity.grid(row=1, column=1, padx=3, pady=4)

        ttk.Label(frame, text="SMP 단가(원/kWh)").grid(row=1, column=2, padx=3, pady=4, sticky="e")
        self.s_smp = ttk.Entry(frame, width=10)
        self.s_smp.grid(row=1, column=3, padx=3, pady=4)

        ttk.Label(frame, text="REC 단가(원/kWh)").grid(row=2, column=0, padx=3, pady=4, sticky="e")
        self.s_rec = ttk.Entry(frame, width=10)
        self.s_rec.grid(row=2, column=1, padx=3, pady=4)

        ttk.Label(frame, text="REC 가중치").grid(row=2, column=2, padx=3, pady=4, sticky="e")
        self.s_weight = ttk.Entry(frame, width=10)
        self.s_weight.grid(row=2, column=3, padx=3, pady=4)

        ttk.Button(frame, text="설정 저장", command=self.save_settings)\
            .grid(row=3, column=0, columnspan=2, padx=3, pady=6, sticky="w")
        self.unit_label = ttk.Label(frame, text="", foreground="#C0392B",
                                    font=("", 10, "bold"))
        self.unit_label.grid(row=3, column=2, columnspan=2, padx=3, pady=6, sticky="w")

    # ── 발전 기록 ────────────────────────────────────────────────
    def _build_records(self, root):
        frame = ttk.LabelFrame(root, text=" 일별 발전 기록 ", padding=8)
        frame.pack(fill="both", expand=True, pady=(8, 0))

        form = ttk.Frame(frame)
        form.pack(fill="x")
        ttk.Label(form, text="날짜").grid(row=0, column=0, padx=3, pady=3, sticky="e")
        self.r_date = ttk.Entry(form, width=12)
        self.r_date.insert(0, today_str())
        self.r_date.grid(row=0, column=1, padx=3, pady=3)

        ttk.Label(form, text="발전량(kWh)").grid(row=0, column=2, padx=3, pady=3, sticky="e")
        self.r_kwh = ttk.Entry(form, width=10)
        self.r_kwh.grid(row=0, column=3, padx=3, pady=3)

        ttk.Label(form, text="메모").grid(row=0, column=4, padx=3, pady=3, sticky="e")
        self.r_note = ttk.Entry(form, width=26)
        self.r_note.grid(row=0, column=5, padx=3, pady=3, sticky="we")
        form.columnconfigure(5, weight=1)

        btns = ttk.Frame(frame)
        btns.pack(fill="x", pady=4)
        ttk.Button(btns, text="기록 추가 / 수정", command=self.save_record).pack(side="left", padx=2)
        ttk.Button(btns, text="삭제", command=self.delete_record).pack(side="left", padx=2)
        ttk.Button(btns, text="입력 초기화", command=self.clear_form).pack(side="left", padx=2)
        ttk.Button(btns, text="💰 발전수익 재무 반영",
                   command=self.sync_to_finance).pack(side="left", padx=(12, 2))
        self.month_label = ttk.Label(btns, text="", foreground="#2E86C1")
        self.month_label.pack(side="right", padx=4)

        cols = [
            ("log_date", "날짜", 110, "center"),
            ("kwh", "발전량(kWh)", 110, "e"),
            ("revenue", "예상 수익(원)", 130, "e"),
            ("note", "메모", 240, "w"),
        ]
        tree_frame, self.tree = build_tree(frame, cols, height=10)
        tree_frame.pack(fill="both", expand=True)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)

    # ── 새로고침 ─────────────────────────────────────────────────
    def refresh(self):
        # 설정 폼 채우기
        self.s_farm.delete(0, "end")
        self.s_farm.insert(0, self.db.get_setting("farm_name", ""))
        self.s_capacity.delete(0, "end")
        self.s_capacity.insert(0, self.db.get_setting("capacity_kw", ""))
        self.s_smp.delete(0, "end")
        self.s_smp.insert(0, self.db.get_setting("smp_price", ""))
        self.s_rec.delete(0, "end")
        self.s_rec.insert(0, self.db.get_setting("rec_price", ""))
        self.s_weight.delete(0, "end")
        self.s_weight.insert(0, self.db.get_setting("rec_weight", ""))
        self.unit_label.config(
            text=f"➔ 1kWh당 예상 정산단가: {won(self.db.solar_unit_revenue())}원"
        )

        # 기록 목록
        self.tree.delete(*self.tree.get_children())
        self._cache.clear()
        for r in self.db.list_solar():
            self._cache[r["id"]] = r
            rev = self.db.solar_revenue(r["generation_kwh"])
            self.tree.insert(
                "", "end", iid=str(r["id"]),
                values=(r["log_date"], f"{r['generation_kwh']:g}",
                        won(rev), r["note"] or ""),
            )
        # 이번 달 합계
        from datetime import datetime
        now = datetime.now()
        m_kwh = self.db.solar_month_total(now.year, now.month)
        m_rev = self.db.solar_revenue(m_kwh)
        self.month_label.config(
            text=f"이번 달 {now.month}월: {m_kwh:g} kWh / 예상수익 {won(m_rev)}원"
        )

    # ── 설정 저장 ────────────────────────────────────────────────
    def save_settings(self):
        self.db.set_setting("farm_name", self.s_farm.get().strip())
        self.db.set_setting("capacity_kw", parse_float(self.s_capacity.get()))
        self.db.set_setting("smp_price", parse_float(self.s_smp.get()))
        self.db.set_setting("rec_price", parse_float(self.s_rec.get()))
        self.db.set_setting("rec_weight", parse_float(self.s_weight.get()))
        self.refresh()
        if self.app:
            self.app.set_title_farm(self.db.get_setting("farm_name", ""))
        messagebox.showinfo("저장 완료", "발전 설비 설정을 저장했습니다.")

    def sync_to_finance(self):
        """월별 발전수익(예상)을 재무 탭에 자동 반영(중복 없이 갱신)."""
        months, total = self.db.sync_solar_revenue_to_finance()
        if months == 0:
            messagebox.showinfo("발전수익 반영",
                                "반영할 발전 기록이 없습니다.\n먼저 발전량을 입력하세요.")
            return
        if self.app:
            self.app.refresh_all()
        messagebox.showinfo(
            "발전수익 반영 완료",
            f"{months}개월의 발전 정산금(예상)을 재무에 반영했습니다.\n"
            f"합계: {won(total)}원\n\n"
            "[재무] 탭에서 '발전 정산금(자동)' 항목으로 확인할 수 있습니다.\n"
            "단가를 바꾼 뒤 다시 누르면 금액이 새로 계산됩니다.",
        )

    # ── 발전 기록 CRUD ───────────────────────────────────────────
    def save_record(self):
        date = self.r_date.get().strip()
        if not valid_date(date):
            messagebox.showwarning("입력 확인", "날짜는 YYYY-MM-DD 형식으로 입력하세요.")
            return
        kwh = parse_float(self.r_kwh.get(), default=None)
        if kwh is None or kwh < 0:
            messagebox.showwarning("입력 확인", "발전량(kWh)을 0 이상 숫자로 입력하세요.")
            return
        self.db.add_or_update_solar(date, kwh, self.r_note.get().strip())
        self.clear_form()
        self.refresh()

    def delete_record(self):
        row_id = selected_id(self.tree)
        if row_id is None:
            messagebox.showinfo("안내", "삭제할 기록을 목록에서 선택하세요.")
            return
        if messagebox.askyesno("삭제 확인", "선택한 발전 기록을 삭제할까요?"):
            self.db.delete_solar(row_id)
            self.clear_form()
            self.refresh()

    def clear_form(self):
        self.r_date.delete(0, "end")
        self.r_date.insert(0, today_str())
        self.r_kwh.delete(0, "end")
        self.r_note.delete(0, "end")
        if self.tree.selection():
            self.tree.selection_remove(self.tree.selection())

    def on_select(self, _event):
        row_id = selected_id(self.tree)
        if row_id is None or row_id not in self._cache:
            return
        r = self._cache[row_id]
        self.r_date.delete(0, "end"); self.r_date.insert(0, r["log_date"])
        self.r_kwh.delete(0, "end"); self.r_kwh.insert(0, f"{r['generation_kwh']:g}")
        self.r_note.delete(0, "end"); self.r_note.insert(0, r["note"] or "")
