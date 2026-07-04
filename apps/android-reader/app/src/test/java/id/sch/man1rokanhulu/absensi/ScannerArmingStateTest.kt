package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.ui.components.FeedbackTone
import id.sch.man1rokanhulu.absensi.ui.screens.scannerPausedFeedback
import id.sch.man1rokanhulu.absensi.ui.screens.shouldProcessScan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScannerArmingStateTest {
    @Test
    fun initialPausedFeedbackTellsOperatorToStartScan() {
        val feedback = scannerPausedFeedback()

        assertEquals("Scan Belum Aktif", feedback.title)
        assertEquals("Pastikan QR tidak berada di depan kamera, lalu tekan Mulai Scan.", feedback.message)
        assertEquals(FeedbackTone.IDLE, feedback.tone)
    }

    @Test
    fun pausedScannerIgnoresDetectedQr() {
        assertFalse(shouldProcessScan(paused = true, armed = false, busy = false))
        assertFalse(shouldProcessScan(paused = true, armed = true, busy = false))
    }

    @Test
    fun unarmedScannerIgnoresDetectedQr() {
        assertFalse(shouldProcessScan(paused = false, armed = false, busy = false))
    }

    @Test
    fun pressingStartArmsScannerForProcessing() {
        assertTrue(shouldProcessScan(paused = false, armed = true, busy = false))
    }

    @Test
    fun busyScannerIgnoresDetectedQrUntilPreviousScanFinishes() {
        assertFalse(shouldProcessScan(paused = false, armed = true, busy = true))
    }
}
