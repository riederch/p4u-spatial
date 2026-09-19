package at.p4u.spatial.scanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

data class OutboxScan(val scanId: String, val directory: File, val manifest: JSONObject)

class ScanOutbox(context: Context) {
    private val root = File(context.filesDir, "outbox/scans").apply { mkdirs() }

    fun create(
        deviceId: String,
        mode: String,
        files: Map<String, ByteArray>,
        capture: JSONObject? = null,
        capabilities: List<String> = emptyList(),
    ): OutboxScan {
        require(mode in setOf("indoor", "site", "registration", "drift-test"))
        val scanId = UUID.randomUUID().toString()
        val dir = File(root, scanId).apply { mkdirs() }
        val filesDir = File(dir, "files").apply { mkdirs() }
        val entries = JSONArray()
        for ((relative, bytes) in files) {
            require(relative.isNotBlank() && !relative.startsWith("/") && !relative.split('/').contains(".."))
            val target = File(filesDir, relative); target.parentFile?.mkdirs(); target.writeBytes(bytes)
            entries.put(JSONObject().put("path", relative).put("sha256", sha256(bytes)))
        }
        val manifest = JSONObject().put("schemaVersion", "1.0").put("scanId", scanId)
            .put("device", JSONObject().put("deviceId", deviceId).put("platform", "android-pico").put("model", android.os.Build.MODEL))
            .put("mode", mode).put("createdAt", Instant.now().toString())
            .put("coordinateFrame", "scan:$scanId")
            .put("capabilities", JSONArray(capabilities))
            .put("files", entries)
        capture?.let { manifest.put("capture", it) }
        File(dir, "manifest.json").writeText(manifest.toString(2))
        return OutboxScan(scanId, dir, manifest)
    }

    fun pending(): List<OutboxScan> = root.listFiles().orEmpty().filter { it.isDirectory }.mapNotNull { dir ->
        val file = File(dir, "manifest.json")
        if (file.isFile) OutboxScan(dir.name, dir, JSONObject(file.readText())) else null
    }.sortedBy { it.manifest.optString("createdAt") }

    fun file(scan: OutboxScan, relative: String): File {
        val base = File(scan.directory, "files").canonicalFile
        val candidate = File(base, relative).canonicalFile
        require(candidate.path == base.path || candidate.path.startsWith(base.path + File.separator))
        return candidate
    }

    fun removeCommitted(scan: OutboxScan) { scan.directory.deleteRecursively() }

    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
