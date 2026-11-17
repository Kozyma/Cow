"""
shop_art.py — 상품 사진이 없을 때 쓰는 기본 그림(SVG)

부위에 맞는 모양과 등급에 맞는 마블링을 그려서 돌려준다.
실제 사진을 올리면 사진이 대신 표시된다.
"""
import math
import random

KINDS = ("steak", "tender", "slices", "cubes", "ribs", "bones", "gift")
CUT_KIND = {
    "등심": "steak", "채끝": "steak", "살치살": "steak", "기타": "steak",
    "안심": "tender",
    "불고기": "slices", "우둔": "slices", "설도": "slices", "앞다리": "slices", "목심": "slices",
    "국거리": "cubes", "양지": "cubes", "사태": "cubes",
    "갈비": "ribs", "사골·잡뼈": "bones", "선물세트": "gift",
}
GRADE_MARBLE = {"1++": 3, "1+": 2, "1": 1}

# 마블링 굵기·양: 노이즈 값의 어느 구간을 흰 지방으로 칠할지 정하는 표
_TABLES = {
    0: "0 0 0 0 0 .35 0 0 0 0 0",
    1: "0 0 0 0 0 .75 0 0 0 0 0",
    2: "0 0 0 .7 0 0 .85 0 0 0 0",
    3: "0 0 .6 0 .9 0 .9 0 .7 0 0",
}


def kind_for(cut):
    return CUT_KIND.get(cut, "steak")


def _blob(rnd, cx, cy, rx, ry, n=9, jit=0.13, rot=0.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        k = 1 + rnd.uniform(-jit, jit)
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot),
                    cy + x * math.sin(rot) + y * math.cos(rot)))
    d = ""
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        if i == 0:
            d += f"M{p1[0]:.1f},{p1[1]:.1f}"
        d += f"C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + "Z"


def _meat(paths, marble, seed, uid, thick=12, fat=True, freq="0.011 0.034"):
    """고기 조각들(paths)을 두께·마블링·지방 테두리와 함께 그린다."""
    out = [f'<g transform="translate(0,{thick})">']
    out += [f'<path d="{d}" fill="#6f1119"/>' for d in paths]
    out.append("</g>")
    for i, d in enumerate(paths):
        cid = f"c{uid}{i}"
        out.append(f'<clipPath id="{cid}"><path d="{d}"/></clipPath>')
        out.append(f'<path d="{d}" fill="url(#mg)"/>')
        out.append(f'<g clip-path="url(#{cid})">'
                   f'<rect width="600" height="600" fill="#fff" filter="url(#mb)" '
                   f'transform="rotate({(seed * 37 + i * 23) % 50 - 25} 300 300)"/>'
                   f'<path d="{d}" fill="none" stroke="#5c0d14" stroke-opacity=".28" stroke-width="10"/>'
                   "</g>")
        if fat:
            out.append(f'<path d="{d}" fill="none" stroke="#f4e6d4" stroke-width="7" '
                       f'stroke-linecap="round" stroke-dasharray="{150 + i * 30} 2000" '
                       f'stroke-dashoffset="{-(seed * 53 + i * 90) % 300}"/>')
    defs = (f'<filter id="mb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
            f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" seed="{seed}"/>'
            '<feColorMatrix values="0 0 0 0 1  0 0 0 0 .93  0 0 0 0 .86  1 0 0 0 0"/>'
            f'<feComponentTransfer><feFuncA type="table" tableValues="{_TABLES[marble]}"/>'
            "</feComponentTransfer><feGaussianBlur stdDeviation=\".6\"/></filter>")
    return defs + "".join(out)


def _garnish(rnd, x, y, rot):
    """로즈메리 한 줄기와 통후추 몇 알."""
    g = [f'<g transform="translate({x},{y}) rotate({rot})">',
         '<path d="M0,0 Q40,-8 96,4" fill="none" stroke="#3c5a2c" stroke-width="3" stroke-linecap="round"/>']
    for i in range(9):
        t = 8 + i * 10
        g.append(f'<path d="M{t},{-1 + i * .4:.1f} l8,-13 M{t + 3},{0 + i * .4:.1f} l9,11" '
                 'stroke="#55793c" stroke-width="3.2" stroke-linecap="round"/>')
    g.append("</g>")
    for _ in range(5):
        px, py = x + rnd.uniform(-40, 110), y + rnd.uniform(-46, 46)
        g.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="4.2" fill="#1c1410"/>')
    return "".join(g)


def _bone(x, y, w, rot):
    return (f'<g transform="translate({x},{y}) rotate({rot})">'
            f'<g transform="translate(0,10)" fill="#b9a688"><rect x="0" y="-22" width="{w}" height="44" rx="20"/>'
            f'<circle cx="0" cy="-16" r="26"/><circle cx="0" cy="16" r="26"/></g>'
            f'<rect x="0" y="-22" width="{w}" height="44" rx="20" fill="#f1e6d2"/>'
            f'<circle cx="0" cy="-16" r="26" fill="#f1e6d2"/><circle cx="0" cy="16" r="26" fill="#f1e6d2"/>'
            f'<ellipse cx="{w}" cy="0" rx="20" ry="24" fill="#e2d2b6"/>'
            f'<ellipse cx="{w}" cy="0" rx="11" ry="14" fill="#b8545a"/>'
            f'<rect x="20" y="-12" width="{w - 50}" height="6" rx="3" fill="#fff" opacity=".6"/></g>')


def _gift():
    """보자기로 싼 선물 상자."""
    return ('<ellipse cx="300" cy="500" rx="210" ry="26" fill="#000" opacity=".16" filter="url(#sh)"/>'
            '<path d="M120,250 L480,250 L466,490 L134,490Z" fill="#8f0d22"/>'
            '<path d="M120,250 L480,250 L474,300 L126,300Z" fill="#000" opacity=".16"/>'
            '<path d="M104,196 L496,196 L496,262 L104,262Z" fill="#c8102e"/>'
            '<path d="M104,196 L496,196 L496,208 L104,208Z" fill="#fff" opacity=".16"/>'
            '<path d="M276,196 h48 v294 h-48Z" fill="#e2bd74"/>'
            '<path d="M276,262 h48 v38 h-48Z" fill="#000" opacity=".14"/>'
            '<path d="M300,190 C230,96 150,120 176,176 C190,206 262,200 300,190Z" fill="#e2bd74"/>'
            '<path d="M300,190 C370,96 450,120 424,176 C410,206 338,200 300,190Z" fill="#d3a85a"/>'
            '<path d="M300,190 C262,150 214,146 208,170 C204,186 266,190 300,190Z" fill="#b98c3f"/>'
            '<path d="M300,190 C338,150 386,146 392,170 C396,186 334,190 300,190Z" fill="#a67b32"/>'
            '<rect x="278" y="170" width="44" height="40" rx="9" fill="#efd08f"/>'
            '<rect x="160" y="380" width="92" height="66" rx="4" fill="#fff"/>'
            '<path d="M172,398 h68 M172,412 h44 M172,426 h56" stroke="#111" stroke-width="5"/>')


def render(kind="steak", seed=1, marble=2, bg="#f1eee9"):
    """600×600 SVG 문자열."""
    if kind not in KINDS:
        kind = "steak"
    marble = max(0, min(3, marble))
    rnd = random.Random(seed * 7919 + KINDS.index(kind))
    head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">'
            '<defs><radialGradient id="mg" cx="45%" cy="40%" r="75%">'
            '<stop offset="0" stop-color="#d23a44"/><stop offset="1" stop-color="#a51826"/></radialGradient>'
            '<radialGradient id="pl" cx="50%" cy="42%" r="60%">'
            '<stop offset="0" stop-color="#3a3836"/><stop offset=".86" stop-color="#232221"/>'
            '<stop offset="1" stop-color="#3d3b39"/></radialGradient>'
            '<filter id="sh" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>'
            f'</defs><rect width="600" height="600" fill="{bg}"/>')
    if kind == "gift":
        return head + _gift() + "</svg>"
    body = ['<ellipse cx="300" cy="330" rx="262" ry="250" fill="#000" opacity=".2" filter="url(#sh)"/>',
            '<circle cx="300" cy="300" r="258" fill="url(#pl)"/>',
            '<circle cx="300" cy="300" r="226" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="2"/>']
    rot = rnd.uniform(-.35, .35)
    if kind == "steak":
        paths = [_blob(rnd, 292, 290, 172, 122, n=10, jit=.14, rot=rot)]
        body.append(_meat(paths, marble, seed, "s", thick=14))
        body.append(_garnish(rnd, 372, 448, -18))
    elif kind == "tender":
        paths = [_blob(rnd, 222, 268, 96, 90, n=8, jit=.07), _blob(rnd, 384, 338, 92, 88, n=8, jit=.07)]
        body.append(_meat(paths, min(marble, 2), seed, "t", thick=24, fat=False))
        body.append(_garnish(rnd, 330, 166, 12))
    elif kind == "slices":
        paths = [_blob(rnd, 196 + i * 52, 250 + i * 24, 138, 52, n=9, jit=.1, rot=-.5) for i in range(5)]
        body.append(_meat(paths, marble, seed, "l", thick=4, freq="0.014 0.03"))
    elif kind == "cubes":
        spots = [(210, 220), (330, 196), (424, 280), (248, 330), (360, 344), (176, 320), (300, 430)]
        paths = [_blob(rnd, x, y, 58, 50, n=7, jit=.1, rot=rnd.uniform(0, 3)) for x, y in spots]
        body.append(_meat(paths, min(marble, 2), seed, "u", thick=20, fat=False, freq="0.02 0.04"))
    elif kind == "ribs":
        paths, bones = [], []
        for i in range(3):
            y = 196 + i * 104
            paths.append(_blob(rnd, 318, y, 152, 44, n=10, jit=.08, rot=-.06))
            bones.append(f'<ellipse cx="166" cy="{y + 8}" rx="30" ry="36" fill="#f1e6d2"/>'
                         f'<ellipse cx="166" cy="{y + 8}" rx="14" ry="18" fill="#d9c7a8"/>')
        body.append(_meat(paths, marble, seed, "r", thick=18))
        body += bones
    elif kind == "bones":
        body += [_bone(170, 214, 240, 8), _bone(190, 318, 250, -6), _bone(168, 418, 230, 4)]
    return head + "".join(body) + "</svg>"
