// 取餐提醒 · Android 工程设置
// 默认使用 Google / Maven Central 官方源，CI 与海外网络更稳。
// 国内网络可启用阿里云镜像：在 android/gradle.properties 取消注释 chinaMirrors=true，
// 或执行 ./gradlew -PchinaMirrors=true assembleDebug。

pluginManagement {
    val useChinaMirrors = providers
        .gradleProperty("chinaMirrors")
        .orElse(providers.environmentVariable("CHINA_MIRRORS"))
        .getOrElse("false")
        .toBoolean()
    repositories {
        // 插件标记（plugin marker）在官方源最全；阿里云对部分 KSP 标记返回 502，故官方优先
        google()
        mavenCentral()
        gradlePluginPortal()
        if (useChinaMirrors) {
            maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
            maven { url = uri("https://maven.aliyun.com/repository/public") }
        }
    }
}

dependencyResolutionManagement {
    val useChinaMirrors = providers
        .gradleProperty("chinaMirrors")
        .orElse(providers.environmentVariable("CHINA_MIRRORS"))
        .getOrElse("false")
        .toBoolean()
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        if (useChinaMirrors) {
            maven { url = uri("https://maven.aliyun.com/repository/public") }
            maven { url = uri("https://maven.aliyun.com/repository/google") }
        }
        google()
        mavenCentral()
    }
}

rootProject.name = "meal-reminder-android"

include(":app")
