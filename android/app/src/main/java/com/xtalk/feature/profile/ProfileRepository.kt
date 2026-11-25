package com.xtalk.app.feature.profile

import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.db.AppDatabase
import com.xtalk.app.core.db.CachedProfile
import com.xtalk.app.core.network.AddUserLanguageRequest
import com.xtalk.app.core.network.MeResponse
import com.xtalk.app.core.network.UpdateProfileRequest
import com.xtalk.app.core.network.UserApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val userApi: UserApi,
    private val db: AppDatabase,
) {
    suspend fun me(): ApiResult<MeResponse> = try {
        val response = userApi.me()
        val body = response.body()
        if (response.isSuccessful && body != null) {
            cache(body)
            ApiResult.Success(body)
        } else {
            ApiResult.Error("Could not load profile (HTTP ${response.code()})", response.code())
        }
    } catch (e: Exception) {
        ApiResult.Error("Network error: ${e.message ?: "could not reach the server"}")
    }

    suspend fun updateProfile(request: UpdateProfileRequest): ApiResult<Unit> = try {
        val response = userApi.updateProfile(request)
        if (response.isSuccessful) ApiResult.Success(Unit)
        else ApiResult.Error("Update failed (HTTP ${response.code()})", response.code())
    } catch (e: Exception) {
        ApiResult.Error("Network error: ${e.message ?: "could not reach the server"}")
    }

    suspend fun addLanguage(request: AddUserLanguageRequest): ApiResult<Unit> = try {
        val response = userApi.addLanguage(request)
        if (response.isSuccessful) ApiResult.Success(Unit)
        else ApiResult.Error("Could not add language (HTTP ${response.code()})", response.code())
    } catch (e: Exception) {
        ApiResult.Error("Network error: ${e.message ?: "could not reach the server"}")
    }

    fun cachedProfile(userId: String) = db.cachedProfileDao().observe(userId)

    suspend fun clearCache() = db.cachedProfileDao().clear()

    private suspend fun cache(me: MeResponse) {
        db.cachedProfileDao().upsert(
            CachedProfile(
                userId = me.id,
                username = me.username,
                displayName = me.profile?.displayName ?: me.username,
                bio = me.profile?.bio,
                country = me.profile?.country,
                photoUrl = me.profile?.photoUrl,
                languagesSummary = me.userLanguages.joinToString {
                    "${it.languageCode}:${it.proficiency}"
                },
                cachedAt = System.currentTimeMillis(),
            ),
        )
    }
}
