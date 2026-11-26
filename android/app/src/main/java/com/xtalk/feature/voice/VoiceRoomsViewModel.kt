package com.xtalk.app.feature.voice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.CreateRoomRequest
import com.xtalk.app.core.network.LanguageDto
import com.xtalk.app.core.network.VoiceApi
import com.xtalk.app.core.network.RoomRoleRequest
import com.xtalk.app.core.network.RoomUserRequest
import com.xtalk.app.core.network.VoiceRoomDetailDto
import com.xtalk.app.core.network.VoiceRoomDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VoiceState(
    val loading: Boolean = true,
    val rooms: List<VoiceRoomDto> = emptyList(),
    val joinedRoomId: String? = null,
    val creating: Boolean = false,
    val error: String? = null,
    val note: String? = null,
    val detail: VoiceRoomDetailDto? = null,
    val myUserId: String? = null,
    val myRole: String = "LISTENER",
    val link: LinkState = LinkState.IDLE,
    val canPublish: Boolean = false,
    val micOn: Boolean = false,
    val speaking: Set<String> = emptySet(),
    val audioError: String? = null,
    val languages: List<LanguageDto> = emptyList(),
    val rosterError: String? = null,
    val gifts: List<com.xtalk.app.core.network.GiftDto> = emptyList(),
    val wallet: com.xtalk.app.core.network.WalletDto? = null,
    val giftBanner: String? = null,
    val giftEffect: Pair<String, Int>? = null,
    val giftMsg: String? = null,
)

@HiltViewModel
class VoiceRoomsViewModel @Inject constructor(
    private val api: VoiceApi,
    private val session: VoiceSession,
    private val authApi: AuthApi,
    private val economy: com.xtalk.app.core.network.EconomyApi,
) : ViewModel() {

    private val _state = MutableStateFlow(VoiceState())
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    private var poll: Job? = null
    private var giftSince: String? = null
    private var bannerJob: Job? = null

    init {
        refresh()
        loadGifts()
        viewModelScope.launch {
            runCatching { authApi.languages(null) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
                ?.let { l -> _state.update { it.copy(languages = l) } }
        }
        session.link.onEach { v -> _state.update { it.copy(link = v) } }.launchIn(viewModelScope)
        session.canPublish.onEach { v -> _state.update { it.copy(canPublish = v) } }.launchIn(viewModelScope)
        session.micOn.onEach { v -> _state.update { it.copy(micOn = v) } }.launchIn(viewModelScope)
        session.speaking.onEach { v -> _state.update { it.copy(speaking = v) } }.launchIn(viewModelScope)
        session.error.onEach { v -> _state.update { it.copy(audioError = v) } }.launchIn(viewModelScope)
    }

    fun refresh() {
        viewModelScope.launch {
            try {
                val res = api.rooms()
                if (res.isSuccessful) _state.update { it.copy(loading = false, rooms = res.body().orEmpty()) }
                else _state.update { it.copy(loading = false, error = "HTTP ${res.code()}") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun create(title: String, languageCode: String?) {
        if (title.trim().length < 3) return
        _state.update { it.copy(creating = true) }
        viewModelScope.launch {
            try {
                val res = api.createRoom(CreateRoomRequest(title.trim(), languageCode = languageCode?.ifBlank { null }))
                if (res.isSuccessful) {
                    _state.update { it.copy(creating = false) }
                    res.body()?.id?.let { enter(it) }
                    refresh()
                } else _state.update { it.copy(creating = false, error = "Create failed (${res.code()})") }
            } catch (e: Exception) {
                _state.update { it.copy(creating = false, error = e.message) }
            }
        }
    }

    fun join(roomId: String) {
        viewModelScope.launch {
            try {
                val res = api.join(roomId)
                if (res.isSuccessful) enter(roomId)
                else _state.update { it.copy(error = "Join failed (${res.code()})") }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    /** Already a participant on the server: get a LiveKit token, connect audio, start roster polling. */
    private suspend fun enter(roomId: String) {
        _state.update { it.copy(joinedRoomId = roomId, detail = null, audioError = null) }
        try {
            val t = api.token(roomId)
            if (t.isSuccessful) {
                val b = t.body()!!
                _state.update { it.copy(myUserId = b.userId, myRole = b.role) }
                session.connect(b.url, b.token, b.canPublish, startMic = false)
            } else {
                val msg = if (t.code() == 503) "Live audio is not set up on this server yet (LiveKit keys missing)." else "Audio token failed (${t.code()})"
                _state.update { it.copy(audioError = msg) }
            }
        } catch (e: Throwable) {
            _state.update { it.copy(audioError = "Audio: ${e.javaClass.simpleName} ${e.message ?: ""}".trim()) }
        }
        startPolling(roomId)
    }

    private suspend fun pollGifts(roomId: String, d: com.xtalk.app.core.network.VoiceRoomDetailDto) {
        try {
            val first = giftSince == null
            val r = economy.roomGifts(roomId, giftSince)
            val list = r.body()
            if (!r.isSuccessful || list == null) return
            if (list.isNotEmpty()) giftSince = list.maxOf { it.createdAt }
            else if (first) giftSince = java.time.Instant.now().toString()
            if (first) { if (giftSince == null) giftSince = java.time.Instant.now().toString(); return }
            val last = list.lastOrNull() ?: return
            fun nm(id: String) = d.participants.firstOrNull { it.userId == id }?.let { p ->
                p.user?.profile?.displayName?.ifBlank { null } ?: p.user?.username } ?: "someone"
            val g = _state.value.gifts.firstOrNull { it.id == last.giftId }
            val text = (g?.emoji ?: "\uD83C\uDF81") + " " + nm(last.senderId) + " (Lv" + last.senderLevel + ") sent " + (g?.name ?: "a gift") + " to " + nm(last.receiverId)
            _state.update { it.copy(giftBanner = text, giftEffect = (g?.emoji ?: "\uD83C\uDF81") to ((it.giftEffect?.second ?: 0) + 1)) }
            bannerJob?.cancel()
            bannerJob = viewModelScope.launch { delay(4500); _state.update { it.copy(giftBanner = null) } }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Throwable) { }
    }

    fun loadGifts() {
        viewModelScope.launch {
            runCatching { economy.gifts() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
                ?.let { g -> _state.update { it.copy(gifts = g) } }
            runCatching { economy.me() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
                ?.let { w -> _state.update { it.copy(wallet = w) } }
        }
    }

    fun testCoins() {
        viewModelScope.launch {
            val r = runCatching { economy.testGrant() }.getOrNull()
            if (r != null && r.isSuccessful) _state.update { it.copy(wallet = r.body(), giftMsg = "Test coins added (no payment)") }
            else _state.update { it.copy(giftMsg = "Test coins unavailable (server update needed or limit reached)") }
        }
    }

    fun sendGift(receiverId: String, giftId: String) {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch {
            try {
                val r = economy.sendGift(com.xtalk.app.core.network.SendGiftRequest(roomId, receiverId, giftId))
                if (r.isSuccessful) {
                    val before = _state.value.wallet?.level
                    val w = r.body()?.wallet
                    val up = w != null && before != null && w.level > before
                    _state.update { it.copy(wallet = w ?: it.wallet, giftMsg = if (up) "Level up! You are now Lv ${w!!.level}" else "Gift sent") }
                }
                else {
                    val raw = r.errorBody()?.string().orEmpty()
                    val m = Regex("\"message\"\\s*:\\s*\"([^\"]+)\"").find(raw)?.groupValues?.get(1)
                    _state.update { it.copy(giftMsg = m ?: "Gift failed (HTTP ${r.code()})") }
                }
            } catch (e: Exception) { _state.update { it.copy(giftMsg = "Gift error: ${e.message}") } }
        }
    }

    fun clearGiftMsg() = _state.update { it.copy(giftMsg = null) }

    private fun startPolling(roomId: String) {
        giftSince = null
        poll?.cancel()
        poll = viewModelScope.launch {
            while (true) {
                try {
                    val r = api.room(roomId)
                    if (r.isSuccessful) {
                        val d = r.body()!!
                        val me = d.participants.firstOrNull { it.userId == _state.value.myUserId }
                        if (!d.isLive || (me == null && _state.value.myUserId != null)) { leaveLocal(); return@launch }
                        _state.update { it.copy(detail = d, myRole = me?.role ?: it.myRole, rosterError = null) }
                        pollGifts(roomId, d)
                    } else if (r.code() == 404) { leaveLocal(); return@launch }
                    else _state.update { it.copy(rosterError = "Room list: HTTP ${r.code()}") }
                } catch (e: kotlinx.coroutines.CancellationException) { throw e
                } catch (e: Throwable) {
                    _state.update { it.copy(rosterError = "Room list: ${e.javaClass.simpleName} ${e.message ?: ""}".trim()) }
                }
                delay(3000)
            }
        }
    }

    private fun leaveLocal() {
        poll?.cancel(); poll = null; giftSince = null
        session.disconnect()
        _state.update { it.copy(joinedRoomId = null, detail = null, note = null) }
        refresh()
    }

    fun leave() {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch {
            runCatching { api.leave(roomId) }
            leaveLocal()
        }
    }

    /** Caller has already ensured RECORD_AUDIO permission. */
    fun toggleMic() = session.setMic(!_state.value.micOn)

    private fun hostAction(block: suspend (String) -> retrofit2.Response<*>) {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch {
            runCatching { block(roomId) }
            runCatching {
                val r = api.room(roomId)
                if (r.isSuccessful) _state.update { it.copy(detail = r.body()) }
            }
        }
    }

    fun requestStage() {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch {
            try {
                val r = api.requestStage(roomId)
                if (!r.isSuccessful) {
                    val msg = if (r.code() == 404) "Server update needed for stage requests" else "Request failed (${r.code()})"
                    _state.update { it.copy(rosterError = msg) }
                } else refreshRoster(roomId)
            } catch (e: Exception) { _state.update { it.copy(rosterError = "Request: ${e.message}") } }
        }
    }

    fun cancelStageRequest() {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch { runCatching { api.cancelStage(roomId) }; refreshRoster(roomId) }
    }

    fun rejectStage(userId: String) = hostAction { api.rejectStage(it, RoomUserRequest(userId)) }
    fun setTheme(theme: String) = hostAction { api.setTheme(it, com.xtalk.app.core.network.RoomThemeRequest(theme)) }

    fun setModerator(userId: String, on: Boolean) = hostAction {
        if (on) api.addModerator(it, RoomUserRequest(userId)) else api.removeModerator(it, RoomUserRequest(userId))
    }

    fun leaveSeat() {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch {
            runCatching { api.leaveSeat(roomId) }
            session.setMic(false)
            refreshRoster(roomId)
        }
    }

    private suspend fun refreshRoster(roomId: String) {
        runCatching {
            val r = api.room(roomId)
            if (r.isSuccessful) {
                val d = r.body()!!
                val me = d.participants.firstOrNull { it.userId == _state.value.myUserId }
                _state.update { it.copy(detail = d, myRole = me?.role ?: it.myRole, rosterError = null) }
            }
        }
    }

    fun setRole(userId: String, role: String) = hostAction { api.setRole(it, RoomRoleRequest(userId, role)) }
    fun mute(userId: String, muted: Boolean) = hostAction {
        if (muted) api.mute(it, RoomUserRequest(userId)) else api.unmute(it, RoomUserRequest(userId))
    }
    fun kick(userId: String) = hostAction { api.remove(it, RoomUserRequest(userId)) }
    fun closeRoom() {
        val roomId = _state.value.joinedRoomId ?: return
        viewModelScope.launch {
            runCatching { api.close(roomId) }
            leaveLocal()
        }
    }

    override fun onCleared() { poll?.cancel(); session.disconnect() }

    fun consumeNote() = _state.update { it.copy(note = null) }
}
