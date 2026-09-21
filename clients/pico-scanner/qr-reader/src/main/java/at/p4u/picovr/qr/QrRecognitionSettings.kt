package at.p4u.picovr.qr

import android.content.Context

class QrRecognitionSettings(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isEnabled(): Boolean = prefs.getBoolean(PREF_RECOGNITION_ENABLED, true)

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(PREF_RECOGNITION_ENABLED, enabled).apply()
    }

    companion object {
        private const val PREFS_NAME = "p4u-qr-reader"
        private const val PREF_RECOGNITION_ENABLED = "qr-recognition-enabled"
    }
}
