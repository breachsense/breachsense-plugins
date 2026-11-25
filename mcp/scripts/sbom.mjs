// CycloneDX 1.5 SBOM for the bundled server. Built from the esbuild metafile, so it lists exactly the
// packages inlined into dist/server.mjs (not dev tooling), with versions, licenses and lockfile hashes.
// The bundle has no runtime dependencies, so `npm audit` on a consumer's side sees none: this file is
// how customers' SCA tools see what is inside.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const purl = (name, version) => `pkg:npm/${name.replace(/^@/, "%40")}@${version}`;

/** Package dirs ("node_modules/a", "node_modules/@s/b", "node_modules/a/node_modules/c") behind the bundle inputs. */
export function bundledPackageDirs(metafile) {
  const dirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const m = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (m) dirs.add(m[1]);
  }
  return [...dirs].sort();
}

export function buildSbom({ metafile, pkg, lock, readPkg, esbuildVersion, now = new Date() }) {
  const components = bundledPackageDirs(metafile).map((dir) => {
    const p = readPkg(dir);
    const ref = purl(p.name, p.version);
    const c = { type: "library", "bom-ref": ref, name: p.name, version: p.version, purl: ref };
    const scope = p.name.match(/^(@[^/]+)\/(.+)$/);
    if (scope) { c.group = scope[1]; c.name = scope[2]; }
    if (typeof p.license === "string") c.licenses = [{ expression: p.license }];
    const integrity = lock.packages?.[dir]?.integrity;
    const sha512 = integrity?.match(/^sha512-(.+)$/);
    if (sha512) c.hashes = [{ alg: "SHA-512", content: Buffer.from(sha512[1], "base64").toString("hex") }];
    return c;
  });
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: { components: [{ type: "application", name: "esbuild", version: esbuildVersion }] },
      component: {
        type: "application",
        "bom-ref": purl(pkg.name, pkg.version),
        group: pkg.name.split("/")[0],
        name: pkg.name.split("/")[1],
        version: pkg.version,
        purl: purl(pkg.name, pkg.version),
        licenses: [{ expression: pkg.license }],
      },
    },
    components,
    dependencies: [{ ref: purl(pkg.name, pkg.version), dependsOn: components.map((c) => c["bom-ref"]) }],
  };
}

export const readPkgFromDisk = (dir) => JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
