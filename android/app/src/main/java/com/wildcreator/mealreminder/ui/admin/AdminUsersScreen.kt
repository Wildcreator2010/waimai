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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.data.remote.dto.AdminUserDto
import com.wildcreator.mealreminder.domain.Role
import com.wildcreator.mealreminder.domain.UserStatus
import com.wildcreator.mealreminder.ui.common.EmptyState
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.ScreenScaffold

/**
 * 用户管理。
 *
 * 按钮可见性按权限矩阵（docs/architecture.md §5.4）：
 *  - ROOT：可提权/降级、可停用/删除 ADMIN 与 USER、可转让 ROOT
 *  - ADMIN：只能停用/删除普通用户；看不到「提权」「转让 ROOT」
 *  - 任何人都不能改 ROOT 的 role/status
 */
@Composable
fun AdminUsersScreen(
    onBack: () -> Unit,
    viewModel: AdminUsersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val myRole = viewModel.myRole
    val myUserId = viewModel.myUserId

    var showCreateDialog by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<AdminUserDto?>(null) }
    var pendingTransfer by remember { mutableStateOf<AdminUserDto?>(null) }

    ScreenScaffold(
        title = "用户",
        onBack = onBack,
        actions = {
            TextButton(onClick = { showCreateDialog = true }) { Text("新建") }
            TextButton(onClick = viewModel::load) { Text("刷新") }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                label = { Text("搜索邮箱") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                trailingIcon = {
                    TextButton(onClick = viewModel::load) { Text("查询") }
                },
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
                state.items.isEmpty() -> EmptyState(text = "没有匹配的用户")
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(items = state.items, key = { it.id }) { user ->
                        UserRow(
                            user = user,
                            myRole = myRole,
                            isSelf = user.id == myUserId,
                            onToggleStatus = {
                                val next = if (user.status.equals(UserStatus.ACTIVE, true)) {
                                    UserStatus.DISABLED
                                } else {
                                    UserStatus.ACTIVE
                                }
                                viewModel.setStatus(user.id, next)
                            },
                            onChangeRole = {
                                val next = if (Role.from(user.role) == Role.USER) "ADMIN" else "USER"
                                viewModel.setRole(user.id, next)
                            },
                            onTransfer = { pendingTransfer = user },
                            onDelete = { pendingDelete = user },
                        )
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateUserDialog(
            acting = state.acting,
            onDismiss = { showCreateDialog = false },
            onCreate = { email, password, role, displayName ->
                viewModel.create(email, password, role, displayName) { showCreateDialog = false }
            },
        )
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除账号？") },
            text = { Text("将级联删除 ${target.email} 的任务、设备与会话，且不可恢复。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.delete(target.id)
                        pendingDelete = null
                    },
                ) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("取消") }
            },
        )
    }

    pendingTransfer?.let { target ->
        TransferRootDialog(
            targetEmail = target.email,
            acting = state.acting,
            onDismiss = { pendingTransfer = null },
            onConfirm = { password ->
                viewModel.transferRoot(target.id, password) { pendingTransfer = null }
            },
        )
    }
}

@Composable
private fun UserRow(
    user: AdminUserDto,
    myRole: Role,
    isSelf: Boolean,
    onToggleStatus: () -> Unit,
    onChangeRole: () -> Unit,
    onTransfer: () -> Unit,
    onDelete: () -> Unit,
) {
    val targetRole = Role.from(user.role)
    val canTouchStatus = !isSelf && when (targetRole) {
        Role.ROOT -> false
        Role.ADMIN -> myRole == Role.ROOT
        Role.USER -> myRole.canEnterAdmin
    }
    val canChangeRole = myRole.canManageRoles && !isSelf && targetRole != Role.ROOT
    val canTransfer = myRole.canManageRoles && !isSelf && targetRole != Role.ROOT
    val canDelete = canTouchStatus

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = user.email, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "${targetRole.label} · ${UserStatus.label(user.status)} · ${user.phone ?: "未绑定手机号"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (canTouchStatus || canChangeRole || canTransfer || canDelete) {
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (canTouchStatus) {
                        TextButton(onClick = onToggleStatus) {
                            Text(if (user.status.equals(UserStatus.ACTIVE, true)) "停用" else "启用")
                        }
                    }
                    if (canChangeRole) {
                        TextButton(onClick = onChangeRole) {
                            Text(if (targetRole == Role.USER) "提权为管理员" else "降为普通用户")
                        }
                    }
                    if (canTransfer) {
                        TextButton(onClick = onTransfer) { Text("转让 ROOT") }
                    }
                    if (canDelete) {
                        TextButton(onClick = onDelete) { Text("删除") }
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateUserDialog(
    acting: Boolean,
    onDismiss: () -> Unit,
    onCreate: (email: String, password: String, role: String, displayName: String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("USER") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建账号") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("邮箱") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("初始密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    supportingText = { Text("至少 8 位；首次登录需改密") },
                )
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text("显示名（可选）") },
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = role == "USER",
                        onClick = { role = "USER" },
                        label = { Text("普通用户") },
                    )
                    FilterChip(
                        selected = role == "ADMIN",
                        onClick = { role = "ADMIN" },
                        label = { Text("管理员") },
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(email, password, role, displayName) },
                enabled = !acting,
            ) { Text("创建") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun TransferRootDialog(
    targetEmail: String,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var password by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("转让 ROOT") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("转让后你将降为 ADMIN，$targetEmail 成为新 ROOT，双方会话全部失效。")
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("你的当前密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(password) }, enabled = !acting) { Text("确认转让") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
