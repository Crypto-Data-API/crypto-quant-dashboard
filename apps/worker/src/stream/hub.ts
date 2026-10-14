import type { IncomingMessage, ServerResponse } from "node:http";
import type { RelayedEvent, StreamStatus } from "@cqd/schemas";

export interface ClientFilter {
  types: Set<string> | null;
  symbols: Set<string> | null;
  minUsd: number;
}

interface Client {
  id: number;
  res: ServerResponse;
  filter: ClientFilter;
}

const BUFFER_MAX = 5_000;
const BACKFILL_DEFAULT = 200;

/**
 * Fan-out hub: one upstream (live CDA stream or the delayed preview) feeds a ring buffer,
 * and every connected browser gets a filtered copy over our own SSE endpoint. Reconnecting
 * browsers send Last-Event-ID (or ?since_id=) and are replayed from the ring buffer, so no
 * event is lost across a reconnect as long as it is still buffered.
 */
export class StreamHub {
  private readonly buffer: RelayedEvent[] = [];
  private readonly clients = new Set<Client>();
  private readonly publishTimes: number[] = [];
  private nextClientId = 1;
  private pingTimer: ReturnType<typeof setInterval>;
  private statusValue: StreamStatus = {
    source: "off",
    state: "idle",
    message: null,
    lastEventAt: null,
    eventsPerMin: 0,
    clients: 0,
    bufferSize: 0,
    delayMs: null,
  };

  constructor() {
    this.pingTimer = setInterval(() => {
      for (const c of this.clients) c.res.write(": ping\n\n");
    }, 15_000);
    this.pingTimer.unref();
  }

  publish(ev: RelayedEvent): void {
    this.buffer.push(ev);
    if (this.buffer.length > BUFFER_MAX) this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
    const now = Date.now();
    this.publishTimes.push(now);
    while (this.publishTimes.length > 0 && this.publishTimes[0]! < now - 60_000) this.publishTimes.shift();
    this.statusValue.lastEventAt = now;
    const frame = eventFrame(ev);
    for (const c of this.clients) {
      if (matches(ev, c.filter)) c.res.write(frame);
    }
  }

  setStatus(patch: Partial<StreamStatus>): void {
    const prev = this.statusValue;
    this.statusValue = { ...prev, ...patch };
    if (prev.state !== this.statusValue.state || prev.source !== this.statusValue.source || prev.message !== this.statusValue.message) {
      const frame = statusFrame(this.status());
      for (const c of this.clients) c.res.write(frame);
    }
  }

  status(): StreamStatus {
    const now = Date.now();
    while (this.publishTimes.length > 0 && this.publishTimes[0]! < now - 60_000) this.publishTimes.shift();
    return { ...this.statusValue, eventsPerMin: this.publishTimes.length, clients: this.clients.size, bufferSize: this.buffer.length };
  }

  /** Attach a browser (already authenticated / CORS-checked by the HTTP layer). */
  attach(req: IncomingMessage, res: ServerResponse, filter: ClientFilter, sinceId: string | null, backfill = BACKFILL_DEFAULT): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    res.write(statusFrame(this.status()));

    for (const ev of this.replay(sinceId, filter, backfill)) res.write(eventFrame(ev));

    const client: Client = { id: this.nextClientId++, res, filter };
    this.clients.add(client);
    const detach = () => this.clients.delete(client);
    req.on("close", detach);
    res.on("error", detach);
  }

  private replay(sinceId: string | null, filter: ClientFilter, backfill: number): RelayedEvent[] {
    let start = Math.max(0, this.buffer.length - backfill * 4);
    if (sinceId) {
      const idx = this.buffer.findIndex((e) => String(e.id) === sinceId);
      if (idx >= 0) start = idx + 1;
    }
    const out = this.buffer.slice(start).filter((e) => matches(e, filter));
    return sinceId ? out : out.slice(-backfill);
  }

  close(): void {
    clearInterval(this.pingTimer);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}

export function parseFilter(params: URLSearchParams): ClientFilter {
  const list = (name: string) => {
    const raw = params.get(name);
    if (!raw) return null;
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? new Set(name === "symbols" ? items.map((s) => s.toUpperCase()) : items) : null;
  };
  const minUsd = Number(params.get("min_usd") ?? 0);
  return { types: list("types"), symbols: list("symbols"), minUsd: Number.isFinite(minUsd) ? minUsd : 0 };
}

function matches(ev: RelayedEvent, f: ClientFilter): boolean {
  if (f.types && !f.types.has(ev.type)) return false;
  if (f.symbols && !f.symbols.has(String(ev.symbol ?? "").toUpperCase())) return false;
  if (f.minUsd > 0 && typeof ev.usd === "number" && Math.abs(ev.usd) < f.minUsd) return false;
  return true;
}

function eventFrame(ev: RelayedEvent): string {
  return `id: ${String(ev.id)}\ndata: ${JSON.stringify(ev)}\n\n`;
}

function statusFrame(s: StreamStatus): string {
  return `event: status\ndata: ${JSON.stringify(s)}\n\n`;
}
