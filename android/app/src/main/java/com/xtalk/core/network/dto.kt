package com.xtalk.app.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(
    val email: String,
    val username: String,
    val password: String,
    val displayName: String,
    val dateOfBirth: String,
)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    val username: String,
    val emailVerified: Boolean = false,
    val isMinor: Boolean = false,
    val status: String = "ACTIVE",
)

@Serializable
data class AuthResponse(
    val user: UserDto,
    val accessToken: String,
    val accessTokenExpiresIn: Int,
    val refreshToken: String,
    val refreshTokenExpiresAt: String,
    val devVerificationToken: String? = null,
)

@Serializable
data class TokenPairResponse(
    val accessToken: String,
    val accessTokenExpiresIn: Int,
    val refreshToken: String,
    val refreshTokenExpiresAt: String,
)

@Serializable
data class LanguageDto(
    val code: String,
    val name: String,
    val nativeName: String,
    val isRtl: Boolean = false,
)

@Serializable
data class UserLanguageDto(
    val id: String,
    val languageCode: String,
    val type: String,
    val proficiency: String,
    val language: LanguageDto? = null,
)

@Serializable
data class AddUserLanguageRequest(
    val code: String,
    val type: String,
    val proficiency: String,
    val dailyMinutes: Int? = null,
    val goalText: String? = null,
)

@Serializable
data class ProfileDto(
    val id: String? = null,
    val displayName: String = "",
    val bio: String? = null,
    val photoUrl: String? = null,
    val country: String? = null,
    val interests: List<String> = emptyList(),
    val showOnlineStatus: Boolean = true,
    val showLastActive: Boolean = true,
    val profileIsPublic: Boolean = true,
    val interfaceLanguage: String = "en",
)

@Serializable
data class UpdateProfileRequest(
    val displayName: String? = null,
    val bio: String? = null,
    val country: String? = null,
    val interests: List<String>? = null,
    val showOnlineStatus: Boolean? = null,
    val showLastActive: Boolean? = null,
    val profileIsPublic: Boolean? = null,
    val interfaceLanguage: String? = null,
)

@Serializable
data class MeResponse(
    val id: String,
    val email: String,
    val username: String,
    val emailVerified: Boolean,
    val isMinor: Boolean,
    val profile: ProfileDto? = null,
    @SerialName("userLanguages") val userLanguages: List<UserLanguageDto> = emptyList(),
)

@Serializable
data class SuccessResponse(val success: Boolean)

@Serializable
data class ApiErrorBody(
    val statusCode: Int? = null,
    val error: String? = null,
    val message: kotlinx.serialization.json.JsonElement? = null,
)

// ---------- Phase 2+: discovery / messaging / moments / voice / admin DTOs ----------

@Serializable
data class PartnerUserDto(
    val id: String,
    val username: String,
    val lastActiveAt: String? = null,
    val isOnline: Boolean? = null,
    val profile: ProfileDto? = null,
    @SerialName("languages") val languages: List<UserLanguageDto> = emptyList(),
)

@Serializable
data class SearchResponse(
    val page: Int, val limit: Int, val total: Int,
    val results: List<PartnerUserDto>,
)

@Serializable
data class RecommendationsResponse(val results: List<PartnerUserDto>, val hint: String? = null)

@Serializable
data class AttachmentDto(val id: String? = null, val url: String, val mimeType: String, val byteSize: Int)

@Serializable
data class MessageDto(
    val id: String,
    val conversationId: String? = null,
    val senderId: String,
    val type: String = "TEXT",
    val body: String? = null,
    val replyToId: String? = null,
    val editedAt: String? = null,
    val createdAt: String,
    val attachments: List<AttachmentDto> = emptyList(),
)

@Serializable
data class ConversationSummaryDto(
    val id: String,
    val updatedAt: String,
    val members: List<UserRefDto> = emptyList(),
    val lastMessage: MessageDto? = null,
    val unreadCount: Int = 0,
)

@Serializable
data class UserRefDto(
    val id: String,
    val username: String,
    val profile: ProfileDto? = null,
)

@Serializable
data class ConversationsResponse(val results: List<ConversationSummaryDto>)

@Serializable
data class MessagesPage(val results: List<MessageDto>, val nextCursor: String? = null)

@Serializable
data class PostAuthorDto(val id: String, val username: String, val profile: ProfileDto? = null)

@Serializable
data class FeedPostDto(
    val id: String,
    val body: String,
    val languageCode: String? = null,
    val createdAt: String,
    val author: PostAuthorDto,
    val images: List<kotlinx.serialization.json.JsonObject> = emptyList(),
    val commentCount: Int = 0,
    val likeCount: Int = 0,
    val likedByMe: Boolean = false,
)

@Serializable
data class FeedResponse(val results: List<FeedPostDto>, val nextCursor: String? = null)

@Serializable
data class CommentDto(
    val id: String,
    val postId: String? = null,
    val body: String,
    val author: PostAuthorDto? = null,
    val createdAt: String? = null,
)

@Serializable
data class CommentsResponse(val page: Int, val limit: Int, val total: Int, val results: List<CommentDto>)

@Serializable
data class VoiceRoomDto(
    val id: String,
    val title: String,
    val description: String? = null,
    val isLive: Boolean = true,
    val language: LanguageDto? = null,
    val host: UserRefDto? = null,
)

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val actor: UserRefDto? = null,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
data class NotificationsResponse(val page: Int, val limit: Int, val total: Int, val results: List<NotificationDto>)

@Serializable
data class SubscriptionDto(val plan: String = "FREE", val status: String = "ACTIVE", val expiresAt: String? = null)

@Serializable
data class EntitlementsDto(val plan: String, val features: List<String>)

@Serializable
data class CreatePostRequest(val body: String, val languageCode: String? = null, val imageUrls: List<String>? = null)

@Serializable
data class SendMessageRequest(val type: String, val body: String? = null, val replyToId: String? = null)

@Serializable
data class CreateRoomRequest(val title: String, val description: String? = null, val languageCode: String? = null)

@Serializable
data class UnreadResponse(val unread: Int)

@Serializable
data class VoiceParticipantDto(
    val userId: String,
    val role: String = "LISTENER",
    val isMuted: Boolean = false,
    val user: UserRefDto? = null,
)

@Serializable
data class VoiceRoomDetailDto(
    val id: String,
    val title: String,
    val isLive: Boolean = true,
    val hostId: String? = null,
    val participants: List<VoiceParticipantDto> = emptyList(),
)

@Serializable
data class VoiceTokenDto(
    val token: String,
    val url: String,
    val userId: String? = null,
    val role: String = "LISTENER",
    val isMuted: Boolean = false,
    val canPublish: Boolean = false,
)

@Serializable
data class RoomRoleRequest(val userId: String, val role: String)

@Serializable
data class RoomUserRequest(val userId: String)
