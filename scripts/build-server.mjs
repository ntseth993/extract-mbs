import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist-server", { recursive: true, force: true });

await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist-server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["vite"],
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

console.log("Server bundled to dist-server/index.mjs");
