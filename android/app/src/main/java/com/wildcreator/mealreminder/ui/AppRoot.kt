package com.wildcreator.mealreminder.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.wildcreator.mealreminder.R
import com.wildcreator.mealreminder.data.session.SessionState
import com.wildcreator.mealreminder.ui.admin.AdminAlertsScreen
import com.wildcreator.mealreminder.ui.admin.AdminAuditScreen
import com.wildcreator.mealreminder.ui.admin.AdminHomeScreen
import com.wildcreator.mealreminder.ui.admin.AdminInvitesScreen
import com.wildcreator.mealreminder.ui.admin.AdminMemberTokenScreen
import com.wildcreator.mealreminder.ui.admin.AdminSystemSettingsScreen
import com.wildcreator.mealreminder.ui.admin.AdminUsersScreen
import com.wildcreator.mealreminder.ui.auth.ForgotPasswordScreen
import com.wildcreator.mealreminder.ui.auth.LoginScreen
import com.wildcreator.mealreminder.ui.auth.RegisterScreen
import com.wildcreator.mealreminder.ui.auth.VerifyEmailScreen
import com.wildcreator.mealreminder.ui.navigation.Routes
import com.wildcreator.mealreminder.ui.reminder.CreateReminderScreen
import com.wildcreator.mealreminder.ui.reminder.ReminderDetailScreen
import com.wildcreator.mealreminder.ui.reminder.ReminderListScreen
import com.wildcreator.mealreminder.ui.settings.PhoneBindScreen
import com.wildcreator.mealreminder.ui.settings.SettingsScreen

/**
 * 应用根：导航宿主 + 底部导航 + 全局弹窗 + 通知权限请求。
 *
 * 会话状态驱动的跳转只在这里发生，各页面不自行处理登录态。
 */
@Composable
fun AppRoot(
    pendingReminderId: String?,
    onReminderConsumed: () -> Unit,
    viewModel: RootViewModel = hiltViewModel(),
) {
    val navController = rememberNavController()
    val sessionState by viewModel.sessionState.collectAsStateWithLifecycle()
    val user by viewModel.user.collectAsStateWithLifecycle()
    val showPhoneDialog by viewModel.showPhoneDialog.collectAsStateWithLifecycle()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    // ---------------------------------------------------------------- 通知权限（Android 13+）
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { /* 用户拒绝时静默：通知不可用，但 App 其余功能不受影响 */ },
    )
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    // ---------------------------------------------------------------- 登录态 → 导航
    LaunchedEffect(sessionState) {
        val route = navController.currentDestination?.route
        when (sessionState) {
            is SessionState.LoggedOut -> {
                if (route != null && !Routes.authRoutes.contains(route)) {
                    navController.navigateClearingStack(Routes.LOGIN)
                }
            }

            is SessionState.LoggedIn -> {
                if (route == null || Routes.authRoutes.contains(route)) {
                    navController.navigateClearingStack(Routes.REMINDERS)
                }
            }

            SessionState.Restoring -> Unit
        }
    }

    // 通知点击带来的任务 id：登录态就绪后跳详情
    LaunchedEffect(pendingReminderId, sessionState) {
        if (!pendingReminderId.isNullOrBlank() && sessionState is SessionState.LoggedIn) {
            navController.navigate(Routes.reminderDetail(pendingReminderId))
            onReminderConsumed()
        }
    }

    // 主界面就绪 → 未绑手机号提示（每进程一次）
    LaunchedEffect(sessionState, user?.id) {
        if (sessionState is SessionState.LoggedIn) {
            viewModel.onMainUiShown()
        }
    }

    val showBottomBar = sessionState is SessionState.LoggedIn &&
        currentRoute != null &&
        Routes.topLevel.contains(currentRoute)

    Scaffold(
        // 内边距交给各页面的 Scaffold（它们有自己的 TopAppBar），这里只负责底部导航高度
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            if (showBottomBar) {
                AppBottomBar(
                    currentRoute = currentRoute,
                    showAdmin = user?.isAdmin == true,
                    onNavigate = { route -> navController.navigateTopLevel(route) },
                )
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.LOGIN,
            modifier = Modifier.padding(innerPadding),
        ) {
            // -------------------------------------------------------- 认证
            composable(Routes.LOGIN) {
                LoginScreen(
                    onNavigateRegister = { navController.navigate(Routes.REGISTER) },
                    onNavigateForgotPassword = { navController.navigate(Routes.FORGOT_PASSWORD) },
                )
            }
            composable(Routes.REGISTER) {
                RegisterScreen(
                    onBack = { navController.popBackStack() },
                    onRegistered = { email ->
                        navController.navigate(Routes.verifyEmail(email)) {
                            popUpTo(Routes.REGISTER) { inclusive = true }
                        }
                    },
                )
            }
            composable(
                route = Routes.VERIFY_EMAIL,
                arguments = listOf(navArgument("email") { type = NavType.StringType; defaultValue = "" }),
            ) { entry ->
                VerifyEmailScreen(
                    email = entry.arguments?.getString("email").orEmpty(),
                    onBack = { navController.popBackStack() },
                    onGoLogin = { navController.navigateClearingStack(Routes.LOGIN) },
                )
            }
            composable(Routes.FORGOT_PASSWORD) {
                ForgotPasswordScreen(onBack = { navController.popBackStack() })
            }

            // -------------------------------------------------------- 任务
            composable(Routes.REMINDERS) {
                ReminderListScreen(
                    onCreate = { navController.navigate(Routes.CREATE_REMINDER) },
                    onOpen = { id -> navController.navigate(Routes.reminderDetail(id)) },
                )
            }
            composable(Routes.CREATE_REMINDER) {
                CreateReminderScreen(
                    onBack = { navController.popBackStack() },
                    onCreated = { id ->
                        navController.popBackStack()
                        if (id.isNotBlank()) {
                            navController.navigate(Routes.reminderDetail(id))
                        }
                    },
                )
            }
            composable(
                route = Routes.REMINDER_DETAIL,
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { entry ->
                ReminderDetailScreen(
                    reminderId = entry.arguments?.getString("id").orEmpty(),
                    onBack = { navController.popBackStack() },
                )
            }

            // -------------------------------------------------------- 设置
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    onOpenPhoneBind = { navController.navigate(Routes.PHONE_BIND) },
                    onLogout = {
                        viewModel.logout()
                        navController.navigateClearingStack(Routes.LOGIN)
                    },
                )
            }
            composable(Routes.PHONE_BIND) {
                PhoneBindScreen(onBack = { navController.popBackStack() })
            }

            // -------------------------------------------------------- 管理（入口按角色显示，服务端二次校验）
            composable(Routes.ADMIN) {
                AdminHomeScreen(
                    onBack = null,
                    onOpenUsers = { navController.navigate(Routes.ADMIN_USERS) },
                    onOpenInvites = { navController.navigate(Routes.ADMIN_INVITES) },
                    onOpenMemberToken = { navController.navigate(Routes.ADMIN_MEMBER_TOKEN) },
                    onOpenSystemSettings = { navController.navigate(Routes.ADMIN_SYSTEM_SETTINGS) },
                    onOpenAlerts = { navController.navigate(Routes.ADMIN_ALERTS) },
                    onOpenAudit = { navController.navigate(Routes.ADMIN_AUDIT) },
                )
            }
            composable(Routes.ADMIN_USERS) {
                AdminUsersScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_INVITES) {
                AdminInvitesScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_MEMBER_TOKEN) {
                AdminMemberTokenScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_SYSTEM_SETTINGS) {
                AdminSystemSettingsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_ALERTS) {
                AdminAlertsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_AUDIT) {
                AdminAuditScreen(onBack = { navController.popBackStack() })
            }
        }
    }

    // ---------------------------------------------------------------- 未绑定手机号弹窗
    if (showPhoneDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissPhoneDialog() },
            title = { Text(stringResource(R.string.phone_dialog_title)) },
            text = { Text(stringResource(R.string.phone_dialog_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.dismissPhoneDialog()
                        navController.navigate(Routes.PHONE_BIND)
                    },
                ) { Text(stringResource(R.string.phone_dialog_bind)) }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissPhoneDialog() }) {
                    Text(stringResource(R.string.phone_dialog_later))
                }
            },
        )
    }
}

@Composable
private fun AppBottomBar(
    currentRoute: String?,
    showAdmin: Boolean,
    onNavigate: (String) -> Unit,
) {
    NavigationBar {
        NavigationBarItem(
            selected = currentRoute == Routes.REMINDERS,
            onClick = { onNavigate(Routes.REMINDERS) },
            icon = { Icon(imageVector = Icons.Filled.List, contentDescription = null) },
            label = { Text("任务") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SETTINGS,
            onClick = { onNavigate(Routes.SETTINGS) },
            icon = { Icon(imageVector = Icons.Filled.Settings, contentDescription = null) },
            label = { Text("设置") },
        )
        if (showAdmin) {
            NavigationBarItem(
                selected = currentRoute == Routes.ADMIN,
                onClick = { onNavigate(Routes.ADMIN) },
                icon = { Icon(imageVector = Icons.Filled.Person, contentDescription = null) },
                label = { Text("管理") },
            )
        }
    }
}

/** 顶层导航：保留各自的返回栈，重复点击不叠加。 */
private fun NavHostController.navigateTopLevel(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/** 清空整个返回栈再跳转（登录成功 / 登出 / 会话失效）。 */
private fun NavHostController.navigateClearingStack(route: String) {
    // 图形尚未挂载时 graph 会抛异常，这里退化为 popUpTo(0)（等同清栈）
    val graphId = runCatching { graph.id }.getOrDefault(0)
    navigate(route) {
        popUpTo(graphId) { inclusive = true }
        launchSingleTop = true
    }
}
