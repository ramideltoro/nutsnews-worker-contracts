import { describe, expect, it } from "vitest";

import {
  CONTRACT_COMPATIBILITY_MATRIX,
  CONTRACT_FIXTURE_SUITES,
  STAGE_PAYLOAD_FIXTURES,
  getContractCompatibilityEntry,
  getSupportedContractVersionsForFixtureSuite,
  validateStagePayload
} from "../src/index.js";

describe("contract conformance and compatibility", () => {
  it("keeps compatibility matrix entries traceable to releases", () => {
    for (const entry of CONTRACT_COMPATIBILITY_MATRIX) {
      expect(entry.releaseUrl).toBe(`https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v${entry.version}`);
      expect(entry.commit.length).toBeGreaterThan(0);
      expect(entry.supportedUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }

    expect(getContractCompatibilityEntry("0.3.0")?.fixtureSuites).toContain(CONTRACT_FIXTURE_SUITES.stagePayloads);
  });

  it("requires old and new compatible consumers to pass the same stage fixture suite", () => {
    const compatibleVersions = getSupportedContractVersionsForFixtureSuite(CONTRACT_FIXTURE_SUITES.stagePayloads);

    expect(compatibleVersions).toEqual(expect.arrayContaining([
      "0.3.0",
      "0.3.1",
      "0.4.0",
      "1.0.0"
    ]));

    for (const version of compatibleVersions) {
      for (const fixture of STAGE_PAYLOAD_FIXTURES) {
        const result = validateStagePayload(fixture.payload);

        expect(result.ok, `${version}:${fixture.name}`).toBe(true);
      }
    }
  });

  it("treats every sanitized fixture as producer conformance evidence", () => {
    for (const fixture of STAGE_PAYLOAD_FIXTURES) {
      const result = validateStagePayload(fixture.payload);

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.definition.producer.length).toBeGreaterThan(0);
        expect(result.definition.consumer.length).toBeGreaterThan(0);
      }
    }
  });
});
