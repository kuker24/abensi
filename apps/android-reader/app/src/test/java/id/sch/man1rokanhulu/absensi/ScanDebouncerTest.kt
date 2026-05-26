package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.scanner.ScanDebouncer
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanDebouncerTest {
    @Test fun debounceSameQrWithinWindow() {
        val d = ScanDebouncer(3000)
        assertTrue(d.shouldAccept("qr1", 1000))
        assertFalse(d.shouldAccept("qr1", 2000))
        assertTrue(d.shouldAccept("qr1", 5001))
        assertTrue(d.shouldAccept("qr2", 5100))
    }
}
