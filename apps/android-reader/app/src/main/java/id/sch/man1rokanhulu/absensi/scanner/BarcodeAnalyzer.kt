package id.sch.man1rokanhulu.absensi.scanner

import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

class BarcodeAnalyzer(private val onQr: (String) -> Unit) : ImageAnalysis.Analyzer {
    private val scanner = BarcodeScanning.getClient()
    private val debouncer = ScanDebouncer(3000)

    @ExperimentalGetImage
    override fun analyze(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image ?: run { imageProxy.close(); return }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner.process(image)
            .addOnSuccessListener { codes ->
                val value = codes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }?.rawValue
                if (!value.isNullOrBlank() && debouncer.shouldAccept(value)) {
                    onQr(value)
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }
}
