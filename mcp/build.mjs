import { build, version as esbuildVersion } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildSbom, readPkgFromDisk } from "./scripts/sbom.mjs";

const outfile = "../plugins/breachsense/mcp/server.mjs";
const result = await build({
  entryPoints: ["src/stdio.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  legalComments: "none",
  metafile: true,
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// npm package entry (the `breachsense-mcp` bin). Same bundle, not committed.
mkdirSync("dist", { recursive: true });
cpSync(outfile, "dist/server.mjs");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const sbom = buildSbom({ metafile: result.metafile, pkg, lock, readPkg: readPkgFromDisk, esbuildVersion });
writeFileSync("dist/sbom.cdx.json", JSON.stringify(sbom, null, 2) + "\n");

// Claude Desktop bundle staging directory (packed with @anthropic-ai/mcpb, not committed).
mkdirSync("dist-mcpb/server", { recursive: true });
cpSync(outfile, "dist-mcpb/server/index.mjs");
const manifest = JSON.parse(readFileSync("mcpb/manifest.json", "utf8"));
manifest.version = pkg.version;
writeFileSync("dist-mcpb/manifest.json", JSON.stringify(manifest, null, 2));
console.error(`built ${outfile}, dist/server.mjs, dist/sbom.cdx.json (${sbom.components.length} bundled packages) and dist-mcpb/`);
