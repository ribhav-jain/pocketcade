// Shared audio: one AudioContext per document, a fresh master gain per mount, mute, and
// serialized suspend/resume where the latest intent wins.

interface AudioHooks {
  /** true while the mounted game has any pause cause */
  paused(): boolean;
  /** this mount's master gain, if any */
  output(): GainNode | null;
  /** forward a mute change to the mounted game (host `mute` event) */
  onMute(muted: boolean): void;
}

export interface AudioService {
  /** false when Web Audio is missing or constructing the context threw */
  readonly available: boolean;
  readonly muted: boolean;
  readonly context: AudioContext | null;
  /** Creates the shared context if needed; outside a gesture it starts suspended. */
  ensure(): AudioContext | null;
  /** Call inside a trusted gesture (Play, resume overlay, mute toggle): create + resume synchronously. */
  unlock(): void;
  setMuted(muted: boolean): void;
  /** Serialized suspend/resume; the latest intent wins. */
  want(state: 'running' | 'suspended'): void;
  /** A fresh master gain → destination for one mount; gain 0 when silent (attract) or muted. */
  createOutput(silent: boolean): GainNode | null;
  /** The mounted runner's hooks; null when nothing is mounted. */
  setActive(hooks: AudioHooks | null): void;
}

export function createAudioService(opts: { muted: boolean; dev: boolean }): AudioService {
  let ctx: AudioContext | null = null;
  let failed = typeof AudioContext === 'undefined';
  let muted = opts.muted;
  let active: AudioHooks | null = null;
  let intent: 'running' | 'suspended' = 'suspended';
  let chain: Promise<void> = Promise.resolve();

  function ensure(): AudioContext | null {
    if (ctx || failed) return ctx;
    try {
      const c = new AudioContext({ latencyHint: 'interactive' });
      // games must never close the shared context.
      Object.defineProperty(c, 'close', {
        configurable: true,
        value: () => {
          const e = new Error('Games must not close the shared AudioContext');
          e.name = 'ContractViolation';
          if (opts.dev) throw e;
          console.warn(`[pocketcade] ${e.message}`);
          return Promise.resolve();
        },
      });
      // The host owns the state: if anything resumes the context while the host wants it suspended
      // (Phaser resumes a supplied context at construction), suspend it again.
      c.addEventListener('statechange', () => {
        if (intent === 'suspended' && c.state === 'running') want('suspended');
      });
      ctx = c;
    } catch {
      failed = true;
    }
    return ctx;
  }

  function want(state: 'running' | 'suspended'): void {
    const c = ctx;
    if (!c) return;
    intent = state;
    chain = chain.then(async () => {
      if (intent !== state) return; // superseded
      try {
        // Unconditional: a resume() someone else started may not have settled yet; calls apply in order.
        if (state === 'running') await c.resume();
        else if (c.state !== 'closed') await c.suspend();
      } catch {
        // resume can reject without activation; the next gesture retries
      }
    });
  }

  return {
    get available() {
      return !failed;
    },
    get muted() {
      return muted;
    },
    get context() {
      return ctx;
    },
    ensure,
    unlock() {
      const c = ensure();
      if (!c) return;
      intent = 'running';
      // Synchronous inside the gesture: never after an await.
      void c.resume().catch(() => {});
    },
    setMuted(m) {
      muted = m;
      const out = active?.output();
      if (out && ctx) out.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
      active?.onMute(m);
      if (m) want('suspended');
      else if (active && !active.paused()) this.unlock();
    },
    want,
    createOutput(silent) {
      const c = ensure();
      if (!c) return null;
      const g = c.createGain();
      g.gain.value = silent || muted ? 0 : 1;
      g.connect(c.destination);
      return g;
    },
    setActive(hooks) {
      active = hooks;
    },
  };
}
