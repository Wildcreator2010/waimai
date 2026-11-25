package com.wildcreator.mealreminder.di

import javax.inject.Qualifier

/** 不带鉴权、不带 Authenticator 的裸客户端：仅用于 /auth/refresh。 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RefreshClient

/** 专用于 ntfy WebSocket 的客户端：不注入 App 的 Authorization，允许无限读超时。 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class NtfyClient
