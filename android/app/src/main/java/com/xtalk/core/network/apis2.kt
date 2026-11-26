package com.xtalk.app.core.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface DiscoveryApi {
    @GET("api/v1/users/me/followers")
    suspend fun myFollowers(@Query("limit") limit: Int = 50): Response<SearchResponse>

    @GET("api/v1/users/me/following")
    suspend fun myFollowing(@Query("limit") limit: Int = 50): Response<SearchResponse>

    @GET("api/v1/discovery/search")
    suspend fun search(
        @Query("native") native: String? = null,
        @Query("learning") learning: String? = null,
        @Query("country") country: String? = null,
        @Query("q") q: String? = null,
        @Query("sort") sort: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): Response<SearchResponse>

    @GET("api/v1/discovery/recommendations")
    suspend fun recommendations(): Response<RecommendationsResponse>

    @POST("api/v1/users/{id}/follow")
    suspend fun follow(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @DELETE("api/v1/users/{id}/follow")
    suspend fun unfollow(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>
}

interface ChatApi {
    @GET("api/v1/chat-extras/flags")
    suspend fun flags(): Response<ChatFlagsResponse>

    @POST("api/v1/chat-extras/conversations/{id}/mute")
    suspend fun mute(@Path("id") id: String, @Body body: ChatFlagRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/chat-extras/conversations/{id}/archive")
    suspend fun archive(@Path("id") id: String, @Body body: ChatFlagRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/chat-extras/messages/{id}/star")
    suspend fun star(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/chat-extras/stars")
    suspend fun stars(): Response<ChatSearchResponse>

    @GET("api/v1/chat-extras/search")
    suspend fun searchMessages(@Query("q") q: String): Response<ChatSearchResponse>

    @POST("api/v1/chat-extras/messages/{id}/react")
    suspend fun react(@Path("id") id: String, @Body body: ReactRequest): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/chat-extras/conversations/{id}/reactions")
    suspend fun reactions(@Path("id") id: String): Response<ReactionsResponse>

    @GET("api/v1/chat-extras/pins")
    suspend fun pins(): Response<PinsResponse>

    @POST("api/v1/chat-extras/pins/{id}")
    suspend fun togglePin(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

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

    @retrofit2.http.PATCH("api/v1/messages/{id}")
    suspend fun editMessage(@Path("id") id: String, @Body body: Map<String, String>): Response<MessageDto>

    @DELETE("api/v1/messages/{id}")
    suspend fun deleteMessage(@Path("id") id: String): Response<SuccessResponse>

    @GET("api/v1/conversations/unread-count")
    suspend fun unreadCount(): Response<UnreadResponse>
}

interface MomentsApi {
    @GET("api/v1/feed")
    suspend fun feed(@Query("before") before: String? = null, @Query("limit") limit: Int = 20, @Query("saved") saved: String? = null, @Query("tag") tag: String? = null): Response<FeedResponse>

    @retrofit2.http.PATCH("api/v1/posts/{id}")
    suspend fun editPost(@Path("id") id: String, @Body body: EditPostRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/posts/{id}/bookmark")
    suspend fun bookmark(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/posts")
    suspend fun createPost(@Body body: CreatePostRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/posts/{id}/like")
    suspend fun like(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @DELETE("api/v1/posts/{id}/like")
    suspend fun unlike(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

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
    suspend fun join(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/leave")
    suspend fun leave(@Path("id") id: String): Response<SuccessResponse>

    @GET("api/v1/voice-rooms/{id}")
    suspend fun room(@Path("id") id: String): Response<VoiceRoomDetailDto>

    @POST("api/v1/voice-rooms/{id}/token")
    suspend fun token(@Path("id") id: String): Response<VoiceTokenDto>

    @POST("api/v1/voice-rooms/{id}/seat/leave")
    suspend fun leaveSeat(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/stage/request")
    suspend fun requestStage(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/stage/cancel")
    suspend fun cancelStage(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/stage/reject")
    suspend fun rejectStage(@Path("id") id: String, @Body body: RoomUserRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/theme")
    suspend fun setTheme(@Path("id") id: String, @Body body: RoomThemeRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/moderators/add")
    suspend fun addModerator(@Path("id") id: String, @Body body: RoomUserRequest): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/voice-rooms/{id}/moderators/remove")
    suspend fun removeModerator(@Path("id") id: String, @Body body: RoomUserRequest): Response<kotlinx.serialization.json.JsonObject>

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

    @POST("api/v1/subscriptions/vip-lookup")
    suspend fun vipLookup(@Body body: VipLookupRequest): Response<VipLookupResponse>

    @POST("api/v1/subscriptions/dev-activate")
    suspend fun devActivate(@Body body: DevActivateRequest): Response<SubscriptionDto>
}

interface EconomyApi {
    @POST("api/v1/economy/levels")
    suspend fun levels(@Body body: VipLookupRequest): Response<LevelsResponse>

    @GET("api/v1/economy/me")
    suspend fun me(): Response<WalletDto>

    @GET("api/v1/economy/gifts")
    suspend fun gifts(): Response<List<GiftDto>>

    @POST("api/v1/economy/test-grant")
    suspend fun testGrant(): Response<WalletDto>

    @POST("api/v1/economy/gifts/send")
    suspend fun sendGift(@Body body: SendGiftRequest): Response<SendGiftResponse>

    @GET("api/v1/economy/rooms/{id}/gifts")
    suspend fun roomGifts(@Path("id") id: String, @Query("since") since: String? = null): Response<List<RoomGiftDto>>
}

interface ToolsApi {
    @POST("api/v1/translate")
    suspend fun translate(@Body body: Map<String, String>): Response<kotlinx.serialization.json.JsonObject>

    @POST("api/v1/corrections")
    suspend fun correct(@Body body: Map<String, String>): Response<kotlinx.serialization.json.JsonObject>
}

interface ExtrasApi {
    @GET("api/v1/profile-extras/me")
    suspend fun mine(): Response<ExtrasDto>

    @PUT("api/v1/profile-extras/me")
    suspend fun save(@Body body: ExtrasDto): Response<ExtrasDto>

    @GET("api/v1/profile-extras/{id}")
    suspend fun of(@Path("id") id: String): Response<ExtrasDto>

    @GET("api/v1/profile-extras/{id}/posts")
    suspend fun posts(@Path("id") id: String, @Query("before") before: String? = null): Response<FeedResponse>

    @GET("api/v1/profile-extras/{id}/wishlist")
    suspend fun wishlist(@Path("id") id: String): Response<WishlistDto>

    @PUT("api/v1/profile-extras/me/wishlist")
    suspend fun setWishlist(@Body body: WishlistDto): Response<WishlistDto>

    @GET("api/v1/profile-extras/{id}/honor")
    suspend fun honor(@Path("id") id: String): Response<HonorDto>
}

interface VocabApi {
    @GET("api/v1/vocab/items")
    suspend fun items(@Query("q") q: String? = null, @Query("collectionId") collectionId: String? = null): Response<VocabListResponse>

    @POST("api/v1/vocab/items")
    suspend fun add(@Body body: VocabItemRequest): Response<VocabItemDto>

    @HTTP(method = "DELETE", path = "api/v1/vocab/items/{id}", hasBody = false)
    suspend fun remove(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/vocab/review/due")
    suspend fun due(@Query("limit") limit: Int = 20): Response<List<VocabItemDto>>

    @POST("api/v1/vocab/items/{id}/review")
    suspend fun review(@Path("id") id: String, @Body body: VocabGradeRequest): Response<kotlinx.serialization.json.JsonObject>

    @GET("api/v1/vocab/stats")
    suspend fun stats(): Response<List<VocabLangStat>>

    @GET("api/v1/vocab/collections")
    suspend fun collections(): Response<List<VocabCollectionDto>>

    @POST("api/v1/vocab/collections")
    suspend fun createCollection(@Body body: VocabCollectionRequest): Response<VocabCollectionDto>
}

interface SessionsApi {
    @GET("api/v1/auth/sessions")
    suspend fun sessions(): Response<SessionsResponse>

    @HTTP(method = "DELETE", path = "api/v1/auth/sessions/{id}", hasBody = false)
    suspend fun revoke(@Path("id") id: String): Response<kotlinx.serialization.json.JsonObject>
}
