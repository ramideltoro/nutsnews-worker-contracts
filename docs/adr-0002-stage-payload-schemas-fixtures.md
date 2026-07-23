# ADR 0002: Stage Payload Schemas and Fixtures

## Status

Accepted for package version `0.3.0`.

## Context

ADR 0001 defines the RabbitMQ route topology and common envelope. Each envelope points at bounded durable payload state through `payloadRef`. The pipeline also needs stable stage payload schemas and sanitized fixtures so services can validate their inputs and outputs without importing another service implementation.

The payload schemas retain the legacy parity baseline while keeping article bodies, model output bodies, prompts, credentials, and production token material out of queue payloads.

## Common Fields

Every stage payload carries these fields:

| Field | Producer expectation | Consumer expectation |
| --- | --- | --- |
| `schemaId` | Use the exact schema ID exported by `STAGE_PAYLOAD_SCHEMA_IDS`. | Reject unknown schema IDs. |
| `schemaVersion` | Publish version `1`. | Reject unsupported versions. |
| `pipelineRunId` | Preserve the end-to-end run ID across hops. | Use for traceability and replay grouping. |
| `stageExecutionId` | Generate a new ID per stage execution attempt. | Use for stage-local idempotency and audit rows. |
| `sourceMessageId` | Copy the envelope message ID from the previous hop. | Link payload state to the source delivery. |
| `idempotencyKey` | Preserve the stable idempotency key across retries/replays. | Dedupe retries, replays, and backend writes. |
| `traceparent` | Copy W3C trace context from the envelope. | Continue distributed tracing across service boundaries. |
| `tracestate` | Copy only when present and bounded. | Forward without interpreting service-private vendor state. |
| `producedAt` | Emit an ISO-8601 UTC timestamp with milliseconds. | Use for stale/replay diagnostics, not ordering guarantees. |
| `replayOfMessageId` | Set only for explicit replay payloads. | Treat replay as idempotent work, not a new article candidate. |

## Schema Table

| Schema ID | Producer | Consumer | Required stage fields | Retained behavior |
| --- | --- | --- | --- | --- |
| `nutsnews.worker.payload.feed-fetch-request.v1` | `scheduler` | `fetcher` | `feedId`, `feedUrl`, `shardIndex`, `shardCount`, `fetchReason`, `limits` | Preserves live shard count/cadence evidence and bounded fetch limits. |
| `nutsnews.worker.payload.feed-fetch-result.v1` | `fetcher` | `canonicalizer` | `feedId`, `feedUrl`, `fetchStatus`, `itemRefs` | Preserves success, unchanged feed, malformed feed, timeout, and sanitized feed health outcomes. |
| `nutsnews.worker.payload.canonical-article-candidate.v1` | `canonicalizer` | `enrichment` | `candidateId`, `feedId`, `sourceItemId`, `originalUrl`, `canonicalUrl`, `title`, `sourceName`, `dedupeStatus` | Preserves original URL normalization and duplicate suppression before expensive work. |
| `nutsnews.worker.payload.enrichment-result.v1` | `enrichment` | `approval` | `candidateId`, `canonicalUrl`, `imageStatus`, `articleMetadataRef` | Preserves article-page image lookup and no-thumbnail behavior by reference. |
| `nutsnews.worker.payload.approval-decision.v1` | `approval` | `translation` | `candidateId`, `decision`, `provider`, `model`, `reviewRef` | Preserves local prefilter, local AI review metadata, rejection reasons, and structured failure handling. |
| `nutsnews.worker.payload.translation-task.v1` | `approval` | `translation` | `articleId`, `sourceLanguage`, `targetLanguages`, `reason`, `existingLanguageCodes` | Preserves required language set and backlog/replay task reasons. |
| `nutsnews.worker.payload.translation-result.v1` | `translation` | `persistence` | `articleId`, `translationStatus`, `completedLanguageCodes`, `missingLanguageCodes`, `summaryRefs` | Preserves partial translation and quality evidence without translated bodies. |
| `nutsnews.worker.payload.persistence-command.v1` | `persistence` | `persistence` | `commandId`, `commandKind`, `backendOperation`, `entityRefs`, `writeMode`, `providerMode` | Preserves backend Worker DB API operation names and idempotent write modes. |
| `nutsnews.worker.payload.persistence-result.v1` | `persistence` | `publication` | `commandId`, `backendOperation`, `persistenceStatus` | Preserves saved, duplicate, rejected, transient failure, and permanent failure write outcomes. |
| `nutsnews.worker.payload.publication-readiness.v1` | `publication` | `publication` | `articleId`, `readinessStatus`, `requiredLanguageCodes`, `availableLanguageCodes`, `missingLanguageCodes`, `snapshotRefreshRequired` | Preserves translation hold and snapshot refresh readiness. |
| `nutsnews.worker.payload.terminal-failure.v1` | `any-stage-consumer` | `dlq-operator` | `failedSchemaId`, `failedMessageId`, `failedRoute`, `failedAttemptCount`, `failureClass`, `errorCode`, `sanitizedError`, `retryExhausted`, `originalPayloadRef` | Preserves poison-message and retry-exhaustion evidence for DLQ handling. |

## Fixture Set

`STAGE_PAYLOAD_FIXTURES` contains sanitized examples for:

- success;
- duplicate candidate/write;
- unchanged feed;
- rejection;
- partial translation;
- transient failure;
- permanent failure;
- retry exhaustion;
- replay;
- service input/output coverage for every schema family.

Fixtures use synthetic `example.test` URLs, fake IDs, fake durable references, and sanitized summaries. They must not include production URL tokens, customer data, credentials, prompts, article bodies, model output bodies, generated passwords, or real bearer material.

## Validation

`validateStagePayload` enforces:

- known schema ID;
- supported schema version;
- required common idempotency and trace fields;
- exact top-level fields for the schema;
- bounded payload size at or below ADR 0001's `16384` byte limit;
- bounded safe URL fields without credentials or token-like query parameters;
- no token, secret, password, private key, or service-role-like fixture material;
- basic type checks for strings, UUIDs, W3C traceparent, timestamps, integers, booleans, arrays, objects, and enums.

The validator intentionally does not call backend, worker, model, or service-local code. It is safe for every service repository to import.

## Consequences

Services can evolve private state behind durable references, but service-to-service payloads remain stable and small.

Breaking payload changes require a new package version, updated fixtures, and consumer tests in affected services.

The active legacy Cloudflare Worker ingestion path remains unchanged by these schemas and fixtures.
