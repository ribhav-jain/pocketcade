import { describe, expect, it } from 'vitest';
import { SFX_PRESETS, renderSfx, type SfxPresetName } from '../src/sfx.ts';

/** FNV-1a over the rendered samples (quantised to 16 bits so the hash is engine-stable). */
function hash(data: Float32Array): string {
  let h = 0x811c9dc5;
  for (const v of data) {
    const q = Math.round(v * 32767) & 0xffff;
    h = Math.imul(h ^ (q & 0xff), 0x01000193);
    h = Math.imul(h ^ (q >>> 8), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const names = Object.keys(SFX_PRESETS) as SfxPresetName[];

describe('renderSfx', () => {
  it.each(names)('%s is ≤ 1.5 s, peaks ≤ 0.9 × volume and ends at 0', (name) => {
    const p = SFX_PRESETS[name];
    const out = renderSfx(p, 48000, `t:${name}`);
    expect(out.length).toBeLessThanOrEqual(48000 * 1.5);
    const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeLessThanOrEqual(0.9 * p.volume + 1e-6);
    expect(peak).toBeGreaterThan(0);
    expect(Math.abs(out[out.length - 1]!)).toBe(0);
  });

  it('is deterministic for a seed, and the seed matters for noise', () => {
    expect(renderSfx(SFX_PRESETS.hit, 44100, 'a')).toEqual(renderSfx(SFX_PRESETS.hit, 44100, 'a'));
    expect(hash(renderSfx(SFX_PRESETS.hit, 44100, 'a'))).not.toBe(
      hash(renderSfx(SFX_PRESETS.hit, 44100, 'b')),
    );
  });

  it('renders every preset to the same samples as before (update the hashes when a preset changes on purpose)', () => {
    const golden = Object.fromEntries(
      names.map((n) => [n, hash(renderSfx(SFX_PRESETS[n], 48000, `golden:${n}`))]),
    );
    expect(golden).toMatchInlineSnapshot(`
      {
        "click": "4214aa4e",
        "coin": "b592b2de",
        "explode": "e1d4fca5",
        "hit": "a91d8c66",
        "jump": "7e7fbfc6",
        "lose": "083799e2",
        "win": "409a288c",
      }
    `);
  });
});
