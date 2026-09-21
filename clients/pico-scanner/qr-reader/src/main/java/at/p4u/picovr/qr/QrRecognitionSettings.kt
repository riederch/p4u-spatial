package at.p4u.picovr.qr

import android.content.Context
import android.content.SharedPreferences

class QrRecognitionSettings(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isEnabled(): Boolean = prefs.getBoolean(PREF_RECOGNITION_ENABLED, true)

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(PREF_RECOGNITION_ENABLED, enabled).apply()
    }

    fun observe(listener: (Boolean) -> Unit): AutoCloseable {
        val sharedPreferenceListener =
            SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == PREF_RECOGNITION_ENABLED) {
                    listener(isEnabled())
                }
            }
        prefs.registerOnSharedPreferenceChangeListener(sharedPreferenceListener)
        listener(isEnabled())
        return AutoCloseable {
            prefs.unregisterOnSharedPreferenceChangeListener(sharedPreferenceListener)
        }
    }

    companion object {
        private const val PREFS_NAME = "p4u-qr-reader"
        private const val PREF_RECOGNITION_ENABLED = "qr-recognition-enabled"
    }
}
