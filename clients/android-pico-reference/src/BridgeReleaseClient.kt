package at.p4u.spatial.update

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

data class AndroidRelease(
    val releaseId: String,
    val version: String,
    val versionCode: Long,
    val channel: String,
    val mandatory: Boolean,
    val packageHref: String,
    val packageSize: Long,
    val sha256: String,
    val signingCertificateSha256: String,
    val coreContract: String,
    val xrContract: String,
    val spatialContract: String?,
)

class BridgeReleaseClient(
    private val xrAppBaseUrl: String,
    private val connectTimeoutMs: Int = 15_000,
    private val readTimeoutMs: Int = 60_000,
) {
    fun latest(channel: String): AndroidRelease {
        require(channel == "stable" || channel == "beta")
        val body = getBytes(
            "${xrAppBaseUrl.trimEnd('/')}/releases/latest?channel=$channel&platform=android-pico",
            maxBytes = 1024 * 1024,
        )
        val json = JSONObject(body.toString(Charsets.UTF_8))
        val pkg = json.getJSONObject("package")
        val compatibility = json.getJSONObject("compatibility")

        return AndroidRelease(
            releaseId = json.getString("releaseId"),
            version = json.getString("version"),
            versionCode = json.getLong("versionCode"),
            channel = json.getString("channel"),
            mandatory = json.getBoolean("mandatory"),
            packageHref = pkg.getString("href"),
            packageSize = pkg.getLong("size"),
            sha256 = pkg.getString("sha256").lowercase(),
            signingCertificateSha256 = pkg.getString("signingCertificateSha256").replace(":", "").lowercase(),
            coreContract = compatibility.getString("core"),
            xrContract = compatibility.getString("xr"),
            spatialContract = compatibility.optString("spatial").ifBlank { null },
        )
    }

    fun download(release: AndroidRelease): ByteArray {
        require(release.packageSize > 0)
        require(release.packageSize <= Int.MAX_VALUE)
        return getBytes(release.packageHref, maxBytes = release.packageSize)
            .also { require(it.size.toLong() == release.packageSize) { "APK size mismatch" } }
    }

    private fun getBytes(url: String, maxBytes: Long): ByteArray {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = true
        connection.connectTimeout = connectTimeoutMs
        connection.readTimeout = readTimeoutMs
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json, application/vnd.android.package-archive")

        try {
            val status = connection.responseCode
            require(status in 200..299) { "HTTP $status from update service" }

            val declaredLength = connection.contentLengthLong
            require(declaredLength <= 0 || declaredLength <= maxBytes) {
                "Update response exceeds declared maximum size"
            }

            connection.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    require(total <= maxBytes) { "Update response exceeds declared maximum size" }
                    out.write(buffer, 0, read)
                }
                return out.toByteArray()
            }
        } finally {
            connection.disconnect()
        }
    }
}
