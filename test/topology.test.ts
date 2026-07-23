import { describe, expect, it } from "vitest";

import {
  WORKER_DELIVERY_BEHAVIOR,
  WORKER_ENVELOPE_SCHEMA_ID,
  WORKER_EXCHANGES,
  WORKER_RETRY_TIERS,
  WORKER_ROUTES,
  WORKER_STAGES,
  getRetryDestination,
  getWorkerRoute,
  isWorkerStage
} from "../src/index.js";

describe("RabbitMQ worker topology", () => {
  it("defines one generated route per worker stage", () => {
    expect(WORKER_ROUTES).toHaveLength(WORKER_STAGES.length);

    for (const route of WORKER_ROUTES) {
      expect(route.schemaId).toBe(WORKER_ENVELOPE_SCHEMA_ID);
      expect(route.exchange).toBe(WORKER_EXCHANGES.main.name);
      expect(route.routingKey).toBe(`nutsnews.worker.${route.stage}.v1`);
      expect(route.mainQueue.name).toBe(`nutsnews.worker.${route.stage}.v1`);
      expect(route.retryQueues).toHaveLength(WORKER_RETRY_TIERS.length);
      expect(route.terminalDlq.name).toBe(`nutsnews.worker.${route.stage}.v1.dlq`);
      expect(route.producer.length).toBeGreaterThan(0);
      expect(route.consumer.length).toBeGreaterThan(0);
    }
  });

  it("keeps queue names unique and generated from stage names", () => {
    const queueNames = WORKER_ROUTES.flatMap((route) => [
      route.mainQueue.name,
      ...route.retryQueues.map((queue) => queue.name),
      route.terminalDlq.name
    ]);

    expect(new Set(queueNames).size).toBe(queueNames.length);
    expect(getWorkerRoute("fetch").mainQueue.name).toBe("nutsnews.worker.fetch.v1");
    expect(isWorkerStage("canonicalization")).toBe(true);
    expect(isWorkerStage("not-a-stage")).toBe(false);
  });

  it("defines fixed retry tiers and terminal DLQ destination", () => {
    const route = getWorkerRoute("fetch");
    const firstRetry = getRetryDestination("fetch", 1);
    const terminal = getRetryDestination("fetch", WORKER_DELIVERY_BEHAVIOR.maxAttempts);

    expect(firstRetry).toBe(route.retryQueues[0]);
    expect(terminal).toBe(route.terminalDlq);
    expect(route.retryQueues.map((queue) => queue.ttlMs)).toEqual([
      30_000,
      300_000,
      1_800_000
    ]);
    expect(route.retryQueues[0]?.deadLetterRoutingKey).toBe(route.routingKey);
  });

  it("documents at-least-once delivery behavior and confirmed retry transfer", () => {
    expect(WORKER_DELIVERY_BEHAVIOR.delivery).toBe("at-least-once");
    expect(WORKER_DELIVERY_BEHAVIOR.duplicates).toBe("possible");
    expect(WORKER_DELIVERY_BEHAVIOR.ordering).toBe("no-global-ordering");
    expect(WORKER_DELIVERY_BEHAVIOR.contentType).toBe("application/json");
    expect(WORKER_DELIVERY_BEHAVIOR.contentEncoding).toBe("utf-8");
    expect(WORKER_DELIVERY_BEHAVIOR.publisherConfirmsRequired).toBe(true);
    expect(WORKER_DELIVERY_BEHAVIOR.mandatoryRoutingRequired).toBe(true);
    expect(WORKER_DELIVERY_BEHAVIOR.manualAckRequired).toBe(true);
    expect(WORKER_DELIVERY_BEHAVIOR.retryTransferRequiresPublishConfirmBeforeAck).toBe(true);
    expect(WORKER_DELIVERY_BEHAVIOR.dlqTransferRequiresPublishConfirmBeforeAck).toBe(true);
  });
});
