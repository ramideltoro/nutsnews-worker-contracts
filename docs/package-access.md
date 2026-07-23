# Package Access

Package: `@ramideltoro/nutsnews-worker-contracts`

Consumers must install exact immutable versions from GitHub Packages:

```sh
npm install @ramideltoro/nutsnews-worker-contracts@0.3.1
```

CI consumers use the owner-scoped npm registry and a short-lived `GITHUB_TOKEN`:

```ini
@ramideltoro:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Source checkout and long-lived package tokens are not part of the supported access path.

## Upgrade Procedure

1. Update the consuming service dependency to the exact new package version.
2. Run the service's contract tests and normal CI against that pinned version.
3. Deploy through the service repository's normal protected rollout path.
4. Keep the previous pinned version available in the lockfile history for rollback.

## Rollback Procedure

Rollback is dependency pinning, not package mutation. Restore the previous exact package version in the consuming service, regenerate the lockfile, run CI, and redeploy through that service's protected rollout path.

Published package versions are not republished in place. Deletion is reserved for exceptional security response and must be documented in the release notes and issue tracker.
