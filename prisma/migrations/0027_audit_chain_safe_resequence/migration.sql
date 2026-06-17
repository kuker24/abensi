-- Correct the unsafe 0022 sequence backfill by validating the existing hash-chain
-- topology and assigning sequence in actual prevHash -> entryHash order.
-- This migration intentionally aborts on branches, orphans, cycles, missing
-- payloads, unsupported hash versions, or disconnected chains. It does not
-- silently rebuild broken forensic history.

DO $$
DECLARE
  total_entries INTEGER := 0;
  genesis_count INTEGER := 0;
  duplicate_hashes INTEGER := 0;
  branch_count INTEGER := 0;
  orphan_count INTEGER := 0;
  missing_payload_count INTEGER := 0;
  unsupported_hash_count INTEGER := 0;
  visited_count INTEGER := 0;
  final_id TEXT;
  final_hash TEXT;
  final_sequence BIGINT;
BEGIN
  SELECT COUNT(*) INTO total_entries FROM "AuditEntry";

  IF total_entries = 0 THEN
    INSERT INTO "AuditChainState" ("id", "lastSequence", "lastHash", "lastEntryId", "updatedAt")
    VALUES (1, 0, NULL, NULL, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "lastSequence" = 0,
      "lastHash" = NULL,
      "lastEntryId" = NULL,
      "updatedAt" = NOW();
    RAISE NOTICE 'Audit chain resequence: no entries; state reset to empty chain.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO genesis_count FROM "AuditEntry" WHERE "prevHash" IS NULL;
  IF genesis_count <> 1 THEN
    RAISE EXCEPTION 'Audit chain validation failed: expected exactly one genesis entry, found %', genesis_count;
  END IF;

  SELECT COUNT(*) INTO missing_payload_count
  FROM "AuditEntry"
  WHERE "canonicalPayload" IS NULL OR "entryHash" IS NULL;
  IF missing_payload_count > 0 THEN
    RAISE EXCEPTION 'Audit chain validation failed: % entries have missing canonicalPayload or entryHash', missing_payload_count;
  END IF;

  SELECT COUNT(*) INTO unsupported_hash_count
  FROM "AuditEntry"
  WHERE "hashVersion" <> 1;
  IF unsupported_hash_count > 0 THEN
    RAISE EXCEPTION 'Audit chain validation failed: % entries use unsupported hashVersion', unsupported_hash_count;
  END IF;

  SELECT COUNT(*) INTO duplicate_hashes
  FROM (
    SELECT "entryHash"
    FROM "AuditEntry"
    GROUP BY "entryHash"
    HAVING COUNT(*) > 1
  ) duplicated;
  IF duplicate_hashes > 0 THEN
    RAISE EXCEPTION 'Audit chain validation failed: % duplicate entryHash value(s)', duplicate_hashes;
  END IF;

  SELECT COUNT(*) INTO branch_count
  FROM (
    SELECT COALESCE("prevHash", 'GENESIS') AS prev_key
    FROM "AuditEntry"
    GROUP BY COALESCE("prevHash", 'GENESIS')
    HAVING COUNT(*) > 1
  ) branches;
  IF branch_count > 0 THEN
    RAISE EXCEPTION 'Audit chain validation failed: % branch point(s) detected', branch_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count
  FROM "AuditEntry" child
  WHERE child."prevHash" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "AuditEntry" parent WHERE parent."entryHash" = child."prevHash"
    );
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Audit chain validation failed: % orphan entry/entries detected', orphan_count;
  END IF;

  CREATE TEMP TABLE audit_chain_order (
    seq BIGINT NOT NULL,
    id TEXT NOT NULL PRIMARY KEY,
    entry_hash TEXT NOT NULL
  ) ON COMMIT DROP;

  WITH RECURSIVE chain AS (
    SELECT
      "id",
      "entryHash",
      "prevHash",
      1::BIGINT AS seq,
      ARRAY["id"] AS path
    FROM "AuditEntry"
    WHERE "prevHash" IS NULL

    UNION ALL

    SELECT
      next_entry."id",
      next_entry."entryHash",
      next_entry."prevHash",
      chain.seq + 1,
      chain.path || next_entry."id"
    FROM chain
    JOIN "AuditEntry" next_entry ON next_entry."prevHash" = chain."entryHash"
    WHERE NOT next_entry."id" = ANY(chain.path)
  )
  INSERT INTO audit_chain_order (seq, id, entry_hash)
  SELECT seq, id, "entryHash" FROM chain;

  SELECT COUNT(*) INTO visited_count FROM audit_chain_order;
  IF visited_count <> total_entries THEN
    RAISE EXCEPTION 'Audit chain validation failed: visited % of % entries; cycle or disconnected component exists', visited_count, total_entries;
  END IF;

  IF (SELECT MAX(seq) FROM audit_chain_order) <> total_entries THEN
    RAISE EXCEPTION 'Audit chain validation failed: reconstructed sequence length does not match entry count';
  END IF;

  UPDATE "AuditEntry" entry
  SET "sequence" = -ordered.seq
  FROM audit_chain_order ordered
  WHERE entry."id" = ordered.id;

  UPDATE "AuditEntry" entry
  SET "sequence" = ordered.seq
  FROM audit_chain_order ordered
  WHERE entry."id" = ordered.id;

  SELECT id, entry_hash, seq
  INTO final_id, final_hash, final_sequence
  FROM audit_chain_order
  ORDER BY seq DESC
  LIMIT 1;

  INSERT INTO "AuditChainState" ("id", "lastSequence", "lastHash", "lastEntryId", "updatedAt")
  VALUES (1, final_sequence, final_hash, final_id, NOW())
  ON CONFLICT ("id") DO UPDATE SET
    "lastSequence" = EXCLUDED."lastSequence",
    "lastHash" = EXCLUDED."lastHash",
    "lastEntryId" = EXCLUDED."lastEntryId",
    "updatedAt" = NOW();

  RAISE NOTICE 'Audit chain resequence PASS: % entries sequenced by prevHash linkage. Final entry %, sequence %.', total_entries, final_id, final_sequence;
END $$;
