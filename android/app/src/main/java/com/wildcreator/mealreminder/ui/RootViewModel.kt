package com.wildcreator.mealreminder.ui

import android.content.Context
import com.wildcreator.mealreminder.data.local.ProcessFlagStore
import com.wildcreator.mealreminder.data.remote.dto.UserDto
import com.wildcreator.mealreminder.data.repository.AuthRepository
import com.wildcreator.mealreminder.data.session.SessionEvent
import com.wildcreator.mealreminder.data.session.SessionManager
import com.wildcreator.mealreminder.data.session.SessionState
import com.wildcreator.mealreminder.push.NtfyForegroundService
import com.wildcreator.mealreminder.push.PushRegistrar
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope

/**
 * 根 ViewModel：冷启动恢复会话、按登录态同步推送通道、控制「未绑定手机号」弹窗。
 */
@HiltViewModel
class RootViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepository: AuthRepository,
    private val sessionManager: SessionManager,
    private val pushRegistrar: PushRegistrar,
    private val processFlagStore: ProcessFlagStore,
) : ViewModel() {

    val sessionState: StateFlow<SessionState> = sessionManager.state
    val user: StateFlow<UserDto?> = sessionManager.user
    val sessionEvents: SharedFlow<SessionEvent> = sessionManager.events

    private val _showPhoneDialog = MutableStateFlow(false)
    val showPhoneDialog: StateFlow<Boolean> = _showPhoneDialog.asStateFlow()

    init {
        // 冷启动：有 refresh token 就换新令牌并拉 /auth/me，否则置为未登录
        viewModelScope.launch { authRepository.restoreSession() }

        // 每次进入登录态（登录成功 / 冷启动恢复）都同步一次推送通道
        viewModelScope.launch {
            sessionManager.state.collect { state ->
                if (state is SessionState.LoggedIn) {
                    pushRegistrar.syncPushMode()
                }
            }
        }
    }

    /**
     * 主界面首次就绪时调用：未绑定手机号则弹一次提示。
     * 「一次」以进程为界（ProcessFlagStore 用进程 id 记录），杀进程重启后会再次提示。
     */
    fun onMainUiShown() {
        val current = sessionManager.currentUser() ?: return
        if (current.phoneVerified) return
        viewModelScope.launch {
            if (processFlagStore.shouldShowPhonePrompt()) {
                _showPhoneDialog.value = true
                processFlagStore.markPhonePromptShown()
            }
        }
    }

    fun dismissPhoneDialog() {
        _showPhoneDialog.value = false
    }

    /** 主动登出：撤销服务端会话、停长连接、清空本地，下一次登录重新提示绑定手机号。 */
    fun logout() {
        viewModelScope.launch {
            runCatching { authRepository.logout() }
            NtfyForegroundService.stop(context)
            processFlagStore.resetPhonePrompt()
            _showPhoneDialog.value = false
        }
    }
}
