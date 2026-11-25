package com.wildcreator.mealreminder.ui.admin

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
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.data.remote.dto.AuditLogDto
import com.wildcreator.mealreminder.ui.common.EmptyState
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.toFullTime

/** 审计：角色变更、MemberToken、设置、邀请码、告警确认等操作留痕。 */
@Composable
fun AdminAuditScreen(
    onBack: () -> Unit,
    viewModel: AdminAuditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenScaffold(
        title = "审计",
        onBack = onBack,
        actions = { TextButton(onClick = viewModel::load) { Text("刷新") } },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            OutlinedTextField(
                value = state.actionFilter,
                onValueChange = viewModel::onActionFilterChange,
                label = { Text("按操作类型筛选（如 ROLE_CHANGE）") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                trailingIcon = {
                    TextButton(onClick = viewModel::load) { Text("查询") }
                },
            )

            ErrorBanner(
                message = state.error,
                modifier = Modifier.padding(horizontal = 16.dp),
                onRetry = viewModel::load,
            )

            when {
                state.loading && state.items.isEmpty() -> LoadingBox()
                state.items.isEmpty() -> EmptyState(text = "没有审计记录")
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(items = state.items, key = { it.id }) { log ->
                        AuditRow(log = log)
                    }
                }
            }
        }
    }
}

@Composable
private fun AuditRow(log: AuditLogDto) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = log.action.ifBlank { "操作" },
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = log.createdAt.toFullTime(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "操作人：${log.actorEmail ?: log.actorId ?: "系统"}",
                style = MaterialTheme.typography.bodySmall,
            )
            if (log.targetType.isNotBlank() || log.targetId.isNotBlank()) {
                Text(
                    text = "对象：${log.targetType} ${log.targetId}".trim(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (log.detail.isNotBlank()) {
                Text(
                    text = log.detail,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (log.ip.isNotBlank()) {
                Text(
                    text = "IP：${log.ip}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
