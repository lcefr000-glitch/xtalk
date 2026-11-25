package com.xtalk.app.feature.voice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.CreateRoomRequest
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
)

@HiltViewModel
class VoiceRoomsViewModel @Inject constructor(
    private val api: VoiceApi,
    private val session: VoiceSession,
) : ViewModel() {

    private val _state = MutableStateFlow(VoiceState())
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    private var poll: Job? = null

    init {
        refresh()
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
        } catch (e: Exception) {
            _state.update { it.copy(audioError = e.message) }
        }
        startPolling(roomId)
    }

    private fun startPolling(roomId: String) {
        poll?.cancel()
        poll = viewModelScope.launch {
            while (true) {
                runCatching {
                    val r = api.room(roomId)
                    if (r.isSuccessful) {
                        val d = r.body()!!
                        val me = d.participants.firstOrNull { it.userId == _state.value.myUserId }
                        if (!d.isLive || me == null) { leaveLocal(); return@launch }
                        _state.update { it.copy(detail = d, myRole = me.role) }
                    } else if (r.code() == 404) { leaveLocal(); return@launch }
                }
                delay(4000)
            }
        }
    }

    private fun leaveLocal() {
        poll?.cancel(); poll = null
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
