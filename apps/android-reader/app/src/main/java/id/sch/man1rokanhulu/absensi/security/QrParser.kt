package id.sch.man1rokanhulu.absensi.security

object QrParser {
    private const val PREFIX = "schoolhub:qr:v1:"
    data class Parsed(val opaqueCode: String, val qrCode: String)

    fun parse(raw: String): Parsed {
        val value = raw.trim()
        require(value.startsWith(PREFIX)) { "Format QR tidak didukung." }
        val opaque = value.removePrefix(PREFIX)
        require(Regex("QR_[A-Z0-9_-]{10,64}").matches(opaque)) { "Format credential QR tidak valid." }
        return Parsed(opaque, PREFIX + opaque)
    }

    fun isSupported(raw: String): Boolean = runCatching { parse(raw) }.isSuccess
}
