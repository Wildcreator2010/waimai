package com.wildcreator.mealreminder.data.remote.dto

import kotlinx.serialization.Serializable

/** 提醒任务（docs/api.md §4）。 */
@Serializable
data class ReminderDto(
    val id: String = "",
    val pickupCode: String = "",
    val cabCode: String = "",
    /** custom / phone_tail */
    val codeMode: String = "custom",
    val durationMin: Int = 60,
    val status: String = "PENDING",
    val baselineFingerprint: String = "",
    val cabinet: String = "",
    /** 命中时记录的订单号；为空表示无法开箱 */
    val orderId: String = "",
    val lockerId: String = "",
    val openCount: Int = 0,
    val lastOpenedAt: String? = null,
    val lastDetail: String = "",
    val checkCount: Int = 0,
    val failCount: Int = 0,
    val createdAt: String? = null,
    val endsAt: String? = null,
    val finishedAt: String? = null,
    val notifiedAt: String? = null,
    val lastCheckAt: String? = null,
    /** 仅 GET /api/reminders/:id 返回，最近 50 条。 */
    val events: List<ReminderEventDto> = emptyList(),
)

@Serializable
data class ReminderEventDto(
    val id: String = "",
    val level: String = "INFO",
    val message: String = "",
    val createdAt: String? = null,
)

@Serializable
data class CreateReminderRequest(
    /** custom = 自定义取餐码；phone_tail = 手机尾号后四位 */
    val codeMode: String? = null,
    val pickupCode: String,
    val cabCode: String,
    val durationMin: Int,
)

/** 创建任务的响应：可能带 warnings（未绑手机号等）。 */
@Serializable
data class CreateReminderResponse(
    val id: String = "",
    val status: String = "PENDING",
    val warnings: List<WarningDto> = emptyList(),
)

/** POST /api/reminders/:id/open */
@Serializable
data class OpenBoxResponseDto(
    val ok: Boolean = false,
    val message: String = "",
    val openCount: Int = 0,
    val cabinet: String = "",
)

/** POST /api/reminders/:id/check */
@Serializable
data class CheckResultDto(
    val ok: Boolean = false,
    val arrived: Boolean = false,
    val detail: String = "",
)
