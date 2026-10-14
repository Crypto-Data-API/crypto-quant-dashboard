/**
 * Validate the saved CDA responses in docs/samples/ against the dataset validators.
 *   pnpm --filter @cqd/schemas check-samples
 * Each sample file is named after its dataset id (optionally suffixed with -SYMBOL).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET_IDS, type DatasetId } from "../src/datasets";
import { DelayedStreamResponse, validateDataset } from "../src/validators";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../../../docs/samples");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const ids = [...DATASET_IDS].sort((a, b) => b.length - a.length);

let failures = 0;
for (const file of files) {
  const base = file.replace(/\.json$/, "");
  const data: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
  if (base === "stream-delayed") {
    const r = DelayedStreamResponse.safeParse(data);
    console.log(`${r.success ? "ok  " : "FAIL"} ${file} -> stream-delayed`);
    if (!r.success) failures++;
    continue;
  }
  const id = ids.find((d) => base === d || base.startsWith(`${d}-`)) as DatasetId | undefined;
  if (!id) {
    console.log(`skip ${file} (no matching dataset)`);
    continue;
  }
  const r = validateDataset(id, data, 5);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${file} -> ${id}${r.ok ? "" : `\n     ${r.issues?.join("\n     ")}`}`);
  if (!r.ok) failures++;
}
console.log(failures === 0 ? `\nall ${files.length} samples valid` : `\n${failures} sample(s) failed`);
process.exit(failures === 0 ? 0 : 1);
