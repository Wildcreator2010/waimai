package com.wildcreator.mealreminder.push

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.wildcreator.mealreminder.MainActivity
import com.wildcreator.mealreminder.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 通知渠道与通知构造（架构 §8.2）。
 *
 * 渠道只有两个：
 *  - 到柜提醒（高优先级，可响铃震动）：入柜、超时等业务提醒
 *  - 系统消息（低优先级，静默）：ntfy 长连接常驻通知、账号/设备类消息
 */
@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /** 幂等创建渠道，Application.onCreate 与前台服务启动时都会调用。 */
    fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val arrived = NotificationChannel(
            CHANNEL_ARRIVED,
            context.getString(R.string.channel_arrived),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_arrived_desc)
            enableVibration(true)
            setShowBadge(true)
        }

        val system = NotificationChannel(
            CHANNEL_SYSTEM,
            context.getString(R.string.channel_system),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.channel_system_desc)
            setShowBadge(false)
        }

        manager.createNotificationChannels(listOf(arrived, system))
    }

    /** 到柜提醒：点击打开任务详情（reminderId 为空时打开任务列表）。 */
    @SuppressLint("MissingPermission")
    fun showArrivedNotification(title: String, body: String, reminderId: String?) {
        ensureChannels()
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val notification = NotificationCompat.Builder(context, CHANNEL_ARRIVED)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title.ifBlank { context.getString(R.string.notif_default_title) })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentIntent(reminderId, notificationId()))
            .build()

        // 无 POST_NOTIFICATIONS 权限时系统会静默丢弃，这里不额外判断以免打断流程
        runCatching { manager.notify(notificationId(), notification) }
    }

    /** 系统消息（低优先级，例如推送通道切换提示）。 */
    @SuppressLint("MissingPermission")
    fun showSystemNotification(title: String, body: String) {
        ensureChannels()
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val notification = NotificationCompat.Builder(context, CHANNEL_SYSTEM)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setContentIntent(contentIntent(null, SYSTEM_NOTIFICATION_ID))
            .build()
        runCatching { manager.notify(SYSTEM_NOTIFICATION_ID, notification) }
    }

    /** ntfy 前台服务的常驻通知（系统消息渠道）。 */
    fun buildForegroundNotification(): Notification {
        ensureChannels()
        return NotificationCompat.Builder(context, CHANNEL_SYSTEM)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notif_ntfy_running))
            .setContentText(context.getString(R.string.notif_ntfy_running_desc))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setContentIntent(contentIntent(null, FOREGROUND_NOTIFICATION_ID))
            .build()
    }

    private fun contentIntent(reminderId: String?, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!reminderId.isNullOrBlank()) {
                putExtra(MainActivity.EXTRA_REMINDER_ID, reminderId)
            }
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun notificationId(): Int =
        (System.currentTimeMillis() % NOTIFICATION_ID_MOD).toInt()

    companion object {
        const val CHANNEL_ARRIVED = "arrived"
        const val CHANNEL_SYSTEM = "system"
        const val FOREGROUND_NOTIFICATION_ID = 2001
        const val SYSTEM_NOTIFICATION_ID = 2002
        private const val NOTIFICATION_ID_MOD = 100_000L
    }
}
