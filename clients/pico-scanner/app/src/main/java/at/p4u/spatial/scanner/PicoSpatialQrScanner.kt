package at.p4u.spatial.scanner

import android.content.Context
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.BarcodeFormat
import com.google.zxing.common.HybridBinarizer
import com.pico.spatial.ml.readback.readbackContentSuspend
import com.pico.spatial.ml.securemr.SpatialMLInstance
import com.pico.spatial.ml.securemr.SpatialMLSession.InitInfo
import com.pico.spatial.ml.securemr.Tensor.DataType
import com.pico.spatial.ml.securemr.Tensor.MultiDimensionalInitInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * QR scanner for PICO headsets that do not expose the passthrough cameras through Android Camera2.
 *
 * SpatialML obtains a rectified VST frame inside the PICO runtime. RelaxMR/readback is required
 * because ZXing must inspect the pixels in the application process.
 */
class PicoSpatialQrScanner(
    private val context: Context,
    private val onDecoded: (String) -> Unit,
    private val onError: (String) -> Unit,
) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var job: Job? = null

    fun start() {
        if (job != null) return
        job = scope.launch {
            runCatching {
                val instance = SpatialMLInstance.create(context.applicationContext)
                var attempts = 0
                while (!instance.ready && attempts < 100) {
                    delay(100)
                    attempts += 1
                }
                check(instance.ready) { "PICO SpatialML wurde nicht bereit." }

                val session = instance.createSession(
                    InitInfo(
                        imageWidth = FRAME_SIZE,
                        imageHeight = FRAME_SIZE,
                        containerWidth = 0,
                        containerHeight = 0,
                        containerDepth = 0,
                    )
                ) ?: error("PICO SpatialML-Session konnte nicht erstellt werden.")

                val frame = session.newGlobalTensor(
                    MultiDimensionalInitInfo(
                        DataType.Image.R8G8B8_U_DYNAMIC,
                        intArrayOf(FRAME_SIZE, FRAME_SIZE),
                    )
                )
                val pipeline = session.newPipeline().apply {
                    val rightFrame = newLocalTensor(
                        MultiDimensionalInitInfo(
                            DataType.Image.R8G8B8_U_DYNAMIC,
                            intArrayOf(FRAME_SIZE, FRAME_SIZE),
                        )
                    )
                    rectifiedVSTAccess(
                        rightImageResult = rightFrame,
                        leftImageResult = null,
                        timestampResult = null,
                        cameraMatrixResult = null,
                    )
                    copy(rightFrame, frame)
                }

                while (true) {
                    pipeline.submit(emptyMap(), null, null)
                    frame.readbackContentSuspend().use { content ->
                        val rgb = ByteArray(FRAME_SIZE * FRAME_SIZE * 3)
                        content.buffer.rewind()
                        content.buffer.get(rgb, 0, minOf(rgb.size, content.buffer.remaining()))
                        decodeRgb(rgb)?.let {
                            onDecoded(it)
                            return@launch
                        }
                    }
                    delay(SCAN_INTERVAL_MS)
                }
            }.onFailure { error ->
                if (job?.isCancelled != true) {
                    onError(error.message ?: error.javaClass.simpleName)
                }
            }
        }
    }

    private fun decodeRgb(rgb: ByteArray): String? {
        val luminance = ByteArray(FRAME_SIZE * FRAME_SIZE)
        var src = 0
        for (i in luminance.indices) {
            val r = rgb[src].toInt() and 0xff
            val g = rgb[src + 1].toInt() and 0xff
            val b = rgb[src + 2].toInt() and 0xff
            luminance[i] = ((r * 77 + g * 150 + b * 29) shr 8).toByte()
            src += 3
        }
        val source = PlanarYUVLuminanceSource(
            luminance,
            FRAME_SIZE,
            FRAME_SIZE,
            0,
            0,
            FRAME_SIZE,
            FRAME_SIZE,
            false,
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        return runCatching {
            MultiFormatReader().apply {
                setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)))
            }.decodeWithState(bitmap).text
        }.getOrNull()
    }

    override fun close() {
        job?.cancel()
        job = null
        scope.cancel()
    }

    companion object {
        private const val FRAME_SIZE = 512
        private const val SCAN_INTERVAL_MS = 120L
    }
}
