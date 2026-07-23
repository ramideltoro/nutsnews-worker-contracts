# Package Integrity and Provenance

Services must pin exact package versions:

```sh
npm install @ramideltoro/nutsnews-worker-contracts@0.3.1
```

Install through the owner-scoped GitHub Packages registry:

```ini
@ramideltoro:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Verify Exact Version

Use a token with `packages: read` and verify the resolved package metadata:

```sh
GITHUB_TOKEN="${GITHUB_TOKEN}" \\
NODE_AUTH_TOKEN="${GITHUB_TOKEN}" \\
node scripts/verify-package-integrity.mjs \\
  --version 0.3.1 \\
  --expected-git-head <release-commit-sha>
```

When an expected npm integrity value is available, pass it too:

```sh
node scripts/verify-package-integrity.mjs \\
  --version 0.3.1 \\
  --expected-integrity <sha512-integrity> \\
  --expected-git-head <release-commit-sha>
```

## Verify Provenance

Every publish workflow packs the tarball, creates a GitHub artifact attestation, and publishes that exact tarball to GitHub Packages.

For releases created by this repository, verify the release tag, publish workflow run, attestation, package `gitHead`, and package integrity before updating a service lockfile.

## Rollback

Rollback is dependency pinning:

1. Restore the previous exact package version in the consuming service.
2. Regenerate the service lockfile.
3. Run the service's conformance tests against the shared fixture suite.
4. Redeploy through that service's protected rollout path.

Published package versions are immutable and must not be republished in place.
