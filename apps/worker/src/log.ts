import type { LogLevel } from "./config";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

/**
 * Structured logger. Emits one JSON object per line (ready for any log shipper). Set
 * LOG_FORMAT=pretty for a compact human format in a terminal.
 */
export function createLogger(level: LogLevel, base: Fields = {}): Logger {
  const pretty = process.env.LOG_FORMAT === "pretty";
  const min = ORDER[level];

  const emit = (lvl: LogLevel, msg: string, fields?: Fields) => {
    if (ORDER[lvl] < min) return;
    const record = { t: new Date().toISOString(), level: lvl, msg, ...base, ...fields };
    const stream = lvl === "error" || lvl === "warn" ? process.stderr : process.stdout;
    if (pretty) {
      const extras = Object.entries({ ...base, ...fields })
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
      stream.write(`${record.t.slice(11, 19)} ${lvl.toUpperCase().padEnd(5)} ${msg}${extras ? ` ${extras}` : ""}\n`);
    } else {
      stream.write(`${JSON.stringify(record, (_k, v: unknown) => (v instanceof Error ? { name: v.name, message: v.message } : v))}\n`);
    }
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (f) => createLogger(level, { ...base, ...f }),
  };
}
