package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.network.isRetryableScanStatus
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class SchoolHubApiClientTest {
    private val api = SchoolHubApiClient { "https://example.test" }

    @Test fun releaseBuildRequiresHttpsServerUrl() {
        assertTrue(api.validateServerUrl("https://ehadir.example.sch.id", releaseBuild = true))
        assertTrue(api.validateServerUrl("  https://ehadir.example.sch.id  ", releaseBuild = true))
        assertFalse(api.validateServerUrl("http://ehadir.example.sch.id", releaseBuild = true))
    }

    @Test fun debugBuildAllowsHttpForLocalTestingOnly() {
        assertTrue(api.validateServerUrl("http://127.0.0.1:3000", releaseBuild = false))
        assertTrue(api.validateServerUrl("https://ehadir.example.sch.id", releaseBuild = false))
    }

    @Test fun serverUrlRejectsUnsupportedSchemes() {
        assertFalse(api.validateServerUrl("", releaseBuild = false))
        assertFalse(api.validateServerUrl("ftp://ehadir.example.sch.id", releaseBuild = false))
        assertFalse(api.validateServerUrl("ehadir.example.sch.id", releaseBuild = false))
    }

    @Test fun scanQrSendsExplicitOriginalTimestampAndRuntimeScanModeField() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(403).setHeader("content-type", "text/plain").setBody("forbidden"))
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val scannedAt = Instant.parse("2026-07-13T08:15:30Z")
            val result = client.scanQr("schoolhub:qr:v1:QR_TEST", "GERBANG", "android-1", "shrsec_test", scannedAt)
            val request = server.takeRequest()
            val body = request.body.readUtf8()

            assertFalse(result.ok)
            assertEquals(403, result.statusCode)
            assertEquals("/api/v1/attendance/qr-reader-scan", request.path)
            assertTrue(body.contains("\"clientScannedAt\":\"${scannedAt}\""))
            assertTrue(body.contains("\"scanMode\":\"GERBANG\""))
            assertFalse(body.contains("\"mode\""))
            assertNotNull(request.getHeader("x-reader-signature"))
            assertNotNull(request.getHeader("x-reader-timestamp"))
        } finally {
            server.shutdown()
        }
    }

    @Test fun scanQrCanSendCheckOnlyMode() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(403).setHeader("content-type", "text/plain").setBody("forbidden"))
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val result = client.scanQr("schoolhub:qr:v1:QR_TEST", "CHECK_ONLY", "android-1", "shrsec_test", Instant.parse("2026-07-13T08:15:30Z"))
            val request = server.takeRequest()
            val body = request.body.readUtf8()

            assertFalse(result.ok)
            assertEquals(403, result.statusCode)
            assertTrue(body.contains("\"scanMode\":\"CHECK_ONLY\""))
            assertFalse(body.contains("\"mode\""))
            assertNotNull(request.getHeader("x-reader-signature"))
        } finally {
            server.shutdown()
        }
    }

    @Test fun retryableStatusesPreservePendingScanWhileBusiness4xxAreTerminal() {
        listOf(408, 425, 429, 500, 502, 599).forEach { status -> assertTrue("HTTP $status", isRetryableScanStatus(status)) }
        listOf(400, 401, 403, 404, 422, 499).forEach { status -> assertFalse("HTTP $status", isRetryableScanStatus(status)) }
    }

    @Test fun versionParsesLegacyResponseWithoutUpdateCenterFields() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setHeader("content-type", "application/json").setBody("{\"latestVersionName\":\"1.1.1\",\"latestVersionCode\":3,\"minSupportedVersionCode\":1,\"forceUpdate\":false,\"releaseNotes\":\"Legacy\"}"))
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val info = client.version()
            assertEquals("1.1.1", info.latestVersionName)
            assertEquals(3, info.latestVersionCode)
            assertEquals(1, info.minSupportedVersionCode)
            assertFalse(info.forceUpdate)
            assertEquals("Legacy", info.releaseNotes)
            assertEquals(null, info.downloadUrl)
            assertEquals(null, info.apkSha256)
            assertEquals(null, info.apkSizeBytes)
        } finally {
            server.shutdown()
        }
    }

    @Test fun versionParsesApkUpdateCenterFields() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setHeader("content-type", "application/json").setBody("{\"latestVersionName\":\"1.2.0\",\"latestVersionCode\":4,\"minSupportedVersionCode\":3,\"forceUpdate\":true,\"releaseNotes\":\"Update center\",\"downloadUrl\":\"/api/v1/mobile/android-reader/releases/apk_1/download\",\"apkSha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"apkSizeBytes\":123456}"))
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val info = client.version()
            assertEquals("1.2.0", info.latestVersionName)
            assertEquals(4, info.latestVersionCode)
            assertEquals(3, info.minSupportedVersionCode)
            assertTrue(info.forceUpdate)
            assertEquals("/api/v1/mobile/android-reader/releases/apk_1/download", info.downloadUrl)
            assertEquals("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", info.apkSha256)
            assertEquals(123456L, info.apkSizeBytes)
        } finally {
            server.shutdown()
        }
    }

    @Test fun sendReaderStatusPostsSignedMonitoringPayloadWithoutQueuedQr() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setHeader("content-type", "application/json").setBody("{\"ok\":true,\"item\":{\"allowedModes\":[\"GATE_IN\",\"GATE_OUT\",\"MUSHOLA\"]}}"))
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val result = client.sendReaderStatus(
                SchoolHubApiClient.ReaderStatusPayload(
                    pendingQueueCount = 4,
                    currentMode = "GERBANG",
                    lastQueueFlushAt = "2026-06-20T01:05:00Z",
                    batteryLevel = 80,
                    networkStatus = "WIFI",
                    statusMessage = "Scanner aktif",
                    warnings = listOf("OFFLINE_QUEUE_PENDING")
                ),
                "android-1",
                "shrsec_test"
            )
            val request = server.takeRequest()
            val body = request.body.readUtf8()

            assertNotNull(result)
            assertEquals(listOf("GATE_IN", "GATE_OUT", "MUSHOLA"), result?.allowedModes)
            assertEquals("/api/v1/device-readers/android/status", request.path)
            assertTrue(body.contains("\"pendingQueueCount\":4"))
            assertTrue(body.contains("\"currentMode\":\"GERBANG\""))
            assertTrue(body.contains("\"appVersionCode\":"))
            assertFalse(body.contains("qrCode"))
            assertFalse(body.contains("schoolhub:qr"))
            assertNotNull(request.getHeader("x-reader-signature"))
        } finally {
            server.shutdown()
        }
    }

    @Test fun scanQrKeepsAuthStatusForRevokedIdentityHandling() = runTest {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("content-type", "application/json")
                .setBody("{\"message\":\"Signature reader tidak valid.\"}")
        )
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val result = client.scanQr("schoolhub:qr:v1:QR_TEST", "GERBANG", "android-1", "shrsec_test", Instant.parse("2026-07-13T08:15:30Z"))

            assertFalse(result.ok)
            assertEquals(401, result.statusCode)
            assertEquals("Signature reader tidak valid.", result.message)
        } finally {
            server.shutdown()
        }
    }
}
