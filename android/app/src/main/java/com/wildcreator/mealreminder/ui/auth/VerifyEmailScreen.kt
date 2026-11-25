package com.wildcreator.mealreminder.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
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
import com.wildcreator.mealreminder.ui.common.PrimaryButton
import com.wildcreator.mealreminder.ui.common.ScreenScaffold

/**
 * 邮箱验证提示页。
 *
 * 正常路径是点邮件里的链接（服务端 /auth/verify-email），
 * 这里额外提供「粘贴令牌」入口，覆盖邮件在别的设备打开的情况。
 */
@Composable
fun VerifyEmailScreen(
    email: String,
    onBack: () -> Unit,
    onGoLogin: () -> Unit,
    viewModel: VerifyEmailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenScaffold(title = "验证邮箱", onBack = onBack) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(text = "验证邮件已发送", style = MaterialTheme.typography.titleMedium)
            Text(
                text = if (email.isBlank()) "请查收注册邮箱中的验证邮件。" else "请查收 $email 中的验证邮件，点击链接即可激活账号。",
                style = MaterialTheme.typography.bodyMedium,
            )
            HintText("没收到？检查垃圾邮件目录，或 60 秒后重新发送。邮件有效期有限，过期请重新注册或联系管理员。")

            InfoBanner(message = state.info)
            ErrorBanner(message = state.error)

            PrimaryButton(
                text = if (state.cooldownSeconds > 0) {
                    "重新发送（${state.cooldownSeconds}s）"
                } else {
                    "重新发送验证邮件"
                },
                onClick = { viewModel.resend(email) },
                enabled = state.cooldownSeconds == 0,
                loading = state.loading,
            )

            OutlinedTextField(
                value = state.token,
                onValueChange = viewModel::onTokenChange,
                label = { Text("验证令牌（可选）") },
                modifier = Modifier.fillMaxWidth(),
                supportingText = { Text("如果邮件在本机浏览器打开，可直接把链接里的 token 粘贴到这里") },
            )

            TextButton(onClick = { viewModel.submitToken(onGoLogin) }) {
                Text("提交令牌并返回登录")
            }

            TextButton(onClick = onGoLogin) { Text("返回登录") }
        }
    }
}
