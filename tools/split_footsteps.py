#!/usr/bin/env python3
"""
Split a recording of someone walking into individual footstep samples.

    python3 tools/split_footsteps.py ~/Downloads/grass-walk.wav grass

Foley libraries ship walk cycles rather than single steps, so one file holds a
couple of dozen usable footsteps. Splitting them out is worth doing properly: a
single sample repeated is the most recognisable sound in a bad game, and a folder
of real variations fixes that far better than pitch-shifting one sample ever will.

Also converts to something sane for a browser. Source foley is often 96kHz 24-bit
stereo, which is megabytes per step for a sound that plays a few metres from the
listener — 48kHz 16-bit mono loses nothing anybody can hear here and is a fraction
of the size.
"""

from __future__ import annotations

import struct
import sys
import wave
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / 'public' / 'audio'

# Two thumps closer together than this are one footstep — a heel and a toe, not
# two paces. Set from the fact that nobody walks faster than about six steps a
# second even at a sprint.
MERGE_GAP = 0.16

# Silence trimmed either side, and how much tail to keep. The tail matters: cutting
# a footstep at its peak makes it a click rather than an impact.
LEAD_IN = 0.02
TAIL = 0.18


def read_mono(path: Path) -> tuple[list[int], int]:
    """Reads any bit depth to a mono list of signed ints, plus the sample rate."""
    with wave.open(str(path)) as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        rate = source.getframerate()
        raw = source.readframes(source.getnframes())

    frames: list[int] = []
    stride = width * channels

    for offset in range(0, len(raw) - stride + 1, stride):
        total = 0
        for c in range(channels):
            start = offset + c * width
            chunk = raw[start:start + width]
            total += int.from_bytes(chunk, 'little', signed=True)
        frames.append(total // channels)

    # Normalise amplitude to 16-bit regardless of the source depth.
    shift = (width - 2) * 8
    if shift > 0:
        frames = [f >> shift for f in frames]

    return frames, rate


def find_steps(samples: list[int], rate: int) -> list[tuple[int, int]]:
    window = max(1, rate // 200)
    peak_of: list[float] = []

    for start in range(0, len(samples) - window, window):
        peak = 0
        for i in range(start, start + window, 4):
            peak = max(peak, abs(samples[i]))
        peak_of.append(peak)

    loudest = max(peak_of) if peak_of else 0
    if loudest == 0:
        return []

    threshold = loudest * 0.06
    runs: list[tuple[int, int]] = []
    inside: int | None = None

    for i, value in enumerate(peak_of):
        if value > threshold and inside is None:
            inside = i
        elif value <= threshold and inside is not None:
            runs.append((inside * window, i * window))
            inside = None
    if inside is not None:
        runs.append((inside * window, len(peak_of) * window))

    merged: list[tuple[int, int]] = []
    for run in runs:
        if merged and run[0] - merged[-1][1] < MERGE_GAP * rate:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)

    return merged


def write_step(path: Path, samples: list[int], rate: int) -> None:
    # Decimate by two: source foley is usually 96kHz, and 48 is ample.
    decimated = samples[::2] if rate >= 88000 else samples
    out_rate = rate // 2 if rate >= 88000 else rate

    # Short fades, or the cut edges click.
    fade = min(len(decimated) // 8, out_rate // 200)
    for i in range(fade):
        decimated[i] = int(decimated[i] * i / fade)
        decimated[-1 - i] = int(decimated[-1 - i] * i / fade)

    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(out_rate)
        out.writeframes(struct.pack(f'<{len(decimated)}h', *decimated))


def main(source: Path, surface: str) -> None:
    samples, rate = read_mono(source)
    steps = find_steps(samples, rate)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for existing in OUT_DIR.glob(f'footstep-{surface}-*.wav'):
        existing.unlink()

    written = 0
    for start, end in steps:
        begin = max(0, start - int(LEAD_IN * rate))
        finish = min(len(samples), end + int(TAIL * rate))
        clip = samples[begin:finish]

        # Skip anything too short to be a step, or too quiet to hear.
        if len(clip) < rate * 0.05:
            continue
        if max(abs(s) for s in clip) < 400:
            continue

        written += 1
        write_step(OUT_DIR / f'footstep-{surface}-{written:02d}.wav', clip, rate)

    total = sum(p.stat().st_size for p in OUT_DIR.glob(f'footstep-{surface}-*.wav'))
    print(f'{surface}: {written} footsteps from {len(steps)} detected events')
    print(f'  {source.stat().st_size / 1e6:.1f} MB in  ->  {total / 1e3:.0f} kB out')
    print(f'  wrote {OUT_DIR.relative_to(REPO)}/footstep-{surface}-NN.wav')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: split_footsteps.py <recording.wav> <surface>')
    main(Path(sys.argv[1]).expanduser(), sys.argv[2])
