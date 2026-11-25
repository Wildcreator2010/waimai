package com.wildcreator.mealreminder.ui.admin

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import com.wildcreator.mealreminder.ui.common.ValueRow
import com.wildcreator.mealreminder.ui.common.toFullTime

/**
 * MemberToken 管理：只读掩码 + 修改 + 测试有效性。
 * 明文永不回显；保存后服务端会立即调一次 openMark 验证。
 */
@Composable
fun AdminMemberTokenScreen(
    onBack: () -> Unit,
    viewModel: AdminMemberTokenViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenScaffold(
        title = "MemberToken",
        onBack = onBack,
        actions = { TextButton(onClick = viewModel::load) { Text("刷新") } },
    ) { innerPadding ->
        if (state.loading && state.token == null) {
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

            val token = state.token
            SectionCard(title = "当前凭证") {
                ValueRow(
                    label = "状态",
                    value = if (token?.configured == true) "已配置" else "未配置",
                )
                ValueRow(
                    label = "掩码",
                    value = token?.masked?.takeIf { it.isNotBlank() } ?: "—",
                )
                ValueRow(label = "更新时间", value = token?.updatedAt.toFullTime())
                ValueRow(label = "更新人", value = token?.updatedBy ?: "—")
                ValueRow(label = "最近验证", value = token?.lastVerifiedAt.toFullTime())
                ValueRow(
                    label = "验证结果",
                    value = when (token?.lastVerifyOk) {
                        true -> "通过"
                        false -> "失败"
                        null -> "尚未验证"
                    },
                )
                if (!token?.lastVerifyMessage.isNullOrBlank()) {
                    ValueRow(label = "说明", value = token?.lastVerifyMessage.orEmpty())
                }
                if (token?.expiringSoon == true) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "⚠ 凭证可能即将失效，请尽快更新。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            SectionCard(title = "修改凭证") {
                OutlinedTextField(
                    value = state.input,
                    onValueChange = viewModel::onInputChange,
                    label = { Text("新的 MemberToken") },
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("至少 8 个字符，不能含空白；保存后立即验证并写审计") },
                )
                Spacer(modifier = Modifier.height(8.dp))
                PrimaryButton(
                    text = "保存并验证",
                    onClick = viewModel::save,
                    loading = state.saving,
                    enabled = state.input.isNotBlank(),
                )
            }

            OutlinedButton(
                onClick = viewModel::verify,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.verifying,
            ) {
                Text(if (state.verifying) "验证中…" else "测试已存凭证的有效性")
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Start,
            ) {
                HintText("明文只在提交时传输一次，服务端 AES-256-GCM 加密存储，任何接口都不回传明文。")
            }
        }
    }
}
