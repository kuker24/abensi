package id.sch.man1rokanhulu.absensi.scanner

import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

/**
 * Frame-level QR analyzer. Duplicate-window anti double-scan for the same card
 * is owned by [ContinuousScanGate]; this class only filters noisy frame spam.
 */
class BarcodeAnalyzer(
    frameNoiseWindowMs: Long = 700,
    private val onQr: (String) -> Unit
) : ImageAnalysis.Analyzer {
    private val scanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
    )
    private val frameNoiseFilter = ScanDebouncer(frameNoiseWindowMs)

    @ExperimentalGetImage
    override fun analyze(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image ?: run {
            imageProxy.close()
            return
        }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner.process(image)
            .addOnSuccessListener { codes ->
                val value = codes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }?.rawValue
                if (!value.isNullOrBlank() && frameNoiseFilter.shouldAccept(value)) {
                    onQr(value)
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }
}
