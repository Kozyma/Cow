"""
web_charts.py — 외부 라이브러리 없이 서버에서 SVG로 그리는 차트.

데스크톱판 charts.py(tkinter Canvas)를 웹용으로 옮긴 것이다.
SVG 문자열을 그대로 HTML에 끼워 넣으므로 자바스크립트/CDN이 필요 없고
휴대폰에서도(오프라인 PWA 포함) 동일하게 보인다.

통화/숫자 포맷 헬퍼(won, won_short)도 여기서 제공한다.
(charts.py 는 tkinter 를 import 하므로 헤드리스 웹 서버에서 쓸 수 없어
 동일한 헬퍼를 여기 다시 둔다.)
"""

import html
import math

# 화면(style.css)과 맞춘 모노크롬(흑백 명도) 팔레트
#   수입=블랙 / 지출=그레이, 발전=블랙 — 색 대신 명도로 구분
INCOME = "#16181d"
EXPENSE = "#9aa0a6"
SOLAR = "#16181d"
GOLD = "#6b7280"
PALETTE = [SOLAR, GOLD, "#9aa0a6", "#c4c8cc", "#454b50", "#b6bbbf"]


# ── 숫자/통화 포맷 헬퍼 (여러 화면에서 공용) ─────────────────────────
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


def _esc(text):
    return html.escape(str(text), quote=True)


def _axis_fmt(value, money):
    return won_short(value) if money else f"{value:,.0f}"


# 차트 공통 레이아웃(뷰박스 좌표). CSS로 width:100% 처리하여 반응형.
_W, _H = 720, 280
_PAD_R, _PAD_T, _PAD_B = 16, 22, 34
_AXIS = "#9aa0a6"      # 축 라벨
_GRID = "#f1f2f1"      # 격자
_INK = "#454b50"       # 범례 텍스트


def _colors_for(series, colors):
    if colors:
        return [colors[i % len(colors)] for i in range(len(series))]
    return [PALETTE[i % len(PALETTE)] for i in range(len(series))]


def _frame(labels, series, money, colors, has_legend):
    """범례·격자·y축을 그리고 (svg조각들, 좌표) 반환."""
    cols = _colors_for(series, colors)
    parts = [
        f'<svg class="chart" viewBox="0 0 {_W} {_H}" '
        f'preserveAspectRatio="xMidYMid meet" role="img" '
        f'xmlns="http://www.w3.org/2000/svg">'
    ]

    has_data = labels and series and any(any(vals) for _, vals in series)
    if not has_data:
        parts.append(
            f'<text x="{_W/2:.0f}" y="{_H/2:.0f}" text-anchor="middle" '
            f'font-size="14" fill="#b6bbbf">기록이 없습니다</text></svg>'
        )
        return "".join(parts), None, cols

    pad_t = _PAD_T
    if has_legend and len(series) > 1:
        lx = 4
        for i, (name, _v) in enumerate(series):
            parts.append(
                f'<circle cx="{lx+5}" cy="12" r="5" fill="{cols[i]}"/>'
            )
            parts.append(
                f'<text x="{lx+15}" y="16" font-size="12.5" fill="{_INK}">{_esc(name)}</text>'
            )
            lx += 24 + len(str(name)) * 9 + 14
        pad_t = _PAD_T + 12

    # y축 라벨 폭은 값 길이에 맞춰 살짝 확보
    pad_l = 52 if money else 44
    plot_w = _W - pad_l - _PAD_R
    plot_h = _H - pad_t - _PAD_B
    x0, y0 = pad_l, _H - _PAD_B

    all_vals = [v for _, vals in series for v in vals]
    vmax = _nice_ceil(max(all_vals)) if all_vals and max(all_vals) > 0 else 1
    for i in range(5):
        val = vmax * i / 4
        y = y0 - plot_h * i / 4
        parts.append(
            f'<line x1="{x0}" y1="{y:.1f}" x2="{x0+plot_w}" y2="{y:.1f}" '
            f'stroke="{_GRID}"/>'
        )
        parts.append(
            f'<text x="{x0-8}" y="{y+4:.1f}" text-anchor="end" '
            f'font-size="11" fill="{_AXIS}">{_esc(_axis_fmt(val, money))}</text>'
        )
    return parts, (x0, y0, plot_w, plot_h, vmax), cols


def bar_chart(labels, series, money=False, colors=None):
    """그룹 막대그래프. series=[(이름,[값...]), ...] → SVG 문자열."""
    parts, geom, cols = _frame(labels, series, money, colors, has_legend=True)
    if geom is None:
        return parts
    x0, y0, plot_w, plot_h, vmax = geom

    n_groups = len(labels)
    n_series = len(series)
    group_w = plot_w / max(n_groups, 1)
    inner = group_w * 0.62
    bar_w = inner / max(n_series, 1)
    r = min(bar_w / 2, 4)

    for gi, label in enumerate(labels):
        gx = x0 + group_w * gi + (group_w - inner) / 2
        for si, (_name, vals) in enumerate(series):
            v = vals[gi] if gi < len(vals) else 0
            bh = plot_h * (v / vmax) if vmax else 0
            bx = gx + bar_w * si
            if bh > 0:
                rr = min(r, bh)
                parts.append(
                    f'<rect x="{bx:.1f}" y="{y0-bh:.1f}" width="{bar_w-1.5:.1f}" '
                    f'height="{bh:.1f}" rx="{rr:.1f}" fill="{cols[si]}"/>'
                )
        cx = x0 + group_w * gi + group_w / 2
        parts.append(
            f'<text x="{cx:.1f}" y="{y0+15:.0f}" text-anchor="middle" '
            f'font-size="11" fill="{_AXIS}">{_esc(label)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def line_chart(labels, series, money=False, colors=None):
    """꺾은선 그래프(추이) — 면적 채움 + 부드러운 선. → SVG 문자열."""
    parts, geom, cols = _frame(labels, series, money, colors, has_legend=False)
    if geom is None:
        return parts
    x0, y0, plot_w, plot_h, vmax = geom

    n = len(labels)
    step = plot_w / max(n - 1, 1)
    label_every = max(1, n // 8)
    for gi, label in enumerate(labels):
        if gi % label_every == 0 or gi == n - 1:
            x = x0 + step * gi
            parts.append(
                f'<text x="{x:.1f}" y="{y0+15:.0f}" text-anchor="middle" '
                f'font-size="11" fill="{_AXIS}">{_esc(label)}</text>'
            )

    for si, (_name, vals) in enumerate(series):
        color = cols[si]
        points = []
        for gi in range(n):
            v = vals[gi] if gi < len(vals) else 0
            x = x0 + step * gi
            y = y0 - plot_h * (v / vmax) if vmax else y0
            points.append((x, y))
        if len(points) >= 2:
            line_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in points)
            # 면적 채움(아주 옅게)
            area_d = (line_d + f" L{points[-1][0]:.1f},{y0:.1f}"
                      f" L{points[0][0]:.1f},{y0:.1f} Z")
            parts.append(f'<path d="{area_d}" fill="{color}" fill-opacity="0.07"/>')
            parts.append(
                f'<path d="{line_d}" fill="none" stroke="{color}" '
                f'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'
            )
        # 끝점만 강조(점이 너무 많으면 지저분)
        if points:
            ex, ey = points[-1]
            parts.append(
                f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="4" '
                f'fill="{color}" stroke="white" stroke-width="2"/>'
            )
    parts.append("</svg>")
    return "".join(parts)
