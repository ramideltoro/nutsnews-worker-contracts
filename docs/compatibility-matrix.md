# Compatibility Matrix

Deprecation window: `90` days from release unless a security response explicitly shortens support.

| Version | Status | Supported until | Contract surfaces | Fixture suites | Release |
| --- | --- | --- | --- | --- | --- |
| `0.1.0` | supported | `2026-10-21` | bootstrap metadata | `bootstrap-metadata-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.1.0 |
| `0.2.0` | supported | `2026-10-21` | bootstrap metadata; RabbitMQ topology and envelope | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.2.0 |
| `0.3.0` | supported | `2026-10-21` | bootstrap metadata; RabbitMQ topology and envelope; stage payload schemas and fixtures | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1`; `stage-payload-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.3.0 |
| `0.3.1` | supported | `2026-10-21` | bootstrap metadata; RabbitMQ topology and envelope; stage payload schemas and fixtures; compatibility and conformance tooling | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1`; `stage-payload-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.3.1 |

## Compatibility Rules

Backward-compatible changes:

- adding an optional payload field;
- adding a new fixture that validates against an existing schema;
- adding a new helper export without changing existing exported values;
- tightening documentation without changing schema IDs, required fields, route names, or queue names.

Breaking changes:

- removing a schema, route, retry tier, field, fixture suite, or exported schema ID;
- renaming a route, queue, routing key, producer, consumer, or schema ID;
- changing retry delays or max attempts;
- changing a field from optional to required;
- changing a field type or enum meaning incompatibly;
- reducing payload size limits below the published fixture suite.

Breaking changes require a major version bump and migration notes in `docs/migrations/MIGRATION-v<version>.md`.

## CI Enforcement

`npm run compatibility:check` compares the current built contract metadata against `docs/compatibility/contract-snapshot.v0.3.0.json`.

CI fails when it detects a breaking change unless:

- `package.json` has a major version greater than the baseline major version; and
- migration notes exist for the new version.

The compatibility test suite also validates producer and consumer conformance against the shared fixture suite so old and new compatible consumers use the same examples.
