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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.data.remote.dto.AlertDto
import com.wildcreator.mealreminder.ui.common.EmptyState
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.SwitchRow
import com.wildcreator.mealreminder.ui.common.toFullTime

/** 告警：短信失败、凭证失效、轮询异常等；可确认（ack）。 */
@Composable
fun AdminAlertsScreen(
    onBack: () -> Unit,
    viewModel: AdminAlertsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenScaffold(
        title = "告警",
        onBack = onBack,
        actions = { TextButton(onClick = viewModel::load) { Text("刷新") } },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            SwitchRow(
                label = "只看未确认",
                checked = state.onlyUnacked,
                onCheckedChange = viewModel::setOnlyUnacked,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            ErrorBanner(
                message = state.error,
                modifier = Modifier.padding(horizontal = 16.dp),
                onRetry = viewModel::load,
            )
            InfoBanner(
                message = state.info,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            when {
                state.loading && state.items.isEmpty() -> LoadingBox()
                state.items.isEmpty() -> EmptyState(text = "没有告警，一切正常")
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(items = state.items, key = { it.id }) { alert ->
                        AlertRow(
                            alert = alert,
                            acting = state.acting,
                            onAck = { viewModel.ack(alert.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AlertRow(alert: AlertDto, acting: Boolean, onAck: () -> Unit) {
    val levelColor = when (alert.level.uppercase()) {
        "ERROR" -> MaterialTheme.colorScheme.error
        "WARN" -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(text = alert.type.ifBlank { "告警" }, style = MaterialTheme.typography.titleSmall, color = levelColor)
                Text(
                    text = alert.createdAt.toFullTime(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = alert.message, style = MaterialTheme.typography.bodyMedium)
            if (alert.ackedAt != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "已确认 · ${alert.ackedAt.toFullTime()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = onAck, enabled = !acting) { Text("确认") }
                }
            }
        }
    }
}
