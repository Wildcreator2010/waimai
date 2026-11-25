package com.wildcreator.mealreminder.data.repository

import android.os.Build
import com.wildcreator.mealreminder.BuildConfig
import com.wildcreator.mealreminder.data.remote.ApiService
import com.wildcreator.mealreminder.data.remote.apiCall
import com.wildcreator.mealreminder.data.remote.dto.CreateDeviceRequest
import com.wildcreator.mealreminder.data.remote.dto.DeleteAccountRequest
import com.wildcreator.mealreminder.data.remote.dto.DeviceDto
import com.wildcreator.mealreminder.data.remote.dto.MeSettingsDto
import com.wildcreator.mealreminder.data.remote.dto.NtfyConfigDto
import com.wildcreator.mealreminder.data.remote.dto.PatchMeSettingsRequest
import com.wildcreator.mealreminder.data.remote.dto.PhoneCodeRequest
import com.wildcreator.mealreminder.data.remote.dto.PhoneVerifyRequest
import javax.inject.Inject
import javax.inject.Singleton

/** 当前用户的设置、手机号、ntfy topic、设备上报（docs/api.md §3）。 */
@Singleton
class MeRepository @Inject constructor(
    private val api: ApiService,
) {

    suspend fun settings(): MeSettingsDto = apiCall { api.meSettings() }

    /**
     * PATCH 之后回读一次设置：api.md 没有规定 PATCH 的响应体，
     * 以 GET 的结果为准最稳（也顺带拿到服务端可能做的规整）。
     */
    suspend fun patchSettings(
        showNotifyDetails: Boolean? = null,
        smsEnabled: Boolean? = null,
        ntfyEnabled: Boolean? = null,
    ): MeSettingsDto {
        apiCall {
            api.patchMeSettings(
                PatchMeSettingsRequest(
                    showNotifyDetails = showNotifyDetails,
                    smsEnabled = smsEnabled,
                    ntfyEnabled = ntfyEnabled,
                ),
            )
        }
        return apiCall { api.meSettings() }
    }

    suspend fun requestPhoneCode(phone: String, captchaId: String?, captchaAnswer: String?) {
        apiCall {
            api.requestPhoneCode(PhoneCodeRequest(phone.trim(), captchaId, captchaAnswer))
        }
    }

    suspend fun verifyPhone(phone: String, code: String) {
        apiCall { api.verifyPhone(PhoneVerifyRequest(phone.trim(), code.trim())) }
    }

    suspend fun unbindPhone() {
        apiCall { api.unbindPhone() }
    }

    /** 重置 topic 后回读设置，取服务端实际生效的新 topic。 */
    suspend fun rotateNtfyTopic(): MeSettingsDto {
        apiCall { api.rotateNtfyTopic() }
        return apiCall { api.meSettings() }
    }

    suspend fun ntfyConfig(): NtfyConfigDto = apiCall { api.ntfyConfig() }

    suspend fun devices(): List<DeviceDto> = apiCall { api.devices() }

    /** 注销账号（需密码确认；ROOT 会被服务端拒绝）。 */
    suspend fun deleteAccount(password: String) {
        apiCall { api.deleteAccount(DeleteAccountRequest(password)) }
    }

    suspend fun deleteDevice(id: String) {
        apiCall { api.deleteDevice(id) }
    }

    /**
     * 上报本机推送方式。FCM 时带 token；NTFY 时 fcmToken 必须为 null。
     * 同一 fcmToken 服务端幂等更新。
     */
    suspend fun registerDevice(pushMode: String, fcmToken: String?) {
        apiCall {
            api.registerDevice(
                CreateDeviceRequest(
                    name = deviceName(),
                    platform = "android",
                    pushMode = pushMode,
                    fcmToken = if (pushMode == "FCM") fcmToken else null,
                    appVersion = BuildConfig.VERSION_NAME,
                ),
            )
        }
    }

    private fun deviceName(): String {
        val manufacturer = Build.MANUFACTURER.orEmpty().trim()
        val model = Build.MODEL.orEmpty().trim()
        return when {
            manufacturer.isBlank() -> model.ifBlank { "Android" }
            model.startsWith(manufacturer, ignoreCase = true) -> model
            else -> "$manufacturer $model".trim()
        }.take(64)
    }
}
