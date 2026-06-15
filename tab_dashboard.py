"""
tab_dashboard.py — 🏠 통합 대시보드

영농형 태양광 농장의 핵심 지표를 한 화면에 모은다.
  · 요약 카드 4개: 진행중 품목 / 이번달 발전량 / 이번달 발전수익 / 올해 순이익
  · 최근 발전량 추이 (꺾은선)
  · 농축산 현황 요약
'새로고침'을 누르거나 탭을 다시 열면 최신 데이터로 갱신된다.
"""

import tkinter as tk
from tkinter import ttk
from datetime import datetime

from charts import LineChart, KFONT, won


class DashboardTab(ttk.Frame):
    def __init__(self, parent, db, app):
        super().__init__(parent, padding=12)
        self.db = db
        self.app = app

        # 상단: 농장명 + 새로고침
        head = ttk.Frame(self)
        head.pack(fill="x")
        self.title_label = ttk.Label(head, text="", font=(KFONT, 15, "bold"))
        self.title_label.pack(side="left")
        ttk.Button(head, text="새로고침", command=self.refresh).pack(side="right")

        # 요약 카드 4개
        cards = ttk.Frame(self)
        cards.pack(fill="x", pady=12)
        for i in range(4):
            cards.columnconfigure(i, weight=1)
        self.card_live = self._make_card(cards, 0, "진행중 품목", "#E8F5E9", "#2E7D32")
        self.card_kwh = self._make_card(cards, 1, "이번 달 발전량", "#FFF8E1", "#F57F17")
        self.card_rev = self._make_card(cards, 2, "이번 달 발전수익", "#FFF3E0", "#E65100")
        self.card_net = self._make_card(cards, 3, "올해 순이익", "#E3F2FD", "#1565C0")

        # 최근 발전량 추이
        ttk.Label(self, text="최근 발전량 추이", font=(KFONT, 11, "bold"))\
            .pack(anchor="w", pady=(6, 2))
        self.solar_chart = LineChart(self, height=200,
                                     value_fmt=lambda v: f"{v:,.0f}")
        self.solar_chart.pack(fill="both", expand=True)

        # 농축산 현황
        status = ttk.LabelFrame(self, text=" 농축산 현황 ", padding=10)
        status.pack(fill="x", pady=(10, 0))
        self.farm_status = ttk.Label(status, text="", font=(KFONT, 11),
                                     justify="left")
        self.farm_status.pack(anchor="w")

        self.refresh()

    def _make_card(self, parent, col, title, bg, fg):
        card = tk.Frame(parent, bg=bg, padx=14, pady=12)
        card.grid(row=0, column=col, padx=5, sticky="nsew")
        tk.Label(card, text=title, bg=bg, fg=fg, font=(KFONT, 10)).pack(anchor="w")
        value = tk.Label(card, text="-", bg=bg, fg=fg, font=(KFONT, 17, "bold"))
        value.pack(anchor="w", pady=(6, 0))
        return value

    def refresh(self):
        now = datetime.now()
        year, month = now.year, now.month

        # 농장명 제목
        farm = self.db.get_setting("farm_name", "") or "영농형 태양광 농장"
        self.title_label.config(text=f"🌱☀  {farm} 대시보드")

        # 카드 1: 진행중 품목
        active, by_cat = self.db.livestock_summary()
        self.card_live.config(text=f"{active} 건")

        # 카드 2, 3: 이번 달 발전량 / 수익
        m_kwh = self.db.solar_month_total(year, month)
        self.card_kwh.config(text=f"{m_kwh:,.0f} kWh")
        self.card_rev.config(text=f"{won(self.db.solar_revenue(m_kwh))} 원")

        # 카드 4: 올해 순이익
        income, expense = self.db.finance_totals(year)
        self.card_net.config(text=f"{won(income - expense)} 원")

        # 최근 발전량 추이 (최근 14건, 날짜 오름차순)
        rows = list(self.db.list_solar(limit=14))[::-1]
        if rows:
            labels = [r["log_date"][5:] for r in rows]   # MM-DD
            values = [r["generation_kwh"] for r in rows]
            self.solar_chart.set_data(labels, [("발전량(kWh)", values)])
        else:
            self.solar_chart.set_data([], [])

        # 농축산 현황 요약
        if by_cat:
            parts = []
            for c in by_cat:
                q = f"{c['q']:g}" if c["q"] else "-"
                parts.append(f"· {c['category']}  {c['c']}종 / 수량 {q}")
            text = "\n".join(parts)
        else:
            text = "등록된 사육·재배 품목이 없습니다.  [농축산] 탭에서 추가해 보세요."
        self.farm_status.config(text=text)
