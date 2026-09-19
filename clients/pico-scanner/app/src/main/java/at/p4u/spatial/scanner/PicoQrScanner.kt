package at.p4u.spatial.scanner

import android.app.Activity
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.EnumMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Minimal practical-test scanner. It intentionally uses Android Camera2 directly so the
 * picoVrVr runtime can expose whichever camera it permits to normal Android applications.
 * If no camera is exposed, the UI reports that explicitly and the manual JSON fallback remains.
 */
class PicoQrScanner(
    private val activity: Activity,
    private val onDecoded: (String) -> Unit,
    private val onError: (String) -> Unit,
) : AutoCloseable {
    private val thread = HandlerThread("p4u-qr-camera")
    private lateinit var handler: Handler
    private var camera: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private val finished = AtomicBoolean(false)
    private val decoder = MultiFormatReader().apply {
        val hints = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java)
        hints[DecodeHintType.POSSIBLE_FORMATS] = listOf(BarcodeFormat.QR_CODE)
        hints[DecodeHintType.TRY_HARDER] = true
        setHints(hints)
    }

    fun start() {
        thread.start()
        handler = Handler(thread.looper)
        val manager = activity.getSystemService(CameraManager::class.java)
        val cameraId = runCatching { manager.cameraIdList.firstOrNull() }.getOrNull()
        if (cameraId == null) {
            fail("Keine Android-Kamera wurde vom picoVrVr-System für diese App freigegeben.")
            return
        }
        reader = ImageReader.newInstance(1280, 720, ImageFormat.YUV_420_888, 2).also {
            it.setOnImageAvailableListener({ source -> decodeLatest(source) }, handler)
        }
        try {
            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(device: CameraDevice) {
                    if (finished.get()) { device.close(); return }
                    camera = device
                    device.createCaptureSession(
                        listOf(reader!!.surface),
                        object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(captureSession: CameraCaptureSession) {
                                if (finished.get()) { captureSession.close(); return }
                                session = captureSession
                                try {
                                    val request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                                        addTarget(reader!!.surface)
                                        set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                                    }.build()
                                    captureSession.setRepeatingRequest(request, null, handler)
                                } catch (e: Exception) {
                                    fail("Kamera konnte nicht gestartet werden: ${e.message}")
                                }
                            }
                            override fun onConfigureFailed(captureSession: CameraCaptureSession) {
                                fail("picoVrVr-Kamera konnte nicht konfiguriert werden.")
                            }
                        },
                        handler,
                    )
                }
                override fun onDisconnected(device: CameraDevice) {
                    device.close()
                    fail("picoVrVr-Kamera wurde getrennt.")
                }
                override fun onError(device: CameraDevice, error: Int) {
                    device.close()
                    fail("picoVrVr-Kamera meldet Fehler $error.")
                }
            }, handler)
        } catch (e: SecurityException) {
            fail("Keine Kameraberechtigung: ${e.message}")
        } catch (e: Exception) {
            fail("Kamera konnte nicht geöffnet werden: ${e.message}")
        }
    }

    private fun decodeLatest(source: ImageReader) {
        val image = source.acquireLatestImage() ?: return
        try {
            val plane = image.planes[0]
            val buffer = plane.buffer
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            if (pixelStride != 1) return
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            val sourceImage = PlanarYUVLuminanceSource(
                bytes, rowStride, image.height,
                0, 0, image.width, image.height,
                false,
            )
            val result = runCatching { decoder.decodeWithState(BinaryBitmap(HybridBinarizer(sourceImage))) }.getOrNull()
            decoder.reset()
            if (result != null && finished.compareAndSet(false, true)) {
                onDecoded(result.text)
            }
        } finally {
            image.close()
        }
    }

    private fun fail(message: String) {
        if (finished.compareAndSet(false, true)) onError(message)
    }

    override fun close() {
        finished.set(true)
        runCatching { session?.close() }
        runCatching { camera?.close() }
        runCatching { reader?.close() }
        session = null
        camera = null
        reader = null
        if (::handler.isInitialized) handler.removeCallbacksAndMessages(null)
        if (thread.isAlive) thread.quitSafely()
    }
}
