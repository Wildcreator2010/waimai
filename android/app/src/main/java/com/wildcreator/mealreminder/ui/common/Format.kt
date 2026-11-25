package com.wildcreator.mealreminder.ui.common

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// 服务端时间为 ISO-8601 UTC（如 2026-11-10T15:00:00.000Z），统一转本地时区展示。
// minSdk 24 通过 coreLibraryDesugaring 使用 java.time。

private val shortFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MM-dd HH:mm", Locale.CHINA)

private val timeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm:ss", Locale.CHINA)

private val fullFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.CHINA)

/** ISO-8601 → 本地「MM-dd HH:mm」；解析失败原样返回。 */
fun String?.toShortTime(): String = format(this, shortFormatter)

/** ISO-8601 → 本地「HH:mm:ss」，用于事件流。 */
fun String?.toTimeOfDay(): String = format(this, timeFormatter)

/** ISO-8601 → 本地「yyyy-MM-dd HH:mm」。 */
fun String?.toFullTime(): String = format(this, fullFormatter)

private fun format(raw: String?, formatter: DateTimeFormatter): String {
    if (raw.isNullOrBlank()) return "—"
    return runCatching {
        Instant.parse(raw).atZone(ZoneId.systemDefault()).format(formatter)
    }.getOrDefault(raw)
}

/** 剩余时长的人类可读文本；已过期返回「已超时」。 */
fun remainingText(endsAt: String?): String {
    if (endsAt.isNullOrBlank()) return "—"
    val end = runCatching { Instant.parse(endsAt) }.getOrNull() ?: return "—"
    val seconds = end.epochSecond - Instant.now().epochSecond
    if (seconds <= 0) return "已超时"
    val minutes = seconds / 60
    return when {
        minutes >= 60 -> "${minutes / 60} 小时 ${minutes % 60} 分"
        minutes >= 1 -> "$minutes 分钟"
        else -> "不到 1 分钟"
    }
}
