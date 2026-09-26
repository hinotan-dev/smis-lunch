"""生成 SMIS 午餐 app 的全套图标（方角全出血，圆角交给 OS）。
版式取自课表 app 实测值（512 基准）：
  横杠 宽 0.438S / 高 0.0547S / 顶边 0.725S / 全圆角
  文字底边 0.561S，宽 0.800S，Archivo 700
"""
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ARCHIVO = "/tmp/claude-0/archivo.ttf"
OUT = "/home/claude/build/pkg/assets"

BG = "#FFF0C2"
FG = "#3A2A12"
BAR = "#F2A900"

BAR_W, BAR_H, BAR_TOP = 0.438, 0.0547, 0.725
TEXT_BOTTOM, TEXT_W = 0.561, 0.800
TEXT = "LUNCH"


def hexrgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5)) + (255,)


def design(S, d, scale=1.0, dy=0.0):
    """把版式画进一个 S×S 的画布；scale/dy 供 maskable 缩进用（围绕内容中心）。"""
    cx, cy = S / 2, S / 2

    def mapx(x):
        return cx + (x - 0.5) * S * scale

    def mapy(y):
        return cy + (y - 0.5) * S * scale + dy * S

    def fit(target):
        lo, hi = 10, S * 3
        while hi - lo > 1:
            mid = (lo + hi) // 2
            bb = d.textbbox((0, 0), TEXT, font=ImageFont.truetype(ARCHIVO, mid))
            if bb[2] - bb[0] > target:
                hi = mid
            else:
                lo = mid
        return lo

    target = TEXT_W * S * scale
    px = fit(target)
    probe = Image.new("L", (S * 2, S * 2), 0)
    ImageDraw.Draw(probe).text(
        (S * 0.1, S * 0.1), TEXT, font=ImageFont.truetype(ARCHIVO, px), fill=255
    )
    ink = probe.getbbox()
    px = fit(target * target / (ink[2] - ink[0]))

    f = ImageFont.truetype(ARCHIVO, px)
    b = d.textbbox((0, 0), TEXT, font=f)
    tw, th = b[2] - b[0], b[3] - b[1]
    d.text((cx - tw / 2 - b[0], mapy(TEXT_BOTTOM) - th - b[1]), TEXT, font=f, fill=hexrgb(FG))

    y = mapy(BAR_TOP)
    h = S * BAR_H * scale
    w = S * BAR_W * scale
    d.rounded_rectangle([cx - w / 2, y, cx + w / 2, y + h], radius=h / 2, fill=hexrgb(BAR))


def png(size, scale=1.0, dy=0.0):
    S = size * 4
    im = Image.new("RGBA", (S, S), hexrgb(BG))
    design(S, ImageDraw.Draw(im), scale, dy)
    return im.resize((size, size), Image.LANCZOS)


def svg(size=512):
    """文字转路径，不依赖字体加载。"""
    font = TTFont(ARCHIVO)
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]

    names = [cmap[ord(c)] for c in TEXT]
    # 先在 em 单位下排版（Archivo 这几个大写字母之间没有 kerning）
    parts, x = [], 0
    for n in names:
        pen = SVGPathPen(gs)
        gs[n].draw(pen)
        parts.append((pen.getCommands(), x))
        x += hmtx[n][0]
    adv = x

    # 墨迹范围（不是 advance），才能和 PIL 量出来的宽度对齐
    ys, ink_lo, ink_hi = [], None, None
    for (_, off), n in zip(parts, names):
        g = font["glyf"][n]
        if not g.numberOfContours:
            continue
        ys += [g.yMin, g.yMax]
        lo, hi = off + g.xMin, off + g.xMax
        ink_lo = lo if ink_lo is None else min(ink_lo, lo)
        ink_hi = hi if ink_hi is None else max(ink_hi, hi)
    cap_bot = min(ys)

    k = TEXT_W * size / (ink_hi - ink_lo)       # em → px，按墨迹宽度
    tx = (size - (ink_hi + ink_lo) * k) / 2     # 墨迹居中
    ty = TEXT_BOTTOM * size + cap_bot * k       # SVG 里 y 轴向下，字形再做 scale(-1)

    glyphs = "".join(
        f'<path transform="translate({tx + off * k:.3f},{ty:.3f}) scale({k:.6f},{-k:.6f})" d="{cmds}"/>'
        for cmds, off in parts
    )
    bw, bh, by = BAR_W * size, BAR_H * size, BAR_TOP * size
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
<rect width="{size}" height="{size}" fill="{BG}"/>
<g fill="{FG}">{glyphs}</g>
<rect x="{(size - bw) / 2:.3f}" y="{by:.3f}" width="{bw:.3f}" height="{bh:.3f}" rx="{bh / 2:.3f}" fill="{BAR}"/>
</svg>
'''


if __name__ == "__main__":
    png(180).save(f"{OUT}/apple-touch-icon.png")
    png(192).save(f"{OUT}/icon-192.png")
    png(512).save(f"{OUT}/icon-512.png")
    # maskable：内容缩到 72% 并把内容中心提到画面正中，留出安全区
    png(512, scale=0.72, dy=-0.063).save(f"{OUT}/icon-maskable-512.png")
    open(f"{OUT}/favicon.svg", "w").write(svg())
    print("icons written")
