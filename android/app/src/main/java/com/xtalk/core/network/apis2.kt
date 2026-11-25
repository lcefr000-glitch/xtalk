package com.xtalk.app.core.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface DiscoveryApi {
    @GET("api/v1/discovery/search")
    suspend fun search(
        @Query("native") native: String? = null,
        @Query("learning") learning: String? = null,
        @Query("country") country: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): Response<SearchResponse>

    @GET("api/v1/discovery/recommendations")
    suspend fun recommendations(): Response<RecommendationsResponse>

    @POST("api/v1/users/{id}/follow")
    suspend fun follow(@Path("id") id: String): Response<Map<String, @JvmSuppressWildcards Any>>

    @DELETE("api/v1/users/{id}/follow")
    suspend fun unfollow(@Path("id") id: String): Response<Map<String, @JvmSuppressWildcards Any>>
}

interface ChatApi {
    @GET("api/v1/conversations")
    suspend fun conversations(): Response<ConversationsResponse>

    @POST("api/v1/conversations")
    suspend fun create(@Body body: Map<String, String>): Response<ConversationSummaryDto>

    @GET("api/v1/conversations/{id}/messages")
    suspend fun messages(
        @Path("id") id: String,
        @Query("before") before: String? = null,
        @Query("limit") limit: Int = 30,
    ): Response<MessagesPage>

    @POST("api/v1/conversations/{id}/messages")
    suspend fun send(@Path("id") id: String, @Body body: SendMessageRequest): Response<MessageDto>

    @POST("api/v1/conversations/{id}/read")
    suspend fun markRead(@Path("id") id: String): Response<SuccessResponse>

    @GET("api/v1/conversations/unread-count")
    suspend fun unreadCount(): Response<UnreadResponse>
}

interface MomentsApi {
    @GET("api/v1/feed")
    suspend fun feed(@Query("before") before: String? = null, @Query("limit") limit: Int = 20): Response<FeedResponse>

    @POST("api/v1/posts")
    suspend fun createPost(@Body body: CreatePostRequest): Response<FeedPostDto>

    @POST("api/v1/posts/{id}/like")
    suspend fun like(@Path("id") id: String): Response<Map<String, @JvmSuppressWildcards Any>>

    @DELETE("api/v1/posts/{id}/like")
    suspend fun unlike(@Path("id") id: String): Response<Map<String, @JvmSuppressWildcards Any>>

    @GET("api/v1/posts/{id}/comments")
    suspend fun comments(@Path("id") id: String): Response<CommentsResponse>

    @POST("api/v1/posts/{id}/comments")
    suspend fun comment(@Path("id") id: String, @Body body: Map<String, String>): Response<CommentDto>
}

interface VoiceApi {
    @GET("api/v1/voice-rooms")
    suspend fun rooms(): Response<List<VoiceRoomDto>>

    @POST("api/v1/voice-rooms")
    suspend fun createRoom(@Body body: CreateRoomRequest): Response<VoiceRoomDto>

    @POST("api/v1/voice-rooms/{id}/join")
    suspend fun join(@Path("id") id: String): Response<Map<String, @JvmSuppressWildcards Any>>

    @POST("api/v1/voice-rooms/{id}/leave")
    suspend fun leave(@Path("id") id: String): Response<SuccessResponse>

    @GET("api/v1/voice-rooms/{id}")
    suspend fun room(@Path("id") id: String): Response<VoiceRoomDetailDto>

    @POST("api/v1/voice-rooms/{id}/token")
    suspend fun token(@Path("id") id: String): Response<VoiceTokenDto>

    @POST("api/v1/voice-rooms/{id}/role")
    suspend fun setRole(@Path("id") id: String, @Body body: RoomRoleRequest): Response<SuccessResponse>

    @POST("api/v1/voice-rooms/{id}/mute")
    suspend fun mute(@Path("id") id: String, @Body body: RoomUserRequest): Response<SuccessResponse>

    @POST("api/v1/voice-rooms/{id}/unmute")
    suspend fun unmute(@Path("id") id: String, @Body body: RoomUserRequest): Response<SuccessResponse>

    @POST("api/v1/voice-rooms/{id}/remove")
    suspend fun remove(@Path("id") id: String, @Body body: RoomUserRequest): Response<SuccessResponse>

    @POST("api/v1/voice-rooms/{id}/close")
    suspend fun close(@Path("id") id: String): Response<SuccessResponse>
}

interface NotificationsApi {
    @GET("api/v1/notifications")
    suspend fun list(): Response<NotificationsResponse>

    @POST("api/v1/notifications/read-all")
    suspend fun readAll(): Response<SuccessResponse>

    @GET("api/v1/notifications/unread-count")
    suspend fun unreadCount(): Response<UnreadResponse>
}

interface SubscriptionsApi {
    @GET("api/v1/subscriptions/me")
    suspend fun me(): Response<SubscriptionDto>

    @GET("api/v1/subscriptions/entitlements")
    suspend fun entitlements(): Response<EntitlementsDto>
}

interface ToolsApi {
    @POST("api/v1/translate")
    suspend fun translate(@Body body: Map<String, String>): Response<Map<String, @JvmSuppressWildcards Any>>

    @POST("api/v1/corrections")
    suspend fun correct(@Body body: Map<String, String>): Response<Map<String, @JvmSuppressWildcards Any>>
}
