package com.wildcreator.mealreminder.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wildcreator.mealreminder.data.remote.toUserMessage
import com.wildcreator.mealreminder.data.repository.AuthRepository
import com.wildcreator.mealreminder.data.session.ServerConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- 登录

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    /** 服务端还没引导过（没有 ROOT），提示去网页完成初始化。 */
    val needsBootstrap: Boolean = false,
    // 服务器地址（消息源）切换
    val serverUrl: String = "",
    val serverInput: String = "",
    val serverTesting: Boolean = false,
    val serverError: String? = null,
    val serverMessage: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val serverConfig: ServerConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        _state.update {
            it.copy(serverUrl = serverConfig.displayUrl(), serverInput = serverConfig.displayUrl())
        }
        // 只用于展示提示，失败无所谓
        viewModelScope.launch {
            val status = runCatching { authRepository.bootstrapStatus() }.getOrNull()
            if (status?.needsBootstrap == true) {
                _state.update { it.copy(needsBootstrap = true) }
            }
        }
    }

    fun onServerInputChange(value: String) =
        _state.update { it.copy(serverInput = value, serverError = null, serverMessage = null) }

    /** 切换服务器：先探活，成功才落盘（登录页此时还没有会话，不需要清理）。 */
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
                    it.copy(serverTesting = false, serverError = "无法连接：$normalized")
                }
                return@launch
            }
            serverConfig.setBaseUrl(normalized)
            _state.update {
                it.copy(
                    serverTesting = false,
                    serverUrl = serverConfig.displayUrl(),
                    serverInput = serverConfig.displayUrl(),
                    serverMessage = "已切换，请用该服务器上的账号登录",
                )
            }
            // 新服务器可能没引导过，重新查一次
            val status = runCatching { authRepository.bootstrapStatus() }.getOrNull()
            _state.update { it.copy(needsBootstrap = status?.needsBootstrap == true) }
        }
    }

    fun resetServer() {
        serverConfig.reset()
        _state.update {
            it.copy(
                serverUrl = serverConfig.displayUrl(),
                serverInput = serverConfig.displayUrl(),
                serverMessage = "已恢复默认地址",
                serverError = null,
            )
        }
    }

    fun onEmailChange(value: String) = _state.update { it.copy(email = value, error = null) }

    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }

    fun login() {
        val current = _state.value
        if (current.loading) return
        if (current.email.isBlank() || current.password.isBlank()) {
            _state.update { it.copy(error = "请输入邮箱和密码") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                authRepository.login(current.email, current.password)
                // 成功后会话状态变化，AppRoot 负责跳转；这里保持 loading 避免重复点击
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- 注册

data class RegisterUiState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val inviteCode: String = "",
    val acceptTerms: Boolean = false,
    val captchaId: String = "",
    val captchaQuestion: String = "",
    val captchaAnswer: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(RegisterUiState())
    val state: StateFlow<RegisterUiState> = _state.asStateFlow()

    init {
        refreshCaptcha()
    }

    /** 取一道人机验证题；提交失败后也应刷新（挑战一次性）。 */
    fun refreshCaptcha() {
        viewModelScope.launch {
            runCatching { authRepository.captchaChallenge("register") }.onSuccess { challenge ->
                _state.update {
                    it.copy(
                        captchaId = challenge.id,
                        captchaQuestion = challenge.question,
                        captchaAnswer = "",
                    )
                }
            }
        }
    }

    fun onEmailChange(value: String) = _state.update { it.copy(email = value, error = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }
    fun onConfirmPasswordChange(value: String) = _state.update { it.copy(confirmPassword = value, error = null) }
    fun onInviteCodeChange(value: String) = _state.update { it.copy(inviteCode = value, error = null) }
    fun onCaptchaAnswerChange(value: String) =
        _state.update { it.copy(captchaAnswer = value.filter { ch -> ch.isDigit() || ch == '-' }.take(6), error = null) }
    fun onAcceptTermsChange(value: Boolean) = _state.update { it.copy(acceptTerms = value, error = null) }

    /** 注册成功后回调邮箱，用于跳「验证邮件已发送」页。 */
    fun register(onSuccess: (String) -> Unit) {
        val current = _state.value
        if (current.loading) return

        val problem = validate(current)
        if (problem != null) {
            _state.update { it.copy(error = problem) }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                authRepository.register(
                    email = current.email,
                    password = current.password,
                    inviteCode = current.inviteCode,
                    acceptTerms = true,
                    captchaId = current.captchaId.ifBlank { null },
                    captchaAnswer = current.captchaAnswer.ifBlank { null },
                )
                onSuccess(current.email.trim())
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
                refreshCaptcha()
            }
        }
    }

    private fun validate(state: RegisterUiState): String? {
        if (state.email.isBlank()) return "请输入邮箱"
        if (!state.email.contains("@")) return "邮箱格式不正确"
        if (state.inviteCode.isBlank()) return "请输入邀请码"
        passwordProblem(state.password)?.let { return it }
        if (state.password != state.confirmPassword) return "两次输入的密码不一致"
        if (!state.acceptTerms) return "请先阅读并同意用户协议"
        if (state.captchaAnswer.isBlank()) return "请完成人机验证"
        return null
    }
}

// ---------------------------------------------------------------- 邮箱验证提示

data class VerifyEmailUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val cooldownSeconds: Int = 0,
    val token: String = "",
    val captchaId: String = "",
    val captchaQuestion: String = "",
    val captchaAnswer: String = "",
)

@HiltViewModel
class VerifyEmailViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(VerifyEmailUiState())
    val state: StateFlow<VerifyEmailUiState> = _state.asStateFlow()

    private var cooldownJob: Job? = null

    fun onTokenChange(value: String) = _state.update { it.copy(token = value, error = null) }

    fun refreshCaptcha() {
        viewModelScope.launch {
            runCatching { authRepository.captchaChallenge("resend") }.onSuccess { challenge ->
                _state.update {
                    it.copy(captchaId = challenge.id, captchaQuestion = challenge.question, captchaAnswer = "")
                }
            }
        }
    }

    fun onCaptchaAnswerChange(value: String) =
        _state.update { it.copy(captchaAnswer = value.filter { ch -> ch.isDigit() || ch == '-' }.take(6), error = null) }

    fun resend(email: String) {
        if (_state.value.loading || _state.value.cooldownSeconds > 0) return
        if (email.isBlank()) {
            _state.update { it.copy(error = "缺少邮箱地址，请返回重新注册") }
            return
        }
        if (_state.value.captchaAnswer.isBlank()) {
            _state.update { it.copy(error = "请先完成人机验证") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, info = null) }
            try {
                authRepository.resendVerification(
                    email = email,
                    captchaId = _state.value.captchaId.ifBlank { null },
                    captchaAnswer = _state.value.captchaAnswer.ifBlank { null },
                )
                _state.update { it.copy(loading = false, info = "验证邮件已重新发送，请查收（含垃圾箱）") }
                startCooldown()
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
                refreshCaptcha()
            }
        }
    }

    /** 手动粘贴邮件里的验证令牌，验证成功后可直接登录。 */
    fun submitToken(onSuccess: () -> Unit) {
        val token = _state.value.token.trim()
        if (token.isBlank()) {
            _state.update { it.copy(error = "请粘贴邮件中的验证令牌") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                authRepository.verifyEmail(token)
                _state.update { it.copy(loading = false, info = "邮箱验证成功，请登录") }
                onSuccess()
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    private fun startCooldown() {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            for (second in RESEND_COOLDOWN_SECONDS downTo 1) {
                _state.update { it.copy(cooldownSeconds = second) }
                delay(1_000)
            }
            _state.update { it.copy(cooldownSeconds = 0) }
        }
    }

    private companion object {
        const val RESEND_COOLDOWN_SECONDS = 60
    }
}

// ---------------------------------------------------------------- 忘记密码

data class ForgotPasswordUiState(
    val email: String = "",
    val captchaId: String = "",
    val captchaQuestion: String = "",
    val captchaAnswer: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ForgotPasswordUiState())
    val state: StateFlow<ForgotPasswordUiState> = _state.asStateFlow()

    init {
        refreshCaptcha()
    }

    fun refreshCaptcha() {
        viewModelScope.launch {
            runCatching { authRepository.captchaChallenge("forgot") }.onSuccess { challenge ->
                _state.update {
                    it.copy(captchaId = challenge.id, captchaQuestion = challenge.question, captchaAnswer = "")
                }
            }
        }
    }

    fun onEmailChange(value: String) = _state.update { it.copy(email = value, error = null) }
    fun onCaptchaAnswerChange(value: String) =
        _state.update { it.copy(captchaAnswer = value.filter { ch -> ch.isDigit() || ch == '-' }.take(6), error = null) }

    fun submit() {
        val current = _state.value
        val email = current.email.trim()
        if (email.isBlank() || !email.contains("@")) {
            _state.update { it.copy(error = "请输入正确的邮箱") }
            return
        }
        if (current.captchaAnswer.isBlank()) {
            _state.update { it.copy(error = "请完成人机验证") }
            return
        }
        if (current.loading) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, info = null) }
            try {
                authRepository.forgotPassword(
                    email = email,
                    captchaId = current.captchaId.ifBlank { null },
                    captchaAnswer = current.captchaAnswer.ifBlank { null },
                )
                // 服务端恒返回 202（防枚举），文案也保持一致
                _state.update { it.copy(loading = false, info = "如果该邮箱已注册，重置邮件已发送（1 小时内有效）") }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
                refreshCaptcha()
            }
        }
    }
}

/** 与服务端一致的最小密码强度校验：≥8 位且同时含字母与数字。 */
private fun passwordProblem(password: String): String? = when {
    password.length < 8 -> "密码至少 8 位"
    !password.any { it.isLetter() } || !password.any { it.isDigit() } -> "密码需同时包含字母和数字"
    else -> null
}
