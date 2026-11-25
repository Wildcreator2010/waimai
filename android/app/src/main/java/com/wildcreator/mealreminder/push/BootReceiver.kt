package com.wildcreator.mealreminder.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.wildcreator.mealreminder.data.session.SessionManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * 开机自启：如果本机走的是 ntfy 通道且有本地会话，恢复前台长连接。
 *
 * BOOT_COMPLETED 是 Android 12+ 允许后台启动前台服务的豁免场景之一。
 */
@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {

    @Inject
    lateinit var session: SessionManager

    @Inject
    lateinit var firebaseInitializer: FirebaseInitializer

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!session.hasRefreshToken()) return

        val useFcm = PushRegistrar.isGmsAvailable(context) && firebaseInitializer.isInitialized
        if (useFcm) {
            Log.i(TAG, "开机：本机走 FCM，无需恢复 ntfy 长连接")
            return
        }
        Log.i(TAG, "开机：恢复 ntfy 长连接")
        NtfyForegroundService.start(context)
    }

    private companion object {
        const val TAG = "BootReceiver"
    }
}
