package com.wildcreator.mealreminder.ui.reminder

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.R
import com.wildcreator.mealreminder.data.remote.dto.ReminderDto
import com.wildcreator.mealreminder.domain.ReminderStatus
import com.wildcreator.mealreminder.ui.common.EmptyState
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.remainingText
import com.wildcreator.mealreminder.ui.common.toShortTime
import kotlinx.coroutines.delay

/** 任务列表：状态筛选 + 15 秒静默轮询（推送之外的第二重保险）。 */
@Composable
fun ReminderListScreen(
    onCreate: () -> Unit,
    onOpen: (String) -> Unit,
    viewModel: ReminderListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // 页面可见期间定时刷新，避免错过入柜事件
    LaunchedEffect(Unit) {
        while (true) {
            delay(15_000)
            viewModel.refresh()
        }
    }

    ScreenScaffold(
        title = stringResource(R.string.app_name),
        actions = {
            TextButton(onClick = viewModel::load) { Text("刷新") }
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreate) {
                Icon(imageVector = Icons.Filled.Add, contentDescription = "新建任务")
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = state.statusFilter == null,
                    onClick = { viewModel.setFilter(null) },
                    label = { Text("全部") },
                )
                STATUS_FILTERS.forEach { (value, label) ->
                    FilterChip(
                        selected = state.statusFilter == value,
                        onClick = { viewModel.setFilter(value) },
                        label = { Text(label) },
                    )
                }
            }

            if (state.error != null) {
                ErrorBanner(
                    message = state.error,
                    modifier = Modifier.padding(horizontal = 16.dp),
                    onRetry = viewModel::load,
                )
            }

            when {
                state.loading && state.items.isEmpty() -> LoadingBox()

                state.items.isEmpty() -> EmptyState(
                    text = "还没有任务。点右下角「+」创建，监控到外卖入柜后会提醒你。",
                )

                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(items = state.items, key = { it.id }) { item ->
                        ReminderCard(item = item, onClick = { onOpen(item.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun ReminderCard(item: ReminderDto, onClick: () -> Unit) {
    val status = ReminderStatus.from(item.status)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "取餐码 ${item.pickupCode}",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = status.label,
                    style = MaterialTheme.typography.labelLarge,
                    color = statusColor(status),
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "柜机 ${item.cabCode}" + if (item.cabinet.isNotBlank()) " · 柜号 ${item.cabinet}" else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = if (status.isActive) {
                    "剩余 ${remainingText(item.endsAt)} · 已查询 ${item.checkCount} 次"
                } else {
                    "创建于 ${item.createdAt.toShortTime()}"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun statusColor(status: ReminderStatus): Color = when (status) {
    ReminderStatus.ARRIVED -> MaterialTheme.colorScheme.primary
    ReminderStatus.TIMEOUT -> MaterialTheme.colorScheme.error
    ReminderStatus.STOPPED -> MaterialTheme.colorScheme.onSurfaceVariant
    else -> MaterialTheme.colorScheme.secondary
}

/** 筛选值 → 中文标签。服务端按单一 status 过滤。 */
private val STATUS_FILTERS: List<Pair<String, String>> = listOf(
    "PENDING" to "待开始",
    "WAITING" to "监控中",
    "ARRIVED" to "已到柜",
    "TIMEOUT" to "已超时",
    "STOPPED" to "已停止",
)
