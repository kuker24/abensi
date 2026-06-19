package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.ui.ReaderDeviceKind
import id.sch.man1rokanhulu.absensi.ui.effectiveScanMode
import id.sch.man1rokanhulu.absensi.ui.friendlyScanMessage
import id.sch.man1rokanhulu.absensi.ui.friendlyScanTitle
import id.sch.man1rokanhulu.absensi.ui.readerDeviceKind
import id.sch.man1rokanhulu.absensi.ui.readerDeviceTitle
import id.sch.man1rokanhulu.absensi.ui.readerModeSummary
import id.sch.man1rokanhulu.absensi.ui.shouldResetProvisioning
import id.sch.man1rokanhulu.absensi.ui.showManualModePicker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderUxTest {
    @Test
    fun gateReaderUsesDedicatedGateUxAndAutoMode() {
        val modes = listOf("GATE_IN", "GATE_OUT")

        assertEquals(ReaderDeviceKind.GATE, readerDeviceKind(modes))
        assertEquals("HP Gerbang", readerDeviceTitle(modes))
        assertEquals("Mode: Datang & Pulang", readerModeSummary(modes))
        assertEquals("GATE_IN", effectiveScanMode(modes, "GATE_OUT"))
        assertFalse(showManualModePicker(modes))
    }

    @Test
    fun musholaReaderUsesDedicatedMusholaUx() {
        val modes = listOf("MUSHOLA")

        assertEquals(ReaderDeviceKind.MUSHOLA, readerDeviceKind(modes))
        assertEquals("HP Mushola", readerDeviceTitle(modes))
        assertTrue(readerModeSummary(modes).startsWith("Sholat saat ini:"))
        assertEquals("MUSHOLA", effectiveScanMode(modes, "CHECK_ONLY"))
        assertFalse(showManualModePicker(modes))
    }

    @Test
    fun friendlyMessagesHideTechnicalErrors() {
        assertEquals("HP scanner belum aktif. Minta admin aktivasi ulang.", friendlyScanMessage("Reader tidak aktif, dicabut, atau tidak ditemukan."))
        assertEquals("Mode HP ini tidak cocok untuk scan ini.", friendlyScanMessage("Mode HP Gerbang hanya untuk siswa lain."))
        assertEquals("Sudah tercatat", friendlyScanTitle(true, "Dzuhur hari ini sudah tercatat."))
        assertTrue(shouldResetProvisioning("Reader sudah dicabut."))
    }
}
