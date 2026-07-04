package id.sch.man1rokanhulu.absensi

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class NetworkSecurityConfigTest {
    private val releaseConfig = File("src/main/res/xml/network_security_config.xml")
    private val debugConfig = File("src/debug/res/xml/network_security_config.xml")

    @Test fun releaseNetworkConfigDisablesCleartext() {
        val xml = releaseConfig.readText()
        assertTrue(xml.contains("cleartextTrafficPermitted=\"false\""))
        assertFalse(xml.contains("<pin-set"))
    }

    @Test fun releaseNetworkConfigUsesSystemTrustOnly() {
        val xml = releaseConfig.readText()
        assertTrue(xml.contains("<certificates src=\"system\""))
        assertFalse(xml.contains("<certificates src=\"user\""))
    }

    @Test fun debugNetworkConfigKeepsLocalHttpUsable() {
        val xml = debugConfig.readText()
        assertTrue(xml.contains("cleartextTrafficPermitted=\"true\""))
        assertTrue(xml.contains("<certificates src=\"user\""))
    }
}
