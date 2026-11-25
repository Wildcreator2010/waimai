package com.wildcreator.mealreminder.data.remote

import com.wildcreator.mealreminder.data.remote.dto.ErrorBodyDto
import java.io.IOException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

private val errorJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
}

/**
 * 统一调用包装：把 Retrofit 的 [HttpException] 解析成带 code 的 [ApiException]，
 * 把 IO 故障包装成 [NetworkException]。所有 Repository 都通过它发起请求。
 */
suspend fun <T> apiCall(block: suspend () -> T): T {
    return try {
        block()
    } catch (e: HttpException) {
        throw e.toApiException()
    } catch (e: IOException) {
        throw NetworkException("网络异常：${e.message ?: "连接中断"}", e)
    }
}

/** 解析错误响应体 `{ code, message, details }`；解析失败时退回 HTTP 状态描述。 */
fun HttpException.toApiException(): ApiException {
    val raw = runCatching { response()?.errorBody()?.string() }.getOrNull()
    val body = parseErrorBody(raw)
    val status = code()
    val errorCode = body?.code?.takeIf { it.isNotBlank() } ?: fallbackCode(status)
    val message = body?.message.orEmpty()
    return ApiException(code = errorCode, message = message, httpStatus = status)
}

private fun parseErrorBody(raw: String?): ErrorBodyDto? {
    if (raw.isNullOrBlank()) return null
    return runCatching { errorJson.decodeFromString(ErrorBodyDto.serializer(), raw) }.getOrNull()
}

private fun fallbackCode(httpStatus: Int): String = when (httpStatus) {
    400 -> "VALIDATION_FAILED"
    401 -> "UNAUTHENTICATED"
    403 -> "FORBIDDEN"
    404 -> "NOT_FOUND"
    409 -> "CONFLICT"
    429 -> "TOO_MANY_REQUESTS"
    else -> "INTERNAL"
}
