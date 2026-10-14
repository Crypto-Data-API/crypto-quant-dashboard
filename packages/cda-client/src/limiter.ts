/**
 * Token bucket with a priority wait queue.
 *
 * Guarantee: at most `burst + ratePerMinute` requests start in any rolling 60 s window.
 * The worker runs it at 100/min with burst 1 (101 per rolling minute) for a Pro Plus key
 * (120/min), and lowers the rate automatically when /auth/keys/me reports a smaller limit.
 *
 * `pauseUntil()` freezes the bucket after a 429 so every caller backs off together.
 */
export interface TokenBucketOptions {
  ratePerMinute: number;
  /** Bucket capacity. Default 1: requests are spaced evenly instead of bursting. */
  burst?: number;
  now?: () => number;
}

export interface AcquireOptions {
  /** Higher runs first. On-demand (user is looking at it) > scheduled polls. */
  priority?: number;
  signal?: AbortSignal;
}

interface Waiter {
  priority: number;
  seq: number;
  resolve: () => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface TokenBucketSnapshot {
  ratePerMinute: number;
  burst: number;
  tokens: number;
  queued: number;
  pausedUntil: number | null;
}

export class TokenBucket {
  private rate: number;
  readonly burst: number;
  private tokens: number;
  private last: number;
  private pausedUntil = 0;
  private seq = 0;
  private waiters: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private msPerToken: number;

  constructor(opts: TokenBucketOptions) {
    if (!(opts.ratePerMinute > 0)) throw new Error("ratePerMinute must be > 0");
    this.rate = opts.ratePerMinute;
    this.burst = Math.max(1, Math.floor(opts.burst ?? 1));
    this.now = opts.now ?? Date.now;
    this.msPerToken = 60_000 / opts.ratePerMinute;
    this.tokens = this.burst;
    this.last = this.now();
  }

  acquire(opts: AcquireOptions = {}): Promise<void> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { priority: opts.priority ?? 0, seq: this.seq++, resolve, reject, signal: opts.signal };
      if (opts.signal) {
        waiter.onAbort = () => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(abortError());
        };
        opts.signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
      this.waiters.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      this.drain();
    });
  }

  get ratePerMinute(): number {
    return this.rate;
  }

  /** Change the refill rate (e.g. after reading the key's real per-minute limit). */
  setRate(ratePerMinute: number): void {
    if (!(ratePerMinute > 0) || ratePerMinute === this.rate) return;
    this.refill();
    this.rate = ratePerMinute;
    this.msPerToken = 60_000 / ratePerMinute;
    this.drain();
  }

  /** Stop handing out tokens until `ts` (epoch ms). Used when CDA answers 429. */
  pauseUntil(ts: number): void {
    if (ts > this.pausedUntil) this.pausedUntil = ts;
    this.tokens = 0;
    this.schedule(Math.max(0, this.pausedUntil - this.now()));
  }

  snapshot(): TokenBucketSnapshot {
    this.refill();
    return {
      ratePerMinute: this.rate,
      burst: this.burst,
      tokens: Math.floor(this.tokens * 100) / 100,
      queued: this.waiters.length,
      pausedUntil: this.pausedUntil > this.now() ? this.pausedUntil : null,
    };
  }

  private refill(): void {
    const now = this.now();
    if (now < this.pausedUntil) {
      this.last = now;
      return;
    }
    const elapsed = now - Math.max(this.last, this.pausedUntil);
    if (elapsed > 0) {
      this.tokens = Math.min(this.burst, this.tokens + elapsed / this.msPerToken);
      this.last = now;
    }
  }

  private drain(): void {
    this.refill();
    while (this.waiters.length > 0 && this.tokens >= 1 && this.now() >= this.pausedUntil) {
      const w = this.waiters.shift()!;
      this.tokens -= 1;
      if (w.signal && w.onAbort) w.signal.removeEventListener("abort", w.onAbort);
      w.resolve();
    }
    if (this.waiters.length > 0) {
      const now = this.now();
      const untilUnpause = Math.max(0, this.pausedUntil - now);
      const untilToken = Math.max(0, (1 - this.tokens) * this.msPerToken);
      this.schedule(Math.max(untilUnpause, untilToken));
    }
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, Math.ceil(delayMs) + 1);
    // Never keep a process alive just to hand out tokens.
    (this.timer as { unref?: () => void }).unref?.();
  }
}

function abortError(): Error {
  const err = new Error("Aborted while waiting for a rate-limit token");
  err.name = "AbortError";
  return err;
}
