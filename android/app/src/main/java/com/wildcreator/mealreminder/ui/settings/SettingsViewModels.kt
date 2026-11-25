package com.wildcreator.mealreminder.ui.settings

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wildcreator.mealreminder.BuildConfig
import com.wildcreator.mealreminder.data.remote.dto.DeviceDto
import com.wildcreator.mealreminder.data.remote.dto.MeSettingsDto
import com.wildcreator.mealreminder.data.remote.toUserMessage
import com.wildcreator.mealreminder.data.repository.AuthRepository
import com.wildcreator.mealreminder.data.repository.MeRepository
import com.wildcreator.mealreminder.data.session.ServerConfig
import com.wildcreator.mealreminder.data.session.SessionManager
import com.wildcreator.mealreminder.push.FirebaseInitializer
import com.wildcreator.mealreminder.push.PushRegistrar
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- 设置

data class SettingsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val settings: MeSettingsDto? = null,
    val devices: List<DeviceDto> = emptyList(),
    val saving: Boolean = false,
    val info: String? = null,
    // 修改密码
    val pwCurrent: String = "",
    val pwNew: String = "",
    val pwConfirm: String = "",
    val changing: Boolean = false,
    val pwMessage: String? = null,
    val pwError: String? = null,
    // 注销账号
    val deletePassword: String = "",
    val deleting: Boolean = false,
    val deleteError: String? = null,
    val deleted: Boolean = false,
    // 服务器地址（消息源）
    val serverUrl: String = "",
    val serverInput: String = "",
    val serverTesting: Boolean = false,
    val serverMessage: String? = null,
    val serverError: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val meRepository: MeRepository,
    private val authRepository: AuthRepository,
    private val sessionManager: SessionManager,
    private val pushRegistrar: PushRegistrar,
    private val firebaseInitializer: FirebaseInitializer,
    private val serverConfig: ServerConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsUiState(loading = true))
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        _state.update {
            it.copy(serverUrl = serverConfig.displayUrl(), serverInput = serverConfig.displayUrl())
        }
    }

    // ---------------------------------------------------------------- 服务器地址

    /** 供界面拼链接（如用户协议页）。 */
    fun serverBaseUrl(): String = serverConfig.displayUrl()

    fun onServerInputChange(value: String) =
        _state.update { it.copy(serverInput = value, serverError = null, serverMessage = null) }

    /**
     * 保存前先探活：向候选地址请求 /api/health，成功才落盘。
     * 切换后本地会话立即失效（令牌属于旧服务器）。
     */
    fun saveServer() {
        val current = _state.value
        if (current.serverTesting) return

        val normalized = ServerConfig.normalize(current.serverInput)
        if (normalized == null) {
            _state.update { it.copy(serverError = "地址格式不正确，例如 https://meal.example.com") }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(serverTesting = true, serverError = null, serverMessage = null) }
            val ok = serverConfig.probe(normalized)

            if (!ok) {
                _state.update {
                    it.copy(serverTesting = false, serverError = "无法连接：$normalized（请确认地址与网络）")
                }
                return@launch
            }

            serverConfig.setBaseUrl(normalized)
            sessionManager.clear()
            _state.update {
                it.copy(
                    serverTesting = false,
                    serverUrl = serverConfig.displayUrl(),
                    serverInput = serverConfig.displayUrl(),
                    serverMessage = "已切换到该服务器，请重新登录",
                )
            }
        }
    }

    fun resetServer() {
        serverConfig.reset()
        sessionManager.clear()
        _state.update {
            it.copy(
                serverUrl = serverConfig.displayUrl(),
                serverInput = serverConfig.displayUrl(),
                serverMessage = "已恢复默认地址，请重新登录",
                serverError = null,
            )
        }
    }

    /** 当前登录用户，供账号信息展示。 */
    val user = sessionManager.user

    /** 本机推送通道文案（设备信息用）。 */
    val pushChannelLabel: String =
        if (pushRegistrar.isGmsAvailable() && firebaseInitializer.isConfigured) "FCM（Google 推送）" else "NTFY（长连接）"

    val deviceSummary: String = buildString {
        append(Build.MANUFACTURER.orEmpty().trim())
        append(' ')
        append(Build.MODEL.orEmpty().trim())
    }.trim()

    val osSummary: String = "Android ${Build.VERSION.RELEASE}（API ${Build.VERSION.SDK_INT}）"

    val appVersion: String = BuildConfig.VERSION_NAME

    val serverUrl: String = BuildConfig.API_BASE_URL

    init {
        load()
    }

    // ---------------------------------------------------------------- 修改密码

    fun onPwCurrentChange(value: String) =
        _state.update { it.copy(pwCurrent = value, pwError = null, pwMessage = null) }

    fun onPwNewChange(value: String) =
        _state.update { it.copy(pwNew = value, pwError = null, pwMessage = null) }

    fun onPwConfirmChange(value: String) =
        _state.update { it.copy(pwConfirm = value, pwError = null, pwMessage = null) }

    fun changePassword() {
        val current = _state.value
        if (current.changing) return
        if (current.pwCurrent.isBlank()) {
            _state.update { it.copy(pwError = "请输入当前密码") }
            return
        }
        if (current.pwNew.length < 8) {
            _state.update { it.copy(pwError = "新密码至少 8 位") }
            return
        }
        if (current.pwNew != current.pwConfirm) {
            _state.update { it.copy(pwError = "两次输入的新密码不一致") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(changing = true, pwError = null, pwMessage = null) }
            try {
                authRepository.changePassword(current.pwCurrent, current.pwNew)
                _state.update {
                    it.copy(
                        changing = false,
                        pwCurrent = "",
                        pwNew = "",
                        pwConfirm = "",
                        pwMessage = "密码已修改，其他设备已被登出",
                    )
                }
            } catch (t: Throwable) {
                _state.update { it.copy(changing = false, pwError = t.toUserMessage()) }
            }
        }
    }

    fun onDeletePasswordChange(value: String) =
        _state.update { it.copy(deletePassword = value, deleteError = null) }

    /** 注销账号：成功后清本地会话，App 会自动回到登录页。 */
    fun deleteAccount() {
        val current = _state.value
        if (current.deleting) return
        if (current.deletePassword.isBlank()) {
            _state.update { it.copy(deleteError = "请输入密码以确认注销") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(deleting = true, deleteError = null) }
            try {
                meRepository.deleteAccount(current.deletePassword)
                sessionManager.clear()
                _state.update { it.copy(deleting = false, deleted = true, deletePassword = "") }
            } catch (t: Throwable) {
                _state.update { it.copy(deleting = false, deleteError = t.toUserMessage()) }
            }
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.settings == null, error = null) }
            try {
                val settings = meRepository.settings()
                val devices = runCatching { meRepository.devices() }.getOrDefault(emptyList())
                _state.update { it.copy(loading = false, settings = settings, devices = devices) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun setShowNotifyDetails(enabled: Boolean) = patch(showNotifyDetails = enabled)

    fun setSmsEnabled(enabled: Boolean) = patch(smsEnabled = enabled)

    fun setNtfyEnabled(enabled: Boolean) {
        patch(
            ntfyEnabled = enabled,
            after = {
                // 开关变化后重新决定长连接是否运行
                viewModelScope.launch { pushRegistrar.syncPushMode() }
            },
        )
    }

    /** 重置 ntfy topic：旧 topic 立即作废，服务端不再 publish。 */
    fun rotateNtfyTopic() {
        if (_state.value.saving) return
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null, info = null) }
            try {
                val updated = meRepository.rotateNtfyTopic()
                _state.update {
                    it.copy(
                        saving = false,
                        info = "ntfy topic 已重置，旧 topic 立即失效",
                        settings = updated,
                    )
                }
                pushRegistrar.syncPushMode()
            } catch (t: Throwable) {
                _state.update { it.copy(saving = false, error = t.toUserMessage()) }
            }
        }
    }

    private fun patch(
        showNotifyDetails: Boolean? = null,
        smsEnabled: Boolean? = null,
        ntfyEnabled: Boolean? = null,
        after: (() -> Unit)? = null,
    ) {
        if (_state.value.saving) return
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null, info = null) }
            try {
                val updated = meRepository.patchSettings(
                    showNotifyDetails = showNotifyDetails,
                    smsEnabled = smsEnabled,
                    ntfyEnabled = ntfyEnabled,
                )
                _state.update { it.copy(saving = false, settings = updated) }
                after?.invoke()
            } catch (t: Throwable) {
                _state.update { it.copy(saving = false, error = t.toUserMessage()) }
                // 失败时回读一次真实状态，避免开关显示与服务端不一致
                load()
            }
        }
    }

    fun currentRoleLabel(): String = sessionManager.currentUser()?.role.orEmpty()
}

// ---------------------------------------------------------------- 手机号绑定

data class PhoneBindUiState(
    val phoneInput: String = "",
    val codeInput: String = "",
    val captchaId: String = "",
    val captchaQuestion: String = "",
    val captchaAnswer: String = "",
    val sending: Boolean = false,
    val verifying: Boolean = false,
    val unbinding: Boolean = false,
    val cooldownSeconds: Int = 0,
    val error: String? = null,
    val info: String? = null,
    val boundPhone: String? = null,
    val bound: Boolean = false,
)

@HiltViewModel
class PhoneBindViewModel @Inject constructor(
    private val meRepository: MeRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(PhoneBindUiState())
    val state: StateFlow<PhoneBindUiState> = _state.asStateFlow()

    private var cooldownJob: Job? = null

    init {
        viewModelScope.launch {
            runCatching { meRepository.settings() }.getOrNull()?.let { settings ->
                _state.update {
                    it.copy(
                        boundPhone = settings.phone,
                        bound = settings.phoneVerified,
                    )
                }
            }
        }
        refreshCaptcha()
    }

    /** 人机验证：发短信前必须先过这一关。 */
    fun refreshCaptcha() {
        viewModelScope.launch {
            runCatching { authRepository.captchaChallenge("phone") }.onSuccess { challenge ->
                _state.update {
                    it.copy(captchaId = challenge.id, captchaQuestion = challenge.question, captchaAnswer = "")
                }
            }
        }
    }

    fun onCaptchaAnswerChange(value: String) =
        _state.update { it.copy(captchaAnswer = value.filter { ch -> ch.isDigit() || ch == '-' }.take(6), error = null) }

    fun onPhoneChange(value: String) =
        _state.update { it.copy(phoneInput = value.filter { ch -> ch.isDigit() }.take(11), error = null) }

    fun onCodeChange(value: String) =
        _state.update { it.copy(codeInput = value.filter { ch -> ch.isDigit() }.take(6), error = null) }

    fun sendCode() {
        val phone = _state.value.phoneInput
        if (_state.value.sending || _state.value.cooldownSeconds > 0) return
        if (!isPhoneValid(phone)) {
            _state.update { it.copy(error = "请输入 11 位手机号") }
            return
        }
        if (_state.value.captchaAnswer.isBlank()) {
            _state.update { it.copy(error = "请先完成人机验证") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(sending = true, error = null, info = null) }
            try {
                meRepository.requestPhoneCode(
                    phone = phone,
                    captchaId = _state.value.captchaId.ifBlank { null },
                    captchaAnswer = _state.value.captchaAnswer.ifBlank { null },
                )
                _state.update { it.copy(sending = false, info = "验证码已发送，5 分钟内有效") }
                startCooldown()
            } catch (t: Throwable) {
                _state.update { it.copy(sending = false, error = t.toUserMessage()) }
                refreshCaptcha()
            }
        }
    }

    fun verify() {
        val current = _state.value
        if (current.verifying) return
        if (!isPhoneValid(current.phoneInput)) {
            _state.update { it.copy(error = "请输入 11 位手机号") }
            return
        }
        if (current.codeInput.length < 4) {
            _state.update { it.copy(error = "请输入短信验证码") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(verifying = true, error = null, info = null) }
            try {
                meRepository.verifyPhone(current.phoneInput, current.codeInput)
                runCatching { authRepository.me() }
                val settings = runCatching { meRepository.settings() }.getOrNull()
                _state.update {
                    it.copy(
                        verifying = false,
                        info = "手机号绑定成功",
                        bound = true,
                        boundPhone = settings?.phone ?: maskPhone(current.phoneInput),
                        codeInput = "",
                    )
                }
            } catch (t: Throwable) {
                _state.update { it.copy(verifying = false, error = t.toUserMessage()) }
            }
        }
    }

    fun unbind() {
        if (_state.value.unbinding) return
        viewModelScope.launch {
            _state.update { it.copy(unbinding = true, error = null, info = null) }
            try {
                meRepository.unbindPhone()
                runCatching { authRepository.me() }
                _state.update {
                    it.copy(
                        unbinding = false,
                        info = "已解绑手机号，之后不再发送短信提醒",
                        bound = false,
                        boundPhone = null,
                    )
                }
            } catch (t: Throwable) {
                _state.update { it.copy(unbinding = false, error = t.toUserMessage()) }
            }
        }
    }

    private fun startCooldown() {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            for (second in SEND_COOLDOWN_SECONDS downTo 1) {
                _state.update { it.copy(cooldownSeconds = second) }
                delay(1_000)
            }
            _state.update { it.copy(cooldownSeconds = 0) }
        }
    }

    private fun isPhoneValid(phone: String): Boolean = phone.length == 11 && phone.all { it.isDigit() }

    private fun maskPhone(phone: String): String =
        if (phone.length == 11) "${phone.take(3)}****${phone.takeLast(4)}" else phone

    private companion object {
        const val SEND_COOLDOWN_SECONDS = 60
    }
}
