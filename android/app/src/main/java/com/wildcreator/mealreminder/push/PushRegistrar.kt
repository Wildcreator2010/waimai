package com.wildcreator.mealreminder.push

import android.content.Context
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import com.wildcreator.mealreminder.data.repository.MeRepository
import com.wildcreator.mealreminder.data.session.SessionManager
import com.wildcreator.mealreminder.domain.PushMode
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 推送通道选择（架构 §8.3 / §8.4）。
 *
 * 判定顺序：
 *  1. 有 GMS 且 Firebase 已用 BuildConfig 凭据初始化成功 → 取 FCM token，上报 pushMode=FCM
 *  2. 其余情况（无 GMS / 无凭据 / 取 token 失败）→ 上报 pushMode=NTFY，并启动 ntfy 前台长连接
 *
 * 两者互斥：服务端对 ntfyEnabled 用户会额外 publish，若 FCM 设备同时连 ntfy 会收到重复提醒。
 */
@Singleton
class PushRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val meRepository: MeRepository,
    private val session: SessionManager,
    private val firebaseInitializer: FirebaseInitializer,
) {

    /** 设备是否具备 Google Play 服务。 */
    fun isGmsAvailable(): Boolean = isGmsAvailable(context)

    /**
     * 登录后/冷启动后调用：决定走 FCM 还是 ntfy，并完成设备上报。
     * 全程在 IO 线程：取 FCM token 用的是阻塞式 Tasks.await，不能放在主线程。
     */
    suspend fun syncPushMode() {
        withContext(Dispatchers.IO) {
            if (!session.isLoggedIn()) return@withContext

            val useFcm = isGmsAvailable() && firebaseInitializer.isInitialized
            if (useFcm) {
                val token = fetchFcmToken()
                if (!token.isNullOrBlank()) {
                    runCatching { meRepository.registerDevice(PushMode.FCM, token) }
                        .onFailure { Log.w(TAG, "上报 FCM 设备失败", it) }
                    NtfyForegroundService.stop(context)
                    Log.i(TAG, "推送通道：FCM")
                    return@withContext
                }
                Log.w(TAG, "FCM token 获取失败，降级到 ntfy")
            }

            runCatching { meRepository.registerDevice(PushMode.NTFY, null) }
                .onFailure { Log.w(TAG, "上报 NTFY 设备失败", it) }
            NtfyForegroundService.start(context)
            Log.i(TAG, "推送通道：NTFY")
        }
    }

    /** FCM token 轮换时（FirebaseMessagingService.onNewToken）单独上报。 */
    suspend fun uploadFcmToken(token: String) {
        withContext(Dispatchers.IO) {
            if (!session.isLoggedIn()) return@withContext
            runCatching { meRepository.registerDevice(PushMode.FCM, token) }
                .onFailure { Log.w(TAG, "上报新 FCM token 失败", it) }
        }
    }

    /**
     * 取 FCM token。用 Tasks.await 同步等待（调用方已在 IO 线程），
     * 避免为一个 Task 引入 kotlinx-coroutines-play-services 依赖。
     */
    private fun fetchFcmToken(): String? = runCatching {
        Tasks.await(FirebaseMessaging.getInstance().token, 20, TimeUnit.SECONDS)
    }.onFailure { Log.w(TAG, "获取 FCM token 异常", it) }.getOrNull()

    companion object {
        private const val TAG = "PushRegistrar"

        /** 静态版本：供 BroadcastReceiver 等无法注入的场景判断 GMS。 */
        fun isGmsAvailable(context: Context): Boolean {
            val status = runCatching {
                GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
            }.getOrDefault(ConnectionResult.SERVICE_MISSING)
            return status == ConnectionResult.SUCCESS
        }
    }
}
