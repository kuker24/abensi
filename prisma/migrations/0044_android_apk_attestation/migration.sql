-- Additive APK attestation metadata. Existing releases remain downloadable and UNVERIFIED.
CREATE TYPE "AndroidApkVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');

ALTER TABLE "AndroidApkRelease"
  ADD COLUMN "packageName" TEXT,
  ADD COLUMN "apkVersionName" TEXT,
  ADD COLUMN "apkVersionCode" INTEGER,
  ADD COLUMN "targetSdkVersion" INTEGER,
  ADD COLUMN "isDebuggable" BOOLEAN,
  ADD COLUMN "usesCleartextTraffic" BOOLEAN,
  ADD COLUMN "signatureSchemeV2" BOOLEAN,
  ADD COLUMN "signerSha256" TEXT,
  ADD COLUMN "verificationStatus" "AndroidApkVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE INDEX "AndroidApkRelease_verificationStatus_createdAt_idx"
  ON "AndroidApkRelease"("verificationStatus", "createdAt");

ALTER TABLE "AndroidApkRelease"
  ADD CONSTRAINT "AndroidApkRelease_apkVersionCode_positive_check"
    CHECK ("apkVersionCode" IS NULL OR "apkVersionCode" > 0),
  ADD CONSTRAINT "AndroidApkRelease_targetSdkVersion_positive_check"
    CHECK ("targetSdkVersion" IS NULL OR "targetSdkVersion" > 0),
  ADD CONSTRAINT "AndroidApkRelease_signerSha256_hex_check"
    CHECK ("signerSha256" IS NULL OR "signerSha256" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "AndroidApkRelease_verified_attestation_complete_check"
    CHECK (
      "verificationStatus" <> 'VERIFIED'
      OR (
        "packageName" IS NOT NULL
        AND "apkVersionName" IS NOT NULL
        AND "apkVersionCode" IS NOT NULL
        AND "targetSdkVersion" IS NOT NULL
        AND "isDebuggable" = false
        AND "usesCleartextTraffic" = false
        AND "signatureSchemeV2" = true
        AND "signerSha256" IS NOT NULL
        AND "verifiedAt" IS NOT NULL
      )
    );
