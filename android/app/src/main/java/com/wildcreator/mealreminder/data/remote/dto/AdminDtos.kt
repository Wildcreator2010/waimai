package com.wildcreator.mealreminder.data.remote.dto

import kotlinx.serialization.Serializable

// ---------------------------------------------------------------- 用户

/** GET /api/admin/users 的列表项。 */
@Serializable
data class AdminUserDto(
    val id: String = "",
    val email: String = "",
    val role: String = "USER",
    val status: String = "ACTIVE",
    val displayName: String = "",
    val phone: String? = null,
    val createdAt: String? = null,
    val lastLoginAt: String? = null,
)

@Serializable
data class CreateUserRequest(
    val email: String,
    val password: String,
    val role: String = "USER",
    val displayName: String = "",
)

/** PATCH /api/admin/users/:id —— role 只有 ROOT 能改。 */
@Serializable
data class PatchUserRequest(
    val displayName: String? = null,
    val status: String? = null,
    val role: String? = null,
)

@Serializable
data class TransferRootRequest(
    val userId: String,
    val password: String,
)

// ---------------------------------------------------------------- 邀请码

@Serializable
data class InviteDto(
    val id: String = "",
    val code: String = "",
    val email: String = "",
    val note: String = "",
    val expiresAt: String? = null,
    val createdAt: String? = null,
    val usedAt: String? = null,
)

@Serializable
data class CreateInviteRequest(
    val email: String,
    val expiresInDays: Int = 7,
    val note: String = "",
)

// ---------------------------------------------------------------- MemberToken

@Serializable
data class MemberTokenDto(
    val configured: Boolean = false,
    val masked: String = "",
    val updatedAt: String? = null,
    val updatedBy: String? = null,
    val lastVerifiedAt: String? = null,
    val lastVerifyOk: Boolean? = null,
    val lastVerifyMessage: String = "",
    val expiringSoon: Boolean = false,
)

@Serializable
data class PutMemberTokenRequest(
    val token: String,
)

@Serializable
data class VerifyResultDto(
    val ok: Boolean = false,
    val message: String = "",
)

// ---------------------------------------------------------------- 系统设置

@Serializable
data class SystemSettingsDto(
    val pollIntervalSec: Int = 60,
    val defaultDurationMin: Int = 60,
    val maxDurationMin: Int = 720,
    val maxActiveRemindersPerUser: Int = 5,
    val lockerDeviceSn: String = "2680",
    val lockerApiBase: String = "",
    val ntfyServerUrl: String = "",
    val registrationOpen: Boolean = true,
    val showNotifyDetailsDefault: Boolean = true,
)

@Serializable
data class PatchSystemSettingsRequest(
    val pollIntervalSec: Int? = null,
    val defaultDurationMin: Int? = null,
    val maxDurationMin: Int? = null,
    val maxActiveRemindersPerUser: Int? = null,
    val lockerDeviceSn: String? = null,
    val lockerApiBase: String? = null,
    val ntfyServerUrl: String? = null,
    val registrationOpen: Boolean? = null,
    val showNotifyDetailsDefault: Boolean? = null,
)

// ---------------------------------------------------------------- 告警 / 审计 / 概览

/** AdminAlert：level ∈ INFO|WARN|ERROR；ackedAt 非空即已确认。 */
@Serializable
data class AlertDto(
    val id: String = "",
    val level: String = "WARN",
    val type: String = "",
    val message: String = "",
    val ackedAt: String? = null,
    val ackedById: String? = null,
    val createdAt: String? = null,
)

/** AuditLog。actorEmail 为服务端附加的展示字段，缺失时降级显示 actorId。 */
@Serializable
data class AuditLogDto(
    val id: String = "",
    val actorId: String? = null,
    val actorEmail: String? = null,
    val action: String = "",
    val targetType: String = "",
    val targetId: String = "",
    val detail: String = "",
    val ip: String = "",
    val createdAt: String? = null,
)

@Serializable
data class OverviewUsersDto(
    val total: Int = 0,
    val active: Int = 0,
    val admins: Int = 0,
)

@Serializable
data class OverviewRemindersDto(
    val waiting: Int = 0,
    val arrivedToday: Int = 0,
    val timeoutToday: Int = 0,
)

@Serializable
data class OverviewSmsDto(
    val sentToday: Int = 0,
    val failedToday: Int = 0,
)

@Serializable
data class OverviewAlertsDto(
    val unacked: Int = 0,
)

@Serializable
data class OverviewLockerDto(
    val configured: Boolean = false,
    val lastVerifyOk: Boolean? = null,
)

@Serializable
data class OverviewDto(
    val users: OverviewUsersDto = OverviewUsersDto(),
    val reminders: OverviewRemindersDto = OverviewRemindersDto(),
    val sms: OverviewSmsDto = OverviewSmsDto(),
    val alerts: OverviewAlertsDto = OverviewAlertsDto(),
    val locker: OverviewLockerDto = OverviewLockerDto(),
)
