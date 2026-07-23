import {
  WORKER_DELIVERY_BEHAVIOR,
  WORKER_ENVELOPE_SCHEMA_ID,
  WORKER_MESSAGE_LIMITS,
  isWorkerStage,
  type WorkerStage
} from "./topology.js";

export const CURRENT_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const MIN_SUPPORTED_ENVELOPE_SCHEMA_VERSION = 1 as const;

export const PAYLOAD_REFERENCE_KINDS = [
  "backend-record",
  "object-storage",
  "external-url"
] as const;

export type PayloadReferenceKind = (typeof PAYLOAD_REFERENCE_KINDS)[number];

export interface WorkerEnvelopeAttempt {
  readonly count: number;
  readonly max: typeof WORKER_DELIVERY_BEHAVIOR.maxAttempts;
  readonly firstAttemptAt: string;
  readonly lastAttemptAt?: string;
}

export interface WorkerEnvelopeAggregate {
  readonly type: string;
  readonly id: string;
  readonly version: number;
}

export interface WorkerEnvelopeProducer {
  readonly name: string;
  readonly version: string;
  readonly instanceId?: string;
}

export interface WorkerPayloadReference {
  readonly kind: PayloadReferenceKind;
  readonly uri: string;
  readonly mediaType: "application/json";
  readonly sizeBytes: number;
  readonly digest?: string;
}

export interface WorkerMessageEnvelope {
  readonly schemaId: typeof WORKER_ENVELOPE_SCHEMA_ID;
  readonly schemaVersion: typeof CURRENT_ENVELOPE_SCHEMA_VERSION;
  readonly route: WorkerStage;
  readonly messageId: string;
  readonly causationId: string;
  readonly correlationId: string;
  readonly traceparent: string;
  readonly tracestate?: string;
  readonly idempotencyKey: string;
  readonly aggregate: WorkerEnvelopeAggregate;
  readonly occurredAt: string;
  readonly attempt: WorkerEnvelopeAttempt;
  readonly producer: WorkerEnvelopeProducer;
  readonly payloadRef: WorkerPayloadReference;
}

export type EnvelopeValidationIssueCode =
  | "invalid-type"
  | "missing-field"
  | "unknown-field"
  | "invalid-schema-id"
  | "stale-schema-version"
  | "unsupported-schema-version"
  | "invalid-schema-version"
  | "invalid-route"
  | "invalid-identifier"
  | "invalid-trace-context"
  | "invalid-timestamp"
  | "invalid-attempt"
  | "invalid-producer"
  | "invalid-payload-reference"
  | "oversized-envelope"
  | "oversized-headers"
  | "oversized-field";

export interface EnvelopeValidationIssue {
  readonly path: string;
  readonly code: EnvelopeValidationIssueCode;
  readonly message: string;
}

export type EnvelopeValidationResult =
  | {
      readonly ok: true;
      readonly value: WorkerMessageEnvelope;
    }
  | {
      readonly ok: false;
      readonly issues: readonly EnvelopeValidationIssue[];
    };

export class WorkerEnvelopeValidationError extends Error {
  readonly issues: readonly EnvelopeValidationIssue[];

  constructor(issues: readonly EnvelopeValidationIssue[]) {
    super(`Invalid worker envelope: ${issues.map((issue) => `${issue.path} ${issue.code}`).join(", ")}`);
    this.name = "WorkerEnvelopeValidationError";
    this.issues = issues;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const IDEMPOTENCY_KEY_RE = /^[a-z0-9][a-z0-9._:/-]{0,255}$/u;
const AGGREGATE_TYPE_RE = /^[a-z][a-z0-9-]{0,63}$/u;
const PRODUCER_NAME_RE = /^[a-z][a-z0-9-]{0,79}$/u;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

const TOP_LEVEL_KEYS = [
  "schemaId",
  "schemaVersion",
  "route",
  "messageId",
  "causationId",
  "correlationId",
  "traceparent",
  "tracestate",
  "idempotencyKey",
  "aggregate",
  "occurredAt",
  "attempt",
  "producer",
  "payloadRef"
] as const;

const AGGREGATE_KEYS = [
  "type",
  "id",
  "version"
] as const;

const ATTEMPT_KEYS = [
  "count",
  "max",
  "firstAttemptAt",
  "lastAttemptAt"
] as const;

const PRODUCER_KEYS = [
  "name",
  "version",
  "instanceId"
] as const;

const PAYLOAD_REF_KEYS = [
  "kind",
  "uri",
  "mediaType",
  "sizeBytes",
  "digest"
] as const;

export function validateWorkerEnvelope(input: unknown): EnvelopeValidationResult {
  const issues: EnvelopeValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          code: "invalid-type",
          message: "Envelope must be a JSON object."
        }
      ]
    };
  }

  validateSerializedSize(input, issues);
  validateExactKeys(input, "$", TOP_LEVEL_KEYS, issues);
  validateSchema(input, issues);
  validateRoute(input, issues);
  validateIdentifiers(input, issues);
  validateTraceContext(input, issues);
  validateTimestamp(input, "occurredAt", "$.occurredAt", issues);
  validateAggregate(input, issues);
  validateAttempt(input, issues);
  validateProducer(input, issues);
  validatePayloadReference(input, issues);
  validateHeaderSize(input, issues);

  if (issues.length > 0) {
    return {
      ok: false,
      issues
    };
  }

  return {
    ok: true,
    value: input as unknown as WorkerMessageEnvelope
  };
}

export function assertWorkerEnvelope(input: unknown): WorkerMessageEnvelope {
  const result = validateWorkerEnvelope(input);

  if (!result.ok) {
    throw new WorkerEnvelopeValidationError(result.issues);
  }

  return result.value;
}

function validateSerializedSize(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const serialized = stringifyForSize(input);

  if (serialized === undefined) {
    addIssue(issues, "$", "invalid-type", "Envelope must be JSON serializable.");
    return;
  }

  if (utf8ByteLength(serialized) > WORKER_MESSAGE_LIMITS.maxEnvelopeBytes) {
    addIssue(issues, "$", "oversized-envelope", `Envelope exceeds ${String(WORKER_MESSAGE_LIMITS.maxEnvelopeBytes)} bytes.`);
  }
}

function validateSchema(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const schemaId = input["schemaId"];

  if (schemaId !== WORKER_ENVELOPE_SCHEMA_ID) {
    addIssue(issues, "$.schemaId", "invalid-schema-id", `schemaId must be ${WORKER_ENVELOPE_SCHEMA_ID}.`);
  }

  const schemaVersion = input["schemaVersion"];

  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    addIssue(issues, "$.schemaVersion", "invalid-schema-version", "schemaVersion must be an integer.");
    return;
  }

  if (schemaVersion < MIN_SUPPORTED_ENVELOPE_SCHEMA_VERSION) {
    addIssue(issues, "$.schemaVersion", "stale-schema-version", "schemaVersion is no longer supported.");
    return;
  }

  if (schemaVersion > CURRENT_ENVELOPE_SCHEMA_VERSION) {
    addIssue(issues, "$.schemaVersion", "unsupported-schema-version", "schemaVersion is newer than this package supports.");
  }
}

function validateRoute(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const route = input["route"];

  if (typeof route !== "string" || !isWorkerStage(route)) {
    addIssue(issues, "$.route", "invalid-route", "route must be one of the contracted worker stages.");
  }
}

function validateIdentifiers(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  for (const key of [
    "messageId",
    "causationId",
    "correlationId"
  ] as const) {
    const value = input[key];

    if (typeof value !== "string" || !UUID_RE.test(value)) {
      addIssue(issues, `$.${key}`, "invalid-identifier", `${key} must be a UUID.`);
    }
  }

  const idempotencyKey = input["idempotencyKey"];

  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    addIssue(issues, "$.idempotencyKey", "invalid-identifier", "idempotencyKey has an invalid format.");
    return;
  }

  if (utf8ByteLength(idempotencyKey) > WORKER_MESSAGE_LIMITS.maxIdempotencyKeyBytes) {
    addIssue(issues, "$.idempotencyKey", "oversized-field", "idempotencyKey is too large.");
  }
}

function validateTraceContext(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const traceparent = input["traceparent"];

  if (typeof traceparent !== "string" || !TRACEPARENT_RE.test(traceparent)) {
    addIssue(issues, "$.traceparent", "invalid-trace-context", "traceparent must follow W3C version 00 trace context format.");
  }

  if (!hasOwn(input, "tracestate")) {
    return;
  }

  const tracestate = input["tracestate"];

  if (typeof tracestate !== "string") {
    addIssue(issues, "$.tracestate", "invalid-trace-context", "tracestate must be a string when present.");
    return;
  }

  if (utf8ByteLength(tracestate) > WORKER_MESSAGE_LIMITS.maxTraceStateBytes) {
    addIssue(issues, "$.tracestate", "oversized-field", "tracestate is too large.");
  }
}

function validateAggregate(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const aggregate = input["aggregate"];

  if (!isRecord(aggregate)) {
    addIssue(issues, "$.aggregate", "invalid-type", "aggregate must be an object.");
    return;
  }

  validateExactKeys(aggregate, "$.aggregate", AGGREGATE_KEYS, issues);

  const type = aggregate["type"];

  if (typeof type !== "string" || !AGGREGATE_TYPE_RE.test(type)) {
    addIssue(issues, "$.aggregate.type", "invalid-identifier", "aggregate.type has an invalid format.");
  }

  const id = aggregate["id"];

  if (typeof id !== "string" || id.length === 0 || utf8ByteLength(id) > 128) {
    addIssue(issues, "$.aggregate.id", "invalid-identifier", "aggregate.id must be a bounded non-empty string.");
  }

  const version = aggregate["version"];

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    addIssue(issues, "$.aggregate.version", "invalid-identifier", "aggregate.version must be a positive integer.");
  }
}

function validateAttempt(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const attempt = input["attempt"];

  if (!isRecord(attempt)) {
    addIssue(issues, "$.attempt", "invalid-type", "attempt must be an object.");
    return;
  }

  validateExactKeys(attempt, "$.attempt", ATTEMPT_KEYS, issues);

  const count = attempt["count"];
  const max = attempt["max"];

  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > WORKER_DELIVERY_BEHAVIOR.maxAttempts) {
    addIssue(issues, "$.attempt.count", "invalid-attempt", `attempt.count must be between 1 and ${String(WORKER_DELIVERY_BEHAVIOR.maxAttempts)}.`);
  }

  if (max !== WORKER_DELIVERY_BEHAVIOR.maxAttempts) {
    addIssue(issues, "$.attempt.max", "invalid-attempt", `attempt.max must be ${String(WORKER_DELIVERY_BEHAVIOR.maxAttempts)}.`);
  }

  validateTimestamp(attempt, "firstAttemptAt", "$.attempt.firstAttemptAt", issues);

  if (hasOwn(attempt, "lastAttemptAt")) {
    validateTimestamp(attempt, "lastAttemptAt", "$.attempt.lastAttemptAt", issues);
  }
}

function validateProducer(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const producer = input["producer"];

  if (!isRecord(producer)) {
    addIssue(issues, "$.producer", "invalid-type", "producer must be an object.");
    return;
  }

  validateExactKeys(producer, "$.producer", PRODUCER_KEYS, issues);

  const name = producer["name"];

  if (typeof name !== "string" || !PRODUCER_NAME_RE.test(name)) {
    addIssue(issues, "$.producer.name", "invalid-producer", "producer.name has an invalid format.");
  } else if (utf8ByteLength(name) > WORKER_MESSAGE_LIMITS.maxProducerNameBytes) {
    addIssue(issues, "$.producer.name", "oversized-field", "producer.name is too large.");
  }

  const version = producer["version"];

  if (typeof version !== "string" || !SEMVER_RE.test(version)) {
    addIssue(issues, "$.producer.version", "invalid-producer", "producer.version must be semver.");
  } else if (utf8ByteLength(version) > WORKER_MESSAGE_LIMITS.maxProducerVersionBytes) {
    addIssue(issues, "$.producer.version", "oversized-field", "producer.version is too large.");
  }

  if (hasOwn(producer, "instanceId")) {
    const instanceId = producer["instanceId"];

    if (typeof instanceId !== "string" || instanceId.length === 0 || utf8ByteLength(instanceId) > 128) {
      addIssue(issues, "$.producer.instanceId", "invalid-producer", "producer.instanceId must be a bounded non-empty string.");
    }
  }
}

function validatePayloadReference(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const payloadRef = input["payloadRef"];

  if (!isRecord(payloadRef)) {
    addIssue(issues, "$.payloadRef", "invalid-type", "payloadRef must be an object.");
    return;
  }

  validateExactKeys(payloadRef, "$.payloadRef", PAYLOAD_REF_KEYS, issues);

  const serialized = stringifyForSize(payloadRef);

  if (serialized === undefined || utf8ByteLength(serialized) > WORKER_MESSAGE_LIMITS.maxPayloadReferenceBytes) {
    addIssue(issues, "$.payloadRef", "oversized-field", `payloadRef must fit in ${String(WORKER_MESSAGE_LIMITS.maxPayloadReferenceBytes)} bytes.`);
  }

  const kind = payloadRef["kind"];

  if (typeof kind !== "string" || !isPayloadReferenceKind(kind)) {
    addIssue(issues, "$.payloadRef.kind", "invalid-payload-reference", "payloadRef.kind is not supported.");
  }

  const uri = payloadRef["uri"];

  if (
    typeof uri !== "string" ||
    uri.length === 0 ||
    uri.startsWith("data:") ||
    utf8ByteLength(uri) > WORKER_MESSAGE_LIMITS.maxPayloadReferenceUriBytes
  ) {
    addIssue(issues, "$.payloadRef.uri", "invalid-payload-reference", "payloadRef.uri must be a bounded reference URI and must not inline data.");
  }

  if (payloadRef["mediaType"] !== "application/json") {
    addIssue(issues, "$.payloadRef.mediaType", "invalid-payload-reference", "payloadRef.mediaType must be application/json.");
  }

  const sizeBytes = payloadRef["sizeBytes"];

  if (
    typeof sizeBytes !== "number" ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 0 ||
    sizeBytes > WORKER_MESSAGE_LIMITS.maxReferencedPayloadBytes
  ) {
    addIssue(issues, "$.payloadRef.sizeBytes", "invalid-payload-reference", "payloadRef.sizeBytes is outside the supported bound.");
  }

  if (hasOwn(payloadRef, "digest")) {
    const digest = payloadRef["digest"];

    if (typeof digest !== "string" || !SHA256_DIGEST_RE.test(digest)) {
      addIssue(issues, "$.payloadRef.digest", "invalid-payload-reference", "payloadRef.digest must be a sha256 digest.");
    }
  }
}

function validateHeaderSize(input: Readonly<Record<string, unknown>>, issues: EnvelopeValidationIssue[]): void {
  const headerMaterial = [
    input["messageId"],
    input["causationId"],
    input["correlationId"],
    input["traceparent"],
    input["tracestate"],
    input["idempotencyKey"]
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  if (utf8ByteLength(headerMaterial) > WORKER_MESSAGE_LIMITS.maxHeadersBytes) {
    addIssue(issues, "$", "oversized-headers", `Envelope routing headers exceed ${String(WORKER_MESSAGE_LIMITS.maxHeadersBytes)} bytes.`);
  }
}

function validateTimestamp(record: Readonly<Record<string, unknown>>, key: string, path: string, issues: EnvelopeValidationIssue[]): void {
  const value = record[key];

  if (typeof value !== "string" || !ISO_INSTANT_RE.test(value) || Number.isNaN(Date.parse(value))) {
    addIssue(issues, path, "invalid-timestamp", `${path} must be an ISO-8601 UTC instant with millisecond precision.`);
  }
}

function validateExactKeys(
  record: Readonly<Record<string, unknown>>,
  path: string,
  allowedKeys: readonly string[],
  issues: EnvelopeValidationIssue[]
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      addIssue(issues, `${path}.${key}`, "unknown-field", `${path}.${key} is not part of the envelope contract.`);
    }
  }
}

function addIssue(
  issues: EnvelopeValidationIssue[],
  path: string,
  code: EnvelopeValidationIssueCode,
  message: string
): void {
  issues.push({
    path,
    code,
    message
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPayloadReferenceKind(value: string): value is PayloadReferenceKind {
  return (PAYLOAD_REFERENCE_KINDS as readonly string[]).includes(value);
}

function stringifyForSize(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : undefined;
  } catch {
    return undefined;
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
      index += 1;
    }
  }

  return bytes;
}
