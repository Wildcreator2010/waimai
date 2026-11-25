package com.wildcreator.mealreminder.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wildcreator.mealreminder.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * FCM 接收端。
 *
 * 只在 Firebase 已初始化时才会被系统创建；没有 google-services.json 时该服务永远不触发。
 * 处理策略：
 *  - 带 notification 载荷的消息交给系统展示（否则会重复弹两次），这里直接返回
 *  - data-only 消息自己构造「到柜提醒」通知，保证渠道与点击跳转一致
 */
@AndroidEntryPoint
class MealFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var pushRegistrar: PushRegistrar

    @Inject
    lateinit var notificationHelper: NotificationHelper

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        scope.launch { pushRegistrar.uploadFcmToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        // 系统会自行展示 notification 载荷，重复处理会出现两条通知
        if (message.notification != null) return

        val data = message.data
        val title = data["title"].orEmpty().ifBlank { getString(R.string.notif_default_title) }
        val body = data["body"] ?: data["message"] ?: return
        val reminderId = data["reminderId"] ?: data["reminder_id"]

        notificationHelper.showArrivedNotification(title = title, body = body, reminderId = reminderId)
    }
}
