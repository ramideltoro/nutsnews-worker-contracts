import {
  DEFAULT_PAYLOAD_STRING_MAX_BYTES,
  STAGE_PAYLOAD_SCHEMA_DEFINITIONS,
  STAGE_PAYLOAD_SCHEMA_VERSION,
  type PayloadFieldDefinition,
  type PayloadFieldType,
  type StagePayloadSchemaDefinition
} from "./payloads.js";
import {
  WORKER_MESSAGE_LIMITS,
  WORKER_RETRY_TIERS,
  WORKER_ROUTES,
  type WorkerRetryTier,
  type WorkerRoute
} from "./topology.js";

export const CONTRACT_COMPATIBILITY_SNAPSHOT_VERSION = 2 as const;

export interface ContractCompatibilityRouteSnapshot {
  readonly stage: string;
  readonly schemaId: string;
  readonly producer: string;
  readonly consumer: string;
  readonly exchange: string;
  readonly routingKey: string;
  readonly mainQueue: string;
  readonly retryQueues: readonly string[];
  readonly terminalDlq: string;
}

export interface ContractCompatibilityRetryTierSnapshot {
  readonly name: string;
  readonly delayMs: number;
}

export interface ContractCompatibilityTopologySnapshot {
  readonly routes: readonly ContractCompatibilityRouteSnapshot[];
  readonly retryTiers: readonly ContractCompatibilityRetryTierSnapshot[];
}

export interface NormalizedPayloadFieldSnapshot {
  readonly type: PayloadFieldType;
  readonly values: readonly string[];
  readonly maxBytes: number | null;
}

export interface NormalizedPayloadSchemaSnapshot {
  readonly stage: string;
  readonly producer: string;
  readonly consumer: string;
  readonly requiredFields: readonly string[];
  readonly fieldDefinitions: Readonly<Record<string, NormalizedPayloadFieldSnapshot>>;
}

export interface NormalizedPayloadConstraintSnapshot {
  readonly maxSerializedPayloadBytes: number;
}

export interface ContractCompatibilitySnapshot {
  readonly snapshotVersion: typeof CONTRACT_COMPATIBILITY_SNAPSHOT_VERSION;
  readonly baselinePackageVersion: string;
  readonly capturedAtUtc: string;
  readonly stagePayloadSchemaVersion: number;
  readonly payloadConstraints: NormalizedPayloadConstraintSnapshot;
  readonly topology: ContractCompatibilityTopologySnapshot;
  readonly payloadSchemas: Readonly<Record<string, NormalizedPayloadSchemaSnapshot>>;
}

export interface LegacyPayloadSchemaSnapshot {
  readonly stage: string;
  readonly producer: string;
  readonly consumer: string;
  readonly requiredFields: readonly string[];
  readonly fields: readonly string[];
}

export interface LegacyContractCompatibilitySnapshot {
  readonly snapshotVersion: 1;
  readonly baselinePackageVersion: string;
  readonly capturedAtUtc: string;
  readonly topology: ContractCompatibilityTopologySnapshot;
  readonly payloadSchemas: Readonly<Record<string, LegacyPayloadSchemaSnapshot>>;
}

export type AnyContractCompatibilitySnapshot =
  | ContractCompatibilitySnapshot
  | LegacyContractCompatibilitySnapshot;

export function buildContractCompatibilitySnapshot(
  baselinePackageVersion: string,
  capturedAtUtc: string
): ContractCompatibilitySnapshot {
  return {
    snapshotVersion: CONTRACT_COMPATIBILITY_SNAPSHOT_VERSION,
    baselinePackageVersion,
    capturedAtUtc,
    stagePayloadSchemaVersion: STAGE_PAYLOAD_SCHEMA_VERSION,
    payloadConstraints: {
      maxSerializedPayloadBytes: WORKER_MESSAGE_LIMITS.maxEnvelopeBytes
    },
    topology: snapshotTopology(WORKER_ROUTES, WORKER_RETRY_TIERS),
    payloadSchemas: snapshotPayloadSchemas(STAGE_PAYLOAD_SCHEMA_DEFINITIONS)
  };
}

export function detectContractBreakingChanges(
  baseline: AnyContractCompatibilitySnapshot,
  current: ContractCompatibilitySnapshot
): readonly string[] {
  return [
    ...detectTopologyBreaks(baseline.topology, current.topology),
    ...detectPayloadSchemaBreaks(baseline, current)
  ];
}

export function selectContractCompatibilityBaselines(
  snapshots: readonly AnyContractCompatibilitySnapshot[],
  currentVersion: string
): readonly AnyContractCompatibilitySnapshot[] {
  const current = parseStableSemver(currentVersion);
  const priorSnapshots = snapshots
    .map((snapshot) => ({
      snapshot,
      version: parseStableSemver(snapshot.baselinePackageVersion)
    }))
    .filter(({ version }) => compareStableSemver(version, current) < 0);
  const currentMajorSnapshots = priorSnapshots.filter(({ version }) => (
    version.major === current.major
  ));
  const selected = currentMajorSnapshots.length > 0
    ? currentMajorSnapshots
    : priorSnapshots.filter(({ version }) => (
      version.major === Math.max(...priorSnapshots.map((candidate) => candidate.version.major))
    ));

  return selected
    .sort((left, right) => compareStableSemver(left.version, right.version))
    .map(({ snapshot }) => snapshot);
}

export function validateContractCompatibilitySnapshotIdentity(
  requestedVersion: string,
  manifestVersion: string,
  exportedVersion: string,
  capturedAtUtc: string
): void {
  parseStableSemver(requestedVersion);
  parseStableSemver(manifestVersion);
  parseStableSemver(exportedVersion);

  if (requestedVersion !== manifestVersion || requestedVersion !== exportedVersion) {
    throw new Error(
      `snapshot version ${requestedVersion} must match manifest and exported version`
    );
  }

  const capturedAt = new Date(capturedAtUtc);
  if (Number.isNaN(capturedAt.valueOf()) || capturedAt.toISOString() !== capturedAtUtc) {
    throw new Error("captured-at-utc must be a canonical ISO-8601 UTC instant with milliseconds");
  }
}

function snapshotTopology(
  routes: readonly WorkerRoute[],
  retryTiers: readonly WorkerRetryTier[]
): ContractCompatibilityTopologySnapshot {
  return {
    routes: routes.map((route) => ({
      stage: route.stage,
      schemaId: route.schemaId,
      producer: route.producer,
      consumer: route.consumer,
      exchange: route.exchange,
      routingKey: route.routingKey,
      mainQueue: route.mainQueue.name,
      retryQueues: route.retryQueues.map((queue) => queue.name),
      terminalDlq: route.terminalDlq.name
    })),
    retryTiers: retryTiers.map((tier) => ({
      name: tier.name,
      delayMs: tier.delayMs
    }))
  };
}

function snapshotPayloadSchemas(
  definitions: Readonly<Record<string, StagePayloadSchemaDefinition>>
): Readonly<Record<string, NormalizedPayloadSchemaSnapshot>> {
  return Object.fromEntries(Object.entries(definitions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([schemaId, definition]) => [
      schemaId,
      {
        stage: definition.stage,
        producer: definition.producer,
        consumer: definition.consumer,
        requiredFields: [...definition.requiredFields].sort(),
        fieldDefinitions: Object.fromEntries(Object.entries(definition.fieldDefinitions)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([field, fieldDefinition]) => [
            field,
            normalizeFieldDefinition(fieldDefinition)
          ]))
      }
    ]));
}

function normalizeFieldDefinition(
  definition: PayloadFieldDefinition
): NormalizedPayloadFieldSnapshot {
  return {
    type: definition.type,
    values: [...(definition.values ?? [])].sort(),
    maxBytes: effectiveFieldMaxBytes(definition)
  };
}

function effectiveFieldMaxBytes(definition: PayloadFieldDefinition): number | null {
  if (definition.type === "string") {
    return definition.maxBytes ?? DEFAULT_PAYLOAD_STRING_MAX_BYTES;
  }

  if (definition.type === "url") {
    return WORKER_MESSAGE_LIMITS.maxPayloadReferenceUriBytes;
  }

  if (definition.type === "idempotency-key") {
    return WORKER_MESSAGE_LIMITS.maxIdempotencyKeyBytes;
  }

  return definition.maxBytes ?? null;
}

function detectTopologyBreaks(
  baseline: ContractCompatibilityTopologySnapshot,
  current: ContractCompatibilityTopologySnapshot
): string[] {
  const breaks: string[] = [];
  const currentRoutes = new Map(current.routes.map((route) => [
    route.stage,
    route
  ]));

  for (const route of baseline.routes) {
    const currentRoute = currentRoutes.get(route.stage);

    if (currentRoute === undefined) {
      breaks.push(`removed route ${route.stage}`);
      continue;
    }

    for (const field of [
      "schemaId",
      "producer",
      "consumer",
      "exchange",
      "routingKey",
      "mainQueue",
      "terminalDlq"
    ] as const) {
      if (route[field] !== currentRoute[field]) {
        breaks.push(`route ${route.stage} changed ${field}`);
      }
    }

    for (const retryQueue of route.retryQueues) {
      if (!currentRoute.retryQueues.includes(retryQueue)) {
        breaks.push(`route ${route.stage} removed retry queue ${retryQueue}`);
      }
    }
  }

  const currentRetryTiers = new Map(current.retryTiers.map((tier) => [
    tier.name,
    tier.delayMs
  ]));

  for (const retryTier of baseline.retryTiers) {
    if (currentRetryTiers.get(retryTier.name) !== retryTier.delayMs) {
      breaks.push(`retry tier ${retryTier.name} changed or was removed`);
    }
  }

  return breaks;
}

function detectPayloadSchemaBreaks(
  baseline: AnyContractCompatibilitySnapshot,
  current: ContractCompatibilitySnapshot
): string[] {
  const breaks: string[] = [];

  if (baseline.snapshotVersion === 1) {
    for (const [schemaId, baselineSchema] of Object.entries(baseline.payloadSchemas)) {
      const currentSchema = current.payloadSchemas[schemaId];

      if (currentSchema === undefined) {
        breaks.push(`removed payload schema ${schemaId}`);
        continue;
      }

      breaks.push(...detectSchemaIdentityAndRequiredBreaks(schemaId, baselineSchema, currentSchema));

      for (const field of baselineSchema.fields) {
        if (currentSchema.fieldDefinitions[field] === undefined) {
          breaks.push(`payload schema ${schemaId} removed field ${field}`);
        }
      }
    }

    return breaks;
  }

  if (baseline.stagePayloadSchemaVersion !== current.stagePayloadSchemaVersion) {
    breaks.push(
      `stage payload schema version changed from ${String(baseline.stagePayloadSchemaVersion)}`
      + ` to ${String(current.stagePayloadSchemaVersion)}`
    );
  }

  if (
    current.payloadConstraints.maxSerializedPayloadBytes
    < baseline.payloadConstraints.maxSerializedPayloadBytes
  ) {
    breaks.push(
      "payload constraints reduced maxSerializedPayloadBytes from "
      + `${String(baseline.payloadConstraints.maxSerializedPayloadBytes)} to `
      + String(current.payloadConstraints.maxSerializedPayloadBytes)
    );
  }

  for (const [schemaId, baselineSchema] of Object.entries(baseline.payloadSchemas)) {
    const currentSchema = current.payloadSchemas[schemaId];

    if (currentSchema === undefined) {
      breaks.push(`removed payload schema ${schemaId}`);
      continue;
    }

    breaks.push(...detectSchemaIdentityAndRequiredBreaks(schemaId, baselineSchema, currentSchema));

    for (const [field, baselineField] of Object.entries(baselineSchema.fieldDefinitions)) {
      const currentField = currentSchema.fieldDefinitions[field];

      if (currentField === undefined) {
        breaks.push(`payload schema ${schemaId} removed field ${field}`);
        continue;
      }

      if (baselineField.type !== currentField.type) {
        breaks.push(
          `payload schema ${schemaId} changed field ${field} type from ${baselineField.type}`
          + ` to ${currentField.type}`
        );
      }

      for (const value of baselineField.values) {
        if (!currentField.values.includes(value)) {
          breaks.push(`payload schema ${schemaId} removed enum value ${field}.${value}`);
        }
      }

      if (
        baselineField.maxBytes !== null
        && currentField.maxBytes !== null
        && currentField.maxBytes < baselineField.maxBytes
      ) {
        breaks.push(
          `payload schema ${schemaId} reduced field ${field} maxBytes from ${String(baselineField.maxBytes)}`
          + ` to ${String(currentField.maxBytes)}`
        );
      }
    }
  }

  return breaks;
}

function detectSchemaIdentityAndRequiredBreaks(
  schemaId: string,
  baseline: Pick<NormalizedPayloadSchemaSnapshot, "stage" | "producer" | "consumer" | "requiredFields">,
  current: NormalizedPayloadSchemaSnapshot
): string[] {
  const breaks: string[] = [];

  for (const field of [
    "stage",
    "producer",
    "consumer"
  ] as const) {
    if (baseline[field] !== current[field]) {
      breaks.push(`payload schema ${schemaId} changed ${field}`);
    }
  }

  const baselineRequiredFields = new Set(baseline.requiredFields);
  const currentRequiredFields = new Set(current.requiredFields);

  for (const requiredField of baselineRequiredFields) {
    if (!currentRequiredFields.has(requiredField)) {
      breaks.push(`payload schema ${schemaId} made required field ${requiredField} optional`);
    }
  }

  for (const requiredField of currentRequiredFields) {
    if (!baselineRequiredFields.has(requiredField)) {
      breaks.push(`payload schema ${schemaId} added required field ${requiredField}`);
    }
  }

  return breaks;
}

interface StableSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseStableSemver(version: string): StableSemver {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version);
  if (match === null) {
    throw new TypeError(`invalid stable semantic version: ${version}`);
  }

  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10)
  };
}

function compareStableSemver(left: StableSemver, right: StableSemver): number {
  return left.major - right.major
    || left.minor - right.minor
    || left.patch - right.patch;
}
