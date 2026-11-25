package com.wildcreator.mealreminder.data.remote

import com.wildcreator.mealreminder.data.remote.dto.AdminUserDto
import com.wildcreator.mealreminder.data.remote.dto.AlertDto
import com.wildcreator.mealreminder.data.remote.dto.AuditLogDto
import com.wildcreator.mealreminder.data.remote.dto.BootstrapStatusDto
import com.wildcreator.mealreminder.data.remote.dto.CaptchaChallengeDto
import com.wildcreator.mealreminder.data.remote.dto.ChangePasswordRequest
import com.wildcreator.mealreminder.data.remote.dto.CheckResultDto
import com.wildcreator.mealreminder.data.remote.dto.CreateDeviceRequest
import com.wildcreator.mealreminder.data.remote.dto.CreateInviteRequest
import com.wildcreator.mealreminder.data.remote.dto.CreateReminderRequest
import com.wildcreator.mealreminder.data.remote.dto.CreateReminderResponse
import com.wildcreator.mealreminder.data.remote.dto.CreateUserRequest
import com.wildcreator.mealreminder.data.remote.dto.DeleteAccountRequest
import com.wildcreator.mealreminder.data.remote.dto.DeviceDto
import com.wildcreator.mealreminder.data.remote.dto.ForgotPasswordRequest
import com.wildcreator.mealreminder.data.remote.dto.HealthDto
import com.wildcreator.mealreminder.data.remote.dto.InviteDto
import com.wildcreator.mealreminder.data.remote.dto.LoginRequest
import com.wildcreator.mealreminder.data.remote.dto.LoginResponse
import com.wildcreator.mealreminder.data.remote.dto.MeSettingsDto
import com.wildcreator.mealreminder.data.remote.dto.MemberTokenDto
import com.wildcreator.mealreminder.data.remote.dto.NtfyConfigDto
import com.wildcreator.mealreminder.data.remote.dto.OpenBoxResponseDto
import com.wildcreator.mealreminder.data.remote.dto.OverviewDto
import com.wildcreator.mealreminder.data.remote.dto.PageDto
import com.wildcreator.mealreminder.data.remote.dto.PatchMeSettingsRequest
import com.wildcreator.mealreminder.data.remote.dto.PatchSystemSettingsRequest
import com.wildcreator.mealreminder.data.remote.dto.PatchUserRequest
import com.wildcreator.mealreminder.data.remote.dto.PhoneCodeRequest
import com.wildcreator.mealreminder.data.remote.dto.PhoneVerifyRequest
import com.wildcreator.mealreminder.data.remote.dto.PutMemberTokenRequest
import com.wildcreator.mealreminder.data.remote.dto.RefreshRequest
import com.wildcreator.mealreminder.data.remote.dto.RegisterRequest
import com.wildcreator.mealreminder.data.remote.dto.ReminderDto
import com.wildcreator.mealreminder.data.remote.dto.ReminderEventDto
import com.wildcreator.mealreminder.data.remote.dto.ResendVerificationRequest
import com.wildcreator.mealreminder.data.remote.dto.ResetPasswordRequest
import com.wildcreator.mealreminder.data.remote.dto.SystemSettingsDto
import com.wildcreator.mealreminder.data.remote.dto.TokenPairDto
import com.wildcreator.mealreminder.data.remote.dto.TransferRootRequest
import com.wildcreator.mealreminder.data.remote.dto.UserDto
import com.wildcreator.mealreminder.data.remote.dto.VerifyEmailRequest
import com.wildcreator.mealreminder.data.remote.dto.VerifyResultDto
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * 全部 REST 契约（docs/api.md）。路径相对 baseUrl，baseUrl 必须以 `/` 结尾。
 * 无返回值或返回值不被 UI 使用的接口声明为 Unit，Retrofit 内置支持。
 */
interface ApiService {

    // ---------------------------------------------------------------- 引导 / 健康

    @GET("api/bootstrap/status")
    suspend fun bootstrapStatus(): BootstrapStatusDto

    @GET("api/health")
    suspend fun health(): HealthDto

    // ---------------------------------------------------------------- 认证

    /** 人机验证题目：purpose ∈ register / resend / forgot / phone */
    @GET("api/captcha/challenge")
    suspend fun captchaChallenge(@Query("purpose") purpose: String): CaptchaChallengeDto

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): Unit

    @POST("api/auth/verify-email")
    suspend fun verifyEmail(@Body body: VerifyEmailRequest): Unit

    @POST("api/auth/resend-verification")
    suspend fun resendVerification(@Body body: ResendVerificationRequest): Unit

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    /** 供 OkHttp Authenticator 之外的场景（冷启动恢复）使用。 */
    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenPairDto

    @POST("api/auth/logout")
    suspend fun logout(): Unit

    @GET("api/auth/me")
    suspend fun me(): UserDto

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): Unit

    @POST("api/auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): Unit

    @PATCH("api/auth/password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): Unit

    // ---------------------------------------------------------------- 当前用户设置

    @GET("api/me/settings")
    suspend fun meSettings(): MeSettingsDto

    @PATCH("api/me/settings")
    suspend fun patchMeSettings(@Body body: PatchMeSettingsRequest): Unit

    @POST("api/me/phone/request-code")
    suspend fun requestPhoneCode(@Body body: PhoneCodeRequest): Unit

    @POST("api/me/phone/verify")
    suspend fun verifyPhone(@Body body: PhoneVerifyRequest): Unit

    @POST("api/me/phone/unbind")
    suspend fun unbindPhone(): Unit

    @POST("api/me/ntfy/rotate")
    suspend fun rotateNtfyTopic(): Unit

    @GET("api/me/ntfy/config")
    suspend fun ntfyConfig(): NtfyConfigDto

    // ---------------------------------------------------------------- 设备

    @POST("api/me/devices")
    suspend fun registerDevice(@Body body: CreateDeviceRequest): Unit

    @GET("api/me/devices")
    suspend fun devices(): List<DeviceDto>

    @DELETE("api/me/devices/{id}")
    suspend fun deleteDevice(@Path("id") id: String): Unit

    /** 注销当前账号（需密码确认） */
    @POST("api/me/delete")
    suspend fun deleteAccount(@Body body: DeleteAccountRequest): Unit

    // ---------------------------------------------------------------- 提醒任务

    @POST("api/reminders")
    suspend fun createReminder(@Body body: CreateReminderRequest): CreateReminderResponse

    @GET("api/reminders")
    suspend fun reminders(
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): PageDto<ReminderDto>

    @GET("api/reminders/{id}")
    suspend fun reminder(@Path("id") id: String): ReminderDto

    @POST("api/reminders/{id}/check")
    suspend fun checkReminder(@Path("id") id: String): CheckResultDto

    @POST("api/reminders/{id}/stop")
    suspend fun stopReminder(@Path("id") id: String): Unit

    /** 一键开箱（会物理开门，服务端限 3 次/任务、10 秒间隔） */
    @POST("api/reminders/{id}/open")
    suspend fun openBox(@Path("id") id: String): OpenBoxResponseDto

    @GET("api/reminders/{id}/events")
    suspend fun reminderEvents(
        @Path("id") id: String,
        @Query("page") page: Int = 1,
    ): PageDto<ReminderEventDto>

    // ---------------------------------------------------------------- 管理员 · 用户

    @GET("api/admin/users")
    suspend fun adminUsers(
        @Query("q") q: String? = null,
        @Query("role") role: String? = null,
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): PageDto<AdminUserDto>

    @POST("api/admin/users")
    suspend fun adminCreateUser(@Body body: CreateUserRequest): Unit

    @PATCH("api/admin/users/{id}")
    suspend fun adminPatchUser(
        @Path("id") id: String,
        @Body body: PatchUserRequest,
    ): Unit

    @DELETE("api/admin/users/{id}")
    suspend fun adminDeleteUser(@Path("id") id: String): Unit

    @POST("api/admin/root/transfer")
    suspend fun adminTransferRoot(@Body body: TransferRootRequest): Unit

    // ---------------------------------------------------------------- 管理员 · 邀请码

    @POST("api/admin/invites")
    suspend fun adminCreateInvite(@Body body: CreateInviteRequest): InviteDto

    @GET("api/admin/invites")
    suspend fun adminInvites(
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): PageDto<InviteDto>

    @DELETE("api/admin/invites/{id}")
    suspend fun adminDeleteInvite(@Path("id") id: String): Unit

    // ---------------------------------------------------------------- 管理员 · MemberToken

    @GET("api/admin/member-token")
    suspend fun adminMemberToken(): MemberTokenDto

    @PUT("api/admin/member-token")
    suspend fun adminPutMemberToken(@Body body: PutMemberTokenRequest): Unit

    @POST("api/admin/member-token/verify")
    suspend fun adminVerifyMemberToken(): VerifyResultDto

    // ---------------------------------------------------------------- 管理员 · 系统设置

    @GET("api/admin/settings")
    suspend fun adminSettings(): SystemSettingsDto

    @PATCH("api/admin/settings")
    suspend fun adminPatchSettings(@Body body: PatchSystemSettingsRequest): Unit

    // ---------------------------------------------------------------- 管理员 · 告警 / 审计 / 概览

    @GET("api/admin/alerts")
    suspend fun adminAlerts(
        @Query("acked") acked: Boolean? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): PageDto<AlertDto>

    @POST("api/admin/alerts/{id}/ack")
    suspend fun adminAckAlert(@Path("id") id: String): Unit

    @GET("api/admin/audit")
    suspend fun adminAudit(
        @Query("action") action: String? = null,
        @Query("actorId") actorId: String? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 20,
    ): PageDto<AuditLogDto>

    @GET("api/admin/overview")
    suspend fun adminOverview(): OverviewDto
}
