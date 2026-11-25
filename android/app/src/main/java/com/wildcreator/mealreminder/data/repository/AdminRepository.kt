package com.wildcreator.mealreminder.data.repository

import com.wildcreator.mealreminder.data.remote.ApiService
import com.wildcreator.mealreminder.data.remote.apiCall
import com.wildcreator.mealreminder.data.remote.dto.AdminUserDto
import com.wildcreator.mealreminder.data.remote.dto.AlertDto
import com.wildcreator.mealreminder.data.remote.dto.AuditLogDto
import com.wildcreator.mealreminder.data.remote.dto.CreateInviteRequest
import com.wildcreator.mealreminder.data.remote.dto.CreateUserRequest
import com.wildcreator.mealreminder.data.remote.dto.InviteDto
import com.wildcreator.mealreminder.data.remote.dto.MemberTokenDto
import com.wildcreator.mealreminder.data.remote.dto.OverviewDto
import com.wildcreator.mealreminder.data.remote.dto.PageDto
import com.wildcreator.mealreminder.data.remote.dto.PatchSystemSettingsRequest
import com.wildcreator.mealreminder.data.remote.dto.PatchUserRequest
import com.wildcreator.mealreminder.data.remote.dto.PutMemberTokenRequest
import com.wildcreator.mealreminder.data.remote.dto.SystemSettingsDto
import com.wildcreator.mealreminder.data.remote.dto.TransferRootRequest
import com.wildcreator.mealreminder.data.remote.dto.VerifyResultDto
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 管理端接口（docs/api.md §5）。权限判定在服务端，客户端只按角色决定入口是否可见。
 */
@Singleton
class AdminRepository @Inject constructor(
    private val api: ApiService,
) {

    // ---------------------------------------------------------------- 用户

    suspend fun users(
        q: String? = null,
        role: String? = null,
        status: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
    ): PageDto<AdminUserDto> = apiCall {
        api.adminUsers(
            q = q?.takeIf { it.isNotBlank() },
            role = role?.takeIf { it.isNotBlank() },
            status = status?.takeIf { it.isNotBlank() },
            page = page,
            pageSize = pageSize,
        )
    }

    suspend fun createUser(
        email: String,
        password: String,
        role: String,
        displayName: String,
    ) {
        apiCall {
            api.adminCreateUser(
                CreateUserRequest(
                    email = email.trim(),
                    password = password,
                    role = role,
                    displayName = displayName.trim(),
                ),
            )
        }
    }

    suspend fun patchUser(
        id: String,
        displayName: String? = null,
        status: String? = null,
        role: String? = null,
    ) {
        apiCall {
            api.adminPatchUser(id, PatchUserRequest(displayName = displayName, status = status, role = role))
        }
    }

    suspend fun deleteUser(id: String) {
        apiCall { api.adminDeleteUser(id) }
    }

    suspend fun transferRoot(userId: String, password: String) {
        apiCall { api.adminTransferRoot(TransferRootRequest(userId = userId, password = password)) }
    }

    // ---------------------------------------------------------------- 邀请码

    suspend fun invites(status: String? = null, page: Int = 1, pageSize: Int = 20): PageDto<InviteDto> =
        apiCall { api.adminInvites(status = status?.takeIf { it.isNotBlank() }, page = page, pageSize = pageSize) }

    suspend fun createInvite(email: String, expiresInDays: Int, note: String): InviteDto = apiCall {
        api.adminCreateInvite(
            CreateInviteRequest(
                email = email.trim(),
                expiresInDays = expiresInDays,
                note = note.trim(),
            ),
        )
    }

    suspend fun deleteInvite(id: String) {
        apiCall { api.adminDeleteInvite(id) }
    }

    // ---------------------------------------------------------------- MemberToken

    suspend fun memberToken(): MemberTokenDto = apiCall { api.adminMemberToken() }

    suspend fun putMemberToken(token: String) {
        apiCall { api.adminPutMemberToken(PutMemberTokenRequest(token.trim())) }
    }

    suspend fun verifyMemberToken(): VerifyResultDto = apiCall { api.adminVerifyMemberToken() }

    // ---------------------------------------------------------------- 系统设置

    suspend fun systemSettings(): SystemSettingsDto = apiCall { api.adminSettings() }

    suspend fun patchSystemSettings(body: PatchSystemSettingsRequest) {
        apiCall { api.adminPatchSettings(body) }
    }

    // ---------------------------------------------------------------- 告警 / 审计 / 概览

    suspend fun alerts(acked: Boolean? = null, page: Int = 1, pageSize: Int = 20): PageDto<AlertDto> =
        apiCall { api.adminAlerts(acked = acked, page = page, pageSize = pageSize) }

    suspend fun ackAlert(id: String) {
        apiCall { api.adminAckAlert(id) }
    }

    suspend fun audit(
        action: String? = null,
        actorId: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
    ): PageDto<AuditLogDto> = apiCall {
        api.adminAudit(
            action = action?.takeIf { it.isNotBlank() },
            actorId = actorId?.takeIf { it.isNotBlank() },
            page = page,
            pageSize = pageSize,
        )
    }

    suspend fun overview(): OverviewDto = apiCall { api.adminOverview() }
}
