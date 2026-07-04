package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.network.HttpClientProvider
import org.junit.Assert.assertSame
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.TimeUnit

class HttpClientProviderTest {
    @Test fun downloadClientSharesConnectionPoolWithSharedClient() {
        assertSame(HttpClientProvider.shared.connectionPool, HttpClientProvider.download.connectionPool)
    }

    @Test fun downloadClientKeepsLongerReadTimeout() {
        assertEquals(20_000, HttpClientProvider.shared.readTimeoutMillis.toLong())
        assertEquals(TimeUnit.SECONDS.toMillis(60), HttpClientProvider.download.readTimeoutMillis.toLong())
    }
}
