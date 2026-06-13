package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import org.junit.Assert.assertFalse
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
}
