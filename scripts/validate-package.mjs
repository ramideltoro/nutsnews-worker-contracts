import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const publicApi = readFileSync(join(root, "src", "index.ts"), "utf8");

const requiredScripts = [
  "build",
  "typecheck",
  "lint",
  "test",
  "package:check",
  "ci"
];
const requiredFiles = [
  "dist",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
];
const forbiddenSourcePatterns = [
  /SUPABASE_SERVICE_ROLE_KEY/u,
  /NUTSNEWS_BACKEND_API_TOKEN/u,
  /GRAFANA_[A-Z0-9_]+/u,
  /(AMQP|BROKER|RABBITMQ)_(URL|URI|USERNAME|PASSWORD|SECRET|TOKEN)/u,
  /RABBITMQ_[A-Z0-9_]*(PASSWORD|SECRET|TOKEN)/u,
  /CLOUDFLARE_API_TOKEN/u,
  /ramideltoro\/nutsnews-worker\/worker\/src/u,
  /\.\.\/worker/u,
  /legacy-worker/u
];
const requiredPackedRootFiles = [
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "package.json"
];
const allowedPackedRootFiles = new Set(requiredPackedRootFiles);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function walkFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const localPath = relative(root, path);

    if (
      entry.isDirectory() &&
      [
        ".git",
        "coverage",
        "dist",
        "node_modules"
      ].includes(entry.name)
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
      continue;
    }

    if (entry.isFile()) {
      files.push(localPath.split(sep).join("/"));
    }
  }

  return files;
}

function assertPackageMetadata() {
  assert(packageJson.name === "@ramideltoro/nutsnews-worker-contracts", "unexpected package name");
  assert(/^\d+\.\d+\.\d+$/u.test(packageJson.version), "package version must be semver without a prerelease");
  assert(packageJson.private !== true, "package must be publishable");
  assert(packageJson.type === "module", "package must use ESM");
  assert(packageJson.sideEffects === false, "package must declare sideEffects false");
  assert(packageJson.main === "./dist/index.js", "unexpected main entry");
  assert(packageJson.types === "./dist/index.d.ts", "unexpected types entry");
  assert(packageJson.publishConfig?.registry === "https://npm.pkg.github.com", "publish registry must be GitHub Packages");
  assert(packageJson.publishConfig?.access === "public", "publish access must be public");
  assert(!packageJson.dependencies, "runtime dependencies are not allowed in the contracts package");

  for (const script of requiredScripts) {
    assert(typeof packageJson.scripts?.[script] === "string", `missing npm script: ${script}`);
  }

  for (const file of requiredFiles) {
    assert(packageJson.files?.includes(file), `package files must include ${file}`);
  }
}

function assertVersionExportMatchesManifest() {
  assert(
    publicApi.includes(`CONTRACT_PACKAGE_VERSION = "${packageJson.version}"`),
    "CONTRACT_PACKAGE_VERSION must match package.json"
  );
}

function assertNoForbiddenSourceReferences() {
  const sourceFiles = walkFiles(root).filter((file) => [
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".ts",
    ".yaml",
    ".yml"
  ].includes(extname(file)) && file !== "scripts/validate-package.mjs");

  for (const file of sourceFiles) {
    const contents = readFileSync(join(root, file), "utf8");

    for (const pattern of forbiddenSourcePatterns) {
      assert(!pattern.test(contents), `forbidden source reference matched ${pattern} in ${file}`);
    }
  }
}

function assertPackedContents() {
  const packOutput = execFileSync("npm", [
    "pack",
    "--json",
    "--dry-run"
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: [
      "ignore",
      "pipe",
      "inherit"
    ]
  });
  const [packResult] = JSON.parse(packOutput);
  const files = packResult.files.map((entry) => entry.path).sort();
  const requiredPackedFiles = [
    ...requiredPackedRootFiles,
    ...expectedBuildOutputFiles()
  ].sort();

  for (const file of requiredPackedFiles) {
    assert(files.includes(file), `packed tarball is missing ${file}`);
  }

  for (const file of files) {
    assert(file.startsWith("dist/") || allowedPackedRootFiles.has(file), `unexpected packed file: ${file}`);
    assert(!file.startsWith(".github/"), "packed tarball must not include GitHub workflow files");
    assert(!file.startsWith("src/"), "packed tarball must not include TypeScript source");
    assert(!file.startsWith("test/"), "packed tarball must not include tests");
    assert(!file.includes(".env"), "packed tarball must not include env files");
  }
}

function assertGeneratedEntriesExist() {
  for (const file of expectedBuildOutputFiles()) {
    assert(statSync(join(root, file)).isFile(), `build output missing ${file}`);
  }
}

function expectedBuildOutputFiles() {
  return walkFiles(join(root, "src"))
    .filter((file) => file.startsWith("src/") && file.endsWith(".ts"))
    .flatMap((file) => {
      const relativeOutput = file.slice("src/".length, -".ts".length);

      return [
        `dist/${relativeOutput}.d.ts`,
        `dist/${relativeOutput}.d.ts.map`,
        `dist/${relativeOutput}.js`,
        `dist/${relativeOutput}.js.map`
      ];
    });
}

assertPackageMetadata();
assertVersionExportMatchesManifest();
assertNoForbiddenSourceReferences();
assertGeneratedEntriesExist();
assertPackedContents();

console.log("Package metadata and packed contents are valid.");
