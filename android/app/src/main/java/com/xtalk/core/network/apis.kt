package com.xtalk.app.core.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Unauthenticated endpoints (auth + public language catalogue). */
interface AuthApi {
    @POST("api/v1/auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("api/v1/auth/google")
    suspend fun google(@Body body: GoogleLoginRequest): Response<GoogleLoginResponse>

    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<TokenPairResponse>

    @POST("api/v1/auth/logout")
    suspend fun logout(@Body body: RefreshRequest): Response<SuccessResponse>

    @POST("api/v1/auth/verify-email")
    suspend fun verifyEmail(@Body body: Map<String, String>): Response<SuccessResponse>

    @POST("api/v1/auth/resend-verification")
    suspend fun resendVerification(@Body body: Map<String, String>): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/auth/forgot-password")
    suspend fun forgotPassword(@Body body: Map<String, String>): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/auth/reset-password")
    suspend fun resetPassword(@Body body: Map<String, String>): Response<SuccessResponse>

    @GET("api/v1/languages")
    suspend fun languages(@Query("search") search: String? = null): Response<List<LanguageDto>>
}

/** Bearer-protected endpoints (token attached by AuthInterceptor). */
interface UserApi {
    @GET("api/v1/users/me")
    suspend fun me(): Response<MeResponse>

    @PATCH("api/v1/profiles/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): Response<ProfileDto>

    @GET("api/v1/profiles/{id}")
    suspend fun publicProfile(@Path("id") id: String): Response<PublicProfileDto>

    @PATCH("api/v1/users/me/settings")
    suspend fun updateSettings(@Body body: UpdateSettingsRequest): Response<kotlinx.serialization.json.JsonObject>

    @HTTP(method = "DELETE", path = "api/v1/users/me", hasBody = false)
    suspend fun deleteMe(): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/users/{id}/follow")
    suspend fun follow(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @HTTP(method = "DELETE", path = "api/v1/users/{id}/follow", hasBody = false)
    suspend fun unfollow(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @PATCH("api/v1/users/me")
    suspend fun updateUsername(@Body body: UpdateUsernameRequest): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/users/check-username")
    suspend fun checkUsername(@Query("username") username: String): Response<UsernameCheckResponse>

    @POST("api/v1/users/{id}/block")
    suspend fun block(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @HTTP(method = "DELETE", path = "api/v1/users/{id}/block", hasBody = false)
    suspend fun unblock(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/users/me/blocked")
    suspend fun blocked(): Response<BlockedResponse>

    @POST("api/v1/reports")
    suspend fun report(@Body body: ReportRequest): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/users/me/languages")
    suspend fun myLanguages(): Response<List<UserLanguageDto>>

    @POST("api/v1/users/me/languages")
    suspend fun addLanguage(@Body body: AddUserLanguageRequest): Response<UserLanguageDto>

    @HTTP(method = "DELETE", path = "api/v1/users/me/languages/{code}", hasBody = false)
    suspend fun removeLanguage(@Path("code") code: String): Response<SuccessResponse>
}
