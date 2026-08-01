import { describe, expect, it } from "vitest";

import {
  buildContractCompatibilitySnapshot,
  detectContractBreakingChanges,
  selectContractCompatibilityBaselines,
  validateContractCompatibilitySnapshotIdentity,
  type ContractCompatibilitySnapshot,
  type NormalizedPayloadSchemaSnapshot
} from "../src/contract-snapshot.js";
import { STAGE_PAYLOAD_SCHEMA_IDS } from "../src/payloads.js";

const BASELINE = buildContractCompatibilitySnapshot(
  "1.0.0",
  "2026-08-01T00:00:00.000Z"
);
const SCHEMA_ID = STAGE_PAYLOAD_SCHEMA_IDS.feedFetchRequest;

describe("contract compatibility snapshots", () => {
  it("captures normalized schema constraints", () => {
    const schema = BASELINE.payloadSchemas[SCHEMA_ID];

    expect(BASELINE.snapshotVersion).toBe(2);
    expect(BASELINE.stagePayloadSchemaVersion).toBe(1);
    expect(schema?.fieldDefinitions["feedId"]).toEqual({
      type: "string",
      values: [],
      maxBytes: 512
    });
    expect(schema?.fieldDefinitions["feedUrl"]?.maxBytes).toBe(2_048);
    expect(schema?.fieldDefinitions["idempotencyKey"]?.maxBytes).toBe(256);
    expect(BASELINE.payloadConstraints.maxSerializedPayloadBytes).toBe(16_384);
    expect(schema?.fieldDefinitions["fetchReason"]?.values).toEqual([
      "backlog",
      "manual",
      "replay",
      "scheduled"
    ]);
  });

  it.each([
    [
      "added required fields",
      withSchema({
        ...baselineSchema(),
        requiredFields: [
          ...baselineSchema().requiredFields,
          "conditional"
        ]
      }),
      "added required field conditional"
    ],
    [
      "field type changes",
      withField("feedId", {
        ...baselineField("feedId"),
        type: "integer"
      }),
      "changed field feedId type from string to integer"
    ],
    [
      "enum tightening",
      withField("fetchReason", {
        ...baselineField("fetchReason"),
        values: baselineField("fetchReason").values.filter((value) => value !== "replay")
      }),
      "removed enum value fetchReason.replay"
    ],
    [
      "byte-limit tightening",
      withField("feedId", {
        ...baselineField("feedId"),
        maxBytes: 128
      }),
      "reduced field feedId maxBytes from 512 to 128"
    ],
    [
      "schema-version changes",
      {
        ...BASELINE,
        stagePayloadSchemaVersion: 2
      },
      "stage payload schema version changed from 1 to 2"
    ],
    [
      "serialized-payload limit tightening",
      {
        ...BASELINE,
        payloadConstraints: {
          maxSerializedPayloadBytes: 8_192
        }
      },
      "payload constraints reduced maxSerializedPayloadBytes from 16384 to 8192"
    ]
  ])("detects %s", (_name, current, expected) => {
    expect(detectContractBreakingChanges(BASELINE, current).some((change) => (
      change.includes(expected)
    ))).toBe(true);
  });

  it("permits optional fields, enum additions, and relaxed byte limits", () => {
    const current = withSchema({
      ...baselineSchema(),
      fieldDefinitions: {
        ...baselineSchema().fieldDefinitions,
        optionalAddition: {
          type: "string",
          values: [],
          maxBytes: 512
        },
        fetchReason: {
          ...baselineField("fetchReason"),
          values: [
            ...baselineField("fetchReason").values,
            "new_reason"
          ]
        },
        feedId: {
          ...baselineField("feedId"),
          maxBytes: 1_024
        }
      }
    });

    expect(detectContractBreakingChanges(BASELINE, current)).toEqual([]);
  });

  it("does not re-require an admitted older-major migration on later 1.x releases", () => {
    const preMajorBaseline = withSchema({
      ...baselineSchema(),
      producer: "old-producer",
      consumer: "old-consumer"
    });
    const snapshots = [
      {
        ...preMajorBaseline,
        baselinePackageVersion: "0.3.0"
      },
      BASELINE
    ];
    const selected = selectContractCompatibilityBaselines(snapshots, "1.0.1");

    expect(selected.map((snapshot) => snapshot.baselinePackageVersion)).toEqual([
      "1.0.0"
    ]);
    expect(selected.flatMap((snapshot) => detectContractBreakingChanges(
      snapshot,
      buildContractCompatibilitySnapshot("1.0.1", "2026-08-02T00:00:00.000Z")
    ))).toEqual([]);
  });

  it("uses the latest lower major when validating a new major baseline", () => {
    const currentMajorSnapshot = {
      ...BASELINE,
      baselinePackageVersion: "2.0.0"
    };
    const selected = selectContractCompatibilityBaselines([
      {
        ...BASELINE,
        baselinePackageVersion: "0.3.0"
      },
      BASELINE,
      currentMajorSnapshot
    ], "2.0.0");

    expect(selected.map((snapshot) => snapshot.baselinePackageVersion)).toEqual([
      "1.0.0"
    ]);
  });

  it("rejects false-version and noncanonical snapshot identities", () => {
    expect(() => {
      validateContractCompatibilitySnapshotIdentity(
        "1.0.1",
        "1.0.0",
        "1.0.0",
        "2026-08-01T00:00:00.000Z"
      );
    }).toThrow(/must match manifest and exported version/u);
    expect(() => {
      validateContractCompatibilitySnapshotIdentity(
        "1.0.0",
        "1.0.0",
        "1.0.0",
        "2026-08-01T00:00:00Z"
      );
    }).toThrow(/canonical ISO-8601 UTC instant with milliseconds/u);
  });
});

function baselineSchema(): NormalizedPayloadSchemaSnapshot {
  return BASELINE.payloadSchemas[SCHEMA_ID]!;
}

function baselineField(field: string) {
  return baselineSchema().fieldDefinitions[field]!;
}

function withField(
  field: string,
  definition: ReturnType<typeof baselineField>
): ContractCompatibilitySnapshot {
  return withSchema({
    ...baselineSchema(),
    fieldDefinitions: {
      ...baselineSchema().fieldDefinitions,
      [field]: definition
    }
  });
}

function withSchema(schema: NormalizedPayloadSchemaSnapshot): ContractCompatibilitySnapshot {
  return {
    ...BASELINE,
    payloadSchemas: {
      ...BASELINE.payloadSchemas,
      [SCHEMA_ID]: schema
    }
  };
}
