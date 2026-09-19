package at.p4u.spatial.scanner

import android.content.Context
import java.util.UUID

class DeviceIdentityStore(context: Context) {
    private val prefs = context.getSharedPreferences("p4u-device-identity", Context.MODE_PRIVATE)

    fun deviceId(): String {
        val existing = prefs.getString("device-id", null)
        if (!existing.isNullOrBlank()) return existing
        val created = UUID.randomUUID().toString()
        check(prefs.edit().putString("device-id", created).commit()) { "Unable to persist device identity" }
        return created
    }

    fun localName(): String = prefs.getString("local-name", null)?.takeIf { it.isNotBlank() }
        ?: "PICO ${android.os.Build.MODEL}"

    fun setLocalName(name: String) {
        val normalized = name.trim()
        require(normalized.isNotEmpty() && normalized.length <= 120) { "Device name must contain 1 to 120 characters" }
        check(prefs.edit().putString("local-name", normalized).commit()) { "Unable to persist device name" }
    }
}
