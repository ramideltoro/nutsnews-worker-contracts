import { describe, expect, it } from "vitest";

import {
  AVAILABLE_CONTRACT_SURFACES,
  CONTRACT_COMPATIBILITY_POLICY,
  CONTRACT_PACKAGE_NAME,
  CONTRACT_PACKAGE_STATUS,
  CONTRACT_PACKAGE_VERSION,
  PLANNED_CONTRACT_SURFACES,
  getContractPackageMetadata
} from "../src/index.js";

describe("contract package metadata", () => {
  it("exports the package identity used by downstream installers", () => {
    expect(CONTRACT_PACKAGE_NAME).toBe("@ramideltoro/nutsnews-worker-contracts");
    expect(CONTRACT_PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(CONTRACT_PACKAGE_STATUS).toBe("topology-envelope");
  });

  it("documents compatibility and rollback expectations", () => {
    expect(CONTRACT_COMPATIBILITY_POLICY.consumerInstall).toContain("exact immutable");
    expect(CONTRACT_COMPATIBILITY_POLICY.rollback).toContain("previously pinned package version");
  });

  it("identifies available and planned contract surfaces", () => {
    expect(AVAILABLE_CONTRACT_SURFACES).toEqual([
      "rabbitmq-topology-and-message-envelope"
    ]);
    expect(PLANNED_CONTRACT_SURFACES).toEqual([
      "stage-payload-schemas-and-fixtures"
    ]);
  });

  it("returns a stable metadata object", () => {
    expect(getContractPackageMetadata()).toEqual({
      packageName: CONTRACT_PACKAGE_NAME,
      packageVersion: CONTRACT_PACKAGE_VERSION,
      status: CONTRACT_PACKAGE_STATUS,
      availableContractSurfaces: AVAILABLE_CONTRACT_SURFACES,
      plannedContractSurfaces: PLANNED_CONTRACT_SURFACES,
      compatibilityPolicy: CONTRACT_COMPATIBILITY_POLICY
    });
  });
});
