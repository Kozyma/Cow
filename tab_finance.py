"""
tab_finance.py — 💰 재무 탭

수입/지출 거래를 입력하고, 농축산·태양광·공통 부문별로 분류한다.
하단에 총수입·총지출·순이익이 실시간으로 표시된다.
"""

import tkinter as tk
from tkinter import ttk, messagebox

from database import FINANCE_TYPES, FINANCE_SECTORS, today_str
from charts import won
from ui_helpers import parse_int, valid_date, build_tree, selected_id


class FinanceTab(ttk.Frame):
    def __init__(self, parent, db, app):
        super().__init__(parent, padding=10)
        self.db = db
        self.app = app
        self._cache = {}

        self._build_form(self)
        self._build_list(self)
        self._build_summary(self)
        self.refresh()

    def _build_form(self, root):
        frame = ttk.LabelFrame(root, text=" 거래 입력 ", padding=8)
        frame.pack(fill="x")

        ttk.Label(frame, text="날짜").grid(row=0, column=0, padx=3, pady=3, sticky="e")
        self.f_date = ttk.Entry(frame, width=12)
        self.f_date.insert(0, today_str())
        self.f_date.grid(row=0, column=1, padx=3, pady=3)

        ttk.Label(frame, text="구분").grid(row=0, column=2, padx=3, pady=3, sticky="e")
        self.f_type = ttk.Combobox(frame, values=FINANCE_TYPES, width=8, state="readonly")
        self.f_type.current(0)
        self.f_type.grid(row=0, column=3, padx=3, pady=3)

        ttk.Label(frame, text="부문").grid(row=0, column=4, padx=3, pady=3, sticky="e")
        self.f_sector = ttk.Combobox(frame, values=FINANCE_SECTORS, width=10, state="readonly")
        self.f_sector.current(0)
        self.f_sector.grid(row=0, column=5, padx=3, pady=3)

        ttk.Label(frame, text="항목").grid(row=1, column=0, padx=3, pady=3, sticky="e")
        self.f_item = ttk.Entry(frame, width=18)
        self.f_item.grid(row=1, column=1, columnspan=2, padx=3, pady=3, sticky="we")

        ttk.Label(frame, text="금액(원)").grid(row=1, column=3, padx=3, pady=3, sticky="e")
        self.f_amount = ttk.Entry(frame, width=14)
        self.f_amount.grid(row=1, column=4, padx=3, pady=3)

        ttk.Label(frame, text="메모").grid(row=2, column=0, padx=3, pady=3, sticky="e")
        self.f_note = ttk.Entry(frame, width=40)
        self.f_note.grid(row=2, column=1, columnspan=5, padx=3, pady=3, sticky="we")
        frame.columnconfigure(5, weight=1)

        btns = ttk.Frame(root)
        btns.pack(fill="x", pady=4)
        ttk.Button(btns, text="추가", command=self.add_tx).pack(side="left", padx=2)
        ttk.Button(btns, text="수정", command=self.update_tx).pack(side="left", padx=2)
        ttk.Button(btns, text="삭제", command=self.delete_tx).pack(side="left", padx=2)
        ttk.Button(btns, text="입력 초기화", command=self.clear_form).pack(side="left", padx=2)

    def _build_list(self, root):
        cols = [
            ("tx_date", "날짜", 95, "center"),
            ("tx_type", "구분", 55, "center"),
            ("sector", "부문", 70, "center"),
            ("item", "항목", 160, "w"),
            ("amount", "금액(원)", 120, "e"),
            ("note", "메모", 200, "w"),
        ]
        tree_frame, self.tree = build_tree(root, cols, height=11)
        tree_frame.pack(fill="both", expand=True, pady=(4, 0))
        self.tree.tag_configure("income", foreground="#1E7E34")   # 수입: 초록
        self.tree.tag_configure("expense", foreground="#C0392B")  # 지출: 빨강
        self.tree.bind("<<TreeviewSelect>>", self.on_select)

    def _build_summary(self, root):
        bar = ttk.Frame(root, padding=(0, 6))
        bar.pack(fill="x")
        self.sum_income = ttk.Label(bar, text="총수입 0원", foreground="#1E7E34",
                                    font=("", 11, "bold"))
        self.sum_income.pack(side="left", padx=12)
        self.sum_expense = ttk.Label(bar, text="총지출 0원", foreground="#C0392B",
                                     font=("", 11, "bold"))
        self.sum_expense.pack(side="left", padx=12)
        self.sum_net = ttk.Label(bar, text="순이익 0원", foreground="#2E86C1",
                                 font=("", 11, "bold"))
        self.sum_net.pack(side="left", padx=12)

    # ── 새로고침 ─────────────────────────────────────────────────
    def refresh(self):
        self.tree.delete(*self.tree.get_children())
        self._cache.clear()
        for r in self.db.list_finance():
            self._cache[r["id"]] = r
            tag = "income" if r["tx_type"] == "수입" else "expense"
            sign = "+" if r["tx_type"] == "수입" else "-"
            self.tree.insert(
                "", "end", iid=str(r["id"]),
                values=(r["tx_date"], r["tx_type"], r["sector"], r["item"],
                        f"{sign}{won(r['amount'])}", r["note"] or ""),
                tags=(tag,),
            )
        income, expense = self.db.finance_totals()
        self.sum_income.config(text=f"총수입 {won(income)}원")
        self.sum_expense.config(text=f"총지출 {won(expense)}원")
        net = income - expense
        self.sum_net.config(text=f"순이익 {won(net)}원",
                            foreground="#2E86C1" if net >= 0 else "#C0392B")

    # ── CRUD ─────────────────────────────────────────────────────
    def _read_form(self):
        date = self.f_date.get().strip()
        if not valid_date(date):
            messagebox.showwarning("입력 확인", "날짜는 YYYY-MM-DD 형식으로 입력하세요.")
            return None
        item = self.f_item.get().strip()
        if not item:
            messagebox.showwarning("입력 확인", "항목명을 입력하세요.")
            return None
        amount = parse_int(self.f_amount.get())
        if amount <= 0:
            messagebox.showwarning("입력 확인", "금액을 0보다 큰 숫자로 입력하세요.")
            return None
        return dict(
            tx_date=date,
            tx_type=self.f_type.get(),
            sector=self.f_sector.get(),
            item=item,
            amount=amount,
            note=self.f_note.get().strip(),
        )

    def add_tx(self):
        data = self._read_form()
        if not data:
            return
        self.db.add_finance(**data)
        self.clear_form()
        self.refresh()

    def update_tx(self):
        row_id = selected_id(self.tree)
        if row_id is None:
            messagebox.showinfo("안내", "수정할 거래를 목록에서 선택하세요.")
            return
        data = self._read_form()
        if not data:
            return
        self.db.update_finance(row_id, **data)
        self.refresh()

    def delete_tx(self):
        row_id = selected_id(self.tree)
        if row_id is None:
            messagebox.showinfo("안내", "삭제할 거래를 목록에서 선택하세요.")
            return
        if messagebox.askyesno("삭제 확인", "선택한 거래를 삭제할까요?"):
            self.db.delete_finance(row_id)
            self.clear_form()
            self.refresh()

    def clear_form(self):
        self.f_date.delete(0, "end")
        self.f_date.insert(0, today_str())
        self.f_type.current(0)
        self.f_sector.current(0)
        self.f_item.delete(0, "end")
        self.f_amount.delete(0, "end")
        self.f_note.delete(0, "end")
        if self.tree.selection():
            self.tree.selection_remove(self.tree.selection())

    def on_select(self, _event):
        row_id = selected_id(self.tree)
        if row_id is None or row_id not in self._cache:
            return
        r = self._cache[row_id]
        self.f_date.delete(0, "end"); self.f_date.insert(0, r["tx_date"])
        self.f_type.set(r["tx_type"])
        self.f_sector.set(r["sector"])
        self.f_item.delete(0, "end"); self.f_item.insert(0, r["item"])
        self.f_amount.delete(0, "end"); self.f_amount.insert(0, str(r["amount"]))
        self.f_note.delete(0, "end"); self.f_note.insert(0, r["note"] or "")
