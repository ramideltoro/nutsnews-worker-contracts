export * from "./envelope.js";
export * from "./topology.js";

export const CONTRACT_PACKAGE_NAME = "@ramideltoro/nutsnews-worker-contracts" as const;
export const CONTRACT_PACKAGE_VERSION = "0.2.0" as const;
export const CONTRACT_PACKAGE_STATUS = "topology-envelope" as const;

export const CONTRACT_COMPATIBILITY_POLICY = {
  semver:
    "Major versions may change published contract shapes; minor versions add backward-compatible contract fields or fixtures; patch versions fix metadata, documentation, or fixtures without changing accepted messages.",
  consumerInstall:
    "Consumers install exact immutable GitHub Packages versions and upgrade only after contract tests pass in the consuming service.",
  rollback:
    "Consumers roll back by restoring the previously pinned package version; published versions are not republished in place."
} as const;

export const AVAILABLE_CONTRACT_SURFACES = [
  "rabbitmq-topology-and-message-envelope"
] as const;

export const PLANNED_CONTRACT_SURFACES = [
  "stage-payload-schemas-and-fixtures"
] as const;

export type ContractPackageStatus = typeof CONTRACT_PACKAGE_STATUS;
export type AvailableContractSurface = (typeof AVAILABLE_CONTRACT_SURFACES)[number];
export type PlannedContractSurface = (typeof PLANNED_CONTRACT_SURFACES)[number];

export interface ContractPackageMetadata {
  readonly packageName: typeof CONTRACT_PACKAGE_NAME;
  readonly packageVersion: typeof CONTRACT_PACKAGE_VERSION;
  readonly status: ContractPackageStatus;
  readonly availableContractSurfaces: readonly AvailableContractSurface[];
  readonly plannedContractSurfaces: readonly PlannedContractSurface[];
  readonly compatibilityPolicy: typeof CONTRACT_COMPATIBILITY_POLICY;
}

export function getContractPackageMetadata(): ContractPackageMetadata {
  return {
    packageName: CONTRACT_PACKAGE_NAME,
    packageVersion: CONTRACT_PACKAGE_VERSION,
    status: CONTRACT_PACKAGE_STATUS,
    availableContractSurfaces: AVAILABLE_CONTRACT_SURFACES,
    plannedContractSurfaces: PLANNED_CONTRACT_SURFACES,
    compatibilityPolicy: CONTRACT_COMPATIBILITY_POLICY
  };
}
