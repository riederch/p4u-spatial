package at.p4u.spatial.scanner

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AuthenticatedBridgeClient(private val bridge: String, private val sessions: SecureSessionStore) {
    @Volatile private var accessToken: String? = null

    fun acceptBootstrap(session: BootstrapSession) {
        accessToken = session.accessToken
        sessions.save(session.refreshToken, session.refreshExpiresAt)
    }

    fun json(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        var token = accessToken ?: refresh()
        repeat(2) { attempt ->
            val result = jsonOnce(path, method, body, token)
            if (result.first != 401 || attempt == 1) {
                require(result.first in 200..299) { "Bridge HTTP ${result.first}: ${result.second}" }
                return JSONObject(result.second)
            }
            token = refresh()
        }
        error("unreachable")
    }

    fun bytes(path: String, bytes: ByteArray, sha256: String): JSONObject {
        var token = accessToken ?: refresh()
        repeat(2) { attempt ->
            val result = bytesOnce(path, bytes, sha256, token)
            if (result.first != 401 || attempt == 1) {
                require(result.first in 200..299) { "Bridge HTTP ${result.first}: ${result.second}" }
                return JSONObject(result.second)
            }
            token = refresh()
        }
        error("unreachable")
    }

    private fun refresh(): String {
        val stored = sessions.read() ?: error("Pairing required")
        val c = URL("${bridge.trimEnd('/')}/api/v1/session/refresh").openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 20_000; c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(JSONObject().put("refreshToken", stored.refreshToken).toString().toByteArray()) }
        try {
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                if (status == 401 || status == 403) { accessToken = null; sessions.clear() }
                error("Session refresh HTTP $status: $text")
            }
            val json = JSONObject(text)
            sessions.save(json.getString("refreshToken"), json.getString("refreshExpiresAt"))
            return json.getString("accessToken").also { accessToken = it }
        } finally { c.disconnect() }
    }

    private fun base(path: String, method: String, token: String) =
        (URL("${bridge.trimEnd('/')}$path").openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000; readTimeout = 60_000; requestMethod = method
            setRequestProperty("Accept", "application/json"); setRequestProperty("Authorization", "Bearer $token")
        }

    private fun jsonOnce(path: String, method: String, body: JSONObject?, token: String): Pair<Int,String> {
        val c = base(path, method, token)
        if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray()) } }
        return response(c)
    }

    private fun bytesOnce(path: String, bytes: ByteArray, sha256: String, token: String): Pair<Int,String> {
        val c = base(path, "PUT", token); c.doOutput = true
        c.setRequestProperty("Content-Type", "application/octet-stream"); c.setRequestProperty("X-Content-Sha256", sha256)
        c.outputStream.use { it.write(bytes) }; return response(c)
    }

    private fun response(c: HttpURLConnection): Pair<Int,String> {
        try {
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            return status to stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        } finally { c.disconnect() }
    }
}
