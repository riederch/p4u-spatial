package at.p4u.spatial.scanner

import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class PairingQr(
    val bridge: String,
    val localUrl: String?,
    val publicUrl: String?,
    val pairingId: String,
    val secret: String,
    val expiresAt: String,
)
data class BootstrapSession(val accessToken: String, val refreshToken: String, val accessExpiresAt: String, val refreshExpiresAt: String)

sealed interface PairingPoll {
    data object Pending : PairingPoll
    data object Rejected : PairingPoll
    data object Expired : PairingPoll
    data class Authorized(val session: BootstrapSession) : PairingPoll
}

class PairingClient {
    fun parseQr(raw: String): PairingQr {
        val json = JSONObject(raw)
        require(json.getInt("version") == 1)
        val addresses = json.optJSONObject("addresses")
        return PairingQr(
            bridge = json.getString("bridge"),
            localUrl = addresses?.optString("localUrl")?.takeIf { it.isNotBlank() },
            publicUrl = addresses?.optString("publicUrl")?.takeIf { it.isNotBlank() },
            pairingId = json.getString("pairingId"),
            secret = json.getString("secret"),
            expiresAt = json.getString("expiresAt"),
        )
    }

    fun claim(baseUrl: String, qr: PairingQr, deviceId: String, appVersion: String, localName: String? = null): String {
        val payload = JSONObject().put("pairingId", qr.pairingId).put("secret", qr.secret)
            .put("device", JSONObject().put("deviceId", deviceId).put("platform", "android-pico")
                .put("model", Build.MODEL).put("name", localName ?: "picoVrVr ${Build.MODEL}").put("runtime", "Android ${Build.VERSION.RELEASE}")
                .put("appVersion", appVersion).put("capabilities", org.json.JSONArray()))
        return request("${baseUrl.trimEnd('/')}/api/v1/pairing/claim", "POST", payload).getString("claimId")
    }

    fun poll(bridge: String, claimId: String): PairingPoll {
        val json = request("${bridge.trimEnd('/')}/api/v1/pairing/claims/$claimId", "GET", null)
        return when (json.getString("status")) {
            "pending" -> PairingPoll.Pending
            "rejected" -> PairingPoll.Rejected
            "expired" -> PairingPoll.Expired
            "authorized" -> json.getJSONObject("session").let { session ->
                PairingPoll.Authorized(BootstrapSession(
                    session.getString("accessToken"), session.getString("refreshToken"),
                    session.getString("accessExpiresAt"), session.getString("refreshExpiresAt")))
            }
            else -> error("Unsupported pairing status")
        }
    }

    private fun request(url: String, method: String, body: JSONObject?): JSONObject {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 20_000; c.requestMethod = method
        c.setRequestProperty("Accept", "application/json")
        if (body != null) {
            c.doOutput = true; c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        try {
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            require(status in 200..299) { "Pairing HTTP $status: $text" }
            return JSONObject(text)
        } finally { c.disconnect() }
    }
}
