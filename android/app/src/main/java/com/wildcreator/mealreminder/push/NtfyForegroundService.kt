package com.wildcreator.mealreminder.push

import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.IBinder
import android.util.Log
import com.wildcreator.mealreminder.R
import com.wildcreator.mealreminder.data.repository.MeRepository
import com.wildcreator.mealreminder.data.session.SessionManager
import com.wildcreator.mealreminder.di.NtfyClient
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * ntfy 主动长连接前台服务（无 GMS 时的默认推送通道）。
 *
 * - 启动即 startForeground，通知栏常驻（系统消息渠道），避免被系统回收
 * - 每次连接前拉一次 /api/me/ntfy/config，拿到 serverUrl/topic/token
 * - 断线指数退避重连：2s → 4s → 8s …… 上限 60s；连接成功即重置退避
 * - 收到的 ntfy 消息转成本地通知，点击跳任务详情
 */
@AndroidEntryPoint
class NtfyForegroundService : Service() {

    @Inject
    lateinit var meRepository: MeRepository

    @Inject
    lateinit var session: SessionManager

    @Inject
    lateinit var notificationHelper: NotificationHelper

    @Inject
    @NtfyClient
    lateinit var ntfyClient: OkHttpClient

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }

    private var connectJob: Job? = null
    private var webSocket: WebSocket? = null

    @Volatile
    private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running) return START_STICKY
        running = true

        notificationHelper.ensureChannels()
        startForeground(NotificationHelper.FOREGROUND_NOTIFICATION_ID, notificationHelper.buildForegroundNotification())

        connectJob = scope.launch { connectLoop() }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        connectJob?.cancel()
        connectJob = null
        webSocket?.cancel()
        webSocket = null
        scope.cancel()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- 连接循环

    private suspend fun connectLoop() {
        var backoffMs = INITIAL_BACKOFF_MS

        while (currentCoroutineContext().isActive) {
            if (!session.isLoggedIn()) {
                // 已登出，无需再保持长连接
                stopSelf()
                return
            }

            val config = runCatching { meRepository.ntfyConfig() }.getOrNull()
            if (config == null) {
                Log.w(TAG, "ntfy 配置不可用，稍后重试")
                delay(CONFIG_RETRY_MS)
                continue
            }
            val wsUrl = NtfyUrl.build(config.serverUrl, config.topic)
            if (wsUrl == null) {
                Log.w(TAG, "ntfy topic 未分配，稍后重试")
                delay(CONFIG_RETRY_MS)
                continue
            }

            val ended = CompletableDeferred<Boolean>()
            val request = Request.Builder()
                .url(wsUrl)
                .apply {
                    if (!config.token.isNullOrBlank()) {
                        header("Authorization", "Bearer ${config.token}")
                    }
                }
                .build()

            val listener = object : WebSocketListener() {
                // onOpen / onFailure / onClosed 都由同一条 OkHttp 读线程回调，无需同步
                var opened = false

                override fun onOpen(webSocket: WebSocket, response: Response) {
                    opened = true
                    Log.i(TAG, "ntfy 长连接已建立")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleMessage(text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "ntfy 长连接失败：${t.message}")
                    ended.complete(opened)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.i(TAG, "ntfy 长连接关闭：$code $reason")
                    ended.complete(opened)
                }
            }

            webSocket = ntfyClient.newWebSocket(request, listener)
            val opened = runCatching { ended.await() }.getOrDefault(false)
            webSocket?.cancel()
            webSocket = null

            if (!currentCoroutineContext().isActive) break

            if (opened) backoffMs = INITIAL_BACKOFF_MS
            delay(backoffMs)
            backoffMs = (backoffMs * 2).coerceAtMost(MAX_BACKOFF_MS)
        }
    }

    // ---------------------------------------------------------------- 消息处理

    private fun handleMessage(text: String) {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return

        // ntfy 的 event 取值：open / keepalive / message / poll_request，只有 message 需要提醒
        val event = obj["event"]?.jsonPrimitive?.contentOrNull
        if (event != null && event != EVENT_MESSAGE) return

        val message = obj["message"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() } ?: return
        val title = obj["title"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: getString(R.string.notif_default_title)

        notificationHelper.showArrivedNotification(
            title = title,
            body = message,
            reminderId = extractReminderId(obj),
        )
    }

    /**
     * 服务端 ntfy 消息的载荷格式在 api.md 中未固定，这里按「宽容解析」处理：
     * 优先读 reminderId / reminder_id 字段，其次从 click 链接的查询参数里取。
     * 都取不到时点击通知只打开任务列表。
     */
    private fun extractReminderId(obj: JsonObject): String? {
        for (key in listOf("reminderId", "reminder_id")) {
            obj[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { return it }
        }
        val click = obj["click"]?.jsonPrimitive?.contentOrNull ?: return null
        return runCatching { Uri.parse(click).getQueryParameter("reminderId") }.getOrNull()
    }

    companion object {
        private const val TAG = "NtfyService"
        private const val EVENT_MESSAGE = "message"
        private const val INITIAL_BACKOFF_MS = 2_000L
        private const val MAX_BACKOFF_MS = 60_000L
        private const val CONFIG_RETRY_MS = 15_000L

        /** 启动长连接；Android 12+ 后台启动前台服务可能被拒，失败只记日志。 */
        fun start(context: Context) {
            val intent = Intent(context, NtfyForegroundService::class.java)
            runCatching {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }.onFailure { Log.w(TAG, "启动 ntfy 前台服务失败：${it.message}") }
        }

        fun stop(context: Context) {
            runCatching { context.stopService(Intent(context, NtfyForegroundService::class.java)) }
        }
    }
}
