package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.security.CanonicalJson
import id.sch.man1rokanhulu.absensi.security.Signer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class SignerTest {
    @Test fun canonicalJsonSortsKeysAndOmitsNull() {
        val body = CanonicalJson.stringify(mapOf("mode" to "GATE_IN", "credentialType" to "QR", "none" to null))
        assertEquals("{\"credentialType\":\"QR\",\"mode\":\"GATE_IN\"}", body)
    }

    @Test fun bodyHashMatchesSha256() {
        val body = "{\"credentialType\":\"QR\"}"
        assertEquals(64, Signer.sha256Hex(body).length)
        assertEquals(Signer.sha256Hex(body), Signer.sha256Hex(body))
    }

    @Test fun signedHeadersUseCanonicalPayload() {
        val raw = "{\"credentialType\":\"QR\",\"mode\":\"GATE_IN\"}"
        val headers = Signer.signedHeaders("device-1", "secret", "POST", "/api/v1/attendance/qr-reader-scan", raw, "2026-05-02T00:00:00Z", "nonce-1")
        val canonical = listOf("POST", "/api/v1/attendance/qr-reader-scan", "2026-05-02T00:00:00Z", "nonce-1", headers.getValue("x-reader-body-hash")).joinToString("\n")
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec("secret".toByteArray(), "HmacSHA256"))
        val expected = mac.doFinal(canonical.toByteArray()).joinToString("") { "%02x".format(it) }
        assertEquals(expected, headers["x-reader-signature"])
        assertTrue(headers.getValue("x-reader-body-hash").matches(Regex("[a-f0-9]{64}")))
    }
}
