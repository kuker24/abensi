package id.sch.man1rokanhulu.absensi.security

import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object Signer {
    fun sha256Hex(text: String): String = MessageDigest.getInstance("SHA-256")
        .digest(text.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    fun hmacSha256Hex(secret: String, payload: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    fun signedHeaders(deviceId: String, secret: String, method: String, path: String, rawBody: String, nowIso: String = Instant.now().toString(), nonce: String = UUID.randomUUID().toString()): Map<String, String> {
        val bodyHash = sha256Hex(rawBody)
        val canonical = listOf(method.uppercase(), path, nowIso, nonce, bodyHash).joinToString("\n")
        return mapOf(
            "x-reader-device-id" to deviceId,
            "x-reader-timestamp" to nowIso,
            "x-reader-nonce" to nonce,
            "x-reader-body-hash" to bodyHash,
            "x-reader-signature" to hmacSha256Hex(secret, canonical),
            "content-type" to "application/json",
            "accept" to "application/json"
        )
    }
}
