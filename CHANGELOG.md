# Changelog

All notable changes to `@ramideltoro/nutsnews-worker-contracts` are documented here.

This package follows semantic versioning. Published versions are immutable; consumers roll back by pinning a previously published version.

## 0.3.0 - 2026-07-23

- Define stage payload schema IDs, producer/consumer metadata, required fields, field definitions, and service-independent payload validation.
- Add sanitized parity fixtures covering success, duplicate, unchanged feed, rejection, partial translation, transient failure, permanent failure, retry exhaustion, replay, and service input/output cases.
- Add ADR 0002 documenting common idempotency/trace fields, per-schema producer/consumer field expectations, fixture policy, and validation rules.

## 0.2.0 - 2026-07-23

- Define generated RabbitMQ exchanges, routing keys, main queues, fixed retry-tier queues, terminal DLQs, route owners, delivery behavior, message limits, and retry destination helpers.
- Define the common worker message envelope and deterministic validation for malformed, oversized, stale-version, unsupported-version, and unknown-field messages.
- Add ADR 0001 documenting topology, envelope validation, retry/DLQ transfer guarantees, at-least-once delivery, duplicate handling, and no global ordering.

## 0.1.0 - 2026-07-23

- Bootstrap TypeScript package, CI checks, and GitHub Packages release workflow.
- Publish metadata-only exports that prove installability before topology and schema contracts are introduced.
