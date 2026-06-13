package id.sch.man1rokanhulu.absensi.scanner

class ScanDebouncer(private val windowMs: Long = 3000) {
    private var lastValue: String? = null
    private var lastAt: Long = 0

    fun shouldAccept(value: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        val accepted = value != lastValue || nowMs - lastAt > windowMs
        if (accepted) {
            lastValue = value
            lastAt = nowMs
        }
        return accepted
    }
}
