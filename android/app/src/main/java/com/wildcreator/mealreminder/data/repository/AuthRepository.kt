package com.wildcreator.mealreminder.data.repository

import com.wildcreator.mealreminder.data.remote.ApiException
import com.wildcreator.mealreminder.data.remote.ApiService
import com.wildcreator.mealreminder.data.remote.apiCall
import com.wildcreator.mealreminder.data.remote.dto.BootstrapStatusDto
import com.wildcreator.mealreminder.data.remote.dto.CaptchaChallengeDto
import com.wildcreator.mealreminder.data.remote.dto.ChangePasswordRequest
import com.wildcreator.mealreminder.data.remote.dto.ForgotPasswordRequest
import com.wildcreator.mealreminder.data.remote.dto.LoginRequest
import com.wildcreator.mealreminder.data.remote.dto.RefreshRequest
import com.wildcreator.mealreminder.data.remote.dto.RegisterRequest
import com.wildcreator.mealreminder.data.remote.dto.ResendVerificationRequest
import com.wildcreator.mealreminder.data.remote.dto.ResetPasswordRequest
import com.wildcreator.mealreminder.data.remote.dto.UserDto
import com.wildcreator.mealreminder.data.remote.dto.VerifyEmailRequest
import com.wildcreator.mealreminder.data.session.SessionManager
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 认证与会话编排。
 *
 * 冷启动顺序（docs/api.md §7）：本地有 refresh → /auth/refresh → /auth/me。
 * bootstrap/status 只用来判断「服务端是否还没初始化」，不阻断登录。
 */
@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val session: SessionManager,
) {

    suspend fun bootstrapStatus(): BootstrapStatusDto = apiCall { api.bootstrapStatus() }

    suspend fun login(email: String, password: String): UserDto {
        val response = apiCall { api.login(LoginRequest(email = email.trim(), password = password)) }
        session.saveLogin(response)
        return response.user
    }

    suspend fun captchaChallenge(purpose: String): CaptchaChallengeDto =
        apiCall { api.captchaChallenge(purpose) }

    suspend fun register(
        email: String,
        password: String,
        inviteCode: String,
        acceptTerms: Boolean,
        captchaId: String?,
        captchaAnswer: String?,
    ) {
        apiCall {
            api.register(
                RegisterRequest(
                    email = email.trim(),
                    password = password,
                    inviteCode = inviteCode.trim(),
                    acceptTerms = acceptTerms,
                    captchaId = captchaId,
                    captchaAnswer = captchaAnswer,
                ),
            )
        }
    }

    suspend fun verifyEmail(token: String) {
        apiCall { api.verifyEmail(VerifyEmailRequest(token.trim())) }
    }

    suspend fun resendVerification(email: String, captchaId: String?, captchaAnswer: String?) {
        apiCall {
            api.resendVerification(
                ResendVerificationRequest(email.trim(), captchaId, captchaAnswer),
            )
        }
    }

    suspend fun forgotPassword(email: String, captchaId: String?, captchaAnswer: String?) {
        apiCall {
            api.forgotPassword(ForgotPasswordRequest(email.trim(), captchaId, captchaAnswer))
        }
    }

    suspend fun resetPassword(token: String, newPassword: String) {
        apiCall { api.resetPassword(ResetPasswordRequest(token.trim(), newPassword)) }
    }

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        apiCall { api.changePassword(ChangePasswordRequest(currentPassword, newPassword)) }
    }

    suspend fun me(): UserDto {
        val user = apiCall { api.me() }
        session.updateUser(user)
        return user
    }

    /**
     * 冷启动恢复会话。返回 null 表示没有可用会话（未登录）。
     *
     * 失败处理有区别：
     *  - 401（refresh 无效/过期/被撤销）→ 清掉本地令牌，必须重新登录
     *  - 网络异常 → 只置为未登录，保留 refresh token，下次有网再恢复
     */
    suspend fun restoreSession(): UserDto? {
        val refreshToken = session.refreshToken()
        if (refreshToken.isNullOrBlank()) {
            session.markRestored(null)
            return null
        }
        return try {
            val pair = apiCall { api.refresh(RefreshRequest(refreshToken)) }
            if (pair.accessToken.isBlank()) {
                session.markRestored(null)
                return null
            }
            session.updateTokens(pair.accessToken, pair.refreshToken)
            val user = apiCall { api.me() }
            session.updateUser(user)
            user
        } catch (t: Throwable) {
            if (t is ApiException && t.httpStatus == 401) {
                session.markLoggedOut()
            } else {
                // 断网/服务端 5xx：不清令牌，等下次冷启动重试
                session.markRestored(null)
            }
            null
        }
    }

    /** 主动登出：尽力撤销服务端 refresh session，本地一定清空。 */
    suspend fun logout() {
        runCatching { api.logout() }
        session.clear()
    }
}
