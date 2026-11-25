package com.wildcreator.mealreminder.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.R
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.PrimaryButton

/** 登录页。登录成功由会话状态驱动跳转，页面自身不做导航。 */
@Composable
fun LoginScreen(
    onNavigateRegister: () -> Unit,
    onNavigateForgotPassword: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showServerDialog by remember { mutableStateOf(false) }

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(modifier = Modifier.height(24.dp))
            Text(text = stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium)
            Text(
                text = "外卖入柜，第一时间提醒你去取",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))

            if (state.needsBootstrap) {
                InfoBanner(message = "服务端尚未初始化：请先在网页端用引导码创建 ROOT 账号。")
            }

            OutlinedTextField(
                value = state.email,
                onValueChange = viewModel::onEmailChange,
                label = { Text("邮箱") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
            )

            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::onPasswordChange,
                label = { Text("密码") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
            )

            ErrorBanner(message = state.error)

            PrimaryButton(
                text = "登录",
                onClick = viewModel::login,
                loading = state.loading,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onNavigateRegister) { Text("注册（需要邀请码）") }
                TextButton(onClick = onNavigateForgotPassword) { Text("忘记密码") }
            }

            // 服务器地址（消息源）：开源部署时用户填自己的地址
            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider()
            TextButton(
                onClick = { showServerDialog = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "服务器：${state.serverUrl}（点击修改）",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        if (showServerDialog) {
            AlertDialog(
                onDismissRequest = { showServerDialog = false },
                title = { Text("服务器地址") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "填你部署的服务端地址，例如 https://meal.example.com。保存前会先测试连通性。",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        OutlinedTextField(
                            value = state.serverInput,
                            onValueChange = viewModel::onServerInputChange,
                            label = { Text("地址") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        state.serverError?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                        state.serverMessage?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.saveServer()
                        },
                        enabled = !state.serverTesting,
                    ) { Text(if (state.serverTesting) "测试中…" else "保存并测试") }
                },
                dismissButton = {
                    Row {
                        TextButton(onClick = viewModel::resetServer) { Text("恢复默认") }
                        TextButton(onClick = { showServerDialog = false }) { Text("关闭") }
                    }
                },
            )
        }
    }
}
