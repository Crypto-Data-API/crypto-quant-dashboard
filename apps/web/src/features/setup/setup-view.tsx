"use client";

import { Bot, Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useWorkerStatus } from "@/lib/hooks";
import { IS_STATIC, REPO_URL } from "@/lib/mode";
import { AGENT_PROMPT } from "./agent-prompt";

function KeyCard({
  icon: Icon,
  name,
  envVar,
  state,
  children,
}: {
  icon: React.ElementType;
  name: string;
  envVar: string;
  state: { label: string; tone: "good" | "warning" | "info" | "outline" };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden />
          {name}
        </CardTitle>
        <Badge variant={state.tone}>{state.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div>
          Environment variable: <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{envVar}</code>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const ext = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
    {label}
    <ExternalLink className="size-3" aria-hidden />
  </a>
);

export function SetupView() {
  const { data } = useWorkerStatus();
  const [copied, setCopied] = useState(false);
  const w = data?.worker ?? null;

  const cdaState: { label: string; tone: "good" | "warning" | "info" | "outline" } = IS_STATIC
    ? { label: "Static demo", tone: "info" }
    : !w
      ? { label: "Worker offline", tone: "outline" }
      : w.keyConfigured
        ? { label: "Configured: live data", tone: "good" }
        : { label: "Not set: demo data", tone: "warning" };
  const jevState: { label: string; tone: "good" | "warning" | "info" | "outline" } = IS_STATIC
    ? { label: "Static demo", tone: "info" }
    : !w
      ? { label: "Worker offline", tone: "outline" }
      : w.jev.configured && !w.demo?.jev
        ? { label: "Configured: live reads", tone: "good" }
        : w.jev.configured
          ? { label: "Set, idle in demo mode", tone: "info" }
          : { label: "Not set: demo reads", tone: "warning" };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Set up live data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The dashboard runs with no keys at all: every panel then shows saved responses (demo mode). Two keys switch it to live data. Both live only in the repo-root{" "}
          <code className="font-mono text-xs">.env</code> and are read by the worker; the browser never sees them.
          {IS_STATIC ? <> This page is part of the static demo, so clone the repo ({ext(REPO_URL, "GitHub")}) to run it yourself.</> : null}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KeyCard icon={KeyRound} name="CryptoDataApi key (required for live data)" envVar="CDA_API_KEY" state={cdaState}>
          <p>Every market panel, the KPI tiles and the live tape come from CryptoDataApi.</p>
          <p>
            A free key comes from <code className="font-mono text-xs">POST https://cryptodataapi.com/api/v1/auth/keys</code> with your email (see{" "}
            {ext("https://cryptodataapi.com/ai-agents", "AI agent guide")}). Confirming the email turns on Pro for 24 hours. The dashboard is sized for Pro or Pro Plus
            ({ext("https://cryptodataapi.com/pricing", "pricing")}).
          </p>
        </KeyCard>
        <KeyCard icon={Bot} name="TypeSafe key (optional)" envVar="TYPESAFE_API_KEY" state={jevState}>
          <p>Powers the Jev classifier: its read of each news catalyst, the cascade odds on squeeze alerts and the market read in the sidebar.</p>
          <p>
            Create one at {ext("https://console.typesafe.ai/settings/keys", "console.typesafe.ai")}. Without it those panels show saved reads. Billing is on input tokens, about
            0.3M a day as built.
          </p>
        </KeyCard>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Set up with your agent</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Paste this into your own AI coding agent. It clones the repo, gets the keys with you, starts everything and checks it.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void copy()} aria-live="polite">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="scrollbar-thin max-h-[480px] overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{AGENT_PROMPT}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Or by hand</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="scrollbar-thin overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed">{`git clone ${REPO_URL}.git
cd crypto-quant-dashboard
pnpm install
cp .env.example .env        # then set CDA_API_KEY (and optionally TYPESAFE_API_KEY)
docker compose up -d redis
pnpm dev                    # web http://localhost:3001, worker http://localhost:4100
curl -s http://localhost:3001/api/status   # worker.keyConfigured should be true`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
