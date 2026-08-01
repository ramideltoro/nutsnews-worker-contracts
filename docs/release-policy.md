# Release Policy

## Ownership

`ramideltoro/nutsnews-worker-contracts` owns the `@ramideltoro/nutsnews-worker-contracts` package, package CI, release workflow, package access notes, and repo-local operational notes.

The package does not own backend host runtime, production deployment secrets, Grafana Cloud resources, explanatory architecture docs, or the active legacy worker runtime.

## Versioning

The package follows semantic versioning:

- Major versions may change published contract shapes or remove deprecated contract fields.
- Minor versions add backward-compatible contract fields, schema options, fixtures, or metadata.
- Patch versions fix metadata, generated types, documentation, or fixtures without changing accepted messages.

Consumers must pin exact versions. Ranges such as `^1.2.3` are not part of the supported upgrade path for production services.

See [compatibility-matrix.md](compatibility-matrix.md) for supported versions, fixture suites, deprecation windows, and breaking-change rules.

## Release Procedure

1. Merge package changes to `main` through pull request review and passing CI.
2. Confirm `package.json`, `CHANGELOG.md`, and exported package metadata use the same version.
3. Create a GitHub release whose tag is `v<package.json version>`.
4. Let the publish workflow run from the release event.
5. Confirm the workflow produced an artifact attestation and published the package to GitHub Packages.
6. Confirm a fresh consumer install can resolve the exact published version through the `@ramideltoro` GitHub Packages scope.
7. Run the `Package Install Smoke` workflow with the exact published version and confirm it installs and imports the package using repository `GITHUB_TOKEN` package-read permissions.
8. For compatibility or schema changes, confirm `npm run compatibility:check` passed and the compatibility matrix was updated.
9. Freeze a compatibility snapshot for each major contract baseline with `node scripts/write-compatibility-snapshot.mjs <version> <captured-at-utc>`, and include it before any later contract change is accepted.

Manual `workflow_dispatch` publish runs are allowed only for rerunning the same source version after an infrastructure failure before the version has been published.

## Release Workflow Controls

The publish workflow:

- grants `packages: write`, `id-token: write`, and `attestations: write` only to the publish job;
- runs `npm ci --ignore-scripts` and the full package CI before publishing so the package-write token is not exposed to dependency lifecycle scripts;
- rejects release tags that do not match `package.json`;
- rejects already-published versions;
- packs the tarball before publishing;
- attests the exact tarball;
- publishes the exact packed tarball to GitHub Packages.

## Rollback

Rollback happens in consumers by restoring the prior exact package version, regenerating the service lockfile, running service CI, and redeploying through that service's protected rollout path.

Published versions are immutable and must not be republished in place. Package deletion is reserved for exceptional security response and must be recorded in release notes and the relevant tracking issue.

Consumers verify package integrity before rollout using [package-integrity.md](package-integrity.md), then roll back by restoring the previous exact dependency version and service lockfile.

## Compatibility Promise

The package is the sole source of truth for worker-uplift contracts after each contract surface is introduced. Services must not copy contract definitions into service-local source trees or depend on this repository through git checkouts.

Bootstrap release `0.1.0` exports only package metadata and compatibility policy. RabbitMQ topology, message envelopes, stage payload schemas, and fixtures are intentionally introduced by later ordered contract tasks.
