import java.util.Properties

// 取餐提醒 · app 模块
//
// FCM 凭据有两条路径，按优先级自动选择：
//   1. app/google-services.json 存在 → 自动应用官方 google-services 插件（推荐，免手填）
//   2. 否则从 local.properties 读 FCM_* 四项写进 BuildConfig；四项全空即视为未配置，推送走 ntfy
// 两种方式都缺失时构建与运行都不受影响（docs/firebase-setup.md）。
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// 把 google-services.json 放进 app/ 即可启用插件；没有该文件时保持不启用。
val googleServicesFile = file("google-services.json")
if (googleServicesFile.exists()) {
    apply(plugin = "com.google.gms.google-services")
    logger.lifecycle("FCM: 检测到 app/google-services.json，已启用 google-services 插件")
} else {
    logger.lifecycle("FCM: 未找到 app/google-services.json，使用 local.properties 注入（可为空）")
}

// ------------------------------------------------------------------ 本机配置读取
// local.properties 不入库；缺失时全部走默认值，构建不受影响。
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

fun localValue(key: String, fallback: String = ""): String =
    (localProperties.getProperty(key) ?: fallback).trim()

/** 把任意字符串安全地放进 buildConfigField 的双引号里。 */
fun quoted(value: String): String {
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"$escaped\""
}

val apiBaseUrl = localValue("API_BASE_URL", "https://meal.example.com/")
val fcmProjectId = localValue("FCM_PROJECT_ID")
val fcmAppId = localValue("FCM_APP_ID")
val fcmApiKey = localValue("FCM_API_KEY")
val fcmSenderId = localValue("FCM_SENDER_ID")

android {
    namespace = "com.wildcreator.mealreminder"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.wildcreator.mealreminder"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        vectorDrawables {
            useSupportLibrary = true
        }

        // 服务端地址（必须带结尾斜杠）
        buildConfigField("String", "API_BASE_URL", quoted(apiBaseUrl))

        // Firebase 四项：默认空字符串 = 未配置 = 推送走 ntfy
        buildConfigField("String", "FCM_PROJECT_ID", quoted(fcmProjectId))
        buildConfigField("String", "FCM_APP_ID", quoted(fcmAppId))
        buildConfigField("String", "FCM_API_KEY", quoted(fcmApiKey))
        buildConfigField("String", "FCM_SENDER_ID", quoted(fcmSenderId))
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            // 刻意不改 applicationId：FCM 的 Android 应用与包名绑定，
            // 加 .debug 后缀会让 debug 包拿不到 token。
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // minSdk 24 用 java.time 做时间展示，需要脱糖
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/versions/9/previous-compilation-data.bin"
        }
    }
}

dependencies {
    // 核心与生命周期
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose（BOM 统一版本）
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // 网络
    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)

    // 本地存储
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    // 推送：GMS 可用性判定 + FCM（Firebase 允许在没有 google-services.json 时手动初始化）
    implementation(libs.play.services.base)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // 脱糖（java.time）
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
