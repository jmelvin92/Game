#!/usr/bin/env python3
"""
Turn an AutoSprite export into a sprite sheet the game can load.

    python3 tools/build_character_sheets.py <export.zip> <name> idle walk run
    python3 tools/build_character_sheets.py white-eyes.zip white-eyes idle run --height 162

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
#
# Overridable per character with --height, because relative size is characterisation:
# a creature that towers over the player reads as wrong before anything else about
# it registers, and normalising everything to one height would throw that away.
DEFAULT_HEIGHT = 118

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


def build(zip_path: Path, name: str, animations: list[str], height: int) -> None:
    with TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(tmp)

        root = Path(tmp)
        # Exports are sometimes nested one level inside the archive.
        if not any(root.glob('iso_*')):
            nested = [p for p in root.iterdir() if p.is_dir()]
            if len(nested) == 1:
                root = nested[0]

        directions = sorted({name for name, _ in FACINGS})
        loaded = {
            animation: {d: frames_for(root, animation, d) for d in directions}
            for animation in animations
        }

        for animation, by_direction in loaded.items():
            counts = {d: len(f) for d, f in by_direction.items()}
            if len(set(counts.values())) != 1:
                sys.exit(f'{animation}: directions disagree on frame count: {counts}')

        # One crop box across every animation, not one per animation.
        #
        # Two reasons. Within an animation, cropping each frame to its own content
        # would centre the character differently in each and the feet would slide.
        # Across animations, a running pose throws the limbs much wider than an
        # idle one — so a per-animation box makes the cells different widths, and
        # the character visibly jumps sideways the moment they start walking.
        boxes = [
            f.getbbox()
            for by_direction in loaded.values()
            for frames in by_direction.values()
            for f in frames
            if f.getbbox()
        ]
        left = min(b[0] for b in boxes)
        top = min(b[1] for b in boxes)
        right = max(b[2] for b in boxes)
        bottom = max(b[3] for b in boxes)

        scale = height / (bottom - top)
        cell_w = max(1, round((right - left) * scale))
        cell_h = max(1, round((bottom - top) * scale))

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        print(f'{name}: shared cell {cell_w} x {cell_h}  (character {height}px tall)\n')

        for animation, by_direction in loaded.items():
            frame_count = len(next(iter(by_direction.values())))
            sheet = Image.new('RGBA', (cell_w * frame_count, cell_h * len(FACINGS)), (0, 0, 0, 0))

            for row, (direction, mirrored) in enumerate(FACINGS):
                for column, frame in enumerate(by_direction[direction]):
                    cell = frame.crop((left, top, right, bottom)).resize(
                        (cell_w, cell_h), Image.LANCZOS
                    )
                    if mirrored:
                        cell = ImageOps.mirror(cell)
                    sheet.paste(cell, (column * cell_w, row * cell_h), cell)

            out = OUT_DIR / f'{name}-{animation}.png'
            sheet.save(out)
            print(f'  {animation:5} {frame_count} frames x {len(FACINGS)} facings'
                  f'  ->  {out.relative_to(REPO)}  ({sheet.size[0]} x {sheet.size[1]})')


if __name__ == '__main__':
    args = sys.argv[1:]
    height = DEFAULT_HEIGHT

    if '--height' in args:
        at = args.index('--height')
        height = int(args[at + 1])
        del args[at:at + 2]

    if len(args) < 3:
        sys.exit(
            'usage: build_character_sheets.py <export.zip> <name> <animation> [...] '
            '[--height N]'
        )

    build(Path(args[0]).expanduser(), args[1], args[2:], height)
