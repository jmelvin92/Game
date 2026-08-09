#!/usr/bin/env python3
"""
Convert a single sound into something a browser should be asked to load.

    python3 tools/convert_sound.py ~/Downloads/swell.wav notice
    python3 tools/convert_sound.py ~/Downloads/thud.wav impact --mono

Foley arrives at 96kHz 24-bit, which is megabytes for a few seconds of audio that
will be played through whatever speakers the player happens to have. 48kHz 16-bit
loses nothing anyone can hear and is a quarter of the size.

Also trims silence from both ends, which foley libraries leave in generously and
which would otherwise become a delay between the thing happening and the player
hearing it.

Separate from split_footsteps.py because that one is looking for many events in one
recording and this one is keeping a single sound whole.
"""

from __future__ import annotations

import json
import struct
import sys
import wave
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / 'public' / 'audio'

# Anything below this fraction of the peak counts as silence at the ends.
SILENCE = 0.012


def read(path: Path) -> tuple[list[list[int]], int]:
    """Returns per-channel samples normalised to 16-bit, and the sample rate."""
    with wave.open(str(path)) as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        rate = source.getframerate()
        raw = source.readframes(source.getnframes())

    shift = (width - 2) * 8
    tracks: list[list[int]] = [[] for _ in range(channels)]
    stride = width * channels

    for offset in range(0, len(raw) - stride + 1, stride):
        for c in range(channels):
            start = offset + c * width
            value = int.from_bytes(raw[start:start + width], 'little', signed=True)
            tracks[c].append(value >> shift if shift > 0 else value)

    return tracks, rate


def trim(tracks: list[list[int]]) -> list[list[int]]:
    length = len(tracks[0])
    peak = max(max(abs(s) for s in track) for track in tracks) or 1
    floor = peak * SILENCE

    first = 0
    while first < length and all(abs(track[first]) < floor for track in tracks):
        first += 1

    last = length - 1
    while last > first and all(abs(track[last]) < floor for track in tracks):
        last -= 1

    return [track[first:last + 1] for track in tracks]


def write_manifest() -> None:
    """Rebuilds the manifest so the game needs no file names in its own source."""
    banks: dict[str, list[str]] = {}
    for clip in sorted(OUT_DIR.glob('*.wav')):
        name = clip.stem.rsplit('-', 1)[0] if '-' in clip.stem else clip.stem
        banks.setdefault(name, []).append(f'/audio/{clip.name}')
    (OUT_DIR / 'manifest.json').write_text(json.dumps(banks, indent=2) + '\n')


def main(source: Path, name: str, mono: bool) -> None:
    tracks, rate = read(source)
    tracks = trim(tracks)

    if mono and len(tracks) > 1:
        tracks = [[sum(values) // len(tracks) for values in zip(*tracks)]]

    if rate >= 88000:
        tracks = [track[::2] for track in tracks]
        rate //= 2

    # Short fades, or a trimmed edge clicks.
    fade = min(len(tracks[0]) // 8, rate // 200)
    for track in tracks:
        for i in range(fade):
            track[i] = int(track[i] * i / fade)
            track[-1 - i] = int(track[-1 - i] * i / fade)

    interleaved: list[int] = []
    for frame in zip(*tracks):
        interleaved.extend(frame)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f'{name}.wav'
    with wave.open(str(out), 'wb') as sink:
        sink.setnchannels(len(tracks))
        sink.setsampwidth(2)
        sink.setframerate(rate)
        sink.writeframes(struct.pack(f'<{len(interleaved)}h', *interleaved))

    write_manifest()
    print(f'{name}: {len(tracks[0]) / rate:.2f}s, {len(tracks)}ch at {rate}Hz')
    print(f'  {source.stat().st_size / 1e6:.1f} MB in  ->  {out.stat().st_size / 1e3:.0f} kB out')


if __name__ == '__main__':
    args = sys.argv[1:]
    mono = '--mono' in args
    if mono:
        args.remove('--mono')
    if len(args) != 2:
        sys.exit('usage: convert_sound.py <sound.wav> <name> [--mono]')
    main(Path(args[0]).expanduser(), args[1], mono)
