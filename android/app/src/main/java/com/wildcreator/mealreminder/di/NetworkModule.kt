package com.wildcreator.mealreminder.di

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.wildcreator.mealreminder.BuildConfig
import com.wildcreator.mealreminder.data.remote.ApiService
import com.wildcreator.mealreminder.data.remote.AuthInterceptor
import com.wildcreator.mealreminder.data.remote.BaseUrlInterceptor
import com.wildcreator.mealreminder.data.remote.RefreshApi
import com.wildcreator.mealreminder.data.remote.TokenAuthenticator
import com.wildcreator.mealreminder.data.session.ServerConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private val jsonMediaType = "application/json; charset=UTF-8".toMediaType()

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        // 服务端可能加字段，客户端不因未知字段崩溃
        ignoreUnknownKeys = true
        // 只发送非 null 字段：PATCH 语义要求「未改的字段不出现」
        explicitNulls = false
        encodeDefaults = false
        coerceInputValues = true
    }

    @Provides
    @Singleton
    fun provideBaseUrl(serverConfig: ServerConfig): String = serverConfig.baseUrl()

    /** 刷新专用：裸客户端，避免拦截器/认证器递归（但仍要改写 host）。 */
    @Provides
    @Singleton
    @RefreshClient
    fun provideRefreshClient(baseUrlInterceptor: BaseUrlInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(baseUrlInterceptor)
            .build()

    /** ntfy 长连接专用：不带 Authorization 拦截器，读超时交给 WebSocket 的 ping 机制。 */
    @Provides
    @Singleton
    @NtfyClient
    fun provideNtfyClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        baseUrlInterceptor: BaseUrlInterceptor,
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(baseUrlInterceptor)
            .addInterceptor(authInterceptor)
            .authenticator(tokenAuthenticator)

        if (BuildConfig.DEBUG) {
            // BASIC 级别只记录请求行与状态码，绝不把密码/令牌写进日志
            builder.addInterceptor(
                HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC },
            )
        }
        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        client: OkHttpClient,
        json: Json,
        baseUrl: String,
    ): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(json.asConverterFactory(jsonMediaType))
        .build()

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService = retrofit.create(ApiService::class.java)

    @Provides
    @Singleton
    fun provideRefreshApi(
        @RefreshClient client: OkHttpClient,
        json: Json,
        baseUrl: String,
    ): RefreshApi = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(json.asConverterFactory(jsonMediaType))
        .build()
        .create(RefreshApi::class.java)
}
