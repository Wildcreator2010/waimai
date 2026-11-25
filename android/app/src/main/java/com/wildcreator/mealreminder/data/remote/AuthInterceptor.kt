package com.wildcreator.mealreminder.data.remote

import com.wildcreator.mealreminder.data.session.SessionManager
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.Interceptor
import okhttp3.Response

/**
 * 给每个请求注入 `Authorization: Bearer <access>`。
 * 已显式带 Authorization 的请求（例如手动测试）不覆盖。
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val session: SessionManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = session.currentAccessToken()
        val request = if (!token.isNullOrBlank() && original.header(HEADER_AUTH) == null) {
            original.newBuilder().header(HEADER_AUTH, "Bearer $token").build()
        } else {
            original
        }
        return chain.proceed(request)
    }

    companion object {
        const val HEADER_AUTH = "Authorization"
        const val BEARER_PREFIX = "Bearer "
    }
}
