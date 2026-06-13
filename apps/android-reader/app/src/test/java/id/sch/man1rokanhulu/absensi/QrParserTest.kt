package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.security.QrParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QrParserTest {
    @Test fun parseValidSchoolHubQr() {
        val parsed = QrParser.parse("schoolhub:qr:v1:QR_7F3K9X2P8LQ0")
        assertEquals("QR_7F3K9X2P8LQ0", parsed.opaqueCode)
        assertEquals("schoolhub:qr:v1:QR_7F3K9X2P8LQ0", parsed.qrCode)
    }

    @Test fun rejectUnsupportedQrFormat() {
        assertFalse(QrParser.isSupported("NISN=12345"))
        assertFalse(QrParser.isSupported("schoolhub:qr:v1:BAD"))
        assertTrue(QrParser.isSupported("schoolhub:qr:v1:QR_ABCDEFGHIJK"))
    }
}
