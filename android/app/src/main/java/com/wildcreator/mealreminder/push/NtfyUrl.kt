package com.wildcreator.mealreminder.push

/**
 * 构造 ntfy WebSocket 地址（架构 §8.4）：
 *   `wss://{server}/{topic}/ws?since=all`
 *
 * 服务端 /api/me/ntfy/config 可能返回 `wss://`、`https://` 或裸主机名，这里统一归一化。
 * 说明：App 关闭了明文流量（usesCleartextTraffic=false），所以 http/ws 的地址会连接失败；
 * 部署侧由 Caddy 终结 TLS，正常返回的就是 wss。
 */
object NtfyUrl {

    fun build(serverUrl: String?, topic: String?): String? {
        val server = serverUrl.orEmpty().trim().trimEnd('/')
        val safeTopic = topic.orEmpty().trim()
        if (server.isBlank() || safeTopic.isBlank()) return null

        val base = when {
            server.startsWith("https://", ignoreCase = true) ->
                "wss://" + server.removePrefix("https://").removePrefix("HTTPS://")
            server.startsWith("http://", ignoreCase = true) ->
                "ws://" + server.removePrefix("http://").removePrefix("HTTP://")
            server.startsWith("wss://", ignoreCase = true) || server.startsWith("ws://", ignoreCase = true) ->
                server
            else -> "wss://$server"
        }
        return "$base/$safeTopic/ws?since=all"
    }
}
