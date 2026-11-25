package com.wildcreator.mealreminder.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.HintText
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.LoadingBox
import com.wildcreator.mealreminder.ui.common.PrimaryButton
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.SectionCard
import com.wildcreator.mealreminder.ui.common.SwitchRow

/** 系统设置：只提交 api.md 列出的字段。 */
@Composable
fun AdminSystemSettingsScreen(
    onBack: () -> Unit,
    viewModel: AdminSystemSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenScaffold(
        title = "系统设置",
        onBack = onBack,
        actions = { TextButton(onClick = viewModel::load) { Text("重新加载") } },
    ) { innerPadding ->
        if (state.loading) {
            LoadingBox(modifier = Modifier.padding(innerPadding))
            return@ScreenScaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ErrorBanner(message = state.error)
            InfoBanner(message = state.info)

            SectionCard(title = "轮询与任务") {
                OutlinedTextField(
                    value = state.pollIntervalSec,
                    onValueChange = viewModel::onPollIntervalChange,
                    label = { Text("轮询间隔（秒）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("下限 10 秒；越短越及时，但会给取餐柜接口更大压力") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = state.defaultDurationMin,
                    onValueChange = viewModel::onDefaultDurationChange,
                    label = { Text("默认监控时长（分钟）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = state.maxDurationMin,
                    onValueChange = viewModel::onMaxDurationChange,
                    label = { Text("最大监控时长（分钟）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("上限 720") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = state.maxActiveRemindersPerUser,
                    onValueChange = viewModel::onMaxActiveChange,
                    label = { Text("单用户同时等待任务上限") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }

            SectionCard(title = "取餐柜") {
                OutlinedTextField(
                    value = state.lockerDeviceSn,
                    onValueChange = viewModel::onDeviceSnChange,
                    label = { Text("设备 SN") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("短信模板 ${'$'}{SN} 的取值") },
                )
                OutlinedTextField(
                    value = state.lockerApiBase,
                    onValueChange = viewModel::onLockerApiBaseChange,
                    label = { Text("取餐柜接口地址") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            SectionCard(title = "推送与注册") {
                OutlinedTextField(
                    value = state.ntfyServerUrl,
                    onValueChange = viewModel::onNtfyServerChange,
                    label = { Text("ntfy 服务地址") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("App 会连接 wss://{该地址}/{topic}/ws") },
                )
                SwitchRow(
                    label = "开放注册",
                    description = "关闭后仅管理员可创建账号",
                    checked = state.registrationOpen,
                    onCheckedChange = viewModel::onRegistrationOpenChange,
                )
                SwitchRow(
                    label = "默认开启通知详情",
                    description = "新用户默认在通知里显示柜号与取餐码",
                    checked = state.showNotifyDetailsDefault,
                    onCheckedChange = viewModel::onShowNotifyDetailsDefaultChange,
                )
            }

            PrimaryButton(
                text = "保存设置",
                onClick = viewModel::save,
                loading = state.saving,
            )

            HintText("所有修改都会写审计日志。轮询间隔改动在下一轮生效，无需重启服务。")
        }
    }
}
