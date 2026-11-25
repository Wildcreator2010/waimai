package com.wildcreator.mealreminder.ui.reminder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.HintText
import com.wildcreator.mealreminder.ui.common.PrimaryButton
import com.wildcreator.mealreminder.ui.common.ScreenScaffold

/**
 * 创建任务：三个变量 —— 取餐码 / 柜机 cabCode / 监控时长。
 *
 * 取餐码支持两种来源：
 *  - 自定义：任意字符串（外卖小票上的取餐码）
 *  - 手机尾号：必须 4 位数字，绑定了手机号时自动填入后四位
 * 柜机 cabCode 默认值由服务端下发（抓包得到的柜机），可手改。
 * 时长只决定「等多久」；误报由服务端基线机制控制。
 */
@Composable
fun CreateReminderScreen(
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    viewModel: CreateReminderViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // 无告警时直接跳详情
    LaunchedEffect(state.createdId, state.warnings) {
        val id = state.createdId ?: return@LaunchedEffect
        if (state.warnings.isEmpty()) onCreated(id)
    }

    ScreenScaffold(title = "创建任务", onBack = onBack) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            HintText("服务端会按固定间隔查询取餐柜；检测到你的取餐码入柜后立即通过推送/短信提醒。")

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = !state.isPhoneTail,
                    onClick = { viewModel.onModeChange("custom") },
                    label = { Text("自定义取餐码") },
                )
                FilterChip(
                    selected = state.isPhoneTail,
                    onClick = { viewModel.onModeChange("phone_tail") },
                    label = { Text("手机尾号后四位") },
                )
            }

            OutlinedTextField(
                value = state.pickupCode,
                onValueChange = viewModel::onPickupCodeChange,
                label = { Text(if (state.isPhoneTail) "手机尾号（4 位数字）" else "取餐码") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                supportingText = {
                    Text(
                        if (state.isPhoneTail) {
                            if (state.boundPhoneTail.isNotBlank()) {
                                "已按绑定手机号填入后四位，可修改；必须正好 4 位数字"
                            } else {
                                "取餐柜用手机尾号识别时填写；必须正好 4 位数字"
                            }
                        } else {
                            "外卖订单上的取餐码，最长 64 个字符"
                        },
                    )
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (state.isPhoneTail) KeyboardType.Number else KeyboardType.Text,
                    imeAction = ImeAction.Next,
                ),
            )

            OutlinedTextField(
                value = state.cabCode,
                onValueChange = viewModel::onCabCodeChange,
                label = { Text("柜机编号（cabCode）") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                supportingText = { Text("已预填当前柜机编号（来自抓包），换柜机时手动改") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )

            OutlinedTextField(
                value = state.durationMin,
                onValueChange = viewModel::onDurationChange,
                label = { Text("监控时长（分钟）") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                supportingText = {
                    Text("1–${state.maxDurationMin} 分钟，默认 ${state.defaultDurationMin}；超时会推送一条超时提醒")
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done,
                ),
            )

            ErrorBanner(message = state.error)

            PrimaryButton(
                text = "开始监控",
                onClick = viewModel::create,
                loading = state.loading,
            )

            HintText("首次查询只记录基线，之后只提醒「新出现且与基线不同」的记录，不会把上一单误判为已入柜。")
        }
    }

    val createdId = state.createdId
    if (createdId != null && state.warnings.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { onCreated(createdId) },
            title = { Text("任务已创建") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    state.warnings.forEach { warning -> Text(text = warning) }
                }
            },
            confirmButton = {
                TextButton(onClick = { onCreated(createdId) }) { Text("知道了") }
            },
        )
    }
}
