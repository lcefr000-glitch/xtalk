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
    val photoUrl: String? = null,
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
    val settings: SettingsDto? = null,
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
    val matchScore: Int = 0,
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
    val moderatorIds: List<String> = emptyList(),
    val theme: String = "default",
    val stageRequests: List<String> = emptyList(),
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


@Serializable
data class GoogleLoginRequest(
    val idToken: String,
    val dateOfBirth: String? = null,
    val username: String? = null,
)

@Serializable
data class GoogleLoginResponse(
    val needsProfile: Boolean = false,
    val email: String? = null,
    val name: String? = null,
    val suggestedUsername: String? = null,
    val user: UserDto? = null,
    val accessToken: String? = null,
    val accessTokenExpiresIn: Int? = null,
    val refreshToken: String? = null,
    val refreshTokenExpiresAt: String? = null,
)


@Serializable
data class PublicLanguageDto(val code: String = "", val name: String? = null, val type: String? = null, val proficiency: String? = null)

@Serializable
data class PublicProfileDto(
    val id: String,
    val username: String,
    val displayName: String = "",
    val bio: String? = null,
    val photoUrl: String? = null,
    val country: String? = null,
    val interests: List<String> = emptyList(),
    val createdAt: String? = null,
    val lastActiveAt: String? = null,
    val languages: List<PublicLanguageDto> = emptyList(),
    val followers: Int = 0,
    val following: Int = 0,
    val isFollowing: Boolean = false,
    val isSelf: Boolean = false,
)

@Serializable
data class UpdateSettingsRequest(
    val notifyMessages: Boolean? = null,
    val notifyFollowers: Boolean? = null,
    val notifyLikes: Boolean? = null,
    val notifyComments: Boolean? = null,
    val notifyRoomInvitations: Boolean? = null,
    val notifyCalls: Boolean? = null,
)

@Serializable
data class SettingsDto(
    val notifyMessages: Boolean = true,
    val notifyFollowers: Boolean = true,
    val notifyLikes: Boolean = true,
    val notifyComments: Boolean = true,
    val notifyRoomInvitations: Boolean = true,
    val notifyCalls: Boolean = true,
)


@Serializable
data class WalletDto(
    val coins: Int = 0, val totalSpent: Int = 0, val level: Int = 1,
    val nextLevelAt: Int = 50, val levelStartsAt: Int = 0,
)

@Serializable
data class GiftDto(val id: String, val name: String, val emoji: String, val price: Int)

@Serializable
data class SendGiftRequest(val roomId: String, val receiverId: String, val giftId: String)

@Serializable
data class SendGiftResponse(val id: String, val gift: GiftDto, val wallet: WalletDto)

@Serializable
data class RoomGiftDto(
    val id: String, val senderId: String, val receiverId: String, val giftId: String,
    val coins: Int = 0, val createdAt: String, val senderLevel: Int = 1,
)

@Serializable
data class DevActivateRequest(val tier: String)

@Serializable
data class RoomThemeRequest(val theme: String)

@Serializable
data class VipLookupRequest(val ids: List<String>)

@Serializable
data class VipLookupResponse(val vipIds: List<String> = emptyList())

@Serializable
data class LevelsResponse(val levels: Map<String, Int> = emptyMap())

@Serializable
data class ExtrasDto(
    val hometown: String = "", val occupation: String = "", val school: String = "",
    val gender: String = "", val mbti: String = "", val bloodType: String = "", val tagline: String = "",
)

@Serializable
data class HonorGiftDto(val giftId: String, val count: Int = 0, val coins: Int = 0)

@Serializable
data class HonorDto(
    val level: Int = 1, val giftsReceived: List<HonorGiftDto> = emptyList(),
    val totalGifts: Int = 0, val totalCoinsReceived: Int = 0,
)

@Serializable
data class UpdateUsernameRequest(val username: String)

@Serializable
data class UsernameCheckResponse(val username: String = "", val available: Boolean = false, val reason: String? = null)

@Serializable
data class BlockedUserDto(val id: String, val username: String, val profile: ProfileDto? = null)

@Serializable
data class BlockedResponse(val results: List<BlockedUserDto> = emptyList())

@Serializable
data class ReportRequest(val targetType: String, val targetId: String, val reason: String, val details: String? = null)

@Serializable
data class ReactionDto(val emoji: String, val count: Int = 0, val mine: Boolean = false)

@Serializable
data class ReactionsResponse(val byMessage: Map<String, List<ReactionDto>> = emptyMap())

@Serializable
data class ReactRequest(val emoji: String)

@Serializable
data class PinsResponse(val ids: List<String> = emptyList())

@Serializable
data class WishlistDto(val giftIds: List<String> = emptyList())

@Serializable
data class VocabItemDto(
    val id: String,
    @SerialName("collection_id") val collectionId: String? = null,
    val kind: String = "WORD",
    @SerialName("term") val text: String,
    val translation: String? = null, val definition: String? = null, val example: String? = null,
    val pronunciation: String? = null,
    @SerialName("language_code") val language: String? = null,
    @SerialName("interval_days") val intervalDays: Int = 0,
    val repetitions: Int = 0,
    @SerialName("due_at") val dueAt: String? = null,
)

@Serializable
data class VocabListResponse(val items: List<VocabItemDto> = emptyList(), val total: Int = 0)

@Serializable
data class VocabItemRequest(
    val term: String, val languageCode: String = "en", val translation: String? = null, val example: String? = null,
    val kind: String? = null, val collectionId: String? = null,
)

@Serializable
data class VocabCollectionDto(val id: String, val name: String, @SerialName("item_count") val count: Int = 0)

@Serializable
data class VocabCollectionRequest(val name: String, val languageCode: String = "en")

@Serializable
data class VocabGradeRequest(val quality: Int)

@Serializable
data class VocabLangStat(val languageCode: String = "", val total: Int = 0, val mastered: Int = 0, val due: Int = 0)

@Serializable
data class VocabStatsDto(val total: Int = 0, val due: Int = 0, val learned: Int = 0)

@Serializable
data class ChatFlagDto(val conversationId: String, val muted: Boolean = false, val archived: Boolean = false)

@Serializable
data class ChatFlagsResponse(val flags: List<ChatFlagDto> = emptyList())

@Serializable
data class ChatFlagRequest(val value: Boolean)

@Serializable
data class ChatHitDto(val id: String, val conversationId: String, val body: String? = null, val createdAt: String? = null, val senderId: String? = null)

@Serializable
data class ChatSearchResponse(val messages: List<ChatHitDto> = emptyList())

@Serializable
data class SessionDto(val id: String, val createdAt: String = "", val device: String = "", val ip: String? = null, val active: Boolean = false)

@Serializable
data class SessionsResponse(val sessions: List<SessionDto> = emptyList())

@Serializable
data class EditPostRequest(val body: String)
