import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outfile = "../plugins/breachsense/mcp/server.mjs";
await build({
  entryPoints: ["src/stdio.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// Claude Desktop bundle staging directory (packed with @anthropic-ai/mcpb, not committed).
mkdirSync("dist-mcpb/server", { recursive: true });
cpSync(outfile, "dist-mcpb/server/index.mjs");
const manifest = JSON.parse(readFileSync("mcpb/manifest.json", "utf8"));
manifest.version = JSON.parse(readFileSync("package.json", "utf8")).version;
writeFileSync("dist-mcpb/manifest.json", JSON.stringify(manifest, null, 2));
console.error(`built ${outfile} and dist-mcpb/`);
