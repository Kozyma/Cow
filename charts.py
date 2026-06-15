"""
charts.py — 외부 라이브러리 없이 tkinter Canvas로 그리는 차트 위젯.

matplotlib 같은 설치형 라이브러리 대신 순수 Canvas로 막대/꺾은선 그래프를
그린다. 창 크기에 맞춰 자동으로 다시 그려진다(<Configure> 바인딩).

공통 통화/숫자 포맷 헬퍼(won, won_short)도 여기서 제공한다.
"""

import math
import platform
import tkinter as tk

# 운영체제별 한글 표시 폰트
if platform.system() == "Darwin":
    KFONT = "AppleGothic"
elif platform.system() == "Windows":
    KFONT = "Malgun Gothic"
else:
    KFONT = "DejaVu Sans"

# 차트 색상표 (농업 그린 → 태양 옐로 → 블루 → 레드 → 퍼플)
PALETTE = ["#4C9A2A", "#F2A900", "#2E86C1", "#C0392B", "#8E44AD", "#16A085"]


# ── 숫자/통화 포맷 헬퍼 (여러 탭에서 공용) ───────────────────────────
def won(value):
    """1240000 -> '1,240,000' (천단위 콤마)."""
    try:
        return f"{int(round(float(value))):,}"
    except (TypeError, ValueError):
        return "0"


def won_short(value):
    """금액을 짧게: 1,240,000 -> '124만', 230000000 -> '2.3억'."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "0"
    sign = "-" if v < 0 else ""
    v = abs(v)
    if v >= 1e8:
        return f"{sign}{v / 1e8:.1f}억"
    if v >= 1e4:
        return f"{sign}{v / 1e4:.0f}만"
    return f"{sign}{v:.0f}"


def _nice_ceil(value):
    """축 최대값을 보기 좋은 값으로 올림. 4321 -> 5000."""
    if value <= 0:
        return 1
    exp = math.floor(math.log10(value))
    base = 10 ** exp
    for m in (1, 2, 2.5, 5, 10):
        if value <= m * base:
            return m * base
    return 10 * base


class _ChartBase(tk.Frame):
    """제목/범례/여백 등 막대·꺾은선 공통 로직."""

    def __init__(self, parent, height=260, value_fmt=None, **kw):
        super().__init__(parent, **kw)
        self.value_fmt = value_fmt or (lambda v: f"{v:,.0f}")
        self.canvas = tk.Canvas(
            self, height=height, bg="white", highlightthickness=0
        )
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda e: self._redraw())
        self._labels = []
        self._series = []          # [(name, color, [values])]
        self._title = ""

    def set_data(self, labels, series, title=""):
        """labels: x축 라벨 리스트, series: [(이름, [값...]), ...]"""
        self._labels = list(labels)
        self._series = [
            (name, PALETTE[i % len(PALETTE)], list(vals))
            for i, (name, vals) in enumerate(series)
        ]
        self._title = title
        self._redraw()

    # 하위 클래스가 plot 영역을 받아 실제 그림을 그린다.
    def _draw_plot(self, c, x0, y0, plot_w, plot_h, vmax):
        raise NotImplementedError

    def _redraw(self):
        c = self.canvas
        c.delete("all")
        W, H = c.winfo_width(), c.winfo_height()
        if W < 30 or H < 30:
            return

        if self._title:
            c.create_text(W // 2, 14, text=self._title,
                          font=(KFONT, 11, "bold"), fill="#333")

        if not self._labels or not self._series:
            c.create_text(W // 2, H // 2, text="데이터가 없습니다",
                          fill="#aaa", font=(KFONT, 10))
            return

        # 범례 (제목 아래)
        legend_y = 30
        lx = 70
        for name, color, _ in self._series:
            c.create_rectangle(lx, legend_y - 5, lx + 12, legend_y + 5,
                               fill=color, outline="")
            c.create_text(lx + 16, legend_y, text=name, anchor="w",
                          font=(KFONT, 9), fill="#444")
            lx += 22 + len(name) * 9 + 16

        pad_l, pad_r, pad_t, pad_b = 58, 18, 46, 38
        plot_w = W - pad_l - pad_r
        plot_h = H - pad_t - pad_b
        if plot_w < 10 or plot_h < 10:
            return
        x0, y0 = pad_l, H - pad_b

        # y축 최대값 + 눈금/격자 (5단계)
        all_vals = [v for _, _, vals in self._series for v in vals]
        vmax = _nice_ceil(max(all_vals)) if all_vals and max(all_vals) > 0 else 1
        for i in range(6):
            val = vmax * i / 5
            y = y0 - plot_h * i / 5
            c.create_line(x0, y, x0 + plot_w, y, fill="#eee")
            c.create_text(x0 - 6, y, text=self.value_fmt(val), anchor="e",
                          font=(KFONT, 8), fill="#888")
        c.create_line(x0, y0, x0 + plot_w, y0, fill="#999")  # x축

        self._draw_plot(c, x0, y0, plot_w, plot_h, vmax)


class BarChart(_ChartBase):
    """그룹 막대그래프 (시리즈 여러 개를 나란히)."""

    def _draw_plot(self, c, x0, y0, plot_w, plot_h, vmax):
        n_groups = len(self._labels)
        n_series = len(self._series)
        group_w = plot_w / n_groups
        bar_w = group_w * 0.72 / n_series

        for gi, label in enumerate(self._labels):
            gx = x0 + group_w * gi + group_w * 0.14
            for si, (_, color, vals) in enumerate(self._series):
                v = vals[gi] if gi < len(vals) else 0
                bh = plot_h * (v / vmax) if vmax else 0
                bx = gx + bar_w * si
                if bh > 0:
                    c.create_rectangle(bx, y0 - bh, bx + bar_w, y0,
                                       fill=color, outline="")
            c.create_text(x0 + group_w * gi + group_w / 2, y0 + 13,
                          text=label, font=(KFONT, 8), fill="#555")


class LineChart(_ChartBase):
    """꺾은선 그래프 (추이 표시용). 점 + 선."""

    def _draw_plot(self, c, x0, y0, plot_w, plot_h, vmax):
        n = len(self._labels)
        step = plot_w / max(n - 1, 1)

        # x축 라벨은 너무 빽빽하지 않게 일부만 표시
        label_every = max(1, n // 12)
        for gi, label in enumerate(self._labels):
            if gi % label_every == 0:
                x = x0 + step * gi
                c.create_text(x, y0 + 13, text=label,
                              font=(KFONT, 8), fill="#555")

        for _, color, vals in self._series:
            points = []
            for gi in range(n):
                v = vals[gi] if gi < len(vals) else 0
                x = x0 + step * gi
                y = y0 - plot_h * (v / vmax) if vmax else y0
                points.append((x, y))
            if len(points) >= 2:
                flat = [coord for xy in points for coord in xy]
                c.create_line(*flat, fill=color, width=2, smooth=True)
            for (x, y) in points:
                c.create_oval(x - 3, y - 3, x + 3, y + 3,
                              fill=color, outline="white")
