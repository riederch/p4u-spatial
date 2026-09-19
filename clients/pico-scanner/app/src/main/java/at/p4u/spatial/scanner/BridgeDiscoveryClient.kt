package at.p4u.spatial.scanner

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class BridgeDiscoveryClient {
    fun xrAppContract(baseUrl: String): String {
        val url = "${baseUrl.trimEnd('/')}/.well-known/open-spatial-interop"
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")

        try {
            val status = connection.responseCode
            require(status in 200..299) { "Bridge discovery returned HTTP $status" }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            return json.getJSONObject("contracts")
                .getJSONObject("xr-app")
                .getString("href")
        } finally {
            connection.disconnect()
        }
    }
}
