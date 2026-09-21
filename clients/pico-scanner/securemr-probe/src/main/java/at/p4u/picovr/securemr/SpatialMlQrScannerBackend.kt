package at.p4u.picovr.securemr

import android.content.Context
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.pico.spatial.ml.readback.readbackContentSuspend
import com.pico.spatial.ml.securemr.GlobalTensor
import com.pico.spatial.ml.securemr.Pipeline
import com.pico.spatial.ml.securemr.SpatialMLInstance
import com.pico.spatial.ml.securemr.SpatialMLSession
import com.pico.spatial.ml.securemr.Tensor
import at.p4u.picovr.qr.QrScannerBackend
import java.nio.ByteBuffer
import java.util.Collections
import java.util.EnumMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// ADR: docs/adr/app/0020-securemr-qr-scanner-backend.md — PICO SpatialML/SecureMR remains a vendor backend behind the generic QR scanner contract.
// ADR: docs/adr/app/0031-hud-controlled-ambient-feature-lifecycle.md — scanner runs in-process inside the Spatial application instead of launching a separate NativeActivity.
class SpatialMlQrScannerBackend(
    context: Context,
) : QrScannerBackend {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val running = AtomicBoolean(false)
    private var scanJob: Job? = null

    override fun start(listener: QrScannerBackend.Listener) {
        stop()
        running.set(true)
        scanJob = scope.launch {
            try {
                val session = createSession()
                val frameTensor = session.newGlobalTensor(
                    Tensor.MultiDimensionalInitInfo(
                        Tensor.DataType.Image.R8G8B8_U_DYNAMIC,
                        intArrayOf(FRAME_SIZE, FRAME_SIZE),
                    ),
                )
                val pipeline = createCameraPipeline(session, frameTensor)

                while (isActive && running.get()) {
                    pipeline.submit(mapOf(), null, null)
                    delay(FRAME_INTERVAL_MS)

                    frameTensor.readbackContentSuspend().use { content ->
                        val raw = decodeQr(
                            content.buffer,
                            FRAME_SIZE,
                            FRAME_SIZE,
                        )
                        if (raw != null && running.compareAndSet(true, false)) {
                            listener.onDecoded(raw)
                            return@launch
                        }
                    }
                }
            } catch (_: CancellationException) {
                // Normal stop/close path.
            } catch (error: Throwable) {
                if (running.compareAndSet(true, false)) {
                    listener.onError(
                        error.message ?: "QR-Erkennung konnte nicht gestartet werden.",
                    )
                }
            }
        }
    }

    override fun stop() {
        running.set(false)
        scanJob?.cancel()
        scanJob = null
    }

    override fun close() {
        stop()
        scope.cancel()
    }

    private suspend fun createSession(): SpatialMLSession {
        val instance = SpatialMLInstance.create(appContext)
        while (!instance.ready) {
            delay(100)
        }
        return requireNotNull(
            instance.createSession(
                SpatialMLSession.InitInfo(
                    imageWidth = FRAME_SIZE,
                    imageHeight = FRAME_SIZE,
                    containerWidth = 0,
                    containerHeight = 0,
                    containerDepth = 0,
                ),
            ),
        ) {
            "SpatialML session could not be created."
        }
    }

    private fun createCameraPipeline(
        session: SpatialMLSession,
        frameTensor: GlobalTensor,
    ): Pipeline =
        session.newPipeline().apply {
            val rightImage = newLocalTensor(
                Tensor.MultiDimensionalInitInfo(
                    Tensor.DataType.Image.R8G8B8_U_DYNAMIC,
                    intArrayOf(FRAME_SIZE, FRAME_SIZE),
                ),
            )
            rectifiedVSTAccess(
                rightImageResult = rightImage,
                leftImageResult = null,
                timestampResult = null,
                cameraMatrixResult = null,
            )
            copy(rightImage, frameTensor)
        }

    private fun decodeQr(
        buffer: ByteBuffer,
        width: Int,
        height: Int,
    ): String? {
        val pixelCount = width * height
        val expected = pixelCount * 3
        if (buffer.remaining() < expected) return null

        val luminance = ByteArray(pixelCount)
        var i = 0
        while (i < pixelCount && buffer.remaining() >= 3) {
            val r = buffer.get().toInt() and 0xff
            val g = buffer.get().toInt() and 0xff
            val b = buffer.get().toInt() and 0xff
            luminance[i] = ((r * 77 + g * 150 + b * 29) shr 8).toByte()
            i += 1
        }

        val source = PlanarYUVLuminanceSource(
            luminance,
            width,
            height,
            0,
            0,
            width,
            height,
            false,
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        val hints = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java).apply {
            put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE))
            put(DecodeHintType.TRY_HARDER, true)
            put(DecodeHintType.ALSO_INVERTED, true)
        }

        return runCatching {
            MultiFormatReader().apply { setHints(hints) }.decodeWithState(bitmap).text
        }.getOrNull()
    }

    companion object {
        private const val FRAME_SIZE = 512
        private const val FRAME_INTERVAL_MS = 150L
    }
}
