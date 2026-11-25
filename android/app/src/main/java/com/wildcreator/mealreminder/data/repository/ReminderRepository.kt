package com.wildcreator.mealreminder.data.repository

import com.wildcreator.mealreminder.data.remote.ApiService
import com.wildcreator.mealreminder.data.remote.apiCall
import com.wildcreator.mealreminder.data.remote.dto.CheckResultDto
import com.wildcreator.mealreminder.data.remote.dto.CreateReminderRequest
import com.wildcreator.mealreminder.data.remote.dto.CreateReminderResponse
import com.wildcreator.mealreminder.data.remote.dto.OpenBoxResponseDto
import com.wildcreator.mealreminder.data.remote.dto.PageDto
import com.wildcreator.mealreminder.data.remote.dto.ReminderDto
import com.wildcreator.mealreminder.data.remote.dto.ReminderEventDto
import javax.inject.Inject
import javax.inject.Singleton

/** 提醒任务（docs/api.md §4）。管理员同样只看自己的任务。 */
@Singleton
class ReminderRepository @Inject constructor(
    private val api: ApiService,
) {

    suspend fun create(
        pickupCode: String,
        cabCode: String,
        durationMin: Int,
        codeMode: String? = null,
    ): CreateReminderResponse =
        apiCall {
            api.createReminder(
                CreateReminderRequest(
                    codeMode = codeMode,
                    pickupCode = pickupCode.trim(),
                    cabCode = cabCode.trim(),
                    durationMin = durationMin,
                ),
            )
        }

    suspend fun list(status: String? = null, page: Int = 1, pageSize: Int = 20): PageDto<ReminderDto> =
        apiCall { api.reminders(status = status, page = page, pageSize = pageSize) }

    suspend fun detail(id: String): ReminderDto = apiCall { api.reminder(id) }

    suspend fun check(id: String): CheckResultDto = apiCall { api.checkReminder(id) }

    /** 停止后服务端响应体未在契约中约定，调用方应重新拉详情。 */
    suspend fun stop(id: String) {
        apiCall { api.stopReminder(id) }
    }

    /** 一键开箱：服务端限 3 次/任务、10 秒间隔，失败会抛 ApiException。 */
    suspend fun openBox(id: String): OpenBoxResponseDto = apiCall { api.openBox(id) }

    suspend fun events(id: String, page: Int = 1): PageDto<ReminderEventDto> =
        apiCall { api.reminderEvents(id = id, page = page) }
}
