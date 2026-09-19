package at.p4u.spatial.scanner

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class BridgeDiscovery(
    val instanceId: String,
    val instanceName: String?,
    val xrAppHref: String,
)

class BridgeDiscoveryClient {
    fun discover(baseUrl: String): BridgeDiscovery {
        val url = "${baseUrl.trimEnd('/')}/.well-known/open-spatial-interop"
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")

        try {
            val status = connection.responseCode
            require(status in 200..299) { "Bridge discovery returned HTTP $status" }
            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            return BridgeDiscovery(
                instanceId = json.getString("instanceId"),
                instanceName = json.optString("instanceName").takeIf { it.isNotBlank() },
                xrAppHref = json.getJSONObject("contracts").getJSONObject("xr-app").getString("href"),
            )
        } finally {
            connection.disconnect()
        }
    }

    fun xrAppContract(baseUrl: String): String = discover(baseUrl).xrAppHref
}
