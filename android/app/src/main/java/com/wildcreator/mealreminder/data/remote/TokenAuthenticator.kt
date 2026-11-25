package com.wildcreator.mealreminder.data.remote

import android.util.Log
import com.wildcreator.mealreminder.data.remote.dto.RefreshRequest
import com.wildcreator.mealreminder.data.session.SessionManager
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * 401 处理（docs/api.md §7）：用 refresh token 换新令牌并重放原请求一次。
 *
 * - 刷新走独立的 [RefreshApi]（无 Authorization、无 Authenticator），避免自我递归。
 * - 并发安全：多个请求同时 401 时只刷新一次，其余线程复用新令牌。
 * - 刷新失败：清会话并广播 [com.wildcreator.mealreminder.data.session.SessionEvent.Expired]，UI 跳登录。
 *
 * 注意：Authenticator 运行在 OkHttp 的工作线程上，这里用 runBlocking 把挂起调用转成同步；
 * 这是 OkHttp Authenticator 的接口约束（必须是阻塞式）。
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val session: SessionManager,
    private val refreshApi: RefreshApi,
) : Authenticator {

    private val refreshLock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        // 原请求没带 Authorization（如登录、刷新本身），不处理
        val failedHeader = response.request.header(AuthInterceptor.HEADER_AUTH) ?: return null
        // 已经重试过一次仍 401，不再循环
        if (responseCount(response) >= 2) {
            session.onSessionExpired()
            return null
        }

        synchronized(refreshLock) {
            val current = session.currentAccessToken()
            val failedToken = failedHeader.removePrefix(AuthInterceptor.BEARER_PREFIX).trim()

            // 别的线程已经刷新成功，直接复用
            if (!current.isNullOrBlank() && current != failedToken) {
                return response.request.newBuilder()
                    .header(AuthInterceptor.HEADER_AUTH, "Bearer $current")
                    .build()
            }

            val refreshToken = session.refreshToken()
            if (refreshToken.isNullOrBlank()) {
                session.onSessionExpired()
                return null
            }

            val pair = try {
                runBlocking { refreshApi.refresh(RefreshRequest(refreshToken)) }
            } catch (t: Throwable) {
                Log.w(TAG, "刷新令牌失败，清除会话", t)
                null
            }

            if (pair == null || pair.accessToken.isBlank()) {
                session.onSessionExpired()
                return null
            }

            session.updateTokens(pair.accessToken, pair.refreshToken)
            return response.request.newBuilder()
                .header(AuthInterceptor.HEADER_AUTH, "Bearer ${pair.accessToken}")
                .build()
        }
    }

    /** OkHttp 的 priorResponse 链长度，用来限制重试次数。 */
    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }

    private companion object {
        const val TAG = "TokenAuthenticator"
    }
}
