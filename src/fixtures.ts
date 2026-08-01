import {
  STAGE_PAYLOAD_SCHEMA_IDS,
  STAGE_PAYLOAD_SCHEMA_VERSION
} from "./payloads.js";

export type StagePayloadFixtureCase =
  | "success"
  | "duplicate"
  | "unchanged-feed"
  | "rejection"
  | "partial-translation"
  | "transient-failure"
  | "permanent-failure"
  | "retry-exhaustion"
  | "replay"
  | "service-input-output";

export interface StagePayloadFixture {
  readonly name: string;
  readonly fixtureCase: StagePayloadFixtureCase;
  readonly retainedLegacyBehavior: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

const basePayload = {
  schemaVersion: STAGE_PAYLOAD_SCHEMA_VERSION,
  pipelineRunId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3601",
  stageExecutionId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3602",
  sourceMessageId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3603",
  idempotencyKey: "feed:world:story-001",
  traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  producedAt: "2026-07-23T04:40:00.000Z"
} as const;

export const STAGE_PAYLOAD_FIXTURES = [
  fixture("feed-fetch-request-scheduled", "service-input-output", "Controller/shard cadence is retained as scheduler evidence without copying shard runtime.", payload(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchRequest, {
    feedId: "feed-world",
    feedUrl: "https://feeds.example.test/world.xml",
    shardIndex: 3,
    shardCount: 25,
    fetchReason: "scheduled",
    conditional: {
      etag: "example-etag"
    },
    limits: {
      timeoutMs: 15_000,
      maxItems: 35
    }
  })),
  fixture("feed-fetch-result-success", "success", "Successful feed refresh emits candidate references and feed health evidence without article body.", payload(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchResult, {
    feedId: "feed-world",
    feedUrl: "https://feeds.example.test/world.xml",
    fetchStatus: "success",
    httpStatus: 200,
    etag: "example-etag-next",
    itemRefs: [
      {
        candidateId: "cand-001",
        sourceItemId: "guid-001",
        canonicalUrl: "https://articles.example.test/world/story-001",
        title: "Synthetic world story"
      }
    ]
  })),
  fixture("feed-fetch-result-unchanged", "unchanged-feed", "Conditional fetch can avoid downstream work for unchanged feeds while recording health.", payload(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchResult, {
    feedId: "feed-world",
    feedUrl: "https://feeds.example.test/world.xml",
    fetchStatus: "unchanged",
    httpStatus: 304,
    unchangedReason: "etag-match",
    itemRefs: []
  })),
  fixture("canonical-candidate-new-from-fetcher", "service-input-output", "The fetcher publishes a bounded candidate for canonicalizer-owned normalization and dedupe work.", payload(STAGE_PAYLOAD_SCHEMA_IDS.canonicalArticleCandidate, {
    candidateId: "cand-001",
    feedId: "feed-world",
    sourceItemId: "guid-001",
    originalUrl: "https://articles.example.test/world/story-001?utm_source=fixture",
    canonicalUrl: "https://articles.example.test/world/story-001",
    title: "Synthetic world story",
    sourceName: "Example Feed",
    publishedAt: "2026-07-23T04:35:00.000Z",
    dedupeStatus: "new"
  })),
  fixture("canonical-candidate-duplicate", "duplicate", "Previously reviewed or published URLs are skipped before AI review.", payload(STAGE_PAYLOAD_SCHEMA_IDS.canonicalArticleCandidate, {
    candidateId: "cand-duplicate-001",
    feedId: "feed-world",
    sourceItemId: "guid-001",
    originalUrl: "https://articles.example.test/world/story-001?utm_source=fixture",
    canonicalUrl: "https://articles.example.test/world/story-001",
    title: "Synthetic duplicate story",
    sourceName: "Example Feed",
    publishedAt: "2026-07-23T04:35:00.000Z",
    dedupeStatus: "duplicate",
    duplicateOfArticleId: "article-existing-001"
  })),
  fixture("enrichment-request-new", "service-input-output", "Canonicalizer requests page enrichment by canonical article ID and durable metadata reference only.", payload(STAGE_PAYLOAD_SCHEMA_IDS.enrichmentRequest, {
    requestId: "enrichment-req-001",
    canonicalArticleId: "article-001",
    articleVersion: 1,
    candidateId: "cand-001",
    canonicalUrl: "https://articles.example.test/world/story-001",
    reason: "new",
    payloadRef: {
      kind: "backend-record",
      id: "canonical-identity-001"
    }
  })),
  fixture("enrichment-request-changed", "service-input-output", "Materially changed canonical articles can request enrichment for a new version without losing identity history.", payload(STAGE_PAYLOAD_SCHEMA_IDS.enrichmentRequest, {
    requestId: "enrichment-req-002",
    canonicalArticleId: "article-001",
    articleVersion: 2,
    candidateId: "cand-001-version-002",
    canonicalUrl: "https://articles.example.test/world/story-001",
    reason: "changed",
    payloadRef: {
      kind: "backend-record",
      id: "canonical-identity-002"
    }
  })),
  fixture("enrichment-result-success", "service-input-output", "Image hydration keeps durable metadata references and selected image URL only.", payload(STAGE_PAYLOAD_SCHEMA_IDS.enrichmentResult, {
    candidateId: "cand-001",
    canonicalUrl: "https://articles.example.test/world/story-001",
    imageStatus: "hydrated",
    imageUrl: "https://images.example.test/world/story-001.jpg",
    articleMetadataRef: {
      kind: "backend-record",
      id: "article-metadata-001"
    }
  })),
  fixture("approval-decision-rejected", "rejection", "No-thumbnail and hard-negative decisions remain explicit rejection cases.", payload(STAGE_PAYLOAD_SCHEMA_IDS.approvalDecision, {
    candidateId: "cand-no-thumbnail-001",
    decision: "rejected",
    rejectionReason: "no_thumbnail",
    provider: "prefilter",
    model: "rules-2026-07",
    positivityScore: 0,
    reviewRef: {
      kind: "backend-record",
      id: "review-rejected-001"
    }
  })),
  fixture("approval-decision-permanent-failure", "permanent-failure", "Invalid structured AI decisions become permanent sanitized failures, not retries without end.", payload(STAGE_PAYLOAD_SCHEMA_IDS.approvalDecision, {
    candidateId: "cand-invalid-ai-001",
    decision: "permanent_failure",
    rejectionReason: "invalid_ai_decision_schema",
    provider: "local_ai",
    model: "qwen2.5:3b",
    positivityScore: 0,
    reviewRef: {
      kind: "backend-record",
      id: "review-failed-001"
    },
    aiUsageRef: {
      kind: "backend-record",
      id: "ai-usage-001"
    }
  })),
  fixture("translation-task-new-article", "service-input-output", "Accepted articles request the retained required language set by article ID.", payload(STAGE_PAYLOAD_SCHEMA_IDS.translationTask, {
    articleId: "article-001",
    sourceLanguage: "en",
    targetLanguages: [
      "fr",
      "ja",
      "de-CH",
      "de",
      "el"
    ],
    reason: "new_article",
    existingLanguageCodes: []
  })),
  fixture("translation-result-partial", "partial-translation", "Publication remains blocked while required summaries are missing.", payload(STAGE_PAYLOAD_SCHEMA_IDS.translationResult, {
    articleId: "article-001",
    translationStatus: "partial",
    completedLanguageCodes: [
      "fr",
      "ja",
      "de"
    ],
    missingLanguageCodes: [
      "de-CH",
      "el"
    ],
    summaryRefs: [
      {
        languageCode: "fr",
        summaryId: "summary-fr-001"
      },
      {
        languageCode: "ja",
        summaryId: "summary-ja-001"
      },
      {
        languageCode: "de",
        summaryId: "summary-de-001"
      }
    ],
    qualityRef: {
      kind: "backend-record",
      id: "translation-quality-001"
    }
  })),
  fixture("feed-fetch-transient-failure", "transient-failure", "Fetch timeout is bounded and records sanitized retryable failure evidence.", payload(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchResult, {
    feedId: "feed-timeout",
    feedUrl: "https://feeds.example.test/timeout.xml",
    fetchStatus: "transient_failure",
    itemRefs: [],
    errorRef: {
      code: "rss_fetch_timeout",
      retryable: true,
      timeoutMs: 15_000
    }
  })),
  fixture("persistence-command-save-article", "service-input-output", "Persistence writes through backend PostgreSQL primary using idempotent backend operations.", payload(STAGE_PAYLOAD_SCHEMA_IDS.persistenceCommand, {
    commandId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3610",
    commandKind: "save_article",
    backendOperation: "save-accepted-articles-batch",
    entityRefs: [
      {
        articleId: "article-001",
        reviewId: "review-accepted-001"
      }
    ],
    writeMode: "insert_on_conflict_do_nothing",
    providerMode: "backend_postgres_primary"
  })),
  fixture("persistence-result-duplicate", "duplicate", "Accepted article writes preserve insert-on-conflict duplicate behavior.", payload(STAGE_PAYLOAD_SCHEMA_IDS.persistenceResult, {
    commandId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3610",
    backendOperation: "save-accepted-articles-batch",
    persistenceStatus: "duplicate",
    duplicateOf: "article-existing-001"
  })),
  fixture("publication-readiness-blocked", "partial-translation", "Translation hold prevents publication until all configured summaries exist.", payload(STAGE_PAYLOAD_SCHEMA_IDS.publicationReadiness, {
    articleId: "article-001",
    readinessStatus: "blocked_missing_translations",
    requiredLanguageCodes: [
      "fr",
      "ja",
      "de-CH",
      "de",
      "el"
    ],
    availableLanguageCodes: [
      "fr",
      "ja",
      "de"
    ],
    missingLanguageCodes: [
      "de-CH",
      "el"
    ],
    snapshotRefreshRequired: false
  })),
  fixture("terminal-failure-retry-exhausted", "retry-exhaustion", "Retry exhaustion captures stable poison-message evidence in the terminal DLQ.", payload(STAGE_PAYLOAD_SCHEMA_IDS.terminalFailure, {
    failedSchemaId: STAGE_PAYLOAD_SCHEMA_IDS.feedFetchResult,
    failedMessageId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3611",
    failedRoute: "nutsnews.worker.canonicalization.v1",
    failedAttemptCount: 4,
    failureClass: "transient_exhausted",
    errorCode: "canonicalizer_repeated_timeout",
    sanitizedError: "Repeated timeout while loading durable candidate reference.",
    retryExhausted: true,
    originalPayloadRef: {
      kind: "backend-record",
      id: "failed-payload-001"
    }
  })),
  fixture("feed-fetch-request-replay", "replay", "Replay retains source message and idempotency context while pointing at the original message.", payload(STAGE_PAYLOAD_SCHEMA_IDS.feedFetchRequest, {
    replayOfMessageId: "018f1598-2dd5-7c4f-9f92-8f7a7f8b3612",
    feedId: "feed-world",
    feedUrl: "https://feeds.example.test/world.xml",
    shardIndex: 3,
    shardCount: 25,
    fetchReason: "replay",
    limits: {
      timeoutMs: 15_000,
      maxItems: 35
    }
  }))
] as const satisfies readonly StagePayloadFixture[];

function fixture(
  name: string,
  fixtureCase: StagePayloadFixtureCase,
  retainedLegacyBehavior: string,
  payloadValue: Readonly<Record<string, unknown>>
): StagePayloadFixture {
  return {
    name,
    fixtureCase,
    retainedLegacyBehavior,
    payload: payloadValue
  };
}

function payload(schemaId: string, fields: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return {
    schemaId,
    ...basePayload,
    ...fields
  };
}
