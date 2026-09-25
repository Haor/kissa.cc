#!/usr/bin/env python3
"""
把单个 CJK 字形的轮廓抽成 SVG path，供 src/assets/masks.ts 里的 figure mask 使用。

一次性工具：输出结果直接 commit 进 masks.ts，构建时不依赖字体文件。
字体用 Noto Serif JP 900（SIL OFL），fontsource 按 unicode-range 拆成了
很多 woff2 分片，这里逐个分片找包含目标字符的那一个。

  python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools brotli
  cd /tmp && npm pack @fontsource/noto-serif-jp && tar xzf fontsource-noto-serif-jp-*.tgz
  /tmp/fontvenv/bin/python scripts/extract-glyph-paths.py /tmp/package/files 夢私機網縁
"""
import glob
import json
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

files_dir, chars = sys.argv[1], sys.argv[2]
weight = sys.argv[3] if len(sys.argv) > 3 else "900"
files = sorted(glob.glob(f"{files_dir}/*-{weight}-normal.woff2"))
out = {}
for ch in chars:
    cp = ord(ch)
    for f in files:
        font = TTFont(f)
        cmap = font.getBestCmap()
        if cp not in cmap:
            continue
        gs = font.getGlyphSet()
        name = cmap[cp]
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        x0, y0, x1, y1 = bp.bounds
        w, h = x1 - x0, y1 - y0
        side = max(w, h)
        # 正方形 viewBox，字形居中；y 轴翻转成 SVG 坐标
        ox = x0 - (side - w) / 2
        oy = y1 + (side - h) / 2
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        tp = TransformPen(pen, (1, 0, 0, -1, -ox, oy))
        gs[name].draw(tp)
        out[ch] = {"side": round(side, 1), "d": pen.getCommands()}
        break
    else:
        print(f"missing {ch}", file=sys.stderr)
print(json.dumps(out, ensure_ascii=False))
