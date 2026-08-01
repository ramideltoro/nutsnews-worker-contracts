# Migration to contracts 1.0.0

Contracts `1.0.0` corrects the ownership metadata for
`nutsnews.worker.payload.canonical-article-candidate.v1`:

- producer: `fetcher` (previously, incorrectly, `canonicalizer`);
- consumer: `canonicalizer` (previously, incorrectly, `enrichment`);
- route/stage: `canonicalization` (unchanged);
- accepted payload fields and schema ID: unchanged.

This is a major release because producer and consumer names are published contract
metadata and ownership-aware runtimes can change whether they accept a delivery.

## Required order

1. Publish and verify `@ramideltoro/nutsnews-worker-contracts@1.0.0`.
2. Update the shared runtime to its release that pins contracts `1.0.0` exactly.
3. Run the runtime conformance test proving a fetcher-shaped canonical candidate is
   accepted by the `canonicalization` processor and other consumer payloads are
   rejected.
4. Upgrade services only after both package releases are available. Keep existing
   services on their current exact pins until their own compatibility tests pass.

The `contract-snapshot.v1.0.0.json` baseline is frozen with this release so any
later ownership or schema break requires a new major version and migration notes.

## Rollback

Restore the prior exact contracts and runtime pins together. Do not combine an
ownership-aware runtime with contracts `0.4.0`, because that version advertises the
wrong consumer for canonical article candidates.
