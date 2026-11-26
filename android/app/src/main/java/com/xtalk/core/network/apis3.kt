package com.xtalk.app.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class FriendRowDto(
    @SerialName("request_id") val requestId: String? = null,
    val id: String? = null,
    @SerialName("user_id") val userId: String,
    val username: String = "",
    val displayName: String? = null,
    val photoUrl: String? = null,
    val country: String? = null,
)

@Serializable
data class SendFriendRequest(val userId: String)

@Serializable
data class FriendStatusDto(val status: String = "NONE", val requestId: String? = null)

interface FriendsApi {
    @GET("api/v1/friends")
    suspend fun friends(): Response<List<FriendRowDto>>

    @GET("api/v1/friends/requests/incoming")
    suspend fun incoming(): Response<List<FriendRowDto>>

    @GET("api/v1/friends/requests/outgoing")
    suspend fun outgoing(): Response<List<FriendRowDto>>

    @POST("api/v1/friends/requests")
    suspend fun send(@Body body: SendFriendRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/friends/requests/{id}/accept")
    suspend fun accept(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/friends/requests/{id}/decline")
    suspend fun decline(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @retrofit2.http.HTTP(method = "DELETE", path = "api/v1/friends/{userId}", hasBody = false)
    suspend fun unfriend(@Path("userId") userId: String): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/friends/status/{userId}")
    suspend fun status(@Path("userId") userId: String): Response<FriendStatusDto>
}

@Serializable
data class AchievementDto(val id: String, val name: String = "", val description: String = "", val emoji: String = "", val unlocked: Boolean = false)

@Serializable
data class ProgressTodayDto(
    val practiceSeconds: Int = 0, val wordsSaved: Int = 0, val messagesSent: Int = 0,
    val lessonsCompleted: Int = 0, val reviewsDone: Int = 0, val dailyGoalMinutes: Int = 15, val goalMet: Boolean = false,
)

@Serializable
data class ProgressDto(
    val streakDays: Int = 0,
    val today: ProgressTodayDto = ProgressTodayDto(),
    val achievements: List<AchievementDto> = emptyList(),
)

interface ProgressApi {
    @GET("api/v1/progress/me")
    suspend fun me(): Response<ProgressDto>
}

@Serializable
data class CourseDto(
    val id: String, val title: String = "", val description: String? = null,
    @SerialName("language_code") val languageCode: String = "", val level: String = "",
    @SerialName("cover_emoji") val coverEmoji: String? = null,
    @SerialName("lesson_count") val lessonCount: Int = 0,
    @SerialName("completed_count") val completedCount: Int = 0,
    val enrolled: Boolean = false,
)

@Serializable
data class LessonRowDto(
    val id: String, val position: Int = 0, val title: String = "", val kind: String = "",
    @SerialName("duration_min") val durationMin: Int? = null, val status: String? = null,
)

@Serializable
data class CourseDetailDto(
    val id: String, val title: String = "", val description: String? = null,
    val lessons: List<LessonRowDto> = emptyList(), val enrolled: Boolean = false,
)

@Serializable
data class LessonDto(val id: String, val title: String = "", val kind: String = "", val content: String = "")

interface CoursesApi {
    @GET("api/v1/courses")
    suspend fun list(@Query("q") q: String? = null): Response<List<CourseDto>>

    @GET("api/v1/courses/{id}")
    suspend fun detail(@Path("id") id: String): Response<CourseDetailDto>

    @POST("api/v1/courses/{id}/enroll")
    suspend fun enroll(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/courses/lessons/{lessonId}")
    suspend fun lesson(@Path("lessonId") id: String): Response<LessonDto>

    @POST("api/v1/courses/lessons/{lessonId}/complete")
    suspend fun complete(@Path("lessonId") id: String, @Body body: Map<String, Int> = emptyMap()): Response<kotlinx.serialization.json.JsonObject>
}
