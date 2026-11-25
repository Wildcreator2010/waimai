package com.wildcreator.mealreminder.ui.reminder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.data.remote.dto.ReminderEventDto
import com.wildcreator.mealreminder.domain.EventLevel
import com.wildcreator.mealreminder.domain.ReminderStatus
import com.wildcreator.mealreminder.ui.common.EmptyState
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.PrimaryButton
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.ValueRow
import com.wildcreator.mealreminder.ui.common.remainingText
import com.wildcreator.mealreminder.ui.common.toFullTime
import com.wildcreator.mealreminder.ui.common.toTimeOfDay
import kotlinx.coroutines.delay

/** 任务详情：状态、事件流、立即查询、停止。 */
@Composable
fun ReminderDetailScreen(
    reminderId: String,
    onBack: () -> Unit,
    viewModel: ReminderDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showStopConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(reminderId) { viewModel.start(reminderId) }

    // 活动任务每 10 秒静默刷新，事件流随之更新
    LaunchedEffect(reminderId, state.reminder?.status) {
        val status = state.reminder?.status
        if (status != null && ReminderStatus.from(status).isActive) {
            while (true) {
                delay(10_000)
                viewModel.load()
            }
        }
    }

    ScreenScaffold(
        title = "任务详情",
        onBack = onBack,
        actions = { TextButton(onClick = viewModel::load) { Text("刷新") } },
    ) { innerPadding ->
        val reminder = state.reminder
        if (state.loading && reminder == null) {
            LoadingBox(modifier = Modifier.padding(innerPadding))
            return@ScreenScaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (state.error != null) {
                item {
                    ErrorBanner(message = state.error, onRetry = viewModel::load)
                }
            }

            if (reminder != null) {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = "取餐码 ${reminder.pickupCode}",
                                    style = MaterialTheme.typography.titleLarge,
                                )
                                Text(
                                    text = ReminderStatus.from(reminder.status).label,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                            Spacer(modifier = Modifier.height(10.dp))
                            ValueRow(label = "柜机", value = reminder.cabCode)
                            ValueRow(
                                label = "取餐码来源",
                                value = if (reminder.codeMode == "phone_tail") "手机尾号" else "自定义",
                            )
                            ValueRow(
                                label = "柜号",
                                value = reminder.cabinet.ifBlank { "尚未入柜" },
                            )
                            ValueRow(label = "监控时长", value = "${reminder.durationMin} 分钟")
                            ValueRow(label = "创建时间", value = reminder.createdAt.toFullTime())
                            ValueRow(label = "截止时间", value = reminder.endsAt.toFullTime())
                            if (ReminderStatus.from(reminder.status).isActive) {
                                ValueRow(label = "剩余", value = remainingText(reminder.endsAt))
                            }
                            ValueRow(
                                label = "查询次数",
                                value = "${reminder.checkCount} 次" +
                                    if (reminder.failCount > 0) "（失败 ${reminder.failCount} 次）" else "",
                            )
                            if (reminder.lastDetail.isNotBlank()) {
                                ValueRow(label = "最近结果", value = reminder.lastDetail)
                            }
                        }
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        OutlinedButton(
                            onClick = viewModel::checkNow,
                            enabled = !state.checking,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (state.checking) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text("立即查询")
                        }
                        OutlinedButton(
                            onClick = { showStopConfirm = true },
                            enabled = ReminderStatus.from(reminder.status).isActive && !state.stopping,
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("停止监控")
                        }
                    }

                    // 已入柜且有订单号才允许开箱（服务端还会再校验一次）
                    if (reminder.status == "ARRIVED" && reminder.orderId.isNotBlank()) {
                        PrimaryButton(
                            text = if (state.opening) "正在开箱…" else "一键开箱（第 ${reminder.openCount + 1} 次）",
                            onClick = viewModel::openBox,
                            loading = state.opening,
                        )
                        Text(
                            text = "开箱会向取餐柜发送真实开门指令，请确认你站在正确的柜机前；每任务最多 3 次、间隔 10 秒。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                if (state.checkResult != null) {
                    item { InfoBanner(message = state.checkResult) }
                }
                if (state.info != null) {
                    item { InfoBanner(message = state.info) }
                }

                item {
                    Text(
                        text = "事件流",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                if (reminder.events.isEmpty()) {
                    item { EmptyState(text = "暂无事件") }
                } else {
                    items(items = reminder.events, key = { it.id }) { event ->
                        EventRow(event = event)
                    }
                }
            }
        }
    }

    if (showStopConfirm) {
        AlertDialog(
            onDismissRequest = { showStopConfirm = false },
            title = { Text("停止监控？") },
            text = { Text("停止后不再查询取餐柜，任务标记为已停止。已到柜的提醒不会撤销。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showStopConfirm = false
                        viewModel.stop()
                    },
                ) { Text("停止") }
            },
            dismissButton = {
                TextButton(onClick = { showStopConfirm = false }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun EventRow(event: ReminderEventDto) {
    val level = EventLevel.from(event.level)
    val color = when (level) {
        EventLevel.ERROR -> MaterialTheme.colorScheme.error
        EventLevel.WARN -> MaterialTheme.colorScheme.secondary
        EventLevel.SUCCESS -> MaterialTheme.colorScheme.primary
        EventLevel.INFO -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = event.createdAt.toTimeOfDay(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = event.message,
            style = MaterialTheme.typography.bodySmall,
            color = color,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}
