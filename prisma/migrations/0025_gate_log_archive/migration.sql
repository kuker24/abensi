-- Preserve full forensic evidence for GateLog duplicates before any corrective
-- business-date deduplication. The table is append-only: normal application
-- mutations cannot update/delete archive rows.

CREATE TABLE "GateLogArchive" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "originalGateLogId" TEXT NOT NULL,
  "canonicalGateLogId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "direction" "GateDirection" NOT NULL,
  "originalBusinessDate" DATE,
  "correctedBusinessDate" DATE NOT NULL,
  "tappedAt" TIMESTAMP(3) NOT NULL,
  "serverReceivedAt" TIMESTAMP(3),
  "deviceId" TEXT,
  "readerId" TEXT,
  "cardId" TEXT,
  "qrCredentialId" TEXT,
  "scanMode" "AndroidReaderMode",
  "appVersion" TEXT,
  "signatureVerified" BOOLEAN,
  "deviceEventId" TEXT,
  "deviceTimestamp" TIMESTAMP(3),
  "nonceHash" TEXT,
  "bodyHash" TEXT,
  "manualReason" TEXT,
  "createdById" TEXT,
  "usedOverrideId" TEXT,
  "completeOriginalRow" JSONB NOT NULL,
  "dedupeReason" TEXT NOT NULL,
  "migrationVersion" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "GateLogArchive_originalGateLogId_key" ON "GateLogArchive"("originalGateLogId");
CREATE INDEX "GateLogArchive_userId_correctedBusinessDate_direction_idx" ON "GateLogArchive"("userId", "correctedBusinessDate", "direction");
CREATE INDEX "GateLogArchive_canonicalGateLogId_idx" ON "GateLogArchive"("canonicalGateLogId");
CREATE INDEX "GateLogArchive_archivedAt_idx" ON "GateLogArchive"("archivedAt");

CREATE OR REPLACE FUNCTION prevent_gate_log_archive_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GateLogArchive is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GateLogArchive_no_update_delete"
BEFORE UPDATE OR DELETE ON "GateLogArchive"
FOR EACH ROW EXECUTE FUNCTION prevent_gate_log_archive_mutation();
