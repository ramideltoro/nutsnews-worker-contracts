# nutsnews-worker-contracts

Versioned worker-uplift contract package for NutsNews services.

## Responsibility

Own versioned RabbitMQ exchanges, routing keys, queue names, retry/DLQ names, message schemas, and fixtures for the worker-uplift pipeline.

Version `1.0.0` defines the RabbitMQ topology, common message envelope, stage payload schemas, sanitized parity fixtures, and compatibility/conformance checks. It corrects canonical article candidate ownership to the actual fetcher-to-canonicalizer boundary.

## Owner

@ramideltoro

## Deployable / Package Type

GitHub Packages npm package: `@ramideltoro/nutsnews-worker-contracts`. This repository is not deployable.

## Install

Consumers install exact immutable versions from GitHub Packages:

```sh
npm install @ramideltoro/nutsnews-worker-contracts@1.0.0
```

CI consumers use the owner-scoped npm registry with a short-lived `GITHUB_TOKEN`:

```ini
@ramideltoro:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Source checkouts and git dependencies are outside the supported access path.

## Package API

```ts
import { getContractPackageMetadata } from "@ramideltoro/nutsnews-worker-contracts";

const metadata = getContractPackageMetadata();
```

Topology and envelope contracts are exported from the package:

```ts
import {
  WORKER_ROUTES,
  STAGE_PAYLOAD_FIXTURES,
  getRetryDestination,
  validateStagePayload,
  validateWorkerEnvelope
} from "@ramideltoro/nutsnews-worker-contracts";
```

See [docs/adr-0001-rabbitmq-topology-envelope.md](docs/adr-0001-rabbitmq-topology-envelope.md) for route ownership, retry/DLQ behavior, delivery assumptions, and validation rules.
See [docs/adr-0002-stage-payload-schemas-fixtures.md](docs/adr-0002-stage-payload-schemas-fixtures.md) for stage payload schemas, fixtures, and producer/consumer field expectations.
See [docs/compatibility-matrix.md](docs/compatibility-matrix.md) and [docs/package-integrity.md](docs/package-integrity.md) for supported versions, conformance, integrity verification, and rollback.

## Development

```sh
npm ci --ignore-scripts
npm run ci
```

`npm run ci` runs linting, strict type checking, tests, build, and package-content validation. CI rejects failures in any of those steps.

## Releases

Published versions are immutable. Releases are created from tags matching `v<package.json version>`, then the publish workflow:

- installs dependencies with `npm ci --ignore-scripts`;
- reruns the full package CI;
- rejects an already-published package version;
- builds and dry-validates the package tarball contents;
- creates a GitHub artifact attestation for the tarball;
- publishes the package to GitHub Packages with `packages: write` scoped only to the publish job.

See [docs/release-policy.md](docs/release-policy.md) for versioning, upgrade, and rollback rules.

## Support Boundary

This repository owns its package or service implementation, CI, package or image publishing workflow, and service-local operational notes. It does not own the backend host, production deployment secrets, Grafana Cloud resources, or cross-system explanatory documentation.

## Production Boundary

`ramideltoro/nutsnews-backend` owns backend-host runtime and deployments. `production-backend` in that repository remains the runtime secret and deployment boundary. No production secret belongs in this repository.

`ramideltoro/nutsnews-infra` owns Grafana Cloud resources. `ramideltoro/nutsnews-docs` owns explanatory architecture and operations documentation.

## Package / Image Access

Downstream builds consume this package through GitHub Packages with an exact immutable version, for example `@ramideltoro/nutsnews-worker-contracts@1.0.0`, using a short-lived `GITHUB_TOKEN` and the owner-scoped npm registry.

No long-lived GitHub Packages token is required for CI. Workflows use least-privilege permissions and request `packages: write` only for publish jobs.

## Exclusions

This package must not include broker credentials, production secrets, business implementation, deployment code, or imports from the active legacy worker runtime.

## Guardrail

This repository must not modify, disable, or depend on the active legacy `ramideltoro/nutsnews-worker` ingestion or failover path.
