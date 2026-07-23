import { execFileSync } from "node:child_process";

const packageName = "@ramideltoro/nutsnews-worker-contracts";
const args = parseArgs(process.argv.slice(2));
const version = args.get("version");
const expectedIntegrity = args.get("expected-integrity");
const expectedGitHead = args.get("expected-git-head");

if (version === undefined) {
  throw new Error("Usage: node scripts/verify-package-integrity.mjs --version <exact-version> [--expected-integrity <sha512-...>] [--expected-git-head <sha>]");
}

const metadata = JSON.parse(execFileSync("npm", [
  "view",
  `${packageName}@${version}`,
  "--json",
  "--registry=https://npm.pkg.github.com"
], {
  encoding: "utf8",
  stdio: [
    "ignore",
    "pipe",
    "inherit"
  ]
}));

if (metadata.name !== packageName || metadata.version !== version) {
  throw new Error(`Resolved unexpected package ${metadata.name}@${metadata.version}`);
}

if (expectedIntegrity !== undefined && metadata.dist?.integrity !== expectedIntegrity) {
  throw new Error(`Integrity mismatch: expected ${expectedIntegrity}, got ${metadata.dist?.integrity ?? "missing"}`);
}

if (expectedGitHead !== undefined && metadata.gitHead !== expectedGitHead) {
  throw new Error(`gitHead mismatch: expected ${expectedGitHead}, got ${metadata.gitHead ?? "missing"}`);
}

console.log(JSON.stringify({
  name: metadata.name,
  version: metadata.version,
  integrity: metadata.dist?.integrity,
  gitHead: metadata.gitHead
}));

function parseArgs(values) {
  const parsed = new Map();

  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];

    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new Error("Arguments must be provided as --key value pairs.");
    }

    parsed.set(key.slice(2), value);
  }

  return parsed;
}
