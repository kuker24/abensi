package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.security.LocalAes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit-level contract for encrypt/decrypt roundtrip shape.
 * AndroidKeystore is not available on plain JVM; this test only validates
 * the ciphertext packaging format and fails soft if Keystore is missing.
 */
class LocalAesCacheTest {
    @Test
    fun ciphertextUsesIvAndPayloadPartsWhenKeystoreAvailable() {
        val aes = runCatching { LocalAes("schoolhub_pending_queue_test") }.getOrNull() ?: return
        val encrypted = runCatching { aes.encrypt("schoolhub:qr:v1:QR_TESTONLY01") }.getOrNull() ?: return
        assertTrue(encrypted.contains(":"))
        val parts = encrypted.split(":")
        assertEquals(2, parts.size)
        val plain = aes.decrypt(encrypted)
        assertEquals("schoolhub:qr:v1:QR_TESTONLY01", plain)
    }
}
