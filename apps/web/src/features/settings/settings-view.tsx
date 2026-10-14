"use client";

import { TIER_LABEL, type Tier } from "@cqd/schemas";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SecHead } from "@/components/panel";
import { RowsPicker, SettingRow, Switch } from "@/components/shell/settings-popover";
import { A, C } from "@/cq/theme";
import { ago, dateTime, int } from "@/lib/format";
import { useNow, useWorkerStatus } from "@/lib/hooks";
import { IS_STATIC, REPO_URL } from "@/lib/mode";
import { setUi, UI_DEFAULTS, useUi } from "@/lib/settings";

const FOCUS_CHIPS = ["BTC", "ETH", "SOL", "HYPE", "XRP", "SUI", "ZEC", "PUMP"];

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="cq-card cq-sec min-w-0">
      <SecHead title={title} sub={sub} mb={8} />
      {children}
    </section>
  );
}

function KV({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="grid items-baseline" style={{ gridTemplateColumns: "150px minmax(0,1fr)", gap: 10, padding: "8px 0", borderTop: "1px solid #10161e", fontSize: 12 }}>
      <span style={{ color: "#5b6878" }}>{k}</span>
      <span className="cq-mono" style={{ color: tone ?? "#c9d3df", fontSize: 11.5, overflowWrap: "anywhere" }}>
        {v}
      </span>
    </div>
  );
}

function YesNo({ yes, yesText = "configured", noText = "not set" }: { yes: boolean; yesText?: string; noText?: string }) {
  const c = yes ? C.long : C.amber;
  return (
    <span className="cq-mono" style={{ fontSize: 10, color: c, background: A(c, 0.1), border: `1px solid ${A(c, 0.4)}`, padding: "1px 7px", borderRadius: 5 }}>
      {yes ? yesText : noText}
    </span>
  );
}

function FocusPicker({ focus }: { focus: string }) {
  const [draft, setDraft] = useState(focus);
  const commit = (v: string) => {
    const s = v.trim().toUpperCase();
    if (/^[A-Z0-9]{1,20}$/.test(s)) setUi({ focus: s });
  };
  return (
    <div style={{ padding: "10px 0 8px", borderTop: "1px solid #121922" }}>
      <div style={{ fontSize: 12.5, color: "#e6edf5" }}>Default focus coin</div>
      <div style={{ fontSize: 11, color: "#5b6878", marginTop: 2 }}>Order Books and the overview terrain open on this coin.</div>
      <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 10 }}>
        {FOCUS_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === focus}
            onClick={() => {
              setDraft(c);
              setUi({ focus: c });
            }}
            className="cq-mono"
            style={{ padding: "4px 9px", background: c === focus ? "#1a2230" : "transparent", border: `1px solid ${c === focus ? "#2f3d50" : "#1c2531"}`, borderRadius: 6, color: c === focus ? "#eef3f8" : "#8b98a9", cursor: "pointer", fontSize: 10.5 }}
          >
            {c}
          </button>
        ))}
        <form
          className="flex items-center"
          style={{ gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            commit(draft);
          }}
        >
          <input className="cq-input" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Default focus coin" style={{ width: 90, padding: "5px 9px", textTransform: "uppercase" }} />
          <button type="submit" className="cq-btn">
            Set
          </button>
        </form>
      </div>
    </div>
  );
}

export function SettingsView() {
  const ui = useUi();
  const now = useNow() || Date.now();
  const { data } = useWorkerStatus();
  const w = data?.worker ?? null;
  const jev = w?.jev;
  const demo = w?.demo;
  const account = w?.account ?? null;
  const tier = account?.tier ? (TIER_LABEL[account.tier as Tier] ?? account.tier) : null;
  const mode = IS_STATIC || demo?.static ? "Static demo" : demo?.cda ? "Demo (keyless)" : w ? "Live" : "Unknown (worker offline)";
  const modeColor = mode === "Live" ? C.long : mode.startsWith("Unknown") ? C.short : C.blue;

  return (
    <div className="grid items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", gap: 16 }}>
      <Card title="Display" sub="Saved in this browser only.">
        <SettingRow title="Expanded sidebar" sub="Labels and badges, or a 64px icon rail" first>
          <Switch on={ui.sb} onChange={(v) => setUi({ sb: v })} label="Expanded sidebar" />
        </SettingRow>
        <SettingRow title="KPI sparklines" sub="Recorded history beside each header KPI">
          <Switch on={ui.kpiSparks} onChange={(v) => setUi({ kpiSparks: v })} label="KPI sparklines" />
        </SettingRow>
        <SettingRow title="Auto-rotate 3D views" sub="Slow camera orbit and sway on all scenes (off reduces motion)">
          <Switch on={ui.motion} onChange={(v) => setUi({ motion: v })} label="Auto-rotate 3D views" />
        </SettingRow>
        <div style={{ padding: "10px 0 8px", borderTop: "1px solid #121922" }}>
          <div style={{ fontSize: 12.5, color: "#e6edf5" }}>Tape rows</div>
          <div style={{ fontSize: 11, color: "#5b6878", marginTop: 2 }}>Rows on the live liquidation tape</div>
          <RowsPicker rows={ui.rows} />
        </div>
        <div className="flex justify-end" style={{ paddingTop: 10, borderTop: "1px solid #121922" }}>
          <button type="button" className="cq-btn" onClick={() => setUi({ ...UI_DEFAULTS })}>
            Reset to defaults
          </button>
        </div>
      </Card>

      <Card title="Live data" sub="What updates on its own.">
        <SettingRow title="Live feed" sub="Stream ticks, liquidations and book updates; off freezes the tape and pauses the L2 ladder" first>
          <Switch on={ui.live} onChange={(v) => setUi({ live: v })} label="Live feed" />
        </SettingRow>
        <FocusPicker key={ui.focus} focus={ui.focus} />
        <KV k="Stream source" v={w?.stream ? `${w.stream.source} · ${w.stream.state} · ${w.stream.eventsPerMin}/min` : IS_STATIC ? "replay in your browser" : "—"} />
      </Card>

      <Card title="Jev (TypeSafe)" sub="A second opinion from TypeSafe's classifier, run in the worker. Kept quiet in the UI.">
        <SettingRow title="Show Jev reads" sub="Status pill, news and squeeze marks, sidebar line" first>
          <Switch on={ui.jev} onChange={(v) => setUi({ jev: v })} label="Show Jev reads" />
        </SettingRow>
        <KV k="Classifier" v={jev ? (jev.configured ? <YesNo yes yesText="on" /> : jev.enabled ? <YesNo yes={false} noText="no TYPESAFE_API_KEY" /> : <YesNo yes={false} noText="disabled (JEV_ENABLED=false)" />) : "—"} />
        <KV k="Model" v={jev ? `${jev.model}${jev.resolvedModel ? ` → ${jev.resolvedModel}` : ""}` : "—"} />
        <KV k="Today" v={jev?.configured ? `${int(jev.callsToday)} calls · ${int(jev.inputTokensToday)} input tokens (budget ${int(jev.budget.dailyInputTokens)}, ${jev.budget.mode})` : demo?.jev ? "showing saved demo reads" : "—"} />
        {jev?.lastError ? <KV k="Last error" v={`${jev.lastError.kind} · ${ago(Date.parse(jev.lastError.at), now)}`} tone={C.amber} /> : null}
      </Card>

      <Card title="Data mode" sub="Where the numbers on screen come from.">
        <KV k="Mode" v={<span style={{ color: modeColor }}>{mode}</span>} />
        {demo ? <KV k="Samples captured" v={`${demo.capturedFrom ? dateTime(Date.parse(demo.capturedFrom)) : "—"} → ${demo.capturedTo ? dateTime(Date.parse(demo.capturedTo)) : "—"}`} /> : null}
        <KV k="Worker" v={data?.workerOnline && w ? `${w.workerId} · cache ${w.cache} · heartbeat ${ago(Date.parse(w.ts), now)}` : IS_STATIC ? "none (static build)" : "offline"} />
        <KV k="Read path" v={data?.via ?? "—"} />
        <div style={{ fontSize: 11.5, color: "#8b98a9", marginTop: 10, lineHeight: 1.55 }}>
          {mode === "Live"
            ? "Every panel reads the worker's cache of live CryptoDataApi responses."
            : "Panels show real CryptoDataApi responses saved earlier, with a Demo sample tag. Add a key for live data."}
        </div>
      </Card>

      <Card title="API keys" sub="Status only. Keys live in the repo-root .env on the server and never reach the browser.">
        <KV k="CDA_API_KEY" v={w ? <YesNo yes={w.keyConfigured} /> : IS_STATIC ? "not used (static build)" : "—"} />
        <KV k="Tier" v={tier ?? (w?.keyConfigured ? "not read yet" : "—")} />
        <KV k="Key limits" v={account?.perMinuteLimit ? `${int(account.perMinuteLimit)}/min · ${int(account.dailyLimit)}/day` : "—"} />
        <KV k="Used today" v={w?.budget && w.keyConfigured ? `${int(w.budget.callsToday)} of ${int(w.budget.dailyBudget)} by this dashboard${account?.requestsToday != null ? ` · ${int(account.requestsToday)} on the whole key` : ""}` : "—"} />
        <KV k="TYPESAFE_API_KEY" v={!jev ? "—" : jev.configured ? <YesNo yes /> : jev.enabled ? <YesNo yes={false} /> : "unknown (JEV_ENABLED=false)"} />
        <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
          <Link href="/setup" style={{ padding: "6px 12px", borderRadius: 8, background: C.blue, color: "#06080b", fontSize: 12, fontWeight: 600 }}>
            Set up keys
          </Link>
          <a href="https://cryptodataapi.com/pricing" target="_blank" rel="noopener noreferrer" className="cq-btn" style={{ fontSize: 12, padding: "6px 12px" }}>
            CryptoDataApi plans ↗
          </a>
          <a href="https://console.typesafe.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="cq-btn" style={{ fontSize: 12, padding: "6px 12px" }}>
            TypeSafe keys ↗
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="cq-btn" style={{ fontSize: 12, padding: "6px 12px" }}>
            Source ↗
          </a>
        </div>
      </Card>
    </div>
  );
}
