package com.wildcreator.mealreminder.push

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.wildcreator.mealreminder.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firebase 初始化。支持两条路径：
 *
 *  1. **google-services.json 路径（推荐）**：文件放进 `app/` 后构建脚本自动启用官方插件，
 *     插件生成的 `FirebaseInitProvider` 会在 Application 之前完成初始化，
 *     此时 `FirebaseApp.getApps()` 非空，这里直接认领。
 *  2. **local.properties 路径**：`FCM_PROJECT_ID / FCM_APP_ID / FCM_API_KEY / FCM_SENDER_ID`
 *     四项由 BuildConfig 注入，四项全非空才手动 initializeApp。
 *
 * 两条都缺失 = 未配置 → 推送整体走 ntfy，构建与运行都不报错（docs/firebase-setup.md）。
 */
@Singleton
class FirebaseInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /** BuildConfig 四项是否齐备（local.properties 路径）。 */
    private val hasManualConfig: Boolean =
        BuildConfig.FCM_PROJECT_ID.isNotBlank() &&
            BuildConfig.FCM_APP_ID.isNotBlank() &&
            BuildConfig.FCM_API_KEY.isNotBlank() &&
            BuildConfig.FCM_SENDER_ID.isNotBlank()

    /** 是否具备可用的 Firebase 配置：插件自动初始化过，或手填四项齐备。 */
    val isConfigured: Boolean
        get() = hasManualConfig || FirebaseApp.getApps(context).isNotEmpty()

    @Volatile
    private var initialized = false

    /** 是否真的可以调用 FirebaseMessaging。 */
    val isInitialized: Boolean get() = initialized

    /** 在 Application.onCreate 调用一次；失败只记日志，绝不抛出。 */
    fun initializeIfConfigured(): Boolean {
        // 路径 1：google-services 插件已完成初始化
        if (FirebaseApp.getApps(context).isNotEmpty()) {
            initialized = true
            Log.i(TAG, "Firebase 已由 google-services 插件初始化")
            return true
        }
        // 路径 2：local.properties 注入
        if (!hasManualConfig) {
            Log.i(TAG, "Firebase 未配置（无 google-services.json 且 FCM_* 为空），推送将走 ntfy")
            return false
        }
        return try {
            val options = FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FCM_APP_ID)
                .setApiKey(BuildConfig.FCM_API_KEY)
                .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
                .setProjectId(BuildConfig.FCM_PROJECT_ID)
                .build()
            FirebaseApp.initializeApp(context, options)
            initialized = true
            Log.i(TAG, "Firebase 已初始化：project=${BuildConfig.FCM_PROJECT_ID}")
            true
        } catch (t: Throwable) {
            initialized = false
            Log.e(TAG, "Firebase 初始化失败，推送将走 ntfy", t)
            false
        }
    }

    private companion object {
        const val TAG = "FirebaseInitializer"
    }
}
