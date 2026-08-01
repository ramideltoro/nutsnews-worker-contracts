import { describe, expect, it } from "vitest";

import {
  STAGE_PAYLOAD_FIXTURES,
  STAGE_PAYLOAD_SCHEMA_DEFINITIONS,
  STAGE_PAYLOAD_SCHEMA_IDS,
  WORKER_MESSAGE_LIMITS,
  getStagePayloadSizeBytes,
  validateStagePayload,
  type StagePayloadFixtureCase,
  type StagePayloadValidationIssueCode
} from "../src/index.js";

const commonFields = [
  "schemaId",
  "schemaVersion",
  "pipelineRunId",
  "stageExecutionId",
  "sourceMessageId",
  "idempotencyKey",
  "traceparent",
  "producedAt"
] as const;

describe("stage payload schemas and fixtures", () => {
  it("defines every stage payload schema with producer and consumer expectations", () => {
    expect(Object.keys(STAGE_PAYLOAD_SCHEMA_DEFINITIONS).sort()).toEqual(Object.values(STAGE_PAYLOAD_SCHEMA_IDS).sort());

    for (const definition of Object.values(STAGE_PAYLOAD_SCHEMA_DEFINITIONS)) {
      expect(definition.schemaId).toContain(".v1");
      expect(definition.producer.length).toBeGreaterThan(0);
      expect(definition.consumer.length).toBeGreaterThan(0);
      expect(definition.summary.length).toBeGreaterThan(0);

      for (const field of commonFields) {
        expect(definition.requiredFields).toContain(field);
        expect(definition.fieldDefinitions[field]?.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("validates all sanitized fixtures and keeps them below the ADR size limit", () => {
    for (const fixture of STAGE_PAYLOAD_FIXTURES) {
      const result = validateStagePayload(fixture.payload);

      expect(result, fixture.name).toMatchObject({
        ok: true
      });
      expect(getStagePayloadSizeBytes(fixture.payload), fixture.name).toBeLessThanOrEqual(WORKER_MESSAGE_LIMITS.maxEnvelopeBytes);
    }
  });

  it("covers retained legacy behavior cases required by the parity baseline", () => {
    const cases = new Set<StagePayloadFixtureCase>(STAGE_PAYLOAD_FIXTURES.map((fixture) => fixture.fixtureCase));

    for (const requiredCase of [
      "success",
      "duplicate",
      "unchanged-feed",
      "rejection",
      "partial-translation",
      "transient-failure",
      "permanent-failure",
      "retry-exhaustion",
      "replay"
    ] as const) {
      expect(cases.has(requiredCase)).toBe(true);
    }
  });

  it("requires idempotency and trace fields on every hop fixture", () => {
    for (const fixture of STAGE_PAYLOAD_FIXTURES) {
      for (const field of commonFields) {
        expect(fixture.payload[field], `${fixture.name}.${field}`).toBeDefined();
      }
    }
  });

  it("defines a canonicalizer-to-enrichment request payload on the enrichment stage", () => {
    const definition = STAGE_PAYLOAD_SCHEMA_DEFINITIONS[STAGE_PAYLOAD_SCHEMA_IDS.enrichmentRequest];
    const fixture = STAGE_PAYLOAD_FIXTURES.find((candidate) => candidate.name === "enrichment-request-new");

    expect(definition).toMatchObject({
      stage: "enrichment",
      producer: "canonicalizer",
      consumer: "enrichment"
    });
    expect(definition.requiredFields).toEqual(expect.arrayContaining([
      "requestId",
      "canonicalArticleId",
      "articleVersion",
      "candidateId",
      "canonicalUrl",
      "reason",
      "payloadRef"
    ]));
    expect(fixture).toBeDefined();

    if (fixture !== undefined) {
      const result = validateStagePayload(fixture.payload);

      expect(result).toMatchObject({
        ok: true
      });
      expect(result.ok ? result.definition.stage : undefined).toBe("enrichment");
    }
  });

  it("defines the canonical article candidate as a fetcher-to-canonicalizer payload", () => {
    const definition = STAGE_PAYLOAD_SCHEMA_DEFINITIONS[STAGE_PAYLOAD_SCHEMA_IDS.canonicalArticleCandidate];
    const fixture = STAGE_PAYLOAD_FIXTURES.find((candidate) => candidate.name === "canonical-candidate-new-from-fetcher");

    expect(definition).toMatchObject({
      stage: "canonicalization",
      producer: "fetcher",
      consumer: "canonicalizer"
    });
    expect(fixture).toBeDefined();

    if (fixture !== undefined) {
      expect(validateStagePayload(fixture.payload)).toMatchObject({
        ok: true,
        definition: {
          producer: "fetcher",
          consumer: "canonicalizer"
        }
      });
    }
  });

  it("rejects invalid enrichment request reasons", () => {
    const fixture = STAGE_PAYLOAD_FIXTURES.find((candidate) => candidate.name === "enrichment-request-new");

    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      throw new Error("missing enrichment-request-new fixture");
    }

    const result = validateStagePayload({
      ...fixture.payload,
      reason: "duplicate"
    });

    expect(issueCodes(result)).toContain("invalid-field");
  });

  it("rejects unknown fields that would inline article or model bodies", () => {
    const fixture = STAGE_PAYLOAD_FIXTURES[0];

    expect(fixture).toBeDefined();

    const result = validateStagePayload({
      ...fixture.payload,
      articleBody: "This would be a large article body."
    });

    expect(issueCodes(result)).toContain("unknown-field");
  });

  it("rejects unsafe URL token material and oversized payloads", () => {
    const fixture = STAGE_PAYLOAD_FIXTURES[0];

    expect(fixture).toBeDefined();

    const unsafeResult = validateStagePayload({
      ...fixture.payload,
      feedUrl: "https://feeds.example.test/world.xml?token=not-real"
    });
    const oversizedResult = validateStagePayload({
      ...fixture.payload,
      feedId: "x".repeat(WORKER_MESSAGE_LIMITS.maxEnvelopeBytes)
    });

    expect(issueCodes(unsafeResult)).toEqual(expect.arrayContaining([
      "invalid-field",
      "unsafe-fixture-content"
    ]));
    expect(issueCodes(oversizedResult)).toContain("oversized-payload");
  });
});

function issueCodes(result: ReturnType<typeof validateStagePayload>): readonly StagePayloadValidationIssueCode[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
