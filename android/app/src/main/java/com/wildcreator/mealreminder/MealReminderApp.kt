package com.wildcreator.mealreminder

import android.app.Application
import com.wildcreator.mealreminder.push.FirebaseInitializer
import com.wildcreator.mealreminder.push.NotificationHelper
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * 应用入口。
 *
 * 启动顺序：通知渠道 → Firebase（四项凭据齐备才初始化）→ 交由 RootViewModel 恢复会话。
 * 没有 google-services.json 时 FirebaseInitializer 直接返回 false，推送后续走 ntfy。
 */
@HiltAndroidApp
class MealReminderApp : Application() {

    @Inject
    lateinit var firebaseInitializer: FirebaseInitializer

    @Inject
    lateinit var notificationHelper: NotificationHelper

    override fun onCreate() {
        super.onCreate()
        // 渠道必须在任何通知之前创建（前台服务启动时也会幂等调用一次）
        notificationHelper.ensureChannels()
        firebaseInitializer.initializeIfConfigured()
    }
}
