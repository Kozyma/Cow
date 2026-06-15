"""
make_icons.py — PWA 아이콘(PNG)을 외부 라이브러리 없이 생성한다.
표준 라이브러리(zlib, struct)만으로 PNG를 직접 인코딩한다.
산출물: static/icon-192.png, icon-512.png, icon-180.png
"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "static")


def _png(path, size, pixels):
    """pixels: bytearray of RGBA (size*size*4) → PNG 파일로 저장."""
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # 필터 타입 0
        raw.extend(pixels[y * stride:(y + 1) * stride])
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8bit RGBA
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


def _blend(dst, src):
    """src(RGBA) 를 dst(RGB) 위에 알파 합성."""
    a = src[3] / 255
    return tuple(int(src[i] * a + dst[i] * (1 - a)) for i in range(3))


def make(size):
    GREEN = (47, 125, 50)
    GROUND = (27, 94, 32)
    SUN = (242, 169, 0)
    px = bytearray(size * size * 4)

    cx, cy = size * 0.5, size * 0.42
    sun_r = size * 0.17
    ray_in, ray_out = size * 0.21, size * 0.30
    hill_cx, hill_cy, hill_r = size * 0.5, size * 1.18, size * 0.78

    for y in range(size):
        for x in range(size):
            col = GREEN
            # 아래쪽 언덕(호)
            if math.hypot(x - hill_cx, y - hill_cy) <= hill_r:
                col = GROUND
            # 태양 광선(8방향 굵은 선)
            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            if ray_in <= dist <= ray_out:
                ang = (math.atan2(dy, dx) + math.pi) % (math.pi / 4)
                if ang < 0.16 or ang > (math.pi / 4 - 0.16):
                    col = _blend(col, (*SUN, 255))
            # 태양 원
            if dist <= sun_r:
                col = SUN
            i = (y * size + x) * 4
            px[i], px[i + 1], px[i + 2], px[i + 3] = col[0], col[1], col[2], 255
    return px


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (512, 192, 180):
        name = f"icon-{s}.png"
        _png(os.path.join(OUT, name), s, make(s))
        print("wrote", name)
