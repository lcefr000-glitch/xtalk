package com.xtalk.app.core.network

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * On a 401, rotates the refresh token once and retries. If rotation fails
 * (expired / revoked / reuse-detected), the session is cleared and the app
 * returns to the login flow.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore,
    private val authApi: Provider<AuthApi>,
) : Authenticator {

    private val mutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Do not retry forever: responseCount > 1 means the retry already failed.
        if (responseCount(response) >= 2) return null
        val current = runBlocking { tokenStore.currentSession() } ?: return null

        val newTokens = runBlocking {
            mutex.withLock {
                // Another thread may have refreshed already.
                val latest = tokenStore.currentSession()
                if (latest != null && latest.accessToken != current.accessToken) return@withLock latest
                val refreshed = authApi.get()
                    .refresh(RefreshRequest(current.refreshToken))
                val body = if (refreshed.isSuccessful) refreshed.body() else null
                if (body == null) {
                    tokenStore.clear()
                    null
                } else {
                    tokenStore.saveTokens(body)
                    tokenStore.currentSession()
                }
            }
        } ?: return null

        return response.request.newBuilder()
            .header("Authorization", "Bearer ${newTokens.accessToken}")
            .build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
