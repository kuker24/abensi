package id.sch.man1rokanhulu.absensi.scanner

class ContinuousScanGate(duplicateWindowMs: Long = 3000) {
    private val debouncer = ScanDebouncer(duplicateWindowMs)
    private var processing = false

    val isProcessing: Boolean
        get() = processing

    fun tryStart(value: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (processing) return false
        if (!debouncer.shouldAccept(value, nowMs)) return false
        processing = true
        return true
    }

    fun finish() {
        processing = false
    }
}
