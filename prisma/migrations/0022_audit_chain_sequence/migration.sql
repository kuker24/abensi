-- Add deterministic sequence metadata to the audit hash chain.
-- Existing rows are backfilled in createdAt/id order. The verifier introduced with
-- this migration must be run after deploy to prove the resulting chain state.

ALTER TABLE "AuditEntry" ADD COLUMN "sequence" BIGINT;
ALTER TABLE "AuditChainState" ADD COLUMN "lastSequence" BIGINT NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC)::BIGINT AS seq
  FROM "AuditEntry"
)
UPDATE "AuditEntry" AS audit
SET "sequence" = ordered.seq
FROM ordered
WHERE audit."id" = ordered."id";

ALTER TABLE "AuditEntry" ALTER COLUMN "sequence" SET NOT NULL;
CREATE UNIQUE INDEX "AuditEntry_sequence_key" ON "AuditEntry"("sequence");

INSERT INTO "AuditChainState" ("id", "lastSequence", "lastHash", "lastEntryId", "updatedAt")
SELECT 1,
       COALESCE(MAX("sequence"), 0),
       (SELECT "entryHash" FROM "AuditEntry" ORDER BY "sequence" DESC LIMIT 1),
       (SELECT "id" FROM "AuditEntry" ORDER BY "sequence" DESC LIMIT 1),
       NOW()
FROM "AuditEntry"
ON CONFLICT ("id") DO UPDATE SET
  "lastSequence" = EXCLUDED."lastSequence",
  "lastHash" = COALESCE(EXCLUDED."lastHash", "AuditChainState"."lastHash"),
  "lastEntryId" = COALESCE(EXCLUDED."lastEntryId", "AuditChainState"."lastEntryId"),
  "updatedAt" = NOW();
