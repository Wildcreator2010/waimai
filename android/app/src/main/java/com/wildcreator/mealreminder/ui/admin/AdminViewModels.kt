package com.wildcreator.mealreminder.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wildcreator.mealreminder.data.remote.dto.AdminUserDto
import com.wildcreator.mealreminder.data.remote.dto.AlertDto
import com.wildcreator.mealreminder.data.remote.dto.AuditLogDto
import com.wildcreator.mealreminder.data.remote.dto.InviteDto
import com.wildcreator.mealreminder.data.remote.dto.MemberTokenDto
import com.wildcreator.mealreminder.data.remote.dto.OverviewDto
import com.wildcreator.mealreminder.data.remote.dto.PatchSystemSettingsRequest
import com.wildcreator.mealreminder.data.remote.dto.SystemSettingsDto
import com.wildcreator.mealreminder.data.remote.toUserMessage
import com.wildcreator.mealreminder.data.repository.AdminRepository
import com.wildcreator.mealreminder.data.session.SessionManager
import com.wildcreator.mealreminder.domain.Role
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- 概览

data class AdminHomeUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val overview: OverviewDto? = null,
)

@HiltViewModel
class AdminHomeViewModel @Inject constructor(
    private val repository: AdminRepository,
    private val sessionManager: SessionManager,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminHomeUiState(loading = true))
    val state: StateFlow<AdminHomeUiState> = _state.asStateFlow()

    val myRole: Role get() = Role.from(sessionManager.currentUser()?.role)

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.overview == null, error = null) }
            try {
                val overview = repository.overview()
                _state.update { it.copy(loading = false, overview = overview) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- 用户管理

data class AdminUsersUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val query: String = "",
    val items: List<AdminUserDto> = emptyList(),
    val acting: Boolean = false,
)

@HiltViewModel
class AdminUsersViewModel @Inject constructor(
    private val repository: AdminRepository,
    private val sessionManager: SessionManager,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminUsersUiState(loading = true))
    val state: StateFlow<AdminUsersUiState> = _state.asStateFlow()

    /** 当前登录者角色，决定「提权 / 转让 ROOT」等按钮是否出现。 */
    val myRole: Role get() = Role.from(sessionManager.currentUser()?.role)

    /** 当前登录者 id，用于隐藏针对自己的危险操作。 */
    val myUserId: String? get() = sessionManager.currentUser()?.id

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            try {
                val page = repository.users(q = _state.value.query)
                _state.update { it.copy(loading = false, items = page.items) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value) }
    }

    fun setStatus(userId: String, status: String) = mutate("已更新账号状态") {
        repository.patchUser(id = userId, status = status)
        Unit
    }

    fun setRole(userId: String, role: String) = mutate("已更新角色") {
        repository.patchUser(id = userId, role = role)
        Unit
    }

    fun delete(userId: String) = mutate("已删除账号") {
        repository.deleteUser(userId)
    }

    fun create(
        email: String,
        password: String,
        role: String,
        displayName: String,
        onSuccess: () -> Unit,
    ) {
        if (_state.value.acting) return
        if (email.isBlank() || !email.contains("@")) {
            _state.update { it.copy(error = "请输入正确的邮箱") }
            return
        }
        if (password.length < 8) {
            _state.update { it.copy(error = "密码至少 8 位") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(acting = true, error = null, info = null) }
            try {
                repository.createUser(email, password, role, displayName)
                _state.update { it.copy(acting = false, info = "账号已创建（首次登录需改密）") }
                onSuccess()
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(acting = false, error = t.toUserMessage()) }
            }
        }
    }

    fun transferRoot(userId: String, password: String, onSuccess: () -> Unit) {
        if (_state.value.acting) return
        if (password.isBlank()) {
            _state.update { it.copy(error = "请输入你当前的密码以确认转让") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(acting = true, error = null, info = null) }
            try {
                repository.transferRoot(userId, password)
                _state.update { it.copy(acting = false, info = "ROOT 已转让，双方会话已失效，请重新登录") }
                onSuccess()
            } catch (t: Throwable) {
                _state.update { it.copy(acting = false, error = t.toUserMessage()) }
            }
        }
    }

    private fun mutate(successMessage: String, block: suspend () -> Unit) {
        if (_state.value.acting) return
        viewModelScope.launch {
            _state.update { it.copy(acting = true, error = null, info = null) }
            try {
                block()
                _state.update { it.copy(acting = false, info = successMessage) }
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(acting = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- 邀请码

data class AdminInvitesUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val statusFilter: String? = null,
    val items: List<InviteDto> = emptyList(),
    val acting: Boolean = false,
    val lastCreated: InviteDto? = null,
)

@HiltViewModel
class AdminInvitesViewModel @Inject constructor(
    private val repository: AdminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminInvitesUiState(loading = true))
    val state: StateFlow<AdminInvitesUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            try {
                val page = repository.invites(status = _state.value.statusFilter)
                _state.update { it.copy(loading = false, items = page.items) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun setFilter(status: String?) {
        if (_state.value.statusFilter == status) return
        _state.update { it.copy(statusFilter = status) }
        load()
    }

    fun create(email: String, expiresInDays: String, note: String, onSuccess: () -> Unit) {
        if (_state.value.acting) return
        if (email.isBlank() || !email.contains("@")) {
            _state.update { it.copy(error = "请输入要邀请的邮箱") }
            return
        }
        val days = expiresInDays.toIntOrNull()
        if (days == null || days !in 1..90) {
            _state.update { it.copy(error = "有效期需在 1–90 天之间") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(acting = true, error = null, info = null) }
            try {
                val invite = repository.createInvite(email, days, note)
                _state.update {
                    it.copy(acting = false, info = "邀请码已生成：${invite.code}", lastCreated = invite)
                }
                onSuccess()
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(acting = false, error = t.toUserMessage()) }
            }
        }
    }

    fun delete(id: String) {
        if (_state.value.acting) return
        viewModelScope.launch {
            _state.update { it.copy(acting = true, error = null, info = null) }
            try {
                repository.deleteInvite(id)
                _state.update { it.copy(acting = false, info = "邀请码已删除") }
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(acting = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- MemberToken

data class MemberTokenUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val token: MemberTokenDto? = null,
    val input: String = "",
    val saving: Boolean = false,
    val verifying: Boolean = false,
)

@HiltViewModel
class AdminMemberTokenViewModel @Inject constructor(
    private val repository: AdminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MemberTokenUiState(loading = true))
    val state: StateFlow<MemberTokenUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.token == null, error = null) }
            try {
                val token = repository.memberToken()
                _state.update { it.copy(loading = false, token = token) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun onInputChange(value: String) = _state.update { it.copy(input = value.trim(), error = null) }

    /** 保存即触发服务端 openMark 验证，成功返回最新掩码与验证结果。 */
    fun save() {
        val token = _state.value.input
        if (_state.value.saving) return
        if (token.length < 8) {
            _state.update { it.copy(error = "MemberToken 至少 8 个字符") }
            return
        }
        if (token.any { it.isWhitespace() }) {
            _state.update { it.copy(error = "MemberToken 不能包含空白字符") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null, info = null) }
            try {
                repository.putMemberToken(token)
                _state.update { it.copy(saving = false, input = "", info = "已保存并完成一次有效性验证") }
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(saving = false, error = t.toUserMessage()) }
            }
        }
    }

    fun verify() {
        if (_state.value.verifying) return
        viewModelScope.launch {
            _state.update { it.copy(verifying = true, error = null, info = null) }
            try {
                val result = repository.verifyMemberToken()
                _state.update {
                    it.copy(
                        verifying = false,
                        info = if (result.ok) "凭证有效：${result.message}" else "凭证无效：${result.message}",
                    )
                }
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(verifying = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- 系统设置

data class SystemSettingsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val saving: Boolean = false,
    val pollIntervalSec: String = "",
    val defaultDurationMin: String = "",
    val maxDurationMin: String = "",
    val maxActiveRemindersPerUser: String = "",
    val lockerDeviceSn: String = "",
    val lockerApiBase: String = "",
    val ntfyServerUrl: String = "",
    val registrationOpen: Boolean = true,
    val showNotifyDetailsDefault: Boolean = true,
)

@HiltViewModel
class AdminSystemSettingsViewModel @Inject constructor(
    private val repository: AdminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SystemSettingsUiState(loading = true))
    val state: StateFlow<SystemSettingsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            // 只有首次（还没有数据）才显示整页 loading，回读时不要闪
            _state.update { it.copy(loading = it.pollIntervalSec.isBlank(), error = null) }
            try {
                val settings = repository.systemSettings()
                _state.update { it.copy(loading = false).fromDto(settings) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun onPollIntervalChange(v: String) = _state.update { it.copy(pollIntervalSec = v.filter { c -> c.isDigit() }.take(5)) }
    fun onDefaultDurationChange(v: String) = _state.update { it.copy(defaultDurationMin = v.filter { c -> c.isDigit() }.take(4)) }
    fun onMaxDurationChange(v: String) = _state.update { it.copy(maxDurationMin = v.filter { c -> c.isDigit() }.take(4)) }
    fun onMaxActiveChange(v: String) = _state.update { it.copy(maxActiveRemindersPerUser = v.filter { c -> c.isDigit() }.take(3)) }
    fun onDeviceSnChange(v: String) = _state.update { it.copy(lockerDeviceSn = v.take(32)) }
    fun onLockerApiBaseChange(v: String) = _state.update { it.copy(lockerApiBase = v.take(200)) }
    fun onNtfyServerChange(v: String) = _state.update { it.copy(ntfyServerUrl = v.take(200)) }
    fun onRegistrationOpenChange(v: Boolean) = _state.update { it.copy(registrationOpen = v) }
    fun onShowNotifyDetailsDefaultChange(v: Boolean) = _state.update { it.copy(showNotifyDetailsDefault = v) }

    fun save() {
        val current = _state.value
        if (current.saving) return

        val poll = current.pollIntervalSec.toIntOrNull()
        val defaultDuration = current.defaultDurationMin.toIntOrNull()
        val maxDuration = current.maxDurationMin.toIntOrNull()
        val maxActive = current.maxActiveRemindersPerUser.toIntOrNull()

        val problem = when {
            poll == null || poll < 10 -> "轮询间隔需 ≥ 10 秒"
            defaultDuration == null || defaultDuration !in 1..720 -> "默认时长需在 1–720 之间"
            maxDuration == null || maxDuration !in 1..720 -> "最大时长需在 1–720 之间"
            maxActive == null || maxActive < 1 -> "单用户任务上限需 ≥ 1"
            current.lockerDeviceSn.isBlank() -> "设备 SN 不能为空"
            current.ntfyServerUrl.isBlank() -> "ntfy 服务地址不能为空"
            else -> null
        }
        if (problem != null) {
            _state.update { it.copy(error = problem) }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null, info = null) }
            try {
                repository.patchSystemSettings(
                    PatchSystemSettingsRequest(
                        pollIntervalSec = poll,
                        defaultDurationMin = defaultDuration,
                        maxDurationMin = maxDuration,
                        maxActiveRemindersPerUser = maxActive,
                        lockerDeviceSn = current.lockerDeviceSn.trim(),
                        lockerApiBase = current.lockerApiBase.trim(),
                        ntfyServerUrl = current.ntfyServerUrl.trim(),
                        registrationOpen = current.registrationOpen,
                        showNotifyDetailsDefault = current.showNotifyDetailsDefault,
                    ),
                )
                _state.update { it.copy(saving = false, info = "系统设置已保存") }
                // 回读一次，确认服务端实际生效的值
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(saving = false, error = t.toUserMessage()) }
            }
        }
    }

    private fun SystemSettingsUiState.fromDto(dto: SystemSettingsDto): SystemSettingsUiState = copy(
        pollIntervalSec = dto.pollIntervalSec.toString(),
        defaultDurationMin = dto.defaultDurationMin.toString(),
        maxDurationMin = dto.maxDurationMin.toString(),
        maxActiveRemindersPerUser = dto.maxActiveRemindersPerUser.toString(),
        lockerDeviceSn = dto.lockerDeviceSn,
        lockerApiBase = dto.lockerApiBase,
        ntfyServerUrl = dto.ntfyServerUrl,
        registrationOpen = dto.registrationOpen,
        showNotifyDetailsDefault = dto.showNotifyDetailsDefault,
    )
}

// ---------------------------------------------------------------- 告警

data class AdminAlertsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val onlyUnacked: Boolean = true,
    val items: List<AlertDto> = emptyList(),
    val acting: Boolean = false,
)

@HiltViewModel
class AdminAlertsViewModel @Inject constructor(
    private val repository: AdminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminAlertsUiState(loading = true))
    val state: StateFlow<AdminAlertsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            try {
                val page = repository.alerts(acked = if (_state.value.onlyUnacked) false else null)
                _state.update { it.copy(loading = false, items = page.items) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun setOnlyUnacked(value: Boolean) {
        if (_state.value.onlyUnacked == value) return
        _state.update { it.copy(onlyUnacked = value) }
        load()
    }

    fun ack(id: String) {
        if (_state.value.acting) return
        viewModelScope.launch {
            _state.update { it.copy(acting = true, error = null) }
            try {
                repository.ackAlert(id)
                _state.update { it.copy(acting = false, info = "告警已确认") }
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(acting = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- 审计

data class AdminAuditUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val actionFilter: String = "",
    val items: List<AuditLogDto> = emptyList(),
)

@HiltViewModel
class AdminAuditViewModel @Inject constructor(
    private val repository: AdminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminAuditUiState(loading = true))
    val state: StateFlow<AdminAuditUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            try {
                val page = repository.audit(action = _state.value.actionFilter)
                _state.update { it.copy(loading = false, items = page.items) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    fun onActionFilterChange(value: String) = _state.update { it.copy(actionFilter = value) }
}
