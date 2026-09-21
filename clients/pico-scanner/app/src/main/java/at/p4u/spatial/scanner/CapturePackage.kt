package at.p4u.spatial.scanner

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class PoseSample(
    val timestamp: Instant,
    val position: FloatArray,
    val orientation: FloatArray,
    val tracking: String = "tracked",
)

data class CaptureIntent(
    val purpose: String,
    val precision: String,
    val sourceId: String? = null,
    val objectId: String? = null,
    val runtimeCapabilities: List<String> = emptyList(),
)

// ADR: docs/adr/contracts/0003-spatial-coordinate-frames.md — scanner-local poses remain explicitly framed evidence and are never assumed globally meaningful.
object CapturePackage {
    fun trajectoryJsonl(scanId: String, samples: List<PoseSample>): ByteArray {
        val frame = "scan:$scanId"
        return samples.joinToString(separator = "\n", postfix = if (samples.isEmpty()) "" else "\n") { sample ->
            require(sample.position.size == 3)
            require(sample.orientation.size == 4)
            JSONObject()
                .put("t", sample.timestamp.toString())
                .put("frame", frame)
                .put("position", JSONArray(sample.position.toList()))
                .put("orientation", JSONArray(sample.orientation.toList()))
                .put("tracking", sample.tracking)
                .toString()
        }.toByteArray()
    }

    fun captureJson(intent: CaptureIntent): JSONObject {
        require(intent.purpose in setOf(
            "room-survey", "building-survey", "asset-registration",
            "registration", "drift-test", "free-capture",
        ))
        require(intent.precision in setOf("relative-only", "local-metric", "registered"))
        require((intent.sourceId == null) == (intent.objectId == null)) {
            "Canonical subject requires both sourceId and objectId"
        }

        return JSONObject()
            .put("purpose", intent.purpose)
            .put("precision", intent.precision)
            .put("runtimeCapabilities", JSONArray(intent.runtimeCapabilities))
            .also { capture ->
                if (intent.sourceId != null && intent.objectId != null) {
                    capture.put("subject", JSONObject()
                        .put("sourceId", intent.sourceId)
                        .put("objectId", intent.objectId))
                }
            }
    }

    fun anchorBinding(
        provider: String,
        providerAnchorId: String,
        scanId: String,
        position: FloatArray,
        orientation: FloatArray,
        sourceId: String? = null,
        objectId: String? = null,
    ): JSONObject {
        require(position.size == 3)
        require(orientation.size == 4)
        require((sourceId == null) == (objectId == null))

        return JSONObject()
            .put("provider", provider)
            .put("providerAnchorId", providerAnchorId)
            .put("frame", "scan:$scanId")
            .put("pose", JSONObject()
                .put("position", JSONArray(position.toList()))
                .put("orientation", JSONArray(orientation.toList())))
            .also { binding ->
                if (sourceId != null && objectId != null) {
                    binding.put("subject", JSONObject()
                        .put("sourceId", sourceId)
                        .put("objectId", objectId))
                }
            }
    }
}
