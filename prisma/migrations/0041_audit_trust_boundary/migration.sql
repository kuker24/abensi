-- Structural-only support for approved audit trust boundaries.
-- This migration does not update, resequence, rehash, or otherwise modify historical AuditEntry rows.
-- Existing healthy chains are bootstrapped lazily by application code after strict verification.
-- Historical incidents and active epochs are created only by the separately reviewed approval command.

CREATE TYPE "AuditChainEpochStatus" AS ENUM ('TRUSTED', 'ACTIVE_TRUSTED');
CREATE TYPE "AuditIntegrityIncidentStatus" AS ENUM ('HISTORICAL_UNTRUSTED');
CREATE TYPE "AuditIntegrityIncidentReasonCode" AS ENUM ('HISTORICAL_CHAIN_INTEGRITY_LOSS');

ALTER TABLE "AuditChainState"
  ADD COLUMN "activeEpochId" TEXT;

CREATE TABLE "AuditChainEpoch" (
  "id" TEXT NOT NULL,
  "epochNumber" INTEGER NOT NULL,
  "startSequence" BIGINT NOT NULL,
  "endSequence" BIGINT,
  "status" "AuditChainEpochStatus" NOT NULL,
  "previousEpochId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "AuditChainEpoch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditChainEpoch_epochNumber_key" UNIQUE ("epochNumber"),
  CONSTRAINT "AuditChainEpoch_startSequence_key" UNIQUE ("startSequence"),
  CONSTRAINT "AuditChainEpoch_previousEpochId_key" UNIQUE ("previousEpochId"),
  CONSTRAINT "AuditChainEpoch_sequence_range_check" CHECK (
    "startSequence" > 0 AND ("endSequence" IS NULL OR "endSequence" >= "startSequence")
  )
);

CREATE TABLE "AuditIntegrityIncident" (
  "id" TEXT NOT NULL,
  "incidentCode" TEXT NOT NULL,
  "reasonCode" "AuditIntegrityIncidentReasonCode" NOT NULL,
  "status" "AuditIntegrityIncidentStatus" NOT NULL,
  "previousTrustedEndSequence" BIGINT NOT NULL,
  "historicalStartSequence" BIGINT NOT NULL,
  "historicalEndSequence" BIGINT NOT NULL,
  "boundaryCommitment" TEXT NOT NULL,
  "approvalReference" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "activeEpochId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditIntegrityIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditIntegrityIncident_incidentCode_key" UNIQUE ("incidentCode"),
  CONSTRAINT "AuditIntegrityIncident_boundaryCommitment_key" UNIQUE ("boundaryCommitment"),
  CONSTRAINT "AuditIntegrityIncident_activeEpochId_key" UNIQUE ("activeEpochId"),
  CONSTRAINT "AuditIntegrityIncident_historical_range_check" CHECK (
    "previousTrustedEndSequence" >= 0
    AND "historicalStartSequence" = "previousTrustedEndSequence" + 1
    AND "historicalEndSequence" >= "historicalStartSequence"
  )
);

CREATE INDEX "AuditChainEpoch_status_idx" ON "AuditChainEpoch"("status");
CREATE INDEX "AuditChainEpoch_startSequence_endSequence_idx" ON "AuditChainEpoch"("startSequence", "endSequence");
CREATE UNIQUE INDEX "AuditChainEpoch_single_active_idx"
  ON "AuditChainEpoch"("status")
  WHERE "status" = 'ACTIVE_TRUSTED';
CREATE UNIQUE INDEX "AuditChainState_activeEpochId_key" ON "AuditChainState"("activeEpochId");
CREATE INDEX "AuditIntegrityIncident_historicalStartSequence_historicalEndSequence_idx"
  ON "AuditIntegrityIncident"("historicalStartSequence", "historicalEndSequence");

ALTER TABLE "AuditChainEpoch"
  ADD CONSTRAINT "AuditChainEpoch_previousEpochId_fkey"
  FOREIGN KEY ("previousEpochId") REFERENCES "AuditChainEpoch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditChainState"
  ADD CONSTRAINT "AuditChainState_activeEpochId_fkey"
  FOREIGN KEY ("activeEpochId") REFERENCES "AuditChainEpoch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditIntegrityIncident"
  ADD CONSTRAINT "AuditIntegrityIncident_activeEpochId_fkey"
  FOREIGN KEY ("activeEpochId") REFERENCES "AuditChainEpoch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Incidents are append-only forensic records. Application roles may add a new incident;
-- modifications and deletion are rejected regardless of application code path.
CREATE OR REPLACE FUNCTION "reject_audit_integrity_incident_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditIntegrityIncident rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditIntegrityIncident_append_only"
BEFORE UPDATE OR DELETE ON "AuditIntegrityIncident"
FOR EACH ROW EXECUTE FUNCTION "reject_audit_integrity_incident_mutation"();

-- PostgreSQL range exclusion constraints need btree_gist for scalar combinations.
-- This trigger avoids extension installation and rejects overlapping incident ranges.
CREATE OR REPLACE FUNCTION "reject_overlapping_audit_integrity_incident_range"()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AuditIntegrityIncident" AS existing
    WHERE NEW."historicalStartSequence" <= existing."historicalEndSequence"
      AND existing."historicalStartSequence" <= NEW."historicalEndSequence"
  ) THEN
    RAISE EXCEPTION 'AuditIntegrityIncident historical range overlaps an existing incident';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditIntegrityIncident_no_overlapping_ranges"
BEFORE INSERT ON "AuditIntegrityIncident"
FOR EACH ROW EXECUTE FUNCTION "reject_overlapping_audit_integrity_incident_range"();

-- Epochs must not overlap. Closing an active epoch and adding its successor
-- occurs in one approval transaction, so close updates exclude the successor
-- start from their own range check.
CREATE OR REPLACE FUNCTION "reject_overlapping_audit_chain_epoch_range"()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AuditChainEpoch" AS existing
    WHERE existing."id" <> NEW."id"
      AND NEW."startSequence" <= COALESCE(existing."endSequence", 9223372036854775807::bigint)
      AND existing."startSequence" <= COALESCE(NEW."endSequence", 9223372036854775807::bigint)
  ) THEN
    RAISE EXCEPTION 'AuditChainEpoch range overlaps an existing epoch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditChainEpoch_no_overlapping_ranges"
BEFORE INSERT OR UPDATE ON "AuditChainEpoch"
FOR EACH ROW EXECUTE FUNCTION "reject_overlapping_audit_chain_epoch_range"();

-- Epoch identity and forensic range fields are immutable. The only permitted
-- update closes an active epoch exactly once; it cannot reopen or be repurposed.
CREATE OR REPLACE FUNCTION "guard_audit_chain_epoch_mutation"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AuditChainEpoch rows are forensic metadata and cannot be deleted';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."epochNumber" IS DISTINCT FROM NEW."epochNumber"
    OR OLD."startSequence" IS DISTINCT FROM NEW."startSequence"
    OR OLD."previousEpochId" IS DISTINCT FROM NEW."previousEpochId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."status" <> 'ACTIVE_TRUSTED'
    OR NEW."status" <> 'TRUSTED'
    OR OLD."endSequence" IS NOT NULL
    OR NEW."endSequence" IS NULL
    OR OLD."closedAt" IS NOT NULL
    OR NEW."closedAt" IS NULL THEN
    RAISE EXCEPTION 'AuditChainEpoch permits only one ACTIVE_TRUSTED to TRUSTED close transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditChainEpoch_forensic_mutation_guard"
BEFORE UPDATE OR DELETE ON "AuditChainEpoch"
FOR EACH ROW EXECUTE FUNCTION "guard_audit_chain_epoch_mutation"();
