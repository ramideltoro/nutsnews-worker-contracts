# Repository Boundary

| Field | Value |
| --- | --- |
| Repository | `ramideltoro/nutsnews-worker-contracts` |
| Owner | `@ramideltoro` |
| Responsibility | Own versioned RabbitMQ exchanges, routing keys, queue names, retry/DLQ names, message schemas, and fixtures for the worker-uplift pipeline. |
| Deployable / package type | Package repo. Publishes `@ramideltoro/nutsnews-worker-contracts` to GitHub Packages. |
| Primary artifact | GitHub Packages npm package |
| Support boundary | Repo-local code, tests, CI, package/image publishing, and service-local run notes. |
| Outside boundary | Backend host runtime/deployments, Grafana Cloud resources, explanatory architecture/operations docs, production secrets, legacy ingestion. |

## Existing Ownership Boundaries

- `ramideltoro/nutsnews-backend` owns backend-host runtime and deployments.
- `production-backend` in `ramideltoro/nutsnews-backend` remains the runtime secret and deployment boundary.
- `ramideltoro/nutsnews-infra` owns Grafana Cloud resources.
- `ramideltoro/nutsnews-docs` owns explanatory architecture and operations docs.
- `ramideltoro/nutsnews-worker` remains the active legacy ingestion and failover path until explicit cutover.

## Control Baseline

- Public repository with MIT license to match existing NutsNews worker/docs visibility and licensing.
- Default branch: `main`.
- CODEOWNERS assigns repository ownership to `@ramideltoro`.
- Default Actions token permission: read-only.
- Publish workflows request package write permission only inside publish jobs.
- CI validates repo boundary docs, linting, strict TypeScript checks, tests, build output, and package contents on every push and pull request.
- CodeQL, dependency review, and Gitleaks secret scanning workflows are present for code-bearing changes.
- Dependabot checks GitHub Actions and npm manifests.
- Branch protection requires pull requests, resolved conversations, and the `validate` status check where GitHub permits repository branch protection. CODEOWNERS documents ownership for reviews.

## Package Controls

- Package versions publish to GitHub Packages from matching `v<version>` releases.
- Downstream repositories install exact package versions through `GITHUB_TOKEN` with `packages: read`; source checkouts and git dependencies are unsupported.
- Publish jobs pack the tarball, verify the expected contents, attest the artifact, and reject republishing an existing version.
- The package contains no broker credentials, production secrets, business implementation, deployment code, or imports from the active legacy worker runtime.
- Service repos publish signed, immutable SHA-tagged images to GHCR. Backend production deploys pull through `ramideltoro/nutsnews-backend/.github/workflows/protected-backend-ansible-apply.yml` only.
- App repos must not define production environments or store production runtime secrets.
