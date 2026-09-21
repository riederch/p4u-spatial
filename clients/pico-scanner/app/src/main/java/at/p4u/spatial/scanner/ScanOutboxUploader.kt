package at.p4u.spatial.scanner

import org.json.JSONObject
import java.security.MessageDigest

data class UploadRunResult(val committed: Int, val deferred: Int)

// ADR: docs/adr/app/0024-headset-offline-state-and-secure-storage.md — retry/resume never deletes the only local primary copy before durable commit.
class ScanOutboxUploader(private val outbox: ScanOutbox, private val bridge: AuthenticatedBridgeClient) {
    fun drain(): UploadRunResult {
        var committed = 0; var deferred = 0
        for (scan in outbox.pending()) {
            try { upload(scan); committed += 1 } catch (_: Exception) { deferred += 1 }
        }
        return UploadRunResult(committed, deferred)
    }

    fun upload(scan: OutboxScan) {
        val base = "/api/v1/scans/${scan.scanId}"
        val status = bridge.json("$base/manifest", "PUT", scan.manifest)
        if (status.optString("state") == "committed") { outbox.removeCommitted(scan); return }

        val missing = status.getJSONArray("missingFiles")
        for (i in 0 until missing.length()) {
            val relative = missing.getString(i)
            val bytes = outbox.file(scan, relative).readBytes()
            val expected = expectedSha(scan.manifest, relative)
            val actual = sha256(bytes)
            require(actual == expected) { "Local outbox file hash changed for $relative" }
            bridge.bytes("$base/files/$relative", bytes, actual)
        }

        val committed = bridge.json("$base/commit", "POST", JSONObject())
        require(committed.optString("state") == "committed")
        outbox.removeCommitted(scan)
    }

    private fun expectedSha(manifest: JSONObject, path: String): String {
        val files = manifest.getJSONArray("files")
        for (i in 0 until files.length()) {
            val item = files.getJSONObject(i)
            if (item.getString("path") == path) return item.getString("sha256").lowercase()
        }
        error("Manifest does not declare $path")
    }

    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
