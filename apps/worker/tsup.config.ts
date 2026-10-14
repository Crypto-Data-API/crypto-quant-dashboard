import { defineConfig } from "tsup";

// Bundle the worker and the workspace packages it imports (they ship TypeScript source)
// into one ESM file. Third-party dependencies stay external and load from node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@cqd\//],
});
