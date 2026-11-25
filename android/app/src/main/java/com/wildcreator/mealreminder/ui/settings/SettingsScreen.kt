package com.wildcreator.mealreminder.ui.settings

import android.content.Intent
import android.net.Uri

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.domain.Role
import com.wildcreator.mealreminder.domain.UserStatus
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.HintText
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.PrimaryButton
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.SectionCard
import com.wildcreator.mealreminder.ui.common.SwitchRow
import com.wildcreator.mealreminder.ui.common.ValueRow

/** 设置页：账号信息、通知开关、ntfy、设备信息、退出登录。 */
@Composable
fun SettingsScreen(
    onOpenPhoneBind: () -> Unit,
    onLogout: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val user by viewModel.user.collectAsStateWithLifecycle()
    var showDeleteConfirm by remember { mutableStateOf(false) }

    ScreenScaffold(title = "设置") { innerPadding ->
        if (state.loading && state.settings == null) {
            LoadingBox(modifier = Modifier.padding(innerPadding))
            return@ScreenScaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ErrorBanner(message = state.error, onRetry = viewModel::load)
            InfoBanner(message = state.info)

            // -------------------------------------------------- 账号
            SectionCard(title = "账号") {
                ValueRow(label = "邮箱", value = user?.email.orEmpty())
                ValueRow(label = "角色", value = Role.from(user?.role).label)
                ValueRow(label = "状态", value = UserStatus.label(user?.status))
                ValueRow(
                    label = "手机号",
                    value = when {
                        user == null -> "—"
                        user?.phoneVerified == true -> user?.phone.orEmpty()
                        else -> "未绑定"
                    },
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    OutlinedButton(onClick = onOpenPhoneBind) {
                        Text(if (user?.phoneVerified == true) "管理手机号" else "绑定手机号")
                    }
                }
                if (user?.phoneVerified != true) {
                    HintText("未绑定手机号时短信提醒不可达，只能通过 App 或网页查看。")
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text("修改密码", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = state.pwCurrent,
                    onValueChange = viewModel::onPwCurrentChange,
                    label = { Text("当前密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.pwNew,
                    onValueChange = viewModel::onPwNewChange,
                    label = { Text("新密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    supportingText = { Text("至少 8 位，且同时包含字母和数字") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.pwConfirm,
                    onValueChange = viewModel::onPwConfirmChange,
                    label = { Text("确认新密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                state.pwError?.let { HintText(it) }
                state.pwMessage?.let { HintText(it) }
                PrimaryButton(
                    text = "修改密码",
                    onClick = viewModel::changePassword,
                    loading = state.changing,
                )

                Spacer(modifier = Modifier.height(4.dp))
                val context = LocalContext.current
                TextButton(
                    onClick = {
                        runCatching {
                            context.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("${viewModel.serverBaseUrl()}/terms"),
                                ),
                            )
                        }
                    },
                ) {
                    Text("查看《用户协议》")
                }
            }

            // -------------------------------------------------- 服务器地址（消息源）
            SectionCard(title = "服务器地址") {
                ValueRow(label = "当前", value = state.serverUrl)
                HintText("开源部署时改成你自己的服务器；切换后需要重新登录。")
                OutlinedTextField(
                    value = state.serverInput,
                    onValueChange = viewModel::onServerInputChange,
                    label = { Text("服务器地址") },
                    singleLine = true,
                    placeholder = { Text("https://meal.example.com") },
                    modifier = Modifier.fillMaxWidth(),
                )
                state.serverError?.let { HintText(it) }
                state.serverMessage?.let { HintText(it) }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    PrimaryButton(
                        text = "保存并测试",
                        onClick = viewModel::saveServer,
                        loading = state.serverTesting,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(onClick = viewModel::resetServer) {
                        Text("恢复默认")
                    }
                }
            }

            // -------------------------------------------------- 危险操作
            SectionCard(title = "危险操作") {
                HintText("注销账号会删除你的全部任务、事件与设备记录，不可恢复。初始管理员不能注销自己。")
                OutlinedTextField(
                    value = state.deletePassword,
                    onValueChange = viewModel::onDeletePasswordChange,
                    label = { Text("输入密码以确认注销") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                state.deleteError?.let { HintText(it) }
                OutlinedButton(
                    onClick = { showDeleteConfirm = true },
                    enabled = state.deletePassword.isNotBlank() && !state.deleting,
                ) {
                    Text("注销我的账号")
                }

                if (showDeleteConfirm) {
                    AlertDialog(
                        onDismissRequest = { showDeleteConfirm = false },
                        title = { Text("确认注销账号？") },
                        text = {
                            Text("账号与全部任务将被永久删除，无法恢复。注销后需要管理员重新发邀请码才能再次注册。")
                        },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    showDeleteConfirm = false
                                    viewModel.deleteAccount()
                                },
                            ) { Text("确认注销") }
                        },
                        dismissButton = {
                            TextButton(onClick = { showDeleteConfirm = false }) { Text("取消") }
                        },
                    )
                }
            }

            // -------------------------------------------------- 通知设置
            val settings = state.settings
            SectionCard(title = "通知") {
                SwitchRow(
                    label = "通知内容包含详情",
                    description = "开启：标题「外卖已入柜」，正文显示柜号与取餐码；关闭：只提示打开 App 查看",
                    checked = settings?.showNotifyDetails ?: true,
                    onCheckedChange = viewModel::setShowNotifyDetails,
                    enabled = !state.saving,
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SwitchRow(
                    label = "短信提醒",
                    description = when {
                        settings?.smsAvailable == false -> "服务端未配置短信，暂不可用"
                        settings?.phoneVerified != true -> "需要先绑定并验证手机号"
                        else -> "入柜后发送短信（模板固定，不受上面的内容开关影响）"
                    },
                    checked = settings?.smsEnabled ?: false,
                    onCheckedChange = viewModel::setSmsEnabled,
                    enabled = !state.saving && settings?.phoneVerified == true && settings?.smsAvailable != false,
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SwitchRow(
                    label = "ntfy 主动连接",
                    description = "无 GMS 设备默认开启；有 GMS 时可作为备用通道",
                    checked = settings?.ntfyEnabled ?: false,
                    onCheckedChange = viewModel::setNtfyEnabled,
                    enabled = !state.saving,
                )
                ValueRow(label = "ntfy topic", value = maskTopic(settings?.ntfyTopic))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        onClick = viewModel::rotateNtfyTopic,
                        enabled = !state.saving,
                    ) { Text("重置 topic") }
                }
                HintText("重置后旧 topic 立即失效；已连接的设备会在下次重连时使用新 topic。")
            }

            // -------------------------------------------------- 设备信息
            SectionCard(title = "设备信息") {
                ValueRow(label = "设备型号", value = viewModel.deviceSummary)
                ValueRow(label = "系统", value = viewModel.osSummary)
                ValueRow(label = "应用版本", value = viewModel.appVersion)
                ValueRow(label = "推送通道", value = viewModel.pushChannelLabel)
                ValueRow(label = "服务端", value = viewModel.serverUrl)
                ValueRow(label = "已注册设备", value = "${state.devices.size} 台")
                state.devices.forEach { device ->
                    ValueRow(
                        label = "",
                        value = "${device.name.ifBlank { "未命名设备" }} · ${device.pushMode}" +
                            if (device.lastSeenAt != null) " · 最近活跃 ${device.lastSeenAt.orEmpty().take(10)}" else "",
                    )
                }
            }

            // -------------------------------------------------- 退出
            OutlinedButton(
                onClick = onLogout,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                Text("退出登录", color = MaterialTheme.colorScheme.error)
            }

            Text(
                text = "退出后本地令牌会被清除，需要重新登录。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

/** topic 只展示前 8 位，避免旁人直接抄走。 */
private fun maskTopic(topic: String?): String {
    if (topic.isNullOrBlank()) return "未分配"
    return if (topic.length <= 8) topic else topic.take(8) + "…"
}
