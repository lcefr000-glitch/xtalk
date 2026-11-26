package com.xtalk.app.feature.auth

import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.AuthResponse
import com.xtalk.app.core.network.LoginRequest
import com.xtalk.app.core.network.GoogleLoginRequest
import com.xtalk.app.core.network.GoogleLoginResponse
import com.xtalk.app.core.network.RefreshRequest
import com.xtalk.app.core.network.RegisterRequest
import com.xtalk.app.core.network.TokenStore
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
    private val json: Json,
) {
    val session = tokenStore.session

    suspend fun register(request: RegisterRequest): ApiResult<AuthResponse> =
        call { authApi.register(request) }.also { persistIfOk(it) }

    suspend fun login(email: String, password: String): ApiResult<AuthResponse> =
        call { authApi.login(LoginRequest(email.trim().lowercase(), password)) }.also { persistIfOk(it) }

    /** Returns Success(null) when the account must be completed (needsProfile) and the profile is in [lastProfile]. */
    suspend fun google(idToken: String, dob: String?, username: String?): ApiResult<GoogleLoginResponse> {
        val res = call { authApi.google(GoogleLoginRequest(idToken, dob, username)) }
        if (res is ApiResult.Success && !res.data.needsProfile) {
            val r = res.data
            val auth = AuthResponse(r.user!!, r.accessToken!!, r.accessTokenExpiresIn ?: 900, r.refreshToken!!, r.refreshTokenExpiresAt ?: "")
            tokenStore.saveAuth(auth.user.id, auth.user.username, auth.user.email, auth)
        }
        return res
    }

    suspend fun verifyEmail(token: String): ApiResult<Boolean> =
        when (val res = call { authApi.verifyEmail(mapOf("token" to token.trim())) }) {
            is ApiResult.Success -> ApiResult.Success(res.data.success)
            is ApiResult.Error -> res
        }

    suspend fun resendVerification(email: String): ApiResult<Unit> =
        when (val res = call { authApi.resendVerification(mapOf("email" to email.trim().lowercase())) }) {
            is ApiResult.Success -> ApiResult.Success(Unit)
            is ApiResult.Error -> res
        }

    suspend fun logout() {
        val refresh = tokenStore.currentSession()?.refreshToken
        if (refresh != null) runCatching { authApi.logout(RefreshRequest(refresh)) }
        tokenStore.clear()
    }

    private suspend fun persistIfOk(result: ApiResult<AuthResponse>) {
        if (result is ApiResult.Success) {
            val auth = result.data
            tokenStore.saveAuth(auth.user.id, auth.user.username, auth.user.email, auth)
        }
    }

    private suspend fun <T> call(block: suspend () -> Response<T>): ApiResult<T> =
        try {
            val response = block()
            val body = response.body()
            when {
                response.isSuccessful && body != null -> ApiResult.Success(body)
                else -> ApiResult.Error(parseErrorMessage(response.code(), response.errorBody()?.string()), response.code())
            }
        } catch (e: Exception) {
            ApiResult.Error("Network error: ${e.message ?: "could not reach the server"}")
        }

    /** Backend sends { message: string | string[] } on errors. */
    internal fun parseErrorMessage(code: Int, raw: String?): String {
        if (raw.isNullOrBlank()) return "Request failed (HTTP $code)"
        return runCatching {
            val element = json.parseToJsonElement(raw)
            val message = element.let { it as? kotlinx.serialization.json.JsonObject }?.get("message")
            when {
                message == null -> "Request failed (HTTP $code)"
                message is kotlinx.serialization.json.JsonArray ->
                    message.jsonArray.joinToString("\n") { it.jsonPrimitive.content }
                else -> message.jsonPrimitive.content
            }
        }.getOrDefault("Request failed (HTTP $code)")
    }
}
