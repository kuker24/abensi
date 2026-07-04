package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.update.ApkUpdateInstaller
import id.sch.man1rokanhulu.absensi.update.ApkUpdatePolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkUpdatePolicyTest {
    @Test fun updateAvailableWhenLatestCodeIsHigher() {
        val info = SchoolHubApiClient.VersionInfo("1.2.0", 4, 1, false, "", downloadUrl = "/api/v1/mobile/android-reader/apk/latest")
        assertTrue(ApkUpdatePolicy.isUpdateAvailable(info, currentCode = 3))
        assertFalse(ApkUpdatePolicy.isUpdateAvailable(info, currentCode = 4))
    }

    @Test fun forceUpdateWhenBelowMinSupportedOrForcedLatest() {
        val belowMin = SchoolHubApiClient.VersionInfo("1.2.0", 4, 4, false, "", downloadUrl = "/api/v1/mobile/android-reader/apk/latest")
        assertTrue(ApkUpdatePolicy.isForceUpdate(belowMin, currentCode = 3))

        val forced = SchoolHubApiClient.VersionInfo("1.2.0", 4, 1, true, "", downloadUrl = "/api/v1/mobile/android-reader/apk/latest")
        assertTrue(ApkUpdatePolicy.isForceUpdate(forced, currentCode = 3))
        assertFalse(ApkUpdatePolicy.isForceUpdate(forced, currentCode = 4))
    }

    @Test fun updateIsIgnoredWhenNoDownloadUrlExists() {
        val info = SchoolHubApiClient.VersionInfo("1.2.0", 4, 4, true, "")
        assertFalse(ApkUpdatePolicy.shouldShowUpdate(info, currentCode = 3))
    }

    @Test fun releaseBuildOnlyTrustsHttpsSameHostDownloadUrls() {
        val base = "https://absensi.man1rokanhulu.cloud"
        assertEquals(
            "https://absensi.man1rokanhulu.cloud/api/v1/mobile/android-reader/releases/apk_1/download",
            ApkUpdateInstaller.trustedDownloadUrl(base, "/api/v1/mobile/android-reader/releases/apk_1/download", releaseBuild = true)
        )
        assertNull(ApkUpdateInstaller.trustedDownloadUrl(base, "http://absensi.man1rokanhulu.cloud/apk.apk", releaseBuild = true))
        assertNull(ApkUpdateInstaller.trustedDownloadUrl(base, "https://example.com/apk.apk", releaseBuild = true))
    }

    @Test fun debugBuildAllowsHttpSameHostDownloadUrls() {
        val base = "http://127.0.0.1:3000"
        assertEquals(
            "http://127.0.0.1:3000/api/v1/mobile/android-reader/releases/apk_1/download",
            ApkUpdateInstaller.trustedDownloadUrl(base, "/api/v1/mobile/android-reader/releases/apk_1/download", releaseBuild = false)
        )
        assertEquals(
            "http://127.0.0.1:3000/apk.apk",
            ApkUpdateInstaller.trustedDownloadUrl(base, "http://127.0.0.1:3000/apk.apk", releaseBuild = false)
        )
    }

    @Test fun trustedDownloadUrlRejectsNullBlankAndWrongHostInputs() {
        val base = "https://absensi.man1rokanhulu.cloud"
        assertNull(ApkUpdateInstaller.trustedDownloadUrl(base, null, releaseBuild = true))
        assertNull(ApkUpdateInstaller.trustedDownloadUrl(base, "", releaseBuild = true))
        assertNull(ApkUpdateInstaller.trustedDownloadUrl(base, "   ", releaseBuild = true))
        assertNull(ApkUpdateInstaller.trustedDownloadUrl(base, "https://evil.example/apk.apk", releaseBuild = false))
    }

    @Test fun trustedDownloadUrlPreservesBasePortAndQueryString() {
        val base = "https://absensi.man1rokanhulu.cloud:8443"
        assertEquals(
            "https://absensi.man1rokanhulu.cloud:8443/download/apk.apk?version=4",
            ApkUpdateInstaller.trustedDownloadUrl(base, "/download/apk.apk?version=4", releaseBuild = true)
        )
    }
}
