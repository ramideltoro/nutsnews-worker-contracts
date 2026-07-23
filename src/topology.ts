export const WORKER_CONTRACT_NAMESPACE = "nutsnews.worker" as const;
export const WORKER_CONTRACT_MAJOR_VERSION = 1 as const;
export const WORKER_ENVELOPE_SCHEMA_ID = "nutsnews.worker.envelope.v1" as const;
export const WORKER_TOPOLOGY_SCHEMA_ID = "nutsnews.worker.rabbitmq-topology.v1" as const;

export const WORKER_STAGES = [
  "fetch",
  "canonicalization",
  "enrichment",
  "approval",
  "translation",
  "persistence",
  "publication"
] as const;

export type WorkerStage = (typeof WORKER_STAGES)[number];

export interface WorkerRouteOwners {
  readonly producer: string;
  readonly consumer: string;
}

export const WORKER_ROUTE_OWNERS = {
  fetch: {
    producer: "scheduler",
    consumer: "fetcher"
  },
  canonicalization: {
    producer: "fetcher",
    consumer: "canonicalizer"
  },
  enrichment: {
    producer: "canonicalizer",
    consumer: "enrichment"
  },
  approval: {
    producer: "enrichment",
    consumer: "approval"
  },
  translation: {
    producer: "approval",
    consumer: "translation"
  },
  persistence: {
    producer: "translation",
    consumer: "persistence"
  },
  publication: {
    producer: "persistence",
    consumer: "publication"
  }
} as const satisfies Readonly<Record<WorkerStage, WorkerRouteOwners>>;

export const WORKER_EXCHANGES = {
  main: {
    name: "nutsnews.worker.v1",
    type: "topic",
    durable: true
  },
  retry: {
    name: "nutsnews.worker.retry.v1",
    type: "topic",
    durable: true
  },
  dlq: {
    name: "nutsnews.worker.dlq.v1",
    type: "topic",
    durable: true
  }
} as const;

export const WORKER_QUEUE_TYPE = "quorum" as const;

export const WORKER_RETRY_TIERS = [
  {
    name: "retry-30s",
    delayMs: 30_000
  },
  {
    name: "retry-5m",
    delayMs: 300_000
  },
  {
    name: "retry-30m",
    delayMs: 1_800_000
  }
] as const;

export type WorkerRetryTier = (typeof WORKER_RETRY_TIERS)[number];
export type WorkerRetryTierName = WorkerRetryTier["name"];

export const WORKER_DELIVERY_BEHAVIOR = {
  delivery: "at-least-once",
  duplicates: "possible",
  ordering: "no-global-ordering",
  durableQueues: true,
  persistentMessages: true,
  contentType: "application/json",
  contentEncoding: "utf-8",
  publisherConfirmsRequired: true,
  mandatoryRoutingRequired: true,
  manualAckRequired: true,
  manualNackRequeueDefault: false,
  prefetch: 16,
  confirmTimeoutMs: 5_000,
  maxAttempts: WORKER_RETRY_TIERS.length + 1,
  retryTransferRequiresPublishConfirmBeforeAck: true,
  dlqTransferRequiresPublishConfirmBeforeAck: true,
  brokerDlxRole: "retry-queue-ttl-return-and-policy-fallback",
  poisonMessageConvention: "publish-confirm-terminal-dlq-before-original-ack"
} as const;

export const WORKER_MESSAGE_LIMITS = {
  maxEnvelopeBytes: 16_384,
  maxHeadersBytes: 8_192,
  maxPayloadReferenceBytes: 4_096,
  maxPayloadReferenceUriBytes: 2_048,
  maxTraceStateBytes: 512,
  maxIdempotencyKeyBytes: 256,
  maxProducerNameBytes: 80,
  maxProducerVersionBytes: 80,
  maxReferencedPayloadBytes: 16_777_216
} as const;

export interface WorkerMainQueue {
  readonly name: string;
  readonly durable: true;
  readonly queueType: typeof WORKER_QUEUE_TYPE;
}

export interface WorkerRetryQueue extends WorkerMainQueue {
  readonly tier: WorkerRetryTierName;
  readonly routingKey: string;
  readonly ttlMs: number;
  readonly deadLetterExchange: typeof WORKER_EXCHANGES.main.name;
  readonly deadLetterRoutingKey: string;
}

export interface WorkerDeadLetterQueue extends WorkerMainQueue {
  readonly routingKey: string;
}

export interface WorkerRoute {
  readonly stage: WorkerStage;
  readonly schemaId: typeof WORKER_ENVELOPE_SCHEMA_ID;
  readonly producer: string;
  readonly consumer: string;
  readonly exchange: typeof WORKER_EXCHANGES.main.name;
  readonly retryExchange: typeof WORKER_EXCHANGES.retry.name;
  readonly dlqExchange: typeof WORKER_EXCHANGES.dlq.name;
  readonly routingKey: string;
  readonly mainQueue: WorkerMainQueue;
  readonly retryQueues: readonly WorkerRetryQueue[];
  readonly terminalDlq: WorkerDeadLetterQueue;
  readonly retryPolicy: {
    readonly maxAttempts: typeof WORKER_DELIVERY_BEHAVIOR.maxAttempts;
    readonly retryTiers: readonly WorkerRetryTier[];
    readonly transferRequiresPublishConfirmBeforeAck: true;
    readonly brokerDlxRole: typeof WORKER_DELIVERY_BEHAVIOR.brokerDlxRole;
  };
}

export function isWorkerStage(value: string): value is WorkerStage {
  return (WORKER_STAGES as readonly string[]).includes(value);
}

export function buildWorkerRoute(stage: WorkerStage): WorkerRoute {
  const owners = WORKER_ROUTE_OWNERS[stage];
  const routingKey = `${WORKER_CONTRACT_NAMESPACE}.${stage}.v1`;
  const mainQueueName = `${WORKER_CONTRACT_NAMESPACE}.${stage}.v1`;
  const retryQueues = WORKER_RETRY_TIERS.map<WorkerRetryQueue>((tier) => ({
    tier: tier.name,
    name: `${mainQueueName}.${tier.name}`,
    routingKey: `${routingKey}.${tier.name}`,
    durable: true,
    queueType: WORKER_QUEUE_TYPE,
    ttlMs: tier.delayMs,
    deadLetterExchange: WORKER_EXCHANGES.main.name,
    deadLetterRoutingKey: routingKey
  }));

  return {
    stage,
    schemaId: WORKER_ENVELOPE_SCHEMA_ID,
    producer: owners.producer,
    consumer: owners.consumer,
    exchange: WORKER_EXCHANGES.main.name,
    retryExchange: WORKER_EXCHANGES.retry.name,
    dlqExchange: WORKER_EXCHANGES.dlq.name,
    routingKey,
    mainQueue: {
      name: mainQueueName,
      durable: true,
      queueType: WORKER_QUEUE_TYPE
    },
    retryQueues,
    terminalDlq: {
      name: `${mainQueueName}.dlq`,
      routingKey: `${routingKey}.dlq`,
      durable: true,
      queueType: WORKER_QUEUE_TYPE
    },
    retryPolicy: {
      maxAttempts: WORKER_DELIVERY_BEHAVIOR.maxAttempts,
      retryTiers: WORKER_RETRY_TIERS,
      transferRequiresPublishConfirmBeforeAck: true,
      brokerDlxRole: WORKER_DELIVERY_BEHAVIOR.brokerDlxRole
    }
  };
}

export const WORKER_ROUTES = WORKER_STAGES.map((stage) => buildWorkerRoute(stage));

export const WORKER_ROUTE_BY_STAGE = Object.freeze(
  Object.fromEntries(WORKER_ROUTES.map((route) => [
    route.stage,
    route
  ]))
) as Readonly<Record<WorkerStage, WorkerRoute>>;

export function getWorkerRoute(stage: WorkerStage): WorkerRoute {
  return WORKER_ROUTE_BY_STAGE[stage];
}

export function getRetryDestination(stage: WorkerStage, failedAttemptCount: number): WorkerRetryQueue | WorkerDeadLetterQueue {
  if (!Number.isInteger(failedAttemptCount) || failedAttemptCount < 1) {
    throw new RangeError("failedAttemptCount must be a positive integer");
  }

  const route = getWorkerRoute(stage);
  const retryQueue = route.retryQueues[failedAttemptCount - 1];

  return retryQueue ?? route.terminalDlq;
}
