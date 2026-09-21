package at.p4u.picovr.ui.hud

import android.content.Context

// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — peripheral HUD scale is a persisted presentation preference, not feature/runtime state.
class HudSettingsStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        "p4u-hud-settings",
        Context.MODE_PRIVATE,
    )

    fun load(): HudSettings =
        HudSettings(
            peripheralHudScalePercent = preferences.getInt(
                KEY_SCALE_PERCENT,
                HudSettings.DEFAULT_SCALE_PERCENT,
            ),
        ).normalized()

    fun save(settings: HudSettings): HudSettings {
        val normalized = settings.normalized()
        preferences.edit()
            .putInt(KEY_SCALE_PERCENT, normalized.peripheralHudScalePercent)
            .apply()
        return normalized
    }

    private fun HudSettings.normalized(): HudSettings =
        copy(peripheralHudScalePercent = normalizedPeripheralHudScalePercent)

    companion object {
        private const val KEY_SCALE_PERCENT = "peripheralHudScalePercent"
    }
}
