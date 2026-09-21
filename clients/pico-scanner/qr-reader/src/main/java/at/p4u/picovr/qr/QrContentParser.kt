package at.p4u.picovr.qr

import android.util.Patterns
import org.json.JSONArray
import org.json.JSONObject

object QrContentParser {
    private val emailPattern = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

    fun parse(rawValue: String): QrContent {
        val raw = rawValue.trim()
        val lower = raw.lowercase()

        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            return QrContent(QrContentKind.WEB, raw, raw, raw)
        }
        if (lower.startsWith("mailto:")) {
            return QrContent(QrContentKind.EMAIL, raw, raw.removePrefixIgnoreCase("mailto:"), raw)
        }
        if (emailPattern.matches(raw)) {
            return QrContent(QrContentKind.EMAIL, raw, raw, "mailto:$raw")
        }
        if (lower.startsWith("tel:")) {
            return QrContent(QrContentKind.PHONE, raw, raw.removePrefixIgnoreCase("tel:"), raw)
        }
        if (lower.startsWith("sms:") || lower.startsWith("smsto:")) {
            return QrContent(QrContentKind.SMS, raw, raw, raw)
        }
        if (lower.startsWith("geo:")) {
            return QrContent(QrContentKind.GEO, raw, raw, raw)
        }
        if (lower.startsWith("wifi:")) {
            return QrContent(QrContentKind.WIFI, raw, formatWifi(raw))
        }
        if (lower.startsWith("begin:vcard") || lower.startsWith("mecard:")) {
            return QrContent(QrContentKind.CONTACT, raw, raw)
        }
        formatJson(raw)?.let { formatted ->
            return QrContent(QrContentKind.JSON, raw, formatted)
        }
        if (looksLikeUri(raw)) {
            return QrContent(QrContentKind.URI, raw, raw, raw)
        }
        return QrContent(QrContentKind.TEXT, raw, raw)
    }

    private fun String.removePrefixIgnoreCase(prefix: String): String =
        if (startsWith(prefix, ignoreCase = true)) substring(prefix.length) else this

    private fun formatJson(raw: String): String? = runCatching {
        when {
            raw.startsWith("{") -> JSONObject(raw).toString(2)
            raw.startsWith("[") -> JSONArray(raw).toString(2)
            else -> null
        }
    }.getOrNull()

    private fun looksLikeUri(raw: String): Boolean {
        val colon = raw.indexOf(':')
        if (colon <= 0) return false
        val scheme = raw.substring(0, colon)
        return scheme.matches(Regex("[A-Za-z][A-Za-z0-9+.-]*"))
    }

    private fun formatWifi(raw: String): String {
        val body = raw.removePrefixIgnoreCase("WIFI:").removeSuffix(";")
        val fields = mutableMapOf<String, String>()
        var token = StringBuilder()
        var escaped = false
        val tokens = mutableListOf<String>()
        for (char in body) {
            when {
                escaped -> {
                    token.append(char)
                    escaped = false
                }
                char == '\\' -> escaped = true
                char == ';' -> {
                    tokens += token.toString()
                    token = StringBuilder()
                }
                else -> token.append(char)
            }
        }
        if (token.isNotEmpty()) tokens += token.toString()
        tokens.forEach { entry ->
            val separator = entry.indexOf(':')
            if (separator > 0) fields[entry.substring(0, separator)] = entry.substring(separator + 1)
        }
        return buildString {
            fields["S"]?.let { append("SSID: ").append(it).append('\n') }
            fields["T"]?.let { append("Sicherheit: ").append(it).append('\n') }
            append("WLAN-Konfiguration erkannt")
        }
    }
}
