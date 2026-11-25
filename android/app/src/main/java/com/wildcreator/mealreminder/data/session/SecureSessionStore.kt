package com.wildcreator.mealreminder.data.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * refresh token 的加密落盘（androidx.security.crypto）。
 *
 * 极端设备上 Keystore 可能不可用（少数定制 ROM / 恢复出厂后残留），
 * 此时降级为普通 SharedPreferences 而不是崩溃：可用性优先，风险写进日志。
 */
@Singleton
class SecureSessionStore @Inject constructor(
    @ApplicationContext context: Context,
) {

    private val prefs: SharedPreferences = createPrefs(context)

    private fun createPrefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (t: Throwable) {
            Log.e(TAG, "加密存储初始化失败，降级为普通 SharedPreferences", t)
            context.getSharedPreferences(FALLBACK_FILE_NAME, Context.MODE_PRIVATE)
        }
    }

    fun refreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun saveRefreshToken(token: String) {
        prefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_REFRESH_TOKEN).apply()
    }

    private companion object {
        const val TAG = "SecureSessionStore"
        const val FILE_NAME = "meal_reminder_secure"
        const val FALLBACK_FILE_NAME = "meal_reminder_secure_fallback"
        const val KEY_REFRESH_TOKEN = "refresh_token"
    }
}
