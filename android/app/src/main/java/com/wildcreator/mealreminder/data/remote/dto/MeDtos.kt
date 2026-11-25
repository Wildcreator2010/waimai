package com.wildcreator.mealreminder.data.remote.dto

import kotlinx.serialization.Serializable

/** GET /api/me/settings（docs/api.md §3）。 */
@Serializable
data class MeSettingsDto(
    val showNotifyDetails: Boolean = true,
    val smsEnabled: Boolean = true,
    val ntfyEnabled: Boolean = false,
    val phone: String? = null,
    val phoneVerified: Boolean = false,
    val ntfyTopic: String? = null,
    val ntfyServerUrl: String? = null,
    val smsAvailable: Boolean = true,
    /** 建任务表单预填：默认柜机编号 */
    val defaultCabCode: String? = null,
    /** 建任务表单预填：默认监控时长（分钟） */
    val defaultDurationMin: Int? = null,
    /** 监控时长上限（分钟） */
    val maxDurationMin: Int? = null,
)

/** PATCH /api/me/settings —— 只发送用户实际改动的字段。 */
@Serializable
data class PatchMeSettingsRequest(
    val showNotifyDetails: Boolean? = null,
    val smsEnabled: Boolean? = null,
    val ntfyEnabled: Boolean? = null,
)

@Serializable
data class PhoneCodeRequest(
    val phone: String,
    val captchaId: String? = null,
    val captchaAnswer: String? = null,
)

@Serializable
data class PhoneVerifyRequest(
    val phone: String,
    val code: String,
)

@Serializable
data class DeleteAccountRequest(
    val password: String,
)

/** GET /api/me/ntfy/config —— App 主动连接所需配置。 */
@Serializable
data class NtfyConfigDto(
    val serverUrl: String = "",
    val topic: String = "",
    val token: String? = null,
)

/** POST /api/me/ntfy/rotate 的返回：只有新 topic。 */
@Serializable
data class NtfyTopicDto(
    val topic: String = "",
)
