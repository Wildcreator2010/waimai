package com.wildcreator.mealreminder.data.remote

import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import retrofit2.HttpException

/**
 * 服务端业务错误（docs/api.md §0.1）：HTTP 状态 + `code` + 中文 message。
 * message 优先用服务端文案，缺失时按 code 兜底翻译。
 */
class ApiException(
    val code: String,
    message: String,
    val httpStatus: Int,
) : Exception(message.ifBlank { codeMessage(code) ?: "请求失败（$httpStatus）" })

/** 网络层故障（断网、超时、TLS 等），与业务错误区分开。 */
class NetworkException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

private fun codeMessage(code: String): String? = when (code) {
    "UNAUTHENTICATED" -> "登录已失效，请重新登录"
    "TOKEN_EXPIRED" -> "登录已过期，请重新登录"
    "EMAIL_NOT_VERIFIED" -> "邮箱尚未验证"
    "ACCOUNT_DISABLED" -> "账号已被停用"
    "FORBIDDEN" -> "没有权限执行该操作"
    "NOT_FOUND" -> "资源不存在"
    "VALIDATION_FAILED" -> "参数不合法"
    "EMAIL_TAKEN" -> "该邮箱已被注册"
    "INVITE_USED" -> "邀请码已被使用"
    "INVITE_INVALID" -> "邀请码无效"
    "INVITE_EXPIRED" -> "邀请码已过期"
    "INVITE_EMAIL_MISMATCH" -> "邀请码与邮箱不匹配"
    "INVALID_CREDENTIALS" -> "邮箱或密码错误"
    "REFRESH_INVALID", "REFRESH_EXPIRED", "REFRESH_REVOKED" -> "登录已失效，请重新登录"
    "TOKEN_INVALID" -> "链接无效"
    "TOO_MANY_REQUESTS" -> "操作过于频繁，请稍后再试"
    "TOO_MANY_ACTIVE_REMINDERS" -> "等待中的任务已达上限"
    "PHONE_TAKEN" -> "该手机号已被其他账号绑定"
    "CODE_INVALID" -> "验证码错误"
    "CODE_EXPIRED" -> "验证码已过期"
    "INTERNAL" -> "服务端开小差了，请稍后重试"
    else -> null
}

/**
 * 把任意异常翻译成可直接展示的中文文案。
 * 所有 ViewModel 的 catch 分支统一走这里，避免文案散落。
 */
fun Throwable.toUserMessage(): String = when (this) {
    is ApiException -> message ?: "请求失败"
    is NetworkException -> message ?: "网络异常"
    is UnknownHostException -> "无法连接服务器，请检查网络或服务端地址"
    is SocketTimeoutException -> "请求超时，请重试"
    is SSLException -> "安全连接失败，请检查证书"
    is HttpException -> "服务端返回 ${code()}，请稍后重试"
    is IOException -> "网络异常：${message ?: "连接中断"}"
    else -> message?.takeIf { it.isNotBlank() } ?: "未知错误"
}
