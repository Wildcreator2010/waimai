package com.wildcreator.mealreminder.data.session

import android.content.Context
import android.content.SharedPreferences
import com.wildcreator.mealreminder.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * 服务器地址（消息源）。
 *
 * 开源后每个人部署到自己的域名，所以地址必须能在 App 里改，而不是编译期写死：
 * - 默认值来自 BuildConfig.API_BASE_URL（构建时可用 local.properties 的 API_BASE_URL 指定）
 * - 用户在设置页或登录页改成自己的地址后，落 SharedPreferences 并立即生效
 * - 所有请求由 [com.wildcreator.mealreminder.data.remote.BaseUrlInterceptor] 改写 host
 */
@Singleton
class ServerConfig @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Volatile
    private var cached: String = prefs.getString(KEY_BASE_URL, null) ?: defaultBaseUrl()

    /** 始终以 `/` 结尾，供 Retrofit 使用。 */
    fun baseUrl(): String = cached

    /** 给用户看的地址（去掉末尾斜杠）。 */
    fun displayUrl(): String = cached.trimEnd('/')

    fun isCustomized(): Boolean = prefs.getString(KEY_BASE_URL, null) != null

    /**
     * 保存用户填写的地址。
     * 只接受 http/https，且必须能解析出 host；自动补全协议与末尾斜杠。
     * @return 规范化后的地址
     */
    fun setBaseUrl(input: String): String {
        val normalized = normalize(input)
            ?: throw IllegalArgumentException("地址格式不正确，例如 https://meal.example.com")
        prefs.edit().putString(KEY_BASE_URL, normalized).apply()
        cached = normalized
        return normalized
    }

    /** 恢复成构建时的默认地址。 */
    fun reset() {
        prefs.edit().remove(KEY_BASE_URL).apply()
        cached = defaultBaseUrl()
    }

    /**
     * 探活：向候选地址请求 /api/health。
     * 用于「保存前先确认这个地址真的是本项目的服务端」，避免用户填错后连不上。
     */
    suspend fun probe(candidate: String): Boolean = withContext(Dispatchers.IO) {
        val normalized = normalize(candidate) ?: return@withContext false
        runCatching {
            val client = OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build()
            client.newCall(Request.Builder().url("${normalized}api/health").get().build())
                .execute()
                .use { response ->
                    response.isSuccessful && response.body?.string()?.contains("\"ok\"") == true
                }
        }.getOrDefault(false)
    }

    companion object {
        private const val PREFS_NAME = "server_config"
        private const val KEY_BASE_URL = "base_url"

        private fun defaultBaseUrl(): String = normalize(BuildConfig.API_BASE_URL)
            ?: "https://meal.example.com/"

        /** 补协议、校验、补末尾斜杠；解析失败返回 null。 */
        fun normalize(input: String): String? {
            val raw = input.trim()
            if (raw.isEmpty()) return null
            val withScheme = when {
                raw.startsWith("http://") || raw.startsWith("https://") -> raw
                // 只填了域名/IP 时默认 https
                else -> "https://$raw"
            }
            val url = withScheme.toHttpUrlOrNull() ?: return null
            if (url.host.isBlank()) return null
            return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
        }
    }
}
