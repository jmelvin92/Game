# Attribution

Where everything in `public/` came from, and on what terms.

Kept accurate because it is the only record: once a file is in the repository its
origin is not recoverable from the file itself, and "where did this come from" is
a much harder question to answer a year later than to write down now.

## Tile art — CC0

**[Screaming Brain Studios](https://screamingbrainstudios.itch.io)**, public domain,
commercial use permitted, no attribution required. Credited here anyway.

- [Isometric Tiles — Floor Pack](https://screamingbrainstudios.itch.io/isotilepack)
  — ground surfaces, `public/tiles/`
- [Isometric Tiles — Wall Pack](https://screamingbrainstudios.itch.io/isowallpack)
  — walls and windows in brick, stone and timber
- [Isometric Tiles — Town Pack](https://screamingbrainstudios.itch.io/iso-town-pack)
  — building facades. Currently unused: each tile depicts several storeys and so
  cannot be stacked to build a taller wall.
- [Isometric Tiles — Overworld Pack](https://screamingbrainstudios.itch.io/iso-overworld-pack)
  — vegetation and terrain

Their sheets use a solid colour where transparency should be — magenta in some
packs, teal in others — which `src/render/textures.ts` keys out at load. It detects
the colour from each sheet's border rather than assuming, because the packs
disagree.

## Character and creature sprites — generated

Made by Joshua with **[AutoSprite.AI](https://autosprite.ai)**.

- `public/sprites/player-*.png` — Jaxin
- `public/sprites/white-eyes-*.png` — the White Eyes

Exported as five directions and assembled into eight by
`tools/build_character_sheets.py`, which mirrors the eastern facings to make the
western ones.

## Cutscene — generated

`public/video-death.mp4`, made by Joshua with an AI video tool.

## Audio — sound libraries

`public/audio/`, supplied by Joshua and processed by `tools/split_footsteps.py`
and `tools/convert_sound.py`.

The source filenames are library naming rather than anything generated — footstep
foley and a cymbal swell. Worth noting because unlike everything above, these are
the one category where terms depend on a subscription or purchase rather than
being public domain or self-made. Joshua has confirmed there is no restriction on
their use here.

## Drawn in code

No source, no licence. `src/render/sprites.ts` generates road surfaces,
vegetation, roofs, lamp posts, and the placeholder character used when a sprite
sheet fails to load.
