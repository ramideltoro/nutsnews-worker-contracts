import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  buildContractCompatibilitySnapshot,
  detectContractBreakingChanges,
  selectContractCompatibilityBaselines
} from "../dist/contract-snapshot.js";

const root = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const snapshots = readdirSync(join(root, "docs", "compatibility"))
  .filter((file) => /^contract-snapshot\.v\d+\.\d+\.\d+\.json$/u.test(file))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(root, "docs", "compatibility", file), "utf8")));
const currentMajor = majorVersion(packageJson.version);
const migrationPath = join(root, "docs", "migrations", `MIGRATION-v${packageJson.version}.md`);
const currentSnapshot = buildContractCompatibilitySnapshot(packageJson.version, new Date(0).toISOString());
const baselines = selectContractCompatibilityBaselines(snapshots, packageJson.version);

for (const snapshot of baselines) {
  const breakingChanges = detectContractBreakingChanges(snapshot, currentSnapshot);

  if (breakingChanges.length > 0) {
    const baselineMajor = majorVersion(snapshot.baselinePackageVersion);

    if (currentMajor <= baselineMajor) {
      throw new Error(`Breaking contract changes relative to ${snapshot.baselinePackageVersion} require a major version bump: ${breakingChanges.join("; ")}`);
    }

    if (!existsSync(migrationPath)) {
      throw new Error(`Breaking contract changes require migration notes at ${migrationPath}: ${breakingChanges.join("; ")}`);
    }
  }
}

console.log(`Contract compatibility check passed against ${baselines.map((snapshot) => snapshot.baselinePackageVersion).join(", ")}.`);

function majorVersion(version) {
  const [major] = version.split(".");
  return Number.parseInt(major ?? "0", 10);
}
