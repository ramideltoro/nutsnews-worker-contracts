import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STAGE_PAYLOAD_SCHEMA_DEFINITIONS,
  WORKER_RETRY_TIERS,
  WORKER_ROUTES
} from "../dist/index.js";

const root = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const snapshot = JSON.parse(readFileSync(join(root, "docs", "compatibility", "contract-snapshot.v0.3.0.json"), "utf8"));

const breakingChanges = [
  ...detectTopologyBreaks(),
  ...detectPayloadSchemaBreaks()
];

if (breakingChanges.length > 0) {
  const baselineMajor = majorVersion(snapshot.baselinePackageVersion);
  const currentMajor = majorVersion(packageJson.version);
  const migrationPath = join(root, "docs", "migrations", `MIGRATION-v${packageJson.version}.md`);

  if (currentMajor <= baselineMajor) {
    throw new Error(`Breaking contract changes require a major version bump: ${breakingChanges.join("; ")}`);
  }

  if (!existsSync(migrationPath)) {
    throw new Error(`Breaking contract changes require migration notes at ${migrationPath}: ${breakingChanges.join("; ")}`);
  }
}

console.log(`Contract compatibility check passed against ${snapshot.baselinePackageVersion}.`);

function detectTopologyBreaks() {
  const breaks = [];
  const currentRoutes = new Map(WORKER_ROUTES.map((route) => [
    route.stage,
    route
  ]));

  for (const route of snapshot.topology.routes) {
    const current = currentRoutes.get(route.stage);

    if (current === undefined) {
      breaks.push(`removed route ${route.stage}`);
      continue;
    }

    for (const [field, currentValue] of [
      [
        "schemaId",
        current.schemaId
      ],
      [
        "producer",
        current.producer
      ],
      [
        "consumer",
        current.consumer
      ],
      [
        "exchange",
        current.exchange
      ],
      [
        "routingKey",
        current.routingKey
      ],
      [
        "mainQueue",
        current.mainQueue.name
      ],
      [
        "terminalDlq",
        current.terminalDlq.name
      ]
    ]) {
      if (route[field] !== currentValue) {
        breaks.push(`route ${route.stage} changed ${field}`);
      }
    }

    const currentRetryQueues = current.retryQueues.map((queue) => queue.name);

    for (const retryQueue of route.retryQueues) {
      if (!currentRetryQueues.includes(retryQueue)) {
        breaks.push(`route ${route.stage} removed retry queue ${retryQueue}`);
      }
    }
  }

  const currentRetryTiers = new Map(WORKER_RETRY_TIERS.map((tier) => [
    tier.name,
    tier.delayMs
  ]));

  for (const retryTier of snapshot.topology.retryTiers) {
    if (currentRetryTiers.get(retryTier.name) !== retryTier.delayMs) {
      breaks.push(`retry tier ${retryTier.name} changed or was removed`);
    }
  }

  return breaks;
}

function detectPayloadSchemaBreaks() {
  const breaks = [];

  for (const [schemaId, baselineSchema] of Object.entries(snapshot.payloadSchemas)) {
    const current = STAGE_PAYLOAD_SCHEMA_DEFINITIONS[schemaId];

    if (current === undefined) {
      breaks.push(`removed payload schema ${schemaId}`);
      continue;
    }

    for (const field of [
      "stage",
      "producer",
      "consumer"
    ]) {
      if (baselineSchema[field] !== current[field]) {
        breaks.push(`payload schema ${schemaId} changed ${field}`);
      }
    }

    for (const requiredField of baselineSchema.requiredFields) {
      if (!current.requiredFields.includes(requiredField)) {
        breaks.push(`payload schema ${schemaId} removed required field ${requiredField}`);
      }
    }

    const currentFields = Object.keys(current.fieldDefinitions);

    for (const field of baselineSchema.fields) {
      if (!currentFields.includes(field)) {
        breaks.push(`payload schema ${schemaId} removed field ${field}`);
      }
    }
  }

  return breaks;
}

function majorVersion(version) {
  const [major] = version.split(".");
  return Number.parseInt(major ?? "0", 10);
}
