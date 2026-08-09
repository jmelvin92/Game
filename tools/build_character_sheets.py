#!/usr/bin/env python3
"""
Turn an AutoSprite export into a sprite sheet the game can load.

    python3 tools/build_character_sheets.py ~/Downloads/Jaxin-spritesheet.zip idle

AutoSprite exports five directions — up, northeast, right, southeast, down — as
separate folders of individual frames. The remaining three (northwest, west,
southwest) are horizontal mirrors of their eastern counterparts, which is why only
five are generated: an asymmetric detail like a backpack strap swaps sides, and at
this size that reads as the character simply having turned.

The output is one PNG per animation, laid out with a row per facing **in the
renderer's own order**, so no translation table is needed at load time.

Why a script rather than doing it by hand: this has to run again for every animation
and every revision of the character, and each step below exists because something
went wrong without it.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Pillow is required: pip3 install Pillow')

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / 'public' / 'sprites'

# How tall the character should stand in the finished sheet, in pixels. Tiles are
# 128x64 and one storey is 64px, so this puts an adult a little under two storeys —
# the proportion that reads correctly against a wall and a doorway.
TARGET_HEIGHT = 118

# Facings in the order `facingIndex` numbers them: east, then clockwise. Each entry
# is the AutoSprite direction to draw it from, and whether to mirror it.
FACINGS: tuple[tuple[str, bool], ...] = (
    ('right', False),      # 0  E
    ('southeast', False),  # 1  SE
    ('down', False),       # 2  S
    ('southeast', True),   # 3  SW
    ('right', True),       # 4  W
    ('northeast', True),   # 5  NW
    ('up', False),         # 6  N
    ('northeast', False),  # 7  NE
)


def frames_for(root: Path, animation: str, direction: str) -> list[Image.Image]:
    """Every frame of one direction, in order."""
    folder = root / f'iso_{animation}_{direction}_right' / 'frames'
    if not folder.is_dir():
        matches = sorted(root.glob(f'iso_{animation}_{direction}_*'))
        if not matches:
            sys.exit(f'No frames for {animation}/{direction} under {root}')
        folder = matches[0] / 'frames'

    return [Image.open(p).convert('RGBA') for p in sorted(folder.glob('*.png'))]


def build(zip_path: Path, animation: str) -> None:
    with TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(tmp)

        root = Path(tmp)
        # Exports are sometimes nested one level inside the archive.
        if not any(root.glob('iso_*')):
            nested = [p for p in root.iterdir() if p.is_dir()]
            if len(nested) == 1:
                root = nested[0]

        directions = {name for name, _ in FACINGS}
        loaded = {d: frames_for(root, animation, d) for d in directions}

        counts = {d: len(f) for d, f in loaded.items()}
        if len(set(counts.values())) != 1:
            sys.exit(f'Directions disagree on frame count: {counts}')
        frame_count = next(iter(counts.values()))

        # One crop box for every frame of every direction. Cropping each frame to
        # its own content would be tighter, but the character would then shift
        # around inside the cell as limbs moved — which reads as sliding feet.
        boxes = [f.getbbox() for frames in loaded.values() for f in frames if f.getbbox()]
        left = min(b[0] for b in boxes)
        top = min(b[1] for b in boxes)
        right = max(b[2] for b in boxes)
        bottom = max(b[3] for b in boxes)

        scale = TARGET_HEIGHT / (bottom - top)
        cell_w = max(1, round((right - left) * scale))
        cell_h = max(1, round((bottom - top) * scale))

        sheet = Image.new('RGBA', (cell_w * frame_count, cell_h * len(FACINGS)), (0, 0, 0, 0))

        for row, (direction, mirrored) in enumerate(FACINGS):
            for column, frame in enumerate(loaded[direction]):
                cell = frame.crop((left, top, right, bottom))
                cell = cell.resize((cell_w, cell_h), Image.LANCZOS)
                if mirrored:
                    cell = ImageOps.mirror(cell)
                sheet.paste(cell, (column * cell_w, row * cell_h), cell)

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        out = OUT_DIR / f'{animation}.png'
        sheet.save(out)

        print(f'{animation}: {frame_count} frames x {len(FACINGS)} facings')
        print(f'  cell   {cell_w} x {cell_h}  (character {TARGET_HEIGHT}px tall)')
        print(f'  sheet  {sheet.size[0]} x {sheet.size[1]}')
        print(f'  wrote  {out.relative_to(REPO)}')
        print(f'\n  Set ANIMATIONS.{animation}.frames = {frame_count} in src/render/sprites.ts')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: build_character_sheets.py <export.zip> <idle|walk|run>')
    build(Path(sys.argv[1]).expanduser(), sys.argv[2])
