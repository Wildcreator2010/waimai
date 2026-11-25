package com.wildcreator.mealreminder.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.wildcreator.mealreminder.R
import com.wildcreator.mealreminder.ui.common.ErrorBanner
import com.wildcreator.mealreminder.ui.common.HintText
import com.wildcreator.mealreminder.ui.common.InfoBanner
import com.wildcreator.mealreminder.ui.common.PrimaryButton
import com.wildcreator.mealreminder.ui.common.ScreenScaffold
import com.wildcreator.mealreminder.ui.common.SectionCard
import com.wildcreator.mealreminder.ui.common.ValueRow

/** 手机号绑定：发码 → 校验 → 解绑。短信是「已绑定必发」的通道，因此这里要显眼。 */
@Composable
fun PhoneBindScreen(
    onBack: () -> Unit,
    viewModel: PhoneBindViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showUnbindConfirm by remember { mutableStateOf(false) }

    ScreenScaffold(title = "绑定手机号", onBack = onBack) { innerPadding ->
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

            SectionCard(title = "当前状态") {
                ValueRow(
                    label = "手机号",
                    value = if (state.bound) state.boundPhone.orEmpty() else "未绑定",
                )
                HintText("绑定并验证后，任务命中或超时会额外发送一条短信提醒。")
            }

            if (state.bound) {
                OutlinedButton(
                    onClick = { showUnbindConfirm = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.unbinding,
                ) {
                    Text("解绑手机号")
                }
                HintText("解绑后不再发送短信，App 冷启动时会再次提示你。")
            } else {
                SectionCard(title = "绑定新手机号") {
                    OutlinedTextField(
                        value = state.phoneInput,
                        onValueChange = viewModel::onPhoneChange,
                        label = { Text("手机号") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Phone,
                            imeAction = ImeAction.Next,
                        ),
                    )

                    OutlinedTextField(
                        value = state.captchaAnswer,
                        onValueChange = viewModel::onCaptchaAnswerChange,
                        label = { Text("人机验证") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        supportingText = {
                            Text(
                                if (state.captchaQuestion.isNotBlank()) {
                                    "请计算：${state.captchaQuestion}"
                                } else {
                                    "正在加载验证题目…"
                                },
                            )
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Next,
                        ),
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(onClick = viewModel::refreshCaptcha) { Text("换一题") }
                        TextButton(
                            onClick = viewModel::sendCode,
                            enabled = !state.sending && state.cooldownSeconds == 0,
                        ) {
                            Text(
                                if (state.cooldownSeconds > 0) {
                                    "重新发送（${state.cooldownSeconds}s）"
                                } else {
                                    "发送验证码"
                                },
                            )
                        }
                    }

                    OutlinedTextField(
                        value = state.codeInput,
                        onValueChange = viewModel::onCodeChange,
                        label = { Text("短信验证码") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done,
                        ),
                    )

                    PrimaryButton(
                        text = "验证并绑定",
                        onClick = viewModel::verify,
                        loading = state.verifying,
                    )

                    HintText("验证码 5 分钟内有效；同一号码 60 秒内只能发一次。")
                }
            }

            Text(
                text = "手机号仅用于发送${stringResource(R.string.app_name)}短信，展示时始终掩码（如 138****8000）。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (showUnbindConfirm) {
        AlertDialog(
            onDismissRequest = { showUnbindConfirm = false },
            title = { Text("解绑手机号？") },
            text = { Text("解绑后短信提醒不可达，只能通过 App 或网页查看。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showUnbindConfirm = false
                        viewModel.unbind()
                    },
                ) { Text("解绑") }
            },
            dismissButton = {
                TextButton(onClick = { showUnbindConfirm = false }) { Text("取消") }
            },
        )
    }
}
