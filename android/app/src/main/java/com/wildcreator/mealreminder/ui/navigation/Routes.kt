package com.wildcreator.mealreminder.ui.navigation

/** 全部导航路由。字符串路由足够，避免为 12 个页面引入类型安全路由的样板代码。 */
object Routes {
    // 认证
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val VERIFY_EMAIL = "verify-email?email={email}"
    const val FORGOT_PASSWORD = "forgot-password"

    // 主功能
    const val REMINDERS = "reminders"
    const val CREATE_REMINDER = "create-reminder"
    const val REMINDER_DETAIL = "reminder/{id}"

    // 设置
    const val SETTINGS = "settings"
    const val PHONE_BIND = "settings/phone"

    // 管理
    const val ADMIN = "admin"
    const val ADMIN_USERS = "admin/users"
    const val ADMIN_INVITES = "admin/invites"
    const val ADMIN_MEMBER_TOKEN = "admin/member-token"
    const val ADMIN_SYSTEM_SETTINGS = "admin/system-settings"
    const val ADMIN_ALERTS = "admin/alerts"
    const val ADMIN_AUDIT = "admin/audit"

    fun verifyEmail(email: String): String = "verify-email?email=${encode(email)}"
    fun reminderDetail(id: String): String = "reminder/${encode(id)}"

    /** 路由参数里只会有邮箱与 uuid，做一次最小转义即可。 */
    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8")

    /** 底部导航可见的顶层路由。 */
    val topLevel: Set<String> = setOf(REMINDERS, SETTINGS, ADMIN)

    /** 未登录时允许停留的路由；登录态变化时据此决定是否跳转。 */
    val authRoutes: Set<String> = setOf(LOGIN, REGISTER, VERIFY_EMAIL, FORGOT_PASSWORD)
}
