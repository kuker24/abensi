package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.scanner.ContinuousScanGate
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContinuousScanGateTest {
    @Test fun differentQrCanScanContinuouslyAfterPreviousFinished() {
        val gate = ContinuousScanGate(3000)

        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_AAAAAAAAAAA", 1000))
        gate.finish()

        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_BBBBBBBBBBB", 1100))
        gate.finish()
    }

    @Test fun sameQrIsNotDoubleScannedTooFast() {
        val gate = ContinuousScanGate(3000)

        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_AAAAAAAAAAA", 1000))
        gate.finish()

        assertFalse(gate.tryStart("schoolhub:qr:v1:QR_AAAAAAAAAAA", 1500))
        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_AAAAAAAAAAA", 4101))
    }

    @Test fun slowServerPreventsDoubleSubmitUntilFinished() {
        val gate = ContinuousScanGate(3000)

        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_AAAAAAAAAAA", 1000))
        assertFalse(gate.tryStart("schoolhub:qr:v1:QR_BBBBBBBBBBB", 1200))

        gate.finish()
        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_BBBBBBBBBBB", 1300))
    }

    @Test fun scannerCanContinueAfterNetworkFailureFinishes() {
        val gate = ContinuousScanGate(3000)

        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_AAAAAAAAAAA", 1000))
        gate.finish()

        assertTrue(gate.tryStart("schoolhub:qr:v1:QR_CCCCCCCCCCC", 1600))
    }
}
