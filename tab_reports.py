"""
tab_reports.py — 📊 통계 탭

연도를 선택하면 그 해의
  · 월별 수입/지출 (막대그래프)
  · 월별 발전량 추이 (꺾은선그래프)
와 연간 요약(순이익·발전수익)을 보여준다.
"""

import tkinter as tk
from tkinter import ttk
from datetime import datetime

from charts import BarChart, LineChart, won, won_short

MONTHS = [f"{m}월" for m in range(1, 13)]


class ReportsTab(ttk.Frame):
    def __init__(self, parent, db, app):
        super().__init__(parent, padding=10)
        self.db = db
        self.app = app

        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="연도", font=("", 11, "bold")).pack(side="left", padx=(2, 6))
        self.year_cb = ttk.Combobox(top, width=8, state="readonly")
        self.year_cb.pack(side="left")
        self.year_cb.bind("<<ComboboxSelected>>", lambda e: self.redraw())
        ttk.Button(top, text="새로고침", command=self.refresh).pack(side="left", padx=8)

        self.summary = ttk.Label(self, text="", font=("", 11), foreground="#333")
        self.summary.pack(fill="x", pady=8)

        self.fin_chart = BarChart(self, height=240, value_fmt=won_short)
        self.fin_chart.pack(fill="both", expand=True, pady=(0, 8))

        self.solar_chart = LineChart(self, height=220,
                                     value_fmt=lambda v: f"{v:,.0f}")
        self.solar_chart.pack(fill="both", expand=True)

        self.refresh()

    def refresh(self):
        """연도 목록을 다시 불러오고 차트를 그린다."""
        years = self.db.finance_years()
        self.year_cb["values"] = years
        if self.year_cb.get() not in years:
            self.year_cb.set(years[0])
        self.redraw()

    def redraw(self):
        year = self.year_cb.get() or datetime.now().strftime("%Y")

        # 월별 수입/지출
        monthly = self.db.finance_monthly(year)
        income = [monthly[m][0] for m in range(1, 13)]
        expense = [monthly[m][1] for m in range(1, 13)]
        self.fin_chart.set_data(
            MONTHS, [("수입", income), ("지출", expense)],
            title=f"{year}년 월별 수입 / 지출",
        )

        # 월별 발전량
        solar = self.db.solar_monthly(year)
        kwh = [solar[m] for m in range(1, 13)]
        self.solar_chart.set_data(
            MONTHS, [("발전량(kWh)", kwh)],
            title=f"{year}년 월별 발전량",
        )

        # 연간 요약
        total_income, total_expense = self.db.finance_totals(year)
        net = total_income - total_expense
        total_kwh = self.db.solar_total(year)
        solar_rev = self.db.solar_revenue(total_kwh)
        self.summary.config(
            text=(
                f"📅 {year}년 요약    "
                f"수입 {won(total_income)}원  ·  지출 {won(total_expense)}원  ·  "
                f"순이익 {won(net)}원        "
                f"☀ 발전 {total_kwh:,.0f} kWh  ·  발전수익(예상) {won(solar_rev)}원"
            )
        )
