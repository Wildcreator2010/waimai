package com.wildcreator.mealreminder.ui.admin

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.data.remote.dto.InviteDto
import com.wildcreator.mealreminder.ui.common.EmptyState
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.toShortTime
import java.time.Instant

/** 邀请码：一码一邮箱，注册必备。 */
@Composable
fun AdminInvitesScreen(
    onBack: () -> Unit,
    viewModel: AdminInvitesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showCreateDialog by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<InviteDto?>(null) }

    ScreenScaffold(
        title = "邀请码",
        onBack = onBack,
        actions = {
            TextButton(onClick = { showCreateDialog = true }) { Text("生成") }
            TextButton(onClick = viewModel::load) { Text("刷新") }
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
                listOf<Pair<String?, String>>(
                    null to "全部",
                    "unused" to "未使用",
                    "used" to "已使用",
                    "expired" to "已过期",
                ).forEach { (value, label) ->
                    FilterChip(
                        selected = state.statusFilter == value,
                        onClick = { viewModel.setFilter(value) },
                        label = { Text(label) },
                    )
                }
            }

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
                state.items.isEmpty() -> EmptyState(text = "还没有邀请码")
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(items = state.items, key = { it.id }) { invite ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(
                                        text = invite.code,
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    Text(
                                        text = inviteStatusLabel(invite),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = invite.email,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = "有效期至 ${invite.expiresAt.toShortTime()}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                if (invite.usedAt == null && !isExpired(invite.expiresAt)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.End,
                                    ) {
                                        TextButton(onClick = { pendingDelete = invite }) {
                                            Text("删除")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateInviteDialog(
            acting = state.acting,
            onDismiss = { showCreateDialog = false },
            onCreate = { email, days, note ->
                viewModel.create(email, days, note) { showCreateDialog = false }
            },
        )
    }

    pendingDelete?.let { invite ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除邀请码？") },
            text = { Text("删除后 ${invite.email} 将无法用它注册。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.delete(invite.id)
                        pendingDelete = null
                    },
                ) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun CreateInviteDialog(
    acting: Boolean,
    onDismiss: () -> Unit,
    onCreate: (email: String, days: String, note: String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var days by remember { mutableStateOf("7") }
    var note by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("生成邀请码") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("邀请邮箱") },
                    singleLine = true,
                    supportingText = { Text("注册时邮箱必须完全一致") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                OutlinedTextField(
                    value = days,
                    onValueChange = { days = it.filter { c -> c.isDigit() }.take(2) },
                    label = { Text("有效天数（1–90）") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("备注（可选）") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onCreate(email, days, note) }, enabled = !acting) { Text("生成") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

private fun inviteStatusLabel(invite: InviteDto): String = when {
    invite.usedAt != null -> "已使用"
    isExpired(invite.expiresAt) -> "已过期"
    else -> "未使用"
}

private fun isExpired(iso: String?): Boolean {
    if (iso.isNullOrBlank()) return false
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return false
    return instant.isBefore(Instant.now())
}
