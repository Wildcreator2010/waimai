package com.wildcreator.mealreminder.ui.admin

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.SectionCard
import com.wildcreator.mealreminder.ui.common.StatCell

/**
 * 管理台首页：概览数字 + 各管理入口。
 *
 * 角色可见性：USER 根本看不到底部「管理」入口；ADMIN/ROOT 才进得来。
 * 页面内的危险操作（提权、转让 ROOT）再按 ROOT 二次收敛。
 */
@Composable
fun AdminHomeScreen(
    onBack: (() -> Unit)?,
    onOpenUsers: () -> Unit,
    onOpenInvites: () -> Unit,
    onOpenMemberToken: () -> Unit,
    onOpenSystemSettings: () -> Unit,
    onOpenAlerts: () -> Unit,
    onOpenAudit: () -> Unit,
    viewModel: AdminHomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenScaffold(
        title = "管理台",
        onBack = onBack,
        actions = { TextButton(onClick = viewModel::load) { Text("刷新") } },
    ) { innerPadding ->
        if (state.loading && state.overview == null) {
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

            val overview = state.overview
            SectionCard(title = "概览") {
                if (overview == null) {
                    Text("暂无数据", style = MaterialTheme.typography.bodyMedium)
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        StatCell(label = "用户总数", value = overview.users.total.toString())
                        StatCell(label = "活跃用户", value = overview.users.active.toString())
                        StatCell(label = "管理员", value = overview.users.admins.toString())
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        StatCell(label = "等待中任务", value = overview.reminders.waiting.toString())
                        StatCell(label = "今日到柜", value = overview.reminders.arrivedToday.toString())
                        StatCell(label = "今日超时", value = overview.reminders.timeoutToday.toString())
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        StatCell(label = "今日短信", value = overview.sms.sentToday.toString())
                        StatCell(label = "短信失败", value = overview.sms.failedToday.toString())
                        StatCell(label = "未确认告警", value = overview.alerts.unacked.toString())
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "MemberToken：" + if (overview.locker.configured) "已配置" else "未配置",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            text = when (overview.locker.lastVerifyOk) {
                                true -> "最近验证通过"
                                false -> "最近验证失败"
                                null -> "尚未验证"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            MenuEntry("用户", "创建/停用/删除账号，ROOT 可提权与转让", onOpenUsers)
            MenuEntry("邀请码", "一码一邮箱，注册必备", onOpenInvites)
            MenuEntry("MemberToken", "取餐柜凭证：掩码查看、修改、测试有效性", onOpenMemberToken)
            MenuEntry("系统设置", "轮询间隔、任务上限、设备 SN、ntfy 地址", onOpenSystemSettings)
            MenuEntry("告警", "短信失败、凭证失效、轮询异常", onOpenAlerts)
            MenuEntry("审计", "角色变更、凭证、设置等操作留痕", onOpenAudit)

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun MenuEntry(title: String, description: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
