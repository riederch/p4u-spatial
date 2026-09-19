package at.p4u.spatial.scanner

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class BridgeProfile(
    val profileId: String,
    val name: String,
    val globalName: String? = null,
    val baseUrl: String,
    val updateChannel: String = "stable",
)

class BridgeProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("p4u-bridge-profiles", Context.MODE_PRIVATE)

    fun list(): List<BridgeProfile> {
        val raw = prefs.getString("profiles", "[]") ?: "[]"
        val array = JSONArray(raw)
        return buildList {
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                add(
                    BridgeProfile(
                        profileId = item.getString("profileId"),
                        name = item.getString("name"),
                        globalName = item.optString("globalName").takeIf { it.isNotBlank() },
                        baseUrl = normalize(item.getString("baseUrl")),
                        updateChannel = item.optString("updateChannel", "stable"),
                    ),
                )
            }
        }
    }

    fun active(): BridgeProfile? {
        val activeId = prefs.getString("active-profile-id", null) ?: return list().firstOrNull()
        return list().firstOrNull { it.profileId == activeId } ?: list().firstOrNull()
    }

    fun setActive(profileId: String) {
        require(list().any { it.profileId == profileId }) { "Unknown bridge profile" }
        check(prefs.edit().putString("active-profile-id", profileId).commit())
    }

    fun upsert(profileId: String? = null, name: String, baseUrl: String, updateChannel: String = "stable", globalName: String? = null): BridgeProfile {
        require(updateChannel == "stable" || updateChannel == "beta")
        val normalizedUrl = normalize(baseUrl)
        require(normalizedUrl.startsWith("https://") || normalizedUrl.startsWith("http://")) { "Bridge URL must use HTTP(S)" }
        val profile = BridgeProfile(
            profileId = profileId ?: UUID.randomUUID().toString(),
            name = name.ifBlank { globalName ?: normalizedUrl },
            globalName = globalName,
            baseUrl = normalizedUrl,
            updateChannel = updateChannel,
        )
        val profiles = list().toMutableList()
        val index = profiles.indexOfFirst { it.profileId == profile.profileId }
        if (index >= 0) profiles[index] = profile else profiles.add(profile)
        persist(profiles)
        if (active() == null || prefs.getString("active-profile-id", null) == null) setActive(profile.profileId)
        return profile
    }

    fun setGlobalName(profileId: String, globalName: String): BridgeProfile {
        val current = list().firstOrNull { it.profileId == profileId } ?: error("Unknown bridge profile")
        return upsert(current.profileId, current.name, current.baseUrl, current.updateChannel, globalName.trim().takeIf { it.isNotEmpty() })
    }

    fun remove(profileId: String): Boolean {
        val profiles = list().toMutableList()
        val removed = profiles.removeAll { it.profileId == profileId }
        if (!removed) return false
        persist(profiles)
        if (prefs.getString("active-profile-id", null) == profileId) {
            prefs.edit().remove("active-profile-id").commit()
            profiles.firstOrNull()?.let { setActive(it.profileId) }
        }
        return true
    }

    private fun persist(profiles: List<BridgeProfile>) {
        val array = JSONArray()
        profiles.forEach { profile ->
            array.put(
                JSONObject()
                    .put("profileId", profile.profileId)
                    .put("name", profile.name)
                    .put("globalName", profile.globalName)
                    .put("baseUrl", profile.baseUrl)
                    .put("updateChannel", profile.updateChannel),
            )
        }
        check(prefs.edit().putString("profiles", array.toString()).commit()) { "Unable to persist bridge profiles" }
    }

    private fun normalize(value: String): String = value.trim().trimEnd('/')
}
