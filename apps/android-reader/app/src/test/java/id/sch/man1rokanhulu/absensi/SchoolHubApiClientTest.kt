package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SchoolHubApiClientTest {
    private val api = SchoolHubApiClient { "https://example.test" }

    @Test fun releaseBuildRequiresHttpsServerUrl() {
        assertTrue(api.validateServerUrl("https://ehadir.example.sch.id", releaseBuild = true))
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

    @Test fun scanQrSendsRuntimeScanModeField() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(403).setHeader("content-type", "text/plain").setBody("forbidden"))
        server.start()
        try {
            val client = SchoolHubApiClient { server.url("/").toString().removeSuffix("/") }
            val result = client.scanQr("schoolhub:qr:v1:QR_TEST", "GERBANG", "android-1", "shrsec_test")
            val request = server.takeRequest()
            val body = request.body.readUtf8()

            assertFalse(result.ok)
            assertEquals(403, result.statusCode)
            assertEquals("/api/v1/attendance/qr-reader-scan", request.path)
            assertTrue(body.contains("\"scanMode\":\"GERBANG\""))
            assertFalse(body.contains("\"mode\""))
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
            val result = client.scanQr("schoolhub:qr:v1:QR_TEST", "GERBANG", "android-1", "shrsec_test")

            assertFalse(result.ok)
            assertEquals(401, result.statusCode)
            assertEquals("Signature reader tidak valid.", result.message)
        } finally {
            server.shutdown()
        }
    }
}
