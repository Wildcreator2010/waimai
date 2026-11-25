package com.wildcreator.mealreminder.data.remote.dto

import kotlinx.serialization.Serializable

/** 统一错误体：`{ code, message, details }`（docs/api.md §0.1）。 */
@Serializable
data class ErrorBodyDto(
    val code: String = "",
    val message: String = "",
    val details: String? = null,
)

/** 统一分页体：`{ items, page, pageSize, total }`（docs/api.md §0.2）。 */
@Serializable
data class PageDto<T>(
    val items: List<T> = emptyList(),
    val page: Int = 1,
    val pageSize: Int = 20,
    val total: Int = 0,
)

/** 创建任务时服务端附带的告警（不阻断创建）。 */
@Serializable
data class WarningDto(
    val code: String = "",
    val message: String = "",
)

/** GET /api/bootstrap/status */
@Serializable
data class BootstrapStatusDto(
    val needsBootstrap: Boolean = false,
)

/** GET /api/health */
@Serializable
data class HealthDto(
    val status: String = "",
    val db: String = "",
    val uptimeSec: Long = 0,
    val version: String = "",
)

/** 用户对象（docs/api.md §0.3）。phone 永远掩码。 */
@Serializable
data class UserDto(
    val id: String = "",
    val email: String = "",
    val role: String = "USER",
    val status: String = "ACTIVE",
    val displayName: String = "",
    val emailVerifiedAt: String? = null,
    val phone: String? = null,
    val phoneVerified: Boolean = false,
    val showNotifyDetails: Boolean = true,
    val smsEnabled: Boolean = true,
    val ntfyEnabled: Boolean = false,
    val ntfyTopic: String? = null,
    val createdAt: String? = null,
    val lastLoginAt: String? = null,
) {
    val isRoot: Boolean get() = role.equals("ROOT", ignoreCase = true)
    val isAdmin: Boolean get() = isRoot || role.equals("ADMIN", ignoreCase = true)
}

/** 登录请求/响应。 */
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class LoginResponse(
    val accessToken: String = "",
    val expiresIn: Long = 0,
    val refreshToken: String = "",
    val user: UserDto = UserDto(),
)

/** refresh 的响应：只有新令牌对，没有 user。 */
@Serializable
data class TokenPairDto(
    val accessToken: String = "",
    val expiresIn: Long = 0,
    val refreshToken: String = "",
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val inviteCode: String,
    /** 必须为 true：用户协议同意 */
    val acceptTerms: Boolean = true,
    val captchaId: String? = null,
    val captchaAnswer: String? = null,
)

/** GET /api/captcha/challenge 返回的挑战。 */
@Serializable
data class CaptchaChallengeDto(
    val id: String = "",
    val question: String = "",
    val provider: String = "builtin",
    val expiresInSec: Int = 0,
)

@Serializable
data class VerifyEmailRequest(
    val token: String,
)

@Serializable
data class ResendVerificationRequest(
    val email: String,
    val captchaId: String? = null,
    val captchaAnswer: String? = null,
)

@Serializable
data class ForgotPasswordRequest(
    val email: String,
    val captchaId: String? = null,
    val captchaAnswer: String? = null,
)

@Serializable
data class ResetPasswordRequest(
    val token: String,
    val newPassword: String,
)

@Serializable
data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String,
)

/** 设备上报（POST /api/me/devices）。 */
@Serializable
data class CreateDeviceRequest(
    val name: String,
    val platform: String = "android",
    val pushMode: String,
    val fcmToken: String? = null,
    val appVersion: String = "",
)

@Serializable
data class DeviceDto(
    val id: String = "",
    val userId: String? = null,
    val name: String = "",
    val platform: String = "android",
    val pushMode: String = "NTFY",
    val fcmToken: String? = null,
    val appVersion: String = "",
    val createdAt: String? = null,
    val lastSeenAt: String? = null,
)
