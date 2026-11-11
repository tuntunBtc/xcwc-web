#!/usr/bin/env python3
"""派生小程序城市页「顶边延展条」。

背景与问题
----------
city.json 使用 navigationStyle: custom，页面从屏幕 y=0 开始渲染，
状态栏 + 右上角胶囊的安全区高度随机型变化（readTopInsetRpx，约 176~320rpx）。
城市主视觉 hero.webp 是 960x722 的横构图（小鸟 / 柳枝 / 湖面），
不能像小窝页竖构图背景那样整屏拉伸，否则主体会变形或被裁掉。

因此把主视觉保持原尺寸贴在安全区下方，安全区本身用一条「顶边延展条」填：
取原图顶部 EXTEND_PX 像素后**垂直翻转**，条带底边正好是原图 y=0 那一行，
横向逐列颜色与下方主图完全对齐，接缝不可见；上方则自然延续垂下的柳枝与天空。
条带高度由 WXML 按 topInset 动态给出，纵向拉伸（scaleToFill），
不同机型都从 y=0 连续铺满，主视觉零变形、零裁切、坐标零回归。

输入：dist/assets/city/felt/hero-v2-960.webp（H5 现行素材，与
      miniprogram/assets/city/felt/hero.webp 同字节）
输出：miniprogram/assets/city/felt/hero-top-extend.webp

用法：python3 scripts/build-miniprogram-city-bg.py
依赖：Pillow（仅重新派生时需要，运行期不依赖）
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dist" / "assets" / "city" / "felt" / "hero-v2-960.webp"
OUT = ROOT / "miniprogram" / "assets" / "city" / "felt" / "hero-top-extend.webp"
EXTEND_PX = 64


def main():
    if not SRC.exists():
        raise SystemExit("缺少 H5 现行主视觉：%s" % SRC)
    with Image.open(SRC) as image:
        src = image.convert("RGB")
        if src.width != 960:
            raise SystemExit("主视觉宽度应为 960，实际 %d；请先核对素材" % src.width)
        strip = src.crop((0, 0, src.width, min(EXTEND_PX, src.height)))
    # 翻转后条带底边 = 原图 y=0，与主图顶边逐列对齐。
    strip = ImageOps.flip(strip)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUT, "WEBP", quality=88, method=6)
    print("%s  %dx%d  %d bytes" % (OUT.relative_to(ROOT), strip.width, strip.height, OUT.stat().st_size))


if __name__ == "__main__":
    main()
