package com.wildcreator.mealreminder.domain

/** 角色（服务端枚举 Role）。USER 无管理入口；ADMIN 不能提权/转让；ROOT 可转让。 */
enum class Role {
    ROOT,
    ADMIN,
    USER;

    val label: String
        get() = when (this) {
            ROOT -> "ROOT"
            ADMIN -> "管理员"
            USER -> "普通用户"
        }

    val canEnterAdmin: Boolean get() = this == ROOT || this == ADMIN

    /** 只有 ROOT 能提权/降级他人、能转让 ROOT。 */
    val canManageRoles: Boolean get() = this == ROOT

    companion object {
        fun from(raw: String?): Role = when (raw?.uppercase()) {
            "ROOT" -> ROOT
            "ADMIN" -> ADMIN
            else -> USER
        }
    }
}

/** 任务状态机（服务端枚举 ReminderStatus）。 */
enum class ReminderStatus {
    PENDING,
    BASELINE,
    WAITING,
    ARRIVED,
    TIMEOUT,
    STOPPED;

    val label: String
        get() = when (this) {
            PENDING -> "待开始"
            BASELINE -> "建立基线"
            WAITING -> "监控中"
            ARRIVED -> "已到柜"
            TIMEOUT -> "已超时"
            STOPPED -> "已停止"
        }

    /** 仍会被调度器轮询的状态。 */
    val isActive: Boolean get() = this == PENDING || this == BASELINE || this == WAITING

    companion object {
        fun from(raw: String?): ReminderStatus = when (raw?.uppercase()) {
            "PENDING" -> PENDING
            "BASELINE" -> BASELINE
            "WAITING" -> WAITING
            "ARRIVED" -> ARRIVED
            "TIMEOUT" -> TIMEOUT
            "STOPPED" -> STOPPED
            else -> PENDING
        }
    }
}

/** 事件级别（服务端枚举 EventLevel）。 */
enum class EventLevel {
    INFO,
    WARN,
    ERROR,
    SUCCESS;

    companion object {
        fun from(raw: String?): EventLevel = when (raw?.uppercase()) {
            "WARN" -> WARN
            "ERROR" -> ERROR
            "SUCCESS" -> SUCCESS
            else -> INFO
        }
    }
}

/** 推送通道（服务端枚举 PushMode）。 */
object PushMode {
    const val FCM = "FCM"
    const val NTFY = "NTFY"
}

/** 用户状态（服务端枚举 UserStatus）。 */
object UserStatus {
    const val PENDING_VERIFICATION = "PENDING_VERIFICATION"
    const val ACTIVE = "ACTIVE"
    const val DISABLED = "DISABLED"

    fun label(raw: String?): String = when (raw?.uppercase()) {
        PENDING_VERIFICATION -> "待验证邮箱"
        ACTIVE -> "正常"
        DISABLED -> "已停用"
        else -> raw ?: "未知"
    }
}
