# ADR 0001: RabbitMQ Topology and Message Envelope

## Status

Accepted for package version `0.2.0`.

## Context

The worker-uplift pipeline needs one versioned source of truth for queue names, routing keys, retry names, DLQ names, delivery behavior, and the common envelope carried between services. Stage payload schemas are intentionally defined in the next contract task.

## Decision

All worker-uplift RabbitMQ routes use:

- main exchange `nutsnews.worker.v1`;
- retry exchange `nutsnews.worker.retry.v1`;
- terminal DLQ exchange `nutsnews.worker.dlq.v1`;
- quorum durable queues;
- persistent JSON messages with content type `application/json` and encoding `utf-8`;
- publisher confirms with a `5000ms` timeout;
- mandatory routing;
- manual ack/nack;
- consumer prefetch `16`;
- at-least-once delivery with possible duplicates and no global ordering;
- three fixed retry tiers: `retry-30s`, `retry-5m`, `retry-30m`;
- max attempts `4`, where attempt `4` routes to the terminal DLQ after failure.

Consumers must publish and confirm retry or DLQ transfer before acknowledging the original delivery. Broker DLX behavior is a retry queue TTL return mechanism and policy fallback, not the primary guarantee for failed main-queue deliveries. Services must not rely on broker DLX to move a failed main delivery unless the approved queue type and policy explicitly provide the same publish-confirm-before-ack guarantee.

Retry queues use queue-level TTL and dead-letter back to the main exchange/routing key. Services must not use unbounded per-message TTL retry patterns that can create head-of-line blocking.

## Route Table

| Stage | Producer | Consumer owner | Routing key | Main queue | Retry queues | Terminal DLQ | Schema identifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fetch` | `scheduler` | `fetcher` | `nutsnews.worker.fetch.v1` | `nutsnews.worker.fetch.v1` | `nutsnews.worker.fetch.v1.retry-30s`, `nutsnews.worker.fetch.v1.retry-5m`, `nutsnews.worker.fetch.v1.retry-30m` | `nutsnews.worker.fetch.v1.dlq` | `nutsnews.worker.envelope.v1` |
| `canonicalization` | `fetcher` | `canonicalizer` | `nutsnews.worker.canonicalization.v1` | `nutsnews.worker.canonicalization.v1` | `nutsnews.worker.canonicalization.v1.retry-30s`, `nutsnews.worker.canonicalization.v1.retry-5m`, `nutsnews.worker.canonicalization.v1.retry-30m` | `nutsnews.worker.canonicalization.v1.dlq` | `nutsnews.worker.envelope.v1` |
| `enrichment` | `canonicalizer` | `enrichment` | `nutsnews.worker.enrichment.v1` | `nutsnews.worker.enrichment.v1` | `nutsnews.worker.enrichment.v1.retry-30s`, `nutsnews.worker.enrichment.v1.retry-5m`, `nutsnews.worker.enrichment.v1.retry-30m` | `nutsnews.worker.enrichment.v1.dlq` | `nutsnews.worker.envelope.v1` |
| `approval` | `enrichment` | `approval` | `nutsnews.worker.approval.v1` | `nutsnews.worker.approval.v1` | `nutsnews.worker.approval.v1.retry-30s`, `nutsnews.worker.approval.v1.retry-5m`, `nutsnews.worker.approval.v1.retry-30m` | `nutsnews.worker.approval.v1.dlq` | `nutsnews.worker.envelope.v1` |
| `translation` | `approval` | `translation` | `nutsnews.worker.translation.v1` | `nutsnews.worker.translation.v1` | `nutsnews.worker.translation.v1.retry-30s`, `nutsnews.worker.translation.v1.retry-5m`, `nutsnews.worker.translation.v1.retry-30m` | `nutsnews.worker.translation.v1.dlq` | `nutsnews.worker.envelope.v1` |
| `persistence` | `translation` | `persistence` | `nutsnews.worker.persistence.v1` | `nutsnews.worker.persistence.v1` | `nutsnews.worker.persistence.v1.retry-30s`, `nutsnews.worker.persistence.v1.retry-5m`, `nutsnews.worker.persistence.v1.retry-30m` | `nutsnews.worker.persistence.v1.dlq` | `nutsnews.worker.envelope.v1` |
| `publication` | `persistence` | `publication` | `nutsnews.worker.publication.v1` | `nutsnews.worker.publication.v1` | `nutsnews.worker.publication.v1.retry-30s`, `nutsnews.worker.publication.v1.retry-5m`, `nutsnews.worker.publication.v1.retry-30m` | `nutsnews.worker.publication.v1.dlq` | `nutsnews.worker.envelope.v1` |

The TypeScript package generates this table from `WORKER_STAGES`, `WORKER_ROUTE_OWNERS`, `WORKER_RETRY_TIERS`, and `buildWorkerRoute`. Services must consume those exports instead of duplicating strings.

## Envelope

Every routed message uses `schemaId` `nutsnews.worker.envelope.v1` and schema version `1`.

Required envelope fields:

- `schemaId`
- `schemaVersion`
- `route`
- `messageId`
- `causationId`
- `correlationId`
- `traceparent`
- optional `tracestate`
- `idempotencyKey`
- `aggregate.type`
- `aggregate.id`
- `aggregate.version`
- `occurredAt`
- `attempt.count`
- `attempt.max`
- `attempt.firstAttemptAt`
- optional `attempt.lastAttemptAt`
- `producer.name`
- `producer.version`
- optional `producer.instanceId`
- `payloadRef.kind`
- `payloadRef.uri`
- `payloadRef.mediaType`
- `payloadRef.sizeBytes`
- optional `payloadRef.digest`

The envelope must not contain article bodies, model bodies, or other large payload data. Large data belongs behind `payloadRef`.

## Validation

`validateWorkerEnvelope` rejects envelopes deterministically when:

- the envelope is not a JSON object;
- unknown top-level or nested fields are present;
- the envelope JSON exceeds `16384` bytes;
- routing/header material exceeds `8192` bytes;
- `schemaId` differs from `nutsnews.worker.envelope.v1`;
- `schemaVersion` is stale or newer than the package supports;
- route, UUIDs, W3C `traceparent`, timestamps, idempotency key, aggregate, attempt, producer, or payload reference fields have invalid formats;
- `payloadRef` exceeds `4096` bytes;
- `payloadRef.uri` exceeds `2048` bytes or inlines data;
- `payloadRef.sizeBytes` exceeds the bounded referenced payload size.

Malformed, oversized, stale-version, and unsupported-version envelopes must not be retried indefinitely. They are poison messages and follow the terminal DLQ convention after the consuming service publishes and confirms the DLQ transfer.

## Consequences

Services assume duplicates can occur and must enforce idempotency with `idempotencyKey`, `aggregate`, and route-specific persistence checks.

No service may assume total ordering across routes or aggregate IDs. Per-aggregate version checks belong in service logic and persistence.

The active legacy ingestion and failover paths remain unchanged by this contract.
