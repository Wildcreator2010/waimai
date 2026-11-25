package com.wildcreator.mealreminder.data.remote

import com.wildcreator.mealreminder.data.remote.dto.RefreshRequest
import com.wildcreator.mealreminder.data.remote.dto.TokenPairDto
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * 仅用于令牌刷新。刻意与 [ApiService] 分离：
 * 它由独立的 OkHttpClient 承载，不带 Authorization 拦截器、也不带 Authenticator，
 * 否则刷新失败会自我递归。
 */
interface RefreshApi {

    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenPairDto
}
