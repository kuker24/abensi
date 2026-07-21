package id.sch.man1rokanhulu.absensi.network

const val MAX_PENDING_SCAN_ATTEMPTS = 10

fun isRetryableScanStatus(statusCode: Int?): Boolean =
    statusCode == 408 ||
        statusCode == 425 ||
        statusCode == 429 ||
        (statusCode != null && statusCode in 500..599)

fun isPendingScanParked(attempts: Int): Boolean = attempts >= MAX_PENDING_SCAN_ATTEMPTS

fun reachesPendingScanAttemptLimit(attempts: Int): Boolean =
    attempts + 1 >= MAX_PENDING_SCAN_ATTEMPTS
