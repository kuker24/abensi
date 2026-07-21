package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.data.LocalConfig
import org.junit.Assert.assertEquals
import org.junit.Test

class LocalConfigTest {
    @Test
    fun missingAllowedModesFailClosedUntilReaderIsReactivated() {
        assertEquals(emptyList<String>(), LocalConfig.parseAllowedModes(null))
        assertEquals(emptyList<String>(), LocalConfig.parseAllowedModes(""))
        assertEquals(emptyList<String>(), LocalConfig.parseAllowedModes(" , "))
    }

    @Test
    fun storedAllowedModesRemainAvailableWithoutLocalDefaults() {
        assertEquals(
            listOf("GERBANG", "MUSHOLA"),
            LocalConfig.parseAllowedModes(" GERBANG, MUSHOLA ")
        )
    }
}
