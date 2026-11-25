// 根构建脚本：只声明插件版本，具体配置在 app/build.gradle.kts
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    // 只有 app/google-services.json 存在时才会在 app 模块真正应用（见 app/build.gradle.kts）
    alias(libs.plugins.google.services) apply false
}
