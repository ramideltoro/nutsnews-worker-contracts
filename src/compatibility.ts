export const CONTRACT_DEPRECATION_WINDOW_DAYS = 90 as const;

export const CONTRACT_FIXTURE_SUITES = {
  bootstrap: "bootstrap-metadata-v1",
  topologyEnvelope: "rabbitmq-topology-envelope-v1",
  stagePayloads: "stage-payload-v1"
} as const;

export type ContractFixtureSuite = (typeof CONTRACT_FIXTURE_SUITES)[keyof typeof CONTRACT_FIXTURE_SUITES];

export interface ContractCompatibilityMatrixEntry {
  readonly version: string;
  readonly status: "supported" | "deprecated";
  readonly releasedAt: string;
  readonly supportedUntil: string;
  readonly surfaces: readonly string[];
  readonly fixtureSuites: readonly ContractFixtureSuite[];
  readonly commit: string;
  readonly releaseUrl: string;
}

export const CONTRACT_COMPATIBILITY_MATRIX = [
  {
    version: "0.1.0",
    status: "supported",
    releasedAt: "2026-07-23",
    supportedUntil: "2026-10-21",
    surfaces: [
      "bootstrap-metadata"
    ],
    fixtureSuites: [
      CONTRACT_FIXTURE_SUITES.bootstrap
    ],
    commit: "2edc95da7f50281ff7ee24aabe77c4a849cc35ea",
    releaseUrl: "https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.1.0"
  },
  {
    version: "0.2.0",
    status: "supported",
    releasedAt: "2026-07-23",
    supportedUntil: "2026-10-21",
    surfaces: [
      "bootstrap-metadata",
      "rabbitmq-topology-and-message-envelope"
    ],
    fixtureSuites: [
      CONTRACT_FIXTURE_SUITES.bootstrap,
      CONTRACT_FIXTURE_SUITES.topologyEnvelope
    ],
    commit: "fe60486175fe4196977918db836d40ec17739782",
    releaseUrl: "https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.2.0"
  },
  {
    version: "0.3.0",
    status: "supported",
    releasedAt: "2026-07-23",
    supportedUntil: "2026-10-21",
    surfaces: [
      "bootstrap-metadata",
      "rabbitmq-topology-and-message-envelope",
      "stage-payload-schemas-and-fixtures"
    ],
    fixtureSuites: [
      CONTRACT_FIXTURE_SUITES.bootstrap,
      CONTRACT_FIXTURE_SUITES.topologyEnvelope,
      CONTRACT_FIXTURE_SUITES.stagePayloads
    ],
    commit: "2ced4d070cfe9d4f821bdc41a9d7851951b1364a",
    releaseUrl: "https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.3.0"
  },
  {
    version: "0.3.1",
    status: "supported",
    releasedAt: "2026-07-23",
    supportedUntil: "2026-10-21",
    surfaces: [
      "bootstrap-metadata",
      "rabbitmq-topology-and-message-envelope",
      "stage-payload-schemas-and-fixtures",
      "compatibility-and-conformance"
    ],
    fixtureSuites: [
      CONTRACT_FIXTURE_SUITES.bootstrap,
      CONTRACT_FIXTURE_SUITES.topologyEnvelope,
      CONTRACT_FIXTURE_SUITES.stagePayloads
    ],
    commit: "resolved-by-release-tag",
    releaseUrl: "https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.3.1"
  },
  {
    version: "0.4.0",
    status: "supported",
    releasedAt: "2026-07-25",
    supportedUntil: "2026-10-23",
    surfaces: [
      "bootstrap-metadata",
      "rabbitmq-topology-and-message-envelope",
      "stage-payload-schemas-and-fixtures",
      "compatibility-and-conformance"
    ],
    fixtureSuites: [
      CONTRACT_FIXTURE_SUITES.bootstrap,
      CONTRACT_FIXTURE_SUITES.topologyEnvelope,
      CONTRACT_FIXTURE_SUITES.stagePayloads
    ],
    commit: "resolved-by-release-tag",
    releaseUrl: "https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v0.4.0"
  },
  {
    version: "1.0.0",
    status: "supported",
    releasedAt: "2026-08-01",
    supportedUntil: "2026-10-30",
    surfaces: [
      "bootstrap-metadata",
      "rabbitmq-topology-and-message-envelope",
      "stage-payload-schemas-and-fixtures",
      "compatibility-and-conformance"
    ],
    fixtureSuites: [
      CONTRACT_FIXTURE_SUITES.bootstrap,
      CONTRACT_FIXTURE_SUITES.topologyEnvelope,
      CONTRACT_FIXTURE_SUITES.stagePayloads
    ],
    commit: "resolved-by-release-tag",
    releaseUrl: "https://github.com/ramideltoro/nutsnews-worker-contracts/releases/tag/v1.0.0"
  }
] as const satisfies readonly ContractCompatibilityMatrixEntry[];

export function getSupportedContractVersionsForFixtureSuite(fixtureSuite: ContractFixtureSuite): readonly string[] {
  const entries: readonly ContractCompatibilityMatrixEntry[] = CONTRACT_COMPATIBILITY_MATRIX;

  return entries
    .filter((entry) => entry.status === "supported" && entry.fixtureSuites.includes(fixtureSuite))
    .map((entry) => entry.version);
}

export function getContractCompatibilityEntry(version: string): ContractCompatibilityMatrixEntry | undefined {
  return CONTRACT_COMPATIBILITY_MATRIX.find((entry) => entry.version === version);
}
