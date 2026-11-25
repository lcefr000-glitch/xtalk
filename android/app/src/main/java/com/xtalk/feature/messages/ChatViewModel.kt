package com.xtalk.app.feature.messages

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.ChatApi
import com.xtalk.app.core.network.ChatSocketManager
import com.xtalk.app.core.network.MessageDto
import com.xtalk.app.core.network.SendMessageRequest
import com.xtalk.app.core.network.TokenStore
import com.xtalk.app.core.network.ToolsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatState(
    val loading: Boolean = true,
    val messages: List<MessageDto> = emptyList(),
    val myUserId: String = "",
    val sending: Boolean = false,
    val peerTyping: Boolean = false,
    val error: String? = null,
    val translations: Map<String, String> = emptyMap(), // messageId -> translated text
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val api: ChatApi,
    private val socket: ChatSocketManager,
    private val tokenStore: TokenStore,
    private val toolsApi: ToolsApi,
) : ViewModel() {

    val conversationId: String = checkNotNull(savedStateHandle["conversationId"])

    private val _state = MutableStateFlow(ChatState())
    val state: StateFlow<ChatState> = _state.asStateFlow()
    private var typingResetJob: Job? = null

    init {
        viewModelScope.launch {
            _state.update { it.copy(myUserId = tokenStore.currentSession()?.userId.orEmpty()) }
        }
        socket.connect()
        socket.join(conversationId)
        load()
        viewModelScope.launch {
            socket.incoming.collect { msg ->
                if (msg.conversationId == conversationId || msg.conversationId == null) {
                    _state.update { s ->
                        if (s.messages.any { it.id == msg.id }) s
                        else s.copy(messages = s.messages + msg)
                    }
                    if (msg.senderId != _state.value.myUserId) socket.markRead(conversationId)
                }
            }
        }
        viewModelScope.launch {
            socket.typing.collect { userId ->
                if (userId != _state.value.myUserId) {
                    _state.update { it.copy(peerTyping = true) }
                    typingResetJob?.cancel()
                    typingResetJob = viewModelScope.launch {
                        delay(3000)
                        _state.update { it.copy(peerTyping = false) }
                    }
                }
            }
        }
    }

    fun load() {
        viewModelScope.launch {
            try {
                val res = api.messages(conversationId)
                if (res.isSuccessful) {
                    _state.update { it.copy(loading = false, messages = res.body()?.results.orEmpty()) }
                    socket.markRead(conversationId)
                    api.markRead(conversationId)
                } else {
                    _state.update { it.copy(loading = false, error = "Could not load messages (${res.code()})") }
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "Network error: ${e.message}") }
            }
        }
    }

    fun send(text: String) {
        val body = text.trim()
        if (body.isEmpty()) return
        _state.update { it.copy(sending = true) }
        viewModelScope.launch {
            try {
                val res = api.send(conversationId, SendMessageRequest(type = "TEXT", body = body))
                if (res.isSuccessful && res.body() != null) {
                    val msg = res.body()!!
                    _state.update { s ->
                        if (s.messages.any { it.id == msg.id }) s.copy(sending = false)
                        else s.copy(sending = false, messages = s.messages + msg)
                    }
                } else {
                    _state.update { it.copy(sending = false, error = "Send failed (${res.code()})") }
                }
            } catch (e: Exception) {
                _state.update { it.copy(sending = false, error = "Network error: ${e.message}") }
            }
        }
    }

    fun onInputChanged() = socket.sendTyping(conversationId)

    /** Translate a message on demand. Needs a configured provider on the backend. */
    fun translate(messageId: String, text: String, target: String) {
        viewModelScope.launch {
            try {
                val res = toolsApi.translate(mapOf("text" to text, "target" to target))
                if (res.isSuccessful) {
                    val translated = res.body()?.get("translatedText") as? String
                    if (translated != null) {
                        _state.update { it.copy(translations = it.translations + (messageId to translated)) }
                    }
                } else {
                    _state.update { it.copy(error = "Translation unavailable (HTTP ${res.code()}): configure a provider on the backend") }
                }
            } catch (e: Exception) {
                _state.update { it.copy(error = "Translation error: ${e.message}") }
            }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}
