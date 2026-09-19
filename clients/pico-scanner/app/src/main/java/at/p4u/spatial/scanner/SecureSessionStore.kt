package at.p4u.spatial.scanner

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class StoredSession(val refreshToken: String, val refreshExpiresAt: String)

class SecureSessionStore(
    context: Context,
    profileId: String,
) {
    private val prefs = context.getSharedPreferences("p4u-secure-session-$profileId", Context.MODE_PRIVATE)
    private val alias = "p4u-spatial-refresh-token-$profileId"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    fun save(token: String, expiresAt: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        check(
            prefs.edit()
                .putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("expires", expiresAt)
                .commit(),
        )
    }

    fun read(): StoredSession? {
        val token = prefs.getString("token", null) ?: return null
        val iv = prefs.getString("iv", null) ?: return null
        val expires = prefs.getString("expires", null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        return StoredSession(
            cipher.doFinal(Base64.decode(token, Base64.NO_WRAP)).toString(Charsets.UTF_8),
            expires,
        )
    }

    fun clear() {
        prefs.edit().clear().commit()
    }
}
