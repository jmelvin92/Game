/**
 * Sound playback.
 *
 * Knows nothing about the game — it loads clips by name and plays them. What a
 * footstep sounds like on grass is decided elsewhere.
 *
 * Uses the Web Audio API rather than `<audio>` elements: overlapping playback is
 * the normal case here, and an `<audio>` element can only play one thing at a
 * time, so a second footstep would cut the first one off.
 */

export interface PlayOptions {
  /** 0 to 1, multiplied into the mixer's volume. */
  readonly volume?: number
  /** Playback rate. 1 is unaltered; small deviations vary a repeated sound. */
  readonly rate?: number
  /**
   * Stereo position, -1 hard left through 0 centre to 1 hard right.
   *
   * Worth having for anything the player is meant to locate rather than merely
   * notice. Something approaching in the dark is the case this exists for: which
   * side it is on is the only information the player gets before they can see it.
   */
  readonly pan?: number
}

export interface Audio {
  /** Loads a set of clips, keyed by name. Failures are skipped, not thrown. */
  load(clips: Readonly<Record<string, readonly string[]>>): Promise<void>
  /** Plays one clip at random from the named set. */
  play(name: string, options?: PlayOptions): void
  /** Browsers block audio until the user interacts; call this from an input handler. */
  resume(): void
  setVolume(volume: number): void
}

export function createAudio(volume = 0.7): Audio {
  // Constructed lazily. Creating a context before any user gesture leaves it
  // suspended, and some browsers log a warning about it every time.
  let context: AudioContext | undefined
  let master: GainNode | undefined
  let level = volume

  const banks = new Map<string, AudioBuffer[]>()

  const ensureContext = (): AudioContext | undefined => {
    if (context === undefined) {
      try {
        context = new AudioContext()
        master = context.createGain()
        master.gain.value = level
        master.connect(context.destination)
      } catch {
        return undefined
      }
    }
    return context
  }

  return {
    async load(clips: Readonly<Record<string, readonly string[]>>): Promise<void> {
      const ctx = ensureContext()
      if (ctx === undefined) return

      await Promise.all(
        Object.entries(clips).map(async ([name, urls]) => {
          const decoded = await Promise.all(
            urls.map(async (url) => {
              try {
                const response = await fetch(url)
                return await ctx.decodeAudioData(await response.arrayBuffer())
              } catch {
                // A missing clip should leave the game silent, not broken.
                return undefined
              }
            }),
          )

          const usable = decoded.filter((b): b is AudioBuffer => b !== undefined)
          if (usable.length > 0) banks.set(name, usable)
        }),
      )
    },

    play(name: string, options: PlayOptions = {}): void {
      const ctx = context
      const bank = banks.get(name)
      if (ctx === undefined || master === undefined || bank === undefined) return
      if (ctx.state !== 'running') return

      const buffer = bank[Math.floor(Math.random() * bank.length)]
      if (buffer === undefined) return

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = options.rate ?? 1

      const gain = ctx.createGain()
      gain.gain.value = options.volume ?? 1

      const pan = options.pan ?? 0
      if (pan !== 0) {
        const panner = ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, pan))
        source.connect(panner)
        panner.connect(gain)
      } else {
        source.connect(gain)
      }

      gain.connect(master)
      source.start()
    },

    resume(): void {
      const ctx = ensureContext()
      if (ctx?.state === 'suspended') void ctx.resume()
    },

    setVolume(next: number): void {
      level = next
      if (master !== undefined) master.gain.value = next
    },
  }
}
