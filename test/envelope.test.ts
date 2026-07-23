import { describe, expect, it } from "vitest";

import {
  CURRENT_ENVELOPE_SCHEMA_VERSION,
  WORKER_DELIVERY_BEHAVIOR,
  WORKER_ENVELOPE_SCHEMA_ID,
  WORKER_MESSAGE_LIMITS,
  WorkerEnvelopeValidationError,
  assertWorkerEnvelope,
  validateWorkerEnvelope,
  type EnvelopeValidationIssueCode,
  type WorkerMessageEnvelope
} from "../src/index.js";

const validEnvelope: WorkerMessageEnvelope = {
  schemaId: WORKER_ENVELOPE_SCHEMA_ID,
  schemaVersion: CURRENT_ENVELOPE_SCHEMA_VERSION,
  route: "fetch",
  messageId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b35f2",
  causationId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b35f3",
  correlationId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b35f4",
  traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  idempotencyKey: "article:source:example:2026-07-23",
  aggregate: {
    type: "article",
    id: "source/example/123",
    version: 1
  },
  occurredAt: "2026-07-23T04:00:00.000Z",
  attempt: {
    count: 1,
    max: WORKER_DELIVERY_BEHAVIOR.maxAttempts,
    firstAttemptAt: "2026-07-23T04:00:00.000Z"
  },
  producer: {
    name: "scheduler",
    version: "0.2.0"
  },
  payloadRef: {
    kind: "backend-record",
    uri: "postgres://article-ingest/source/example/123",
    mediaType: "application/json",
    sizeBytes: 512,
    digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
};

describe("worker message envelope validation", () => {
  it("accepts a valid envelope and returns the typed value", () => {
    const result = validateWorkerEnvelope(validEnvelope);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.route).toBe("fetch");
      expect(result.value.payloadRef.uri).toContain("postgres://");
    }
  });

  it("throws a structured validation error from assertWorkerEnvelope", () => {
    expect(() => assertWorkerEnvelope({
      ...validEnvelope,
      messageId: "not-a-uuid"
    })).toThrow(WorkerEnvelopeValidationError);
  });

  it("rejects unknown fields and prevents inline payload bodies", () => {
    const result = validateWorkerEnvelope({
      ...validEnvelope,
      payload: {
        body: "large article body"
      }
    });

    expect(issueCodes(result)).toContain("unknown-field");
  });

  it("rejects malformed identifiers and timestamps deterministically", () => {
    const result = validateWorkerEnvelope({
      ...validEnvelope,
      correlationId: "bad-correlation-id",
      occurredAt: "2026-07-23"
    });

    expect(issueCodes(result)).toEqual(expect.arrayContaining([
      "invalid-identifier",
      "invalid-timestamp"
    ]));
  });

  it("rejects stale and unsupported schema versions distinctly", () => {
    expect(issueCodes(validateWorkerEnvelope({
      ...validEnvelope,
      schemaVersion: 0
    }))).toContain("stale-schema-version");

    expect(issueCodes(validateWorkerEnvelope({
      ...validEnvelope,
      schemaVersion: 2
    }))).toContain("unsupported-schema-version");
  });

  it("rejects oversized header and payload reference fields", () => {
    const result = validateWorkerEnvelope({
      ...validEnvelope,
      tracestate: "a".repeat(WORKER_MESSAGE_LIMITS.maxTraceStateBytes + 1),
      payloadRef: {
        ...validEnvelope.payloadRef,
        uri: `postgres://${"a".repeat(WORKER_MESSAGE_LIMITS.maxPayloadReferenceUriBytes + 1)}`
      }
    });

    expect(issueCodes(result)).toContain("oversized-field");
  });

  it("rejects attempts beyond the bounded retry policy", () => {
    const result = validateWorkerEnvelope({
      ...validEnvelope,
      attempt: {
        ...validEnvelope.attempt,
        count: WORKER_DELIVERY_BEHAVIOR.maxAttempts + 1
      }
    });

    expect(issueCodes(result)).toContain("invalid-attempt");
  });
});

function issueCodes(result: ReturnType<typeof validateWorkerEnvelope>): readonly EnvelopeValidationIssueCode[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
