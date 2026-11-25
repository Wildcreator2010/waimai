package com.wildcreator.mealreminder.data.session

import com.wildcreator.mealreminder.data.remote.dto.LoginResponse
import com.wildcreator.mealreminder.data.remote.dto.UserDto
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/** 会话状态：启动恢复中 / 未登录 / 已登录。 */
sealed interface SessionState {
    data object Restoring : SessionState
    data object LoggedOut : SessionState
    data object LoggedIn : SessionState
}

/** 会话事件：refresh 失败、被服务端踢下线等，UI 订阅后跳登录。 */
enum class SessionEvent {
    /** 令牌刷新失败或会话被撤销，需要重新登录。 */
    Expired,
}

/**
 * 会话单一事实来源。
 *
 * 安全约定（架构 §5.3 / 任务要求）：access 只放内存，refresh 落 EncryptedSharedPreferences。
 * 进程被杀后 access 丢失，冷启动用 refresh 换新令牌。
 */
@Singleton
class SessionManager @Inject constructor(
    private val secureStore: SecureSessionStore,
) {

    private val _accessToken = MutableStateFlow<String?>(null)
    private val _user = MutableStateFlow<UserDto?>(null)
    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    private val _events = MutableSharedFlow<SessionEvent>(extraBufferCapacity = 4)

    val accessToken: StateFlow<String?> = _accessToken.asStateFlow()
    val user: StateFlow<UserDto?> = _user.asStateFlow()
    val state: StateFlow<SessionState> = _state.asStateFlow()
    val events: SharedFlow<SessionEvent> = _events.asSharedFlow()

    // ---------------------------------------------------------------- 读取

    fun currentAccessToken(): String? = _accessToken.value

    fun refreshToken(): String? = secureStore.refreshToken()

    fun hasRefreshToken(): Boolean = !secureStore.refreshToken().isNullOrBlank()

    fun isLoggedIn(): Boolean = _state.value is SessionState.LoggedIn

    fun currentUser(): UserDto? = _user.value

    // ---------------------------------------------------------------- 写入

    fun saveLogin(response: LoginResponse) {
        _accessToken.value = response.accessToken
        if (response.refreshToken.isNotBlank()) {
            secureStore.saveRefreshToken(response.refreshToken)
        }
        _user.value = response.user
        _state.value = SessionState.LoggedIn
    }

    /** 刷新成功后轮换令牌：旧 refresh 立即作废，服务端已换发新的。 */
    fun updateTokens(accessToken: String, refreshToken: String) {
        _accessToken.value = accessToken
        if (refreshToken.isNotBlank()) {
            secureStore.saveRefreshToken(refreshToken)
        }
        _state.value = SessionState.LoggedIn
    }

    fun updateUser(user: UserDto) {
        _user.value = user
        if (_state.value !is SessionState.LoggedIn) {
            _state.value = SessionState.LoggedIn
        }
    }

    fun markRestored(user: UserDto?) {
        _user.value = user
        _state.value = if (user != null) SessionState.LoggedIn else SessionState.LoggedOut
    }

    fun markLoggedOut() {
        clear()
    }

    /** 清空本地会话（不通知 UI，用于主动登出）。 */
    fun clear() {
        _accessToken.value = null
        _user.value = null
        secureStore.clear()
        _state.value = SessionState.LoggedOut
    }

    /** 被动失效（refresh 失败 / 被踢）：清空并广播事件，由导航层跳登录。 */
    fun onSessionExpired() {
        val hadSession = hasRefreshToken() || _user.value != null
        clear()
        if (hadSession) {
            _events.tryEmit(SessionEvent.Expired)
        }
    }
}
