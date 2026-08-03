package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.scanner.ScanDebouncer
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BarcodeAnalyzerConfigTest {
    @Test
    fun frameNoiseFilterIsShorterThanOperatorDuplicateWindow() {
        val frame = ScanDebouncer(700)
        val operator = ScanDebouncer(3000)

        assertTrue(frame.shouldAccept("qr-a", 1000))
        assertFalse(frame.shouldAccept("qr-a", 1500))
        assertTrue(frame.shouldAccept("qr-a", 1801))

        assertTrue(operator.shouldAccept("qr-a", 1000))
        assertFalse(operator.shouldAccept("qr-a", 2500))
        assertTrue(operator.shouldAccept("qr-a", 4001))
    }
}
