# Compatibility Matrix

Deprecation window: `90` days from release unless a security response explicitly shortens support.

| Version | Status | Supported until | Contract surfaces | Fixture suites | Release |
| --- | --- | --- | --- | --- | --- |
| `0.1.0` | supported | `2026-10-21` | bootstrap metadata | `bootstrap-metadata-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.1.0 |
| `0.2.0` | supported | `2026-10-21` | bootstrap metadata; RabbitMQ topology and envelope | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.2.0 |
| `0.3.0` | supported | `2026-10-21` | bootstrap metadata; RabbitMQ topology and envelope; stage payload schemas and fixtures | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1`; `stage-payload-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.3.0 |
| `0.3.1` | supported | `2026-10-21` | bootstrap metadata; RabbitMQ topology and envelope; stage payload schemas and fixtures; compatibility and conformance tooling | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1`; `stage-payload-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.3.1 |
| `0.4.0` | supported | `2026-10-23` | bootstrap metadata; RabbitMQ topology and envelope; stage payload schemas and fixtures; compatibility and conformance tooling | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1`; `stage-payload-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.4.0 |
| `1.0.0` | supported | `2026-10-30` | bootstrap metadata; RabbitMQ topology and envelope; corrected stage payload ownership; compatibility and conformance tooling | `bootstrap-metadata-v1`; `rabbitmq-topology-envelope-v1`; `stage-payload-v1` | https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v1.0.0 |

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

`npm run compatibility:check` compares the current built contract metadata against the applicable frozen baselines under `docs/compatibility/`. It uses prior baselines in the current major, or the newest lower major when validating a new major, so an admitted old-major break does not force bogus migration notes on later compatible releases. Version `1.0.0` adds a normalized v2 baseline containing the payload schema version, global serialized-payload limit, and each field's required state, type, enum values, and effective byte limit. Legacy v1 snapshots remain readable for historical topology and field-presence checks.

CI fails when it detects a breaking change unless:

- `package.json` has a major version greater than the baseline major version; and
- migration notes exist for the new version.

The compatibility test suite also validates producer and consumer conformance against the shared fixture suite so old and new compatible consumers use the same examples.
