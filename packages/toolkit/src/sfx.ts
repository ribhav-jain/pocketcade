// SFX synth and playback. renderSfx is pure; playback never touches context.destination.
import { createRng } from './rng.ts';

export interface SfxParams {
  wave: 'square' | 'triangle' | 'sine' | 'saw' | 'noise';
  /** start pitch, Hz */
  freq: number;
  /** exponential slide target over the whole sound, Hz */
  freqEnd?: number;
  /** total ≤ 1500 ms */
  attackMs: number;
  sustainMs: number;
  decayMs: number;
  /** 0..1 peak, before the sfx bus */
  volume: number;
  /** square only, 0.05..0.5 (default 0.5) */
  duty?: number;
  /** pitch multipliers vs `freq` */
  arp?: readonly { atMs: number; ratio: number }[];
  vibrato?: { hz: number; cents: number };
  /** one-pole low-pass cutoff sweep, Hz */
  lowpass?: number;
  lowpassEnd?: number;
}

export type SfxPresetName = 'jump' | 'coin' | 'hit' | 'explode' | 'click' | 'win' | 'lose';
export type SfxBank = readonly (SfxPresetName | { name: string; params: SfxParams })[];

export interface Sfx {
  play(name: string, options?: { volume?: number; detuneCents?: number }): void;
  stopAll(): void;
  readonly ready: boolean;
}

/** Tuned by ear (golden hashes in test/sfx.test.ts change with them). */
export const SFX_PRESETS: Record<SfxPresetName, SfxParams> = {
  jump: {
    wave: 'square',
    duty: 0.5,
    freq: 300,
    freqEnd: 620,
    attackMs: 5,
    sustainMs: 40,
    decayMs: 120,
    volume: 0.45,
    lowpass: 3500,
  },
  coin: {
    wave: 'square',
    duty: 0.25,
    freq: 988,
    attackMs: 0,
    sustainMs: 60,
    decayMs: 220,
    volume: 0.4,
    arp: [{ atMs: 60, ratio: 1.335 }],
  },
  hit: {
    wave: 'noise',
    freq: 0,
    attackMs: 0,
    sustainMs: 20,
    decayMs: 140,
    volume: 0.55,
    lowpass: 2400,
    lowpassEnd: 400,
  },
  explode: {
    wave: 'noise',
    freq: 0,
    attackMs: 0,
    sustainMs: 80,
    decayMs: 600,
    volume: 0.7,
    lowpass: 1200,
    lowpassEnd: 120,
  },
  click: { wave: 'triangle', freq: 1400, attackMs: 0, sustainMs: 4, decayMs: 30, volume: 0.3 },
  win: {
    wave: 'square',
    duty: 0.5,
    freq: 523,
    attackMs: 5,
    sustainMs: 360,
    decayMs: 260,
    volume: 0.4,
    arp: [
      { atMs: 90, ratio: 1.26 },
      { atMs: 180, ratio: 1.498 },
      { atMs: 270, ratio: 2 },
    ],
  },
  lose: {
    wave: 'saw',
    freq: 392,
    freqEnd: 98,
    attackMs: 10,
    sustainMs: 200,
    decayMs: 450,
    volume: 0.4,
    vibrato: { hz: 7, cents: 30 },
    lowpass: 2000,
  },
};

const MAX_MS = 1500;

/** deterministic mono render; ≤ 1.5 s, peak ≤ 0.9 × volume, last 2 ms ramped to 0. */
export function renderSfx(
  p: SfxParams,
  sampleRate: number,
  seed: string,
): Float32Array<ArrayBuffer> {
  const totalMs = Math.min(MAX_MS, p.attackMs + p.sustainMs + p.decayMs);
  const n = Math.max(1, Math.round((totalMs / 1000) * sampleRate));
  const out = new Float32Array(n);
  const rng = createRng(seed);
  const duty = Math.min(0.5, Math.max(0.05, p.duty ?? 0.5));
  const a = (p.attackMs / 1000) * sampleRate;
  const s = (p.sustainMs / 1000) * sampleRate;
  const d = Math.max(1, (p.decayMs / 1000) * sampleRate);
  const ramp = Math.max(1, Math.round(0.002 * sampleRate));
  let phase = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const ms = (i / sampleRate) * 1000;
    let f = p.freqEnd ? p.freq * Math.pow(p.freqEnd / p.freq, t) : p.freq;
    for (const step of p.arp ?? []) if (ms >= step.atMs) f = p.freq * step.ratio;
    if (p.vibrato)
      f *= Math.pow(
        2,
        (p.vibrato.cents / 1200) * Math.sin(2 * Math.PI * p.vibrato.hz * (i / sampleRate)),
      );
    phase = (phase + f / sampleRate) % 1;
    let x: number;
    if (p.wave === 'noise') x = rng.next() * 2 - 1;
    else if (p.wave === 'square') x = phase < duty ? 1 : -1;
    else if (p.wave === 'triangle') x = 1 - 4 * Math.abs(phase - 0.5);
    else if (p.wave === 'saw') x = 2 * phase - 1;
    else x = Math.sin(2 * Math.PI * phase);
    if (p.lowpass) {
      const cut = p.lowpassEnd ? p.lowpass * Math.pow(p.lowpassEnd / p.lowpass, t) : p.lowpass;
      y += (1 - Math.exp((-2 * Math.PI * cut) / sampleRate)) * (x - y);
      x = y;
    }
    const env = i < a ? i / a : i < a + s ? 1 : Math.max(0, 1 - (i - a - s) / d);
    const tail = i >= n - ramp ? (n - 1 - i) / ramp : 1;
    out[i] = x * env * tail * p.volume * 0.9;
  }
  return out;
}

/** Renders a bank to AudioBuffers at the context's rate, yielding between sounds. */
export async function renderBank(
  bank: SfxBank,
  context: BaseAudioContext,
  seedPrefix: string,
  signal: AbortSignal,
): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  for (const b of bank) {
    if (signal.aborted) break;
    const [name, params] = typeof b === 'string' ? [b, SFX_PRESETS[b]] : [b.name, b.params];
    const data = renderSfx(params, context.sampleRate, `${seedPrefix}:sfx:${name}`);
    const buf = context.createBuffer(1, data.length, context.sampleRate);
    buf.copyToChannel(data, 0);
    out.set(name, buf);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export const NO_SFX: Sfx = { play() {}, stopAll() {}, ready: false };

export interface BusSfx extends Sfx {
  setMuted(muted: boolean): void;
  dispose(): void;
}

/** source → per-play gain → sfx bus → host.audio.output. ≤ 8 voices, 30 ms same-name throttle. */
export function createBusSfx(
  context: BaseAudioContext,
  output: AudioNode,
  buffers: Map<string, AudioBuffer>,
): BusSfx {
  const bus = context.createGain();
  bus.connect(output);
  const voices: AudioBufferSourceNode[] = [];
  const last = new Map<string, number>();
  const stop = (v: AudioBufferSourceNode) => {
    try {
      v.stop();
    } catch {
      // already stopped
    }
    v.disconnect();
  };
  return {
    ready: true,
    play(name, o = {}) {
      const buf = buffers.get(name);
      const now = performance.now();
      if (!buf || now - (last.get(name) ?? -Infinity) < 30) return;
      last.set(name, now);
      if (voices.length >= 8) stop(voices.shift()!);
      const src = context.createBufferSource();
      src.buffer = buf;
      if (o.detuneCents) src.detune.value = o.detuneCents;
      const gain = context.createGain();
      gain.gain.value = o.volume ?? 1;
      src.connect(gain).connect(bus);
      src.onended = () => {
        const i = voices.indexOf(src);
        if (i >= 0) voices.splice(i, 1);
        src.disconnect();
        gain.disconnect();
      };
      voices.push(src);
      src.start();
    },
    stopAll() {
      for (const v of voices.splice(0)) stop(v);
    },
    setMuted(m) {
      bus.gain.value = m ? 0 : 1;
    },
    dispose() {
      this.stopAll();
      bus.disconnect();
    },
  };
}
