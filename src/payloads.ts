import {
  WORKER_MESSAGE_LIMITS,
  type WorkerStage
} from "./topology.js";

export const STAGE_PAYLOAD_SCHEMA_VERSION = 1 as const;

export const STAGE_PAYLOAD_SCHEMA_IDS = {
  feedFetchRequest: "nutsnews.worker.payload.feed-fetch-request.v1",
  feedFetchResult: "nutsnews.worker.payload.feed-fetch-result.v1",
  canonicalArticleCandidate: "nutsnews.worker.payload.canonical-article-candidate.v1",
  enrichmentResult: "nutsnews.worker.payload.enrichment-result.v1",
  approvalDecision: "nutsnews.worker.payload.approval-decision.v1",
  translationTask: "nutsnews.worker.payload.translation-task.v1",
  translationResult: "nutsnews.worker.payload.translation-result.v1",
  persistenceCommand: "nutsnews.worker.payload.persistence-command.v1",
  persistenceResult: "nutsnews.worker.payload.persistence-result.v1",
  publicationReadiness: "nutsnews.worker.payload.publication-readiness.v1",
  terminalFailure: "nutsnews.worker.payload.terminal-failure.v1"
} as const;

export type StagePayloadSchemaId = (typeof STAGE_PAYLOAD_SCHEMA_IDS)[keyof typeof STAGE_PAYLOAD_SCHEMA_IDS];

export type PayloadFieldType =
  | "schema-id"
  | "schema-version"
  | "uuid"
  | "traceparent"
  | "iso-instant"
  | "idempotency-key"
  | "string"
  | "url"
  | "integer"
  | "positive-integer"
  | "boolean"
  | "string-array"
  | "object"
  | "object-array"
  | "enum";

export interface PayloadFieldDefinition {
  readonly type: PayloadFieldType;
  readonly values?: readonly string[];
  readonly maxBytes?: number;
  readonly description: string;
}

export interface StagePayloadSchemaDefinition {
  readonly schemaId: StagePayloadSchemaId;
  readonly stage: WorkerStage | "terminal";
  readonly producer: string;
  readonly consumer: string;
  readonly summary: string;
  readonly requiredFields: readonly string[];
  readonly fieldDefinitions: Readonly<Record<string, PayloadFieldDefinition>>;
}

export type StagePayloadValidationIssueCode =
  | "invalid-type"
  | "unknown-schema"
  | "unsupported-schema-version"
  | "missing-field"
  | "unknown-field"
  | "invalid-field"
  | "oversized-payload"
  | "unsafe-fixture-content";

export interface StagePayloadValidationIssue {
  readonly path: string;
  readonly code: StagePayloadValidationIssueCode;
  readonly message: string;
}

export type StagePayloadValidationResult =
  | {
      readonly ok: true;
      readonly value: Readonly<Record<string, unknown>>;
      readonly definition: StagePayloadSchemaDefinition;
    }
  | {
      readonly ok: false;
      readonly issues: readonly StagePayloadValidationIssue[];
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const IDEMPOTENCY_KEY_RE = /^[a-z0-9][a-z0-9._:/-]{0,255}$/u;
const UNSAFE_TEXT_FRAGMENTS = [
  "bearer ",
  "api_key=",
  "apikey=",
  "token=",
  "secret=",
  "password=",
  "private_key",
  "service_role"
] as const;

const COMMON_REQUIRED_FIELDS = [
  "schemaId",
  "schemaVersion",
  "pipelineRunId",
  "stageExecutionId",
  "sourceMessageId",
  "idempotencyKey",
  "traceparent",
  "producedAt"
] as const;

const COMMON_FIELD_DEFINITIONS = {
  schemaId: {
    type: "schema-id",
    description: "Exact payload schema identifier."
  },
  schemaVersion: {
    type: "schema-version",
    description: "Payload schema version supported by this package."
  },
  pipelineRunId: {
    type: "uuid",
    description: "End-to-end worker pipeline run identifier."
  },
  stageExecutionId: {
    type: "uuid",
    description: "Identifier for this stage execution attempt."
  },
  sourceMessageId: {
    type: "uuid",
    description: "Envelope message ID from the previous hop."
  },
  idempotencyKey: {
    type: "idempotency-key",
    description: "Stable key used by consumers to dedupe retries and replays."
  },
  traceparent: {
    type: "traceparent",
    description: "W3C trace context propagated from the envelope."
  },
  tracestate: {
    type: "string",
    maxBytes: 512,
    description: "Optional W3C trace state propagated from the envelope."
  },
  producedAt: {
    type: "iso-instant",
    description: "UTC timestamp when the payload was produced."
  },
  replayOfMessageId: {
    type: "uuid",
    description: "Original message ID when this payload is an explicit replay."
  }
} as const satisfies Readonly<Record<string, PayloadFieldDefinition>>;

export const STAGE_PAYLOAD_SCHEMA_DEFINITIONS = {
  [STAGE_PAYLOAD_SCHEMA_IDS.feedFetchRequest]: schema(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchRequest, "fetch", "scheduler", "fetcher", "Request one feed fetch without carrying feed contents.", [
    "feedId",
    "feedUrl",
    "shardIndex",
    "shardCount",
    "fetchReason",
    "limits"
  ], {
    feedId: stringField("Stable feed identifier."),
    feedUrl: urlField("Synthetic or public feed URL to fetch."),
    shardIndex: integerField("Legacy shard index retained for parity evidence."),
    shardCount: positiveIntegerField("Legacy shard count retained for parity evidence."),
    fetchReason: enumField("Reason for fetch scheduling.", [
      "scheduled",
      "manual",
      "backlog",
      "replay"
    ]),
    conditional: objectField("Optional conditional request metadata such as ETag or Last-Modified."),
    limits: objectField("Fetch timeout and item cap limits.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.feedFetchResult]: schema(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchResult, "fetch", "fetcher", "canonicalizer", "Report feed fetch and parse outcome using candidate references only.", [
    "feedId",
    "feedUrl",
    "fetchStatus",
    "itemRefs"
  ], {
    feedId: stringField("Stable feed identifier."),
    feedUrl: urlField("Fetched feed URL."),
    fetchStatus: enumField("Fetch and parse outcome.", [
      "success",
      "unchanged",
      "transient_failure",
      "permanent_failure"
    ]),
    httpStatus: integerField("HTTP status when available."),
    etag: stringField("Sanitized ETag returned by the feed."),
    lastModified: stringField("Sanitized Last-Modified value returned by the feed."),
    unchangedReason: stringField("Reason an unchanged feed produced no candidates."),
    itemRefs: objectArrayField("Small candidate references emitted by the parser."),
    errorRef: objectField("Sanitized error reference for failed fetches.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.canonicalArticleCandidate]: schema(STAGE_PAYLOAD_SCHEMA_IDS.canonicalArticleCandidate, "canonicalization", "canonicalizer", "enrichment", "Carry canonical URL and dedupe decision without article body.", [
    "candidateId",
    "feedId",
    "sourceItemId",
    "originalUrl",
    "canonicalUrl",
    "title",
    "sourceName",
    "dedupeStatus"
  ], {
    candidateId: stringField("Stable candidate identifier."),
    feedId: stringField("Stable feed identifier."),
    sourceItemId: stringField("Source GUID/link identifier from feed item."),
    originalUrl: urlField("Original article URL from the feed."),
    canonicalUrl: urlField("Canonical URL after normalization."),
    title: stringField("Sanitized feed title only, not article body."),
    sourceName: stringField("Public source display name."),
    publishedAt: isoInstantField("Article published timestamp when present."),
    dedupeStatus: enumField("Dedupe decision before expensive work.", [
      "new",
      "duplicate"
    ]),
    duplicateOfArticleId: stringField("Existing article identifier for duplicates.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.enrichmentResult]: schema(STAGE_PAYLOAD_SCHEMA_IDS.enrichmentResult, "enrichment", "enrichment", "approval", "Carry image/article-page enrichment metadata by reference.", [
    "candidateId",
    "canonicalUrl",
    "imageStatus",
    "articleMetadataRef"
  ], {
    candidateId: stringField("Stable candidate identifier."),
    canonicalUrl: urlField("Canonical URL under review."),
    imageStatus: enumField("Image hydration outcome.", [
      "hydrated",
      "no_thumbnail",
      "transient_failure"
    ]),
    imageUrl: urlField("Selected thumbnail/image URL when available."),
    articleMetadataRef: objectField("Durable reference to sanitized article-page metadata."),
    retryAfterSeconds: integerField("Suggested retry delay for transient image failures.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.approvalDecision]: schema(STAGE_PAYLOAD_SCHEMA_IDS.approvalDecision, "approval", "approval", "translation", "Carry approval/rejection decision and metadata, not model output body.", [
    "candidateId",
    "decision",
    "provider",
    "model",
    "reviewRef"
  ], {
    candidateId: stringField("Stable candidate identifier."),
    decision: enumField("Approval outcome.", [
      "accepted",
      "rejected",
      "transient_failure",
      "permanent_failure"
    ]),
    rejectionReason: stringField("Sanitized rejection reason."),
    provider: enumField("Decision provider path.", [
      "prefilter",
      "local_ai",
      "legacy_openai_fallback"
    ]),
    model: stringField("Provider model identifier."),
    positivityScore: integerField("Bounded positivity score from retained legacy behavior."),
    reviewRef: objectField("Durable reference to structured review metadata."),
    aiUsageRef: objectField("Durable reference to token/cost counters.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.translationTask]: schema(STAGE_PAYLOAD_SCHEMA_IDS.translationTask, "translation", "approval", "translation", "Request translations for required languages by article ID.", [
    "articleId",
    "sourceLanguage",
    "targetLanguages",
    "reason",
    "existingLanguageCodes"
  ], {
    articleId: stringField("Accepted article identifier."),
    sourceLanguage: stringField("Source language code."),
    targetLanguages: stringArrayField("Required target language codes."),
    reason: enumField("Translation scheduling reason.", [
      "new_article",
      "backlog_recovery",
      "replay"
    ]),
    existingLanguageCodes: stringArrayField("Already available language codes.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.translationResult]: schema(STAGE_PAYLOAD_SCHEMA_IDS.translationResult, "translation", "translation", "persistence", "Report translation coverage and summary references.", [
    "articleId",
    "translationStatus",
    "completedLanguageCodes",
    "missingLanguageCodes",
    "summaryRefs"
  ], {
    articleId: stringField("Accepted article identifier."),
    translationStatus: enumField("Translation task outcome.", [
      "complete",
      "partial",
      "transient_failure",
      "permanent_failure"
    ]),
    completedLanguageCodes: stringArrayField("Languages with saved summary references."),
    missingLanguageCodes: stringArrayField("Required languages still missing."),
    summaryRefs: objectArrayField("Durable summary row references, not translated text bodies."),
    qualityRef: objectField("Durable reference to translation quality evidence."),
    failureRef: objectField("Sanitized failure reference.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.persistenceCommand]: schema(STAGE_PAYLOAD_SCHEMA_IDS.persistenceCommand, "persistence", "persistence", "persistence", "Request an idempotent backend Worker DB API write.", [
    "commandId",
    "commandKind",
    "backendOperation",
    "entityRefs",
    "writeMode",
    "providerMode"
  ], {
    commandId: uuidField("Unique persistence command identifier."),
    commandKind: enumField("Persistence command type.", [
      "save_feed_health",
      "save_review",
      "save_article",
      "save_summaries",
      "save_worker_run"
    ]),
    backendOperation: enumField("Backend Worker DB API operation.", [
      "save-feed-health-batch",
      "save-article-reviews-batch",
      "save-accepted-articles-batch",
      "save-article-summaries-batch",
      "save-ai-usage-run",
      "save-worker-run"
    ]),
    entityRefs: objectArrayField("Durable references to write inputs."),
    writeMode: enumField("Idempotent write mode.", [
      "upsert",
      "insert_on_conflict_do_nothing"
    ]),
    providerMode: enumField("Backend provider mode.", [
      "backend_postgres_primary"
    ])
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.persistenceResult]: schema(STAGE_PAYLOAD_SCHEMA_IDS.persistenceResult, "persistence", "persistence", "publication", "Report backend write result without carrying persisted bodies.", [
    "commandId",
    "backendOperation",
    "persistenceStatus"
  ], {
    commandId: uuidField("Persistence command identifier."),
    backendOperation: stringField("Backend operation that was attempted."),
    persistenceStatus: enumField("Persistence write outcome.", [
      "saved",
      "duplicate",
      "rejected",
      "transient_failure",
      "permanent_failure"
    ]),
    savedEntityRefs: objectArrayField("Saved entity references."),
    duplicateOf: stringField("Existing entity identifier for duplicate writes."),
    errorRef: objectField("Sanitized failure reference.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.publicationReadiness]: schema(STAGE_PAYLOAD_SCHEMA_IDS.publicationReadiness, "publication", "publication", "publication", "Declare whether an article can publish and refresh snapshots.", [
    "articleId",
    "readinessStatus",
    "requiredLanguageCodes",
    "availableLanguageCodes",
    "missingLanguageCodes",
    "snapshotRefreshRequired"
  ], {
    articleId: stringField("Accepted article identifier."),
    readinessStatus: enumField("Publication gate outcome.", [
      "ready",
      "blocked_missing_translations",
      "published"
    ]),
    requiredLanguageCodes: stringArrayField("Configured required summary languages."),
    availableLanguageCodes: stringArrayField("Summary languages present."),
    missingLanguageCodes: stringArrayField("Summary languages blocking publication."),
    snapshotRefreshRequired: booleanField("Whether public-feed snapshot refresh should run."),
    publicationRef: objectField("Durable publication audit reference.")
  }),
  [STAGE_PAYLOAD_SCHEMA_IDS.terminalFailure]: schema(STAGE_PAYLOAD_SCHEMA_IDS.terminalFailure, "terminal", "any-stage-consumer", "dlq-operator", "Record poison or retry-exhausted message facts for terminal handling.", [
    "failedSchemaId",
    "failedMessageId",
    "failedRoute",
    "failedAttemptCount",
    "failureClass",
    "errorCode",
    "sanitizedError",
    "retryExhausted",
    "originalPayloadRef"
  ], {
    failedSchemaId: stringField("Schema ID of the failed message or payload."),
    failedMessageId: uuidField("Envelope message ID that failed."),
    failedRoute: stringField("Worker route where the failure occurred."),
    failedAttemptCount: positiveIntegerField("Attempt count at terminal failure."),
    failureClass: enumField("Terminal failure class.", [
      "malformed",
      "oversized",
      "stale_schema",
      "unsupported_schema",
      "transient_exhausted",
      "permanent"
    ]),
    errorCode: stringField("Stable sanitized error code."),
    sanitizedError: stringField("Sanitized operator-facing error summary."),
    retryExhausted: booleanField("Whether retry tiers were exhausted."),
    originalPayloadRef: objectField("Durable reference to the failed payload snapshot.")
  })
} as const satisfies Readonly<Record<StagePayloadSchemaId, StagePayloadSchemaDefinition>>;

export function getStagePayloadSchemaDefinition(schemaId: StagePayloadSchemaId): StagePayloadSchemaDefinition {
  return STAGE_PAYLOAD_SCHEMA_DEFINITIONS[schemaId];
}

export function getStagePayloadSizeBytes(payload: unknown): number {
  const serialized = stringifyForSize(payload);
  return serialized === undefined ? Number.POSITIVE_INFINITY : utf8ByteLength(serialized);
}

export function validateStagePayload(input: unknown): StagePayloadValidationResult {
  const issues: StagePayloadValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        issue("$", "invalid-type", "Stage payload must be a JSON object.")
      ]
    };
  }

  const sizeBytes = getStagePayloadSizeBytes(input);

  if (sizeBytes > WORKER_MESSAGE_LIMITS.maxEnvelopeBytes) {
    issues.push(issue("$", "oversized-payload", `Stage payload exceeds ${String(WORKER_MESSAGE_LIMITS.maxEnvelopeBytes)} bytes.`));
  }

  if (containsUnsafeFixtureContent(input)) {
    issues.push(issue("$", "unsafe-fixture-content", "Stage payload contains token, secret, or credential-like material."));
  }

  const schemaId = input["schemaId"];

  if (typeof schemaId !== "string" || !isStagePayloadSchemaId(schemaId)) {
    issues.push(issue("$.schemaId", "unknown-schema", "schemaId is not a known worker stage payload schema."));
    return {
      ok: false,
      issues
    };
  }

  const definition = STAGE_PAYLOAD_SCHEMA_DEFINITIONS[schemaId];
  const allowedFields = Object.keys(definition.fieldDefinitions);

  for (const key of Object.keys(input)) {
    if (!allowedFields.includes(key)) {
      issues.push(issue(`$.${key}`, "unknown-field", `${key} is not part of ${schemaId}.`));
    }
  }

  for (const field of definition.requiredFields) {
    if (!hasOwn(input, field)) {
      issues.push(issue(`$.${field}`, "missing-field", `${field} is required by ${schemaId}.`));
    }
  }

  for (const [field, fieldDefinition] of Object.entries(definition.fieldDefinitions)) {
    if (hasOwn(input, field)) {
      validateField(input[field], fieldDefinition, `$.${field}`, definition, issues);
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues
    };
  }

  return {
    ok: true,
    value: input,
    definition
  };
}

function schema(
  schemaId: StagePayloadSchemaId,
  stage: StagePayloadSchemaDefinition["stage"],
  producer: string,
  consumer: string,
  summary: string,
  requiredFields: readonly string[],
  fieldDefinitions: Readonly<Record<string, PayloadFieldDefinition>>
): StagePayloadSchemaDefinition {
  return {
    schemaId,
    stage,
    producer,
    consumer,
    summary,
    requiredFields: [
      ...COMMON_REQUIRED_FIELDS,
      ...requiredFields
    ],
    fieldDefinitions: {
      ...COMMON_FIELD_DEFINITIONS,
      ...fieldDefinitions
    }
  };
}

function validateField(
  value: unknown,
  definition: PayloadFieldDefinition,
  path: string,
  schemaDefinition: StagePayloadSchemaDefinition,
  issues: StagePayloadValidationIssue[]
): void {
  if (definition.type === "schema-id") {
    if (value !== schemaDefinition.schemaId) {
      issues.push(issue(path, "invalid-field", `schemaId must be ${schemaDefinition.schemaId}.`));
    }
    return;
  }

  if (definition.type === "schema-version") {
    if (value !== STAGE_PAYLOAD_SCHEMA_VERSION) {
      issues.push(issue(path, "unsupported-schema-version", `schemaVersion must be ${String(STAGE_PAYLOAD_SCHEMA_VERSION)}.`));
    }
    return;
  }

  if (definition.type === "uuid") {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      issues.push(issue(path, "invalid-field", `${path} must be a UUID.`));
    }
    return;
  }

  if (definition.type === "traceparent") {
    if (typeof value !== "string" || !TRACEPARENT_RE.test(value)) {
      issues.push(issue(path, "invalid-field", `${path} must be W3C traceparent version 00.`));
    }
    return;
  }

  if (definition.type === "iso-instant") {
    if (typeof value !== "string" || !ISO_INSTANT_RE.test(value) || Number.isNaN(Date.parse(value))) {
      issues.push(issue(path, "invalid-field", `${path} must be an ISO-8601 UTC instant with milliseconds.`));
    }
    return;
  }

  if (definition.type === "idempotency-key") {
    if (typeof value !== "string" || !IDEMPOTENCY_KEY_RE.test(value) || utf8ByteLength(value) > WORKER_MESSAGE_LIMITS.maxIdempotencyKeyBytes) {
      issues.push(issue(path, "invalid-field", `${path} is not a valid idempotency key.`));
    }
    return;
  }

  if (definition.type === "string") {
    validateString(value, definition, path, issues);
    return;
  }

  if (definition.type === "url") {
    if (typeof value !== "string" || !isSafeUrl(value)) {
      issues.push(issue(path, "invalid-field", `${path} must be a bounded http(s) URL without credentials or token-like query parameters.`));
    }
    return;
  }

  if (definition.type === "integer" || definition.type === "positive-integer") {
    const minimum = definition.type === "positive-integer" ? 1 : 0;

    if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
      issues.push(issue(path, "invalid-field", `${path} must be an integer >= ${String(minimum)}.`));
    }
    return;
  }

  if (definition.type === "boolean") {
    if (typeof value !== "boolean") {
      issues.push(issue(path, "invalid-field", `${path} must be a boolean.`));
    }
    return;
  }

  if (definition.type === "string-array") {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
      issues.push(issue(path, "invalid-field", `${path} must be an array of non-empty strings.`));
    }
    return;
  }

  if (definition.type === "object") {
    if (!isRecord(value)) {
      issues.push(issue(path, "invalid-field", `${path} must be an object.`));
    }
    return;
  }

  if (definition.type === "object-array") {
    if (!Array.isArray(value) || !value.every((item) => isRecord(item))) {
      issues.push(issue(path, "invalid-field", `${path} must be an array of objects.`));
    }
    return;
  }

  if (typeof value !== "string" || !definition.values?.includes(value)) {
    issues.push(issue(path, "invalid-field", `${path} must be one of the allowed enum values.`));
  }
}

function validateString(
  value: unknown,
  definition: PayloadFieldDefinition,
  path: string,
  issues: StagePayloadValidationIssue[]
): void {
  const maxBytes = definition.maxBytes ?? 512;

  if (typeof value !== "string" || value.length === 0 || utf8ByteLength(value) > maxBytes) {
    issues.push(issue(path, "invalid-field", `${path} must be a bounded non-empty string.`));
  }
}

function stringField(description: string): PayloadFieldDefinition {
  return {
    type: "string",
    description
  };
}

function uuidField(description: string): PayloadFieldDefinition {
  return {
    type: "uuid",
    description
  };
}

function urlField(description: string): PayloadFieldDefinition {
  return {
    type: "url",
    description
  };
}

function isoInstantField(description: string): PayloadFieldDefinition {
  return {
    type: "iso-instant",
    description
  };
}

function integerField(description: string): PayloadFieldDefinition {
  return {
    type: "integer",
    description
  };
}

function positiveIntegerField(description: string): PayloadFieldDefinition {
  return {
    type: "positive-integer",
    description
  };
}

function booleanField(description: string): PayloadFieldDefinition {
  return {
    type: "boolean",
    description
  };
}

function stringArrayField(description: string): PayloadFieldDefinition {
  return {
    type: "string-array",
    description
  };
}

function objectField(description: string): PayloadFieldDefinition {
  return {
    type: "object",
    description
  };
}

function objectArrayField(description: string): PayloadFieldDefinition {
  return {
    type: "object-array",
    description
  };
}

function enumField(description: string, values: readonly string[]): PayloadFieldDefinition {
  return {
    type: "enum",
    values,
    description
  };
}

function isStagePayloadSchemaId(value: string): value is StagePayloadSchemaId {
  return Object.values(STAGE_PAYLOAD_SCHEMA_IDS).includes(value as StagePayloadSchemaId);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isSafeUrl(value: string): boolean {
  if (utf8ByteLength(value) > 2_048) {
    return false;
  }

  if (!/^https?:\/\//u.test(value)) {
    return false;
  }

  const authority = value.replace(/^https?:\/\//u, "").split(/[/?#]/u)[0];

  if (authority === undefined || authority.length === 0 || authority.includes("@")) {
    return false;
  }

  const query = value.split("?", 2)[1]?.split("#", 1)[0] ?? "";

  return !query.split("&").some((parameter) => /^(token|secret|password|api.?key)=?/iu.test(parameter));
}

function containsUnsafeFixtureContent(payload: Readonly<Record<string, unknown>>): boolean {
  const serialized = stringifyForSize(payload)?.toLowerCase();

  if (serialized === undefined) {
    return true;
  }

  return UNSAFE_TEXT_FRAGMENTS.some((fragment) => serialized.includes(fragment));
}

function issue(path: string, code: StagePayloadValidationIssueCode, message: string): StagePayloadValidationIssue {
  return {
    path,
    code,
    message
  };
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
