package com.xtalk.app.core.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionStore by preferencesDataStore(name = "xtalk_session")

data class Session(
    val accessToken: String,
    val refreshToken: String,
    val refreshTokenExpiresAt: String,
    val userId: String,
    val username: String,
    val email: String,
)

/** Persisted auth session (DataStore). Single writer: AuthRepository / TokenAuthenticator. */
@Singleton
class TokenStore @Inject constructor(@ApplicationContext context: Context) {

    private val store = context.sessionStore

    private object K {
        val access = stringPreferencesKey("access_token")
        val refresh = stringPreferencesKey("refresh_token")
        val refreshExpiry = stringPreferencesKey("refresh_expiry")
        val userId = stringPreferencesKey("user_id")
        val username = stringPreferencesKey("username")
        val email = stringPreferencesKey("email")
        val onboardingDone = stringPreferencesKey("onboarding_done")
    }

    val session: Flow<Session?> = store.data.map { p ->
        val access = SecureBox.open(p[K.access])
        val refresh = SecureBox.open(p[K.refresh])
        if (access.isNullOrBlank() || refresh.isNullOrBlank()) null
        else Session(
            accessToken = access,
            refreshToken = refresh,
            refreshTokenExpiresAt = p[K.refreshExpiry].orEmpty(),
            userId = p[K.userId].orEmpty(),
            username = p[K.username].orEmpty(),
            email = p[K.email].orEmpty(),
        )
    }

    val onboardingDone: Flow<Boolean> = store.data.map { it[K.onboardingDone] == "true" }

    suspend fun currentSession(): Session? = session.first()

    suspend fun saveAuth(userId: String, username: String, email: String, tokens: AuthResponse) {
        store.edit { p ->
            p[K.access] = SecureBox.seal(tokens.accessToken)
            p[K.refresh] = SecureBox.seal(tokens.refreshToken)
            p[K.refreshExpiry] = tokens.refreshTokenExpiresAt
            p[K.userId] = userId
            p[K.username] = username
            p[K.email] = email
        }
    }

    suspend fun saveTokens(tokens: TokenPairResponse) {
        store.edit { p ->
            p[K.access] = SecureBox.seal(tokens.accessToken)
            p[K.refresh] = SecureBox.seal(tokens.refreshToken)
            p[K.refreshExpiry] = tokens.refreshTokenExpiresAt
        }
    }

    suspend fun markOnboardingDone() {
        store.edit { it[K.onboardingDone] = "true" }
    }

    suspend fun clear() {
        store.edit { p ->
            p.remove(K.access); p.remove(K.refresh); p.remove(K.refreshExpiry)
            p.remove(K.userId); p.remove(K.username); p.remove(K.email)
        }
    }
}
