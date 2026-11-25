package com.wildcreator.mealreminder.ui.reminder

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wildcreator.mealreminder.data.remote.dto.ReminderDto
import com.wildcreator.mealreminder.data.remote.toUserMessage
import com.wildcreator.mealreminder.data.repository.MeRepository
import com.wildcreator.mealreminder.data.repository.ReminderRepository
import com.wildcreator.mealreminder.domain.ReminderStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- 任务列表

data class ReminderListUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val items: List<ReminderDto> = emptyList(),
    /** null 表示「全部」。 */
    val statusFilter: String? = null,
)

@HiltViewModel
class ReminderListViewModel @Inject constructor(
    private val repository: ReminderRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ReminderListUiState(loading = true))
    val state: StateFlow<ReminderListUiState> = _state.asStateFlow()

    init {
        load()
        // 每 15 秒静默刷新一次，与 Web 端一致；不显示 loading，避免闪烁
        viewModelScope.launch {
            while (isActive) {
                delay(15_000)
                fetch()
            }
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            fetch()
        }
    }

    /** 静默刷新：不显示 loading，也不清空列表，供下拉/定时轮询使用。 */
    fun refresh() {
        viewModelScope.launch { fetch() }
    }

    fun setFilter(status: String?) {
        if (_state.value.statusFilter == status) return
        _state.update { it.copy(statusFilter = status) }
        load()
    }

    private suspend fun fetch() {
        try {
            val page = repository.list(status = _state.value.statusFilter)
            _state.update { it.copy(loading = false, error = null, items = page.items) }
        } catch (t: Throwable) {
            _state.update { it.copy(loading = false, error = t.toUserMessage()) }
        }
    }

    /** 供 UI 使用：仍会被轮询的状态数量。 */
    fun activeCount(): Int = _state.value.items.count { ReminderStatus.from(it.status).isActive }
}

// ---------------------------------------------------------------- 创建任务

data class CreateReminderUiState(
    /** custom = 自定义取餐码；phone_tail = 手机尾号后四位 */
    val codeMode: String = "custom",
    val pickupCode: String = "",
    val cabCode: String = "",
    val durationMin: String = "",
    val defaultDurationMin: Int = 60,
    val maxDurationMin: Int = 720,
    val boundPhoneTail: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    /** 创建成功后服务端返回的告警（例如未绑手机号）。 */
    val warnings: List<String> = emptyList(),
    val createdId: String? = null,
) {
    val isPhoneTail: Boolean get() = codeMode == "phone_tail"
}

@HiltViewModel
class CreateReminderViewModel @Inject constructor(
    private val repository: ReminderRepository,
    private val meRepository: MeRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(CreateReminderUiState())
    val state: StateFlow<CreateReminderUiState> = _state.asStateFlow()

    init {
        // 预填服务端下发的默认柜机与默认时长；用户已输入的不覆盖
        viewModelScope.launch {
            runCatching { meRepository.settings() }.onSuccess { settings ->
                val tail = settings.phone.orEmpty().filter { it.isDigit() }.takeLast(4)
                _state.update { current ->
                    current.copy(
                        cabCode = current.cabCode.ifBlank { settings.defaultCabCode.orEmpty() },
                        durationMin = current.durationMin.ifBlank {
                            (settings.defaultDurationMin ?: 60).toString()
                        },
                        defaultDurationMin = settings.defaultDurationMin ?: 60,
                        maxDurationMin = settings.maxDurationMin ?: 720,
                        boundPhoneTail = tail,
                    )
                }
            }
        }
    }

    fun onModeChange(mode: String) {
        _state.update { current ->
            when (mode) {
                "phone_tail" -> current.copy(
                    codeMode = mode,
                    pickupCode = current.boundPhoneTail.ifBlank { current.pickupCode.filter { it.isDigit() }.take(4) },
                    error = null,
                )
                else -> current.copy(codeMode = "custom", pickupCode = "", error = null)
            }
        }
    }

    fun onPickupCodeChange(value: String) {
        _state.update { current ->
            val next = if (current.isPhoneTail) {
                // 手机尾号只允许 4 位数字
                value.filter { it.isDigit() }.take(4)
            } else {
                value
            }
            current.copy(pickupCode = next, error = null)
        }
    }

    fun onCabCodeChange(value: String) = _state.update { it.copy(cabCode = value, error = null) }

    fun onDurationChange(value: String) {
        // 只允许数字，避免输入法把字母塞进来
        _state.update { it.copy(durationMin = value.filter { ch -> ch.isDigit() }.take(3), error = null) }
    }

    fun create() {
        val current = _state.value
        if (current.loading) return

        val pickup = current.pickupCode.trim()
        val cab = current.cabCode.trim()
        val duration = current.durationMin.toIntOrNull()

        val problem = when {
            pickup.isEmpty() -> if (current.isPhoneTail) "请输入手机尾号后四位" else "请输入取餐码"
            current.isPhoneTail && !pickup.matches(Regex("^\\d{4}$")) -> "手机尾号必须是 4 位数字"
            !current.isPhoneTail && pickup.length > 64 -> "取餐码最多 64 个字符"
            cab.isEmpty() -> "请输入柜机编号"
            cab.length > 32 -> "柜机编号最多 32 个字符"
            duration == null || duration !in 1..current.maxDurationMin ->
                "监控时长需在 1–${current.maxDurationMin} 分钟之间"
            else -> null
        }
        if (problem != null) {
            _state.update { it.copy(error = problem) }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val response = repository.create(pickup, cab, duration!!, current.codeMode)
                _state.update {
                    it.copy(
                        loading = false,
                        createdId = response.id,
                        warnings = response.warnings.map { warning -> warning.message },
                    )
                }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }
}

// ---------------------------------------------------------------- 任务详情

data class ReminderDetailUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val reminder: ReminderDto? = null,
    val checking: Boolean = false,
    val checkResult: String? = null,
    val stopping: Boolean = false,
    val opening: Boolean = false,
    val info: String? = null,
)

@HiltViewModel
class ReminderDetailViewModel @Inject constructor(
    private val repository: ReminderRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ReminderDetailUiState(loading = true))
    val state: StateFlow<ReminderDetailUiState> = _state.asStateFlow()

    private var reminderId: String = ""

    fun start(id: String) {
        if (reminderId == id) return
        reminderId = id
        load()
    }

    fun load() {
        if (reminderId.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(loading = it.reminder == null, error = null) }
            try {
                val detail = repository.detail(reminderId)
                _state.update { it.copy(loading = false, error = null, reminder = detail) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.toUserMessage()) }
            }
        }
    }

    /** 立即查询一次（不改变 endsAt）。 */
    fun checkNow() {
        if (reminderId.isBlank() || _state.value.checking) return
        viewModelScope.launch {
            _state.update { it.copy(checking = true, error = null, checkResult = null) }
            try {
                val result = repository.check(reminderId)
                val text = buildString {
                    append(if (result.arrived) "已入柜" else "尚未入柜")
                    if (result.detail.isNotBlank()) {
                        append("：")
                        append(result.detail)
                    }
                }
                _state.update { it.copy(checking = false, checkResult = text) }
                // 查询会写事件，顺手刷新详情
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(checking = false, error = t.toUserMessage()) }
            }
        }
    }

    fun stop() {
        if (reminderId.isBlank() || _state.value.stopping) return
        viewModelScope.launch {
            _state.update { it.copy(stopping = true, error = null) }
            try {
                repository.stop(reminderId)
                _state.update { it.copy(stopping = false, info = "任务已停止") }
                // 停止后重新拉详情，用服务端真实状态覆盖本地猜测
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(stopping = false, error = t.toUserMessage()) }
            }
        }
    }

    /** 一键开箱：服务端限 3 次/任务、10 秒间隔，失败会返回明确错误码。 */
    fun openBox() {
        if (reminderId.isBlank() || _state.value.opening) return
        viewModelScope.launch {
            _state.update { it.copy(opening = true, error = null, info = null) }
            try {
                val result = repository.openBox(reminderId)
                _state.update {
                    it.copy(opening = false, info = "开箱命令已发送（第 ${result.openCount} 次）：${result.message}")
                }
                load()
            } catch (t: Throwable) {
                _state.update { it.copy(opening = false, error = t.toUserMessage()) }
            }
        }
    }
}
