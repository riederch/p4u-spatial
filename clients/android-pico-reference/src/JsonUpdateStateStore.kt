package at.p4u.spatial.update

import android.content.Context
import org.json.JSONObject
import java.io.File

data class AndroidUpdateState(
    val phase: String,
    val channel: String,
    val installedVersionCode: Long,
    val targetReleaseId: String? = null,
    val targetVersionCode: Long? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
)

class JsonUpdateStateStore(
    context: Context,
) {
    private val file = File(context.filesDir, "update-state.json")

    fun read(): AndroidUpdateState? {
        if (!file.isFile) return null
        val json = JSONObject(file.readText())
        return AndroidUpdateState(
            phase = json.getString("phase"),
            channel = json.getString("channel"),
            installedVersionCode = json.getLong("installedVersionCode"),
            targetReleaseId = json.optString("targetReleaseId").ifBlank { null },
            targetVersionCode = if (json.has("targetVersionCode")) json.getLong("targetVersionCode") else null,
            errorCode = json.optString("errorCode").ifBlank { null },
            errorMessage = json.optString("errorMessage").ifBlank { null },
        )
    }

    fun write(state: AndroidUpdateState) {
        val json = JSONObject()
            .put("phase", state.phase)
            .put("channel", state.channel)
            .put("installedVersionCode", state.installedVersionCode)
        state.targetReleaseId?.let { json.put("targetReleaseId", it) }
        state.targetVersionCode?.let { json.put("targetVersionCode", it) }
        state.errorCode?.let { json.put("errorCode", it) }
        state.errorMessage?.let { json.put("errorMessage", it) }

        val temp = File(file.parentFile, ".update-state.tmp")
        temp.writeText(json.toString())
        require(temp.renameTo(file)) { "Unable to persist update state" }
    }
}
