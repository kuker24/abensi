-- Additive APK release table for Android scanner update center.
CREATE TABLE "AndroidApkRelease" (
  "id" TEXT NOT NULL,
  "versionName" TEXT NOT NULL,
  "versionCode" INTEGER NOT NULL,
  "minSupportedVersionCode" INTEGER NOT NULL DEFAULT 1,
  "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
  "releaseNotes" TEXT,
  "apkFileName" TEXT NOT NULL,
  "apkPath" TEXT NOT NULL,
  "apkSha256" TEXT NOT NULL,
  "apkSizeBytes" INTEGER NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'application/vnd.android.package-archive',
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AndroidApkRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AndroidApkRelease_versionCode_key" ON "AndroidApkRelease"("versionCode");
CREATE INDEX "AndroidApkRelease_isPublished_versionCode_idx" ON "AndroidApkRelease"("isPublished", "versionCode");
CREATE INDEX "AndroidApkRelease_createdAt_idx" ON "AndroidApkRelease"("createdAt");
CREATE INDEX "AndroidApkRelease_createdById_createdAt_idx" ON "AndroidApkRelease"("createdById", "createdAt");

ALTER TABLE "AndroidApkRelease"
  ADD CONSTRAINT "AndroidApkRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AndroidApkRelease"
  ADD CONSTRAINT "AndroidApkRelease_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AndroidApkRelease"
  ADD CONSTRAINT "AndroidApkRelease_versionCode_positive_check" CHECK ("versionCode" > 0),
  ADD CONSTRAINT "AndroidApkRelease_minSupportedVersionCode_positive_check" CHECK ("minSupportedVersionCode" > 0),
  ADD CONSTRAINT "AndroidApkRelease_minSupported_lte_version_check" CHECK ("minSupportedVersionCode" <= "versionCode"),
  ADD CONSTRAINT "AndroidApkRelease_apkSha256_hex_check" CHECK ("apkSha256" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "AndroidApkRelease_apkSizeBytes_positive_check" CHECK ("apkSizeBytes" > 0),
  ADD CONSTRAINT "AndroidApkRelease_apk_content_type_check" CHECK ("contentType" = 'application/vnd.android.package-archive');
