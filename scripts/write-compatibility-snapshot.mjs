import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildContractCompatibilitySnapshot,
  validateContractCompatibilitySnapshotIdentity
} from "../dist/contract-snapshot.js";
import { CONTRACT_PACKAGE_VERSION } from "../dist/index.js";

const [version, capturedAtUtc] = process.argv.slice(2);

if (version === undefined) {
  throw new Error("Usage: node scripts/write-compatibility-snapshot.mjs <semver> <captured-at-utc>");
}

if (capturedAtUtc === undefined) {
  throw new Error("captured-at-utc is required");
}

const root = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
validateContractCompatibilitySnapshotIdentity(
  version,
  packageJson.version,
  CONTRACT_PACKAGE_VERSION,
  capturedAtUtc
);
const outputPath = join(root, "docs", "compatibility", `contract-snapshot.v${version}.json`);
const snapshot = buildContractCompatibilitySnapshot(version, capturedAtUtc);

mkdirSync(dirname(outputPath), {
  recursive: true
});
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx"
});

console.log(`Wrote compatibility snapshot ${outputPath}`);
