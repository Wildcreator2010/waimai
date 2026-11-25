package com.wildcreator.mealreminder

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import com.wildcreator.mealreminder.ui.AppRoot
import com.wildcreator.mealreminder.ui.theme.MealReminderTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * 单 Activity 宿主。
 *
 * 通知点击带 EXTRA_REMINDER_ID 进来时，AppRoot 会在登录态就绪后跳到对应任务详情。
 * launchMode=singleTop，因此已在前台时走 onNewIntent。
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val pendingReminderId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        pendingReminderId.value = intent?.getStringExtra(EXTRA_REMINDER_ID)

        setContent {
            MealReminderTheme {
                AppRoot(
                    pendingReminderId = pendingReminderId.value,
                    onReminderConsumed = { pendingReminderId.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingReminderId.value = intent.getStringExtra(EXTRA_REMINDER_ID)
    }

    companion object {
        /** 通知点击携带的任务 id。 */
        const val EXTRA_REMINDER_ID = "extra_reminder_id"
    }
}
