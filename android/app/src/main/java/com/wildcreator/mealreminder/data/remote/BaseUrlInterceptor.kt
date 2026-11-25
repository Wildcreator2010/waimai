package com.wildcreator.mealreminder.data.remote

import com.wildcreator.mealreminder.data.session.ServerConfig
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * 把每个请求的 host 改写成当前配置的服务器地址。
 *
 * 为什么不用 Retrofit 的 baseUrl：Retrofit 的 baseUrl 在构建后不可变，
 * 而用户可能在运行时换成自己的服务器。这里保留 Retrofit 的路径拼接，
 * 只替换 scheme/host/port，路径与查询参数原样保留。
 */
@Singleton
class BaseUrlInterceptor @Inject constructor(
    private val serverConfig: ServerConfig,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val base = serverConfig.baseUrl().toHttpUrlOrNull() ?: return chain.proceed(request)

        val target = request.url.newBuilder()
            .scheme(base.scheme)
            .host(base.host)
            .port(base.port)
            .build()

        return chain.proceed(request.newBuilder().url(target).build())
    }
}
