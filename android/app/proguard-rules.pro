# 本期 release 未开启混淆（isMinifyEnabled = false），此处仅留占位。
# 若后续开启，kotlinx.serialization 与 Retrofit 泛型需要以下规则：

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.wildcreator.mealreminder.data.remote.dto.** {
    *** Companion;
}
-keepclasseswithmembers class com.wildcreator.mealreminder.data.remote.dto.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit
-keepattributes Signature, Exceptions
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
