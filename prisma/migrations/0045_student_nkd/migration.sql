-- Dedicated immutable Nomor Kartu Digital (NKD) for student identity cards.
-- Additive only. Existing users remain nullable until approved student import assigns NKD.

ALTER TABLE "User"
  ADD COLUMN "nkd" TEXT;

CREATE UNIQUE INDEX "User_nkd_key" ON "User"("nkd");
CREATE UNIQUE INDEX "User_nis_key" ON "User"("nis");

ALTER TABLE "User"
  ADD CONSTRAINT "User_nkd_student_four_digits_chk"
  CHECK (
    "nkd" IS NULL
    OR ("role" = 'SISWA' AND "nkd" ~ '^[0-9]{4}$')
  );

CREATE TABLE "StudentNkdRegistry" (
  "nkd" TEXT NOT NULL,
  "userId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentNkdRegistry_pkey" PRIMARY KEY ("nkd"),
  CONSTRAINT "StudentNkdRegistry_nkd_four_digits_chk" CHECK ("nkd" ~ '^[0-9]{4}$'),
  CONSTRAINT "StudentNkdRegistry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentNkdRegistry_userId_key"
  ON "StudentNkdRegistry"("userId");

CREATE OR REPLACE FUNCTION "reject_user_nkd_mutation"()
RETURNS trigger AS $$
BEGIN
  IF OLD."nkd" IS NOT NULL AND NEW."nkd" IS DISTINCT FROM OLD."nkd" THEN
    RAISE EXCEPTION 'User NKD is immutable once assigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_nkd_immutable"
BEFORE UPDATE OF "nkd" ON "User"
FOR EACH ROW
EXECUTE FUNCTION "reject_user_nkd_mutation"();

CREATE OR REPLACE FUNCTION "reserve_user_nkd"()
RETURNS trigger AS $$
BEGIN
  IF NEW."nkd" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."nkd" IS DISTINCT FROM NEW."nkd") THEN
    INSERT INTO "StudentNkdRegistry" ("nkd", "userId")
    VALUES (NEW."nkd", NEW."id");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_nkd_reserve"
AFTER INSERT OR UPDATE OF "nkd" ON "User"
FOR EACH ROW
EXECUTE FUNCTION "reserve_user_nkd"();
