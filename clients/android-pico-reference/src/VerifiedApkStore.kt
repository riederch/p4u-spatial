package at.p4u.spatial.update

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

class VerifiedApkStore(
    context: Context,
) {
    private val updateDir = File(context.filesDir, "updates").apply { mkdirs() }

    fun stage(release: AndroidRelease, bytes: ByteArray): File {
        require(bytes.size.toLong() == release.packageSize) { "APK size mismatch" }
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
        require(digest == release.sha256.lowercase()) { "APK SHA-256 mismatch" }

        val target = File(updateDir, "${release.releaseId}.apk")
        val temporary = File(updateDir, ".${release.releaseId}.tmp")
        FileOutputStream(temporary).use { stream ->
            stream.write(bytes)
            stream.fd.sync()
        }
        require(temporary.renameTo(target)) { "Unable to atomically stage APK" }
        return target
    }

    fun remove(releaseId: String) {
        File(updateDir, "$releaseId.apk").delete()
        File(updateDir, ".$releaseId.tmp").delete()
    }
}
