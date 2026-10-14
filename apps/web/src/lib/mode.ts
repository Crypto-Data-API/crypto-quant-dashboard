/**
 * Data mode. "server" (default) reads our own /api routes, backed by the worker. "static" is the
 * GitHub Pages export (NEXT_PUBLIC_DATA_MODE=static): no server at all, every panel reads the
 * samples bundled under public/samples by scripts/export-samples.ts.
 */
export const IS_STATIC = process.env.NEXT_PUBLIC_DATA_MODE === "static";

/** "/crypto-quant-dashboard" on GitHub Pages, "" otherwise. Next adds it to links, not to fetch(). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const REPO_URL = "https://github.com/Crypto-Data-API/crypto-quant-dashboard";
export const DEMO_URL = "https://crypto-data-api.github.io/crypto-quant-dashboard/";

export const samplesUrl = (path: string) => `${BASE_PATH}/samples/${path}`;

/** File name of a dataset sample in the static export. */
export const sampleFile = (id: string, param: string | null) => (param ? `data/${id}--${param}.json` : `data/${id}.json`);
