#!/usr/bin/env python3
"""PWA用アイコンを標準ライブラリだけで生成する（炎モチーフ）。"""
import os
import struct
import zlib

BG = (22, 18, 14)        # --bg
EMBER = (255, 122, 47)   # --ember
EMBER_DIM = (184, 90, 36)  # --ember-dim
CORE = (255, 214, 170)   # 炎の芯


def make_icon(size):
    px = [[BG for _ in range(size)] for _ in range(size)]
    cx = size / 2

    # 炎: 縦に細長い雫を3枚重ねる（外炎・中炎・芯）
    layers = [
        (0.30, 0.16, 0.92, EMBER_DIM),
        (0.22, 0.28, 0.90, EMBER),
        (0.11, 0.50, 0.86, CORE),
    ]
    for half_w, top, bottom, color in layers:
        w = half_w * size
        y0, y1 = top * size, bottom * size
        h = y1 - y0
        for y in range(int(y0), int(y1)):
            t = min(1.0, max(0.0, (y - y0) / h))  # 0=先端 1=根本
            # 先端は細く、根本は丸く膨らむ
            width = w * (t ** 0.62)
            # 根本を円で閉じる
            if t > 0.72:
                s = min(1.0, max(0.0, (t - 0.72) / 0.28))
                width = w * max(0.0, 1 - s * s) ** 0.5
            for x in range(int(cx - width), int(cx + width) + 1):
                if 0 <= x < size:
                    px[y][x] = color

    return px


def write_png(path, px):
    size = len(px)
    raw = b''.join(b'\x00' + b''.join(struct.pack('BBB', *px[y][x]) for x in range(size))
                   for y in range(size))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
    os.makedirs(out, exist_ok=True)
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
        write_png(os.path.join(out, name), make_icon(size))
        print('wrote', name, size)


if __name__ == '__main__':
    main()
