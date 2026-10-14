/**
 * Self-contained prompt a user can paste into their own AI coding agent to set up the
 * dashboard. Keep README.md ("Set up with your agent") in sync with this text.
 */
export const AGENT_PROMPT = `Set up the Crypto Quant Dashboard on this machine for me and report back when it is running.

1. Prerequisites: check for git, Node.js 20.12 or newer (22 recommended), pnpm 10 (run "corepack enable", or "npm i -g pnpm@10" if corepack cannot write to the Node folder) and Docker. Install anything missing or tell me what to install.

2. Get the code:
   git clone https://github.com/Crypto-Data-API/crypto-quant-dashboard.git
   cd crypto-quant-dashboard
   pnpm install
   cp .env.example .env

3. CryptoDataApi key (required for live data). If I do not already have one, ask me for my email address, then create a free key:
   curl -s -X POST https://cryptodataapi.com/api/v1/auth/keys -H "Content-Type: application/json" -d "{\\"email\\": \\"MY_EMAIL\\"}"
   The response field "api_key" (starts with cdk_) is shown only once. Write it into .env as CDA_API_KEY=<key>. Tell me to confirm the email CryptoDataApi sends: confirming switches on Pro for 24 hours. Paid Pro and Pro Plus plans are at https://cryptodataapi.com/pricing, and agent docs are at https://cryptodataapi.com/ai-agents.

4. TypeSafe key (optional, powers the Jev classifier panels). Ask me whether I want it. If yes, ask me to create a key at https://console.typesafe.ai/settings/keys and paste it, then write it into .env as TYPESAFE_API_KEY=<key>. If not, leave it empty: those panels show demo data.

5. Never print, log or commit either key. .env is already gitignored.

6. Start Redis: docker compose up -d redis

7. Start the app from the repo root and keep it running: pnpm dev
   (worker on http://localhost:4100, web app on http://localhost:3001)

8. Verify: open http://localhost:3001 and run
   curl -s http://localhost:3001/api/status
   Confirm worker.keyConfigured is true (and jev.configured is true if a TypeSafe key was set). If keyConfigured is false, the worker did not see the key: check that .env is in the repo root, then stop and restart pnpm dev.

9. Report what you did, which keys are configured (without showing them) and the /api/status summary.`;
