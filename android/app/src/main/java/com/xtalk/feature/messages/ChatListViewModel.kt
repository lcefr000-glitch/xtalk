package com.xtalk.app.feature.messages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.ChatApi
import com.xtalk.app.core.network.ChatSocketManager
import com.xtalk.app.core.network.ConversationSummaryDto
import com.xtalk.app.core.network.TokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatListState(
    val loading: Boolean = true,
    val conversations: List<ConversationSummaryDto> = emptyList(),
    val myUserId: String = "",
    val error: String? = null,
    val pinned: Set<String> = emptySet(),
    val muted: Set<String> = emptySet(),
    val archived: Set<String> = emptySet(),
)

@HiltViewModel
class ChatListViewModel @Inject constructor(
    private val api: ChatApi,
    private val socket: ChatSocketManager,
    private val tokenStore: TokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ChatListState())
    val state: StateFlow<ChatListState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.update { it.copy(myUserId = tokenStore.currentSession()?.userId.orEmpty()) }
        }
        refresh()
        socket.connect()
        viewModelScope.launch {
            socket.incoming.collect { refresh() }
        }
    }

    private suspend fun loadFlags() {
        val f = runCatching { api.flags() }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.flags ?: return
        _state.update { it.copy(muted = f.filter { x -> x.muted }.map { x -> x.conversationId }.toSet(), archived = f.filter { x -> x.archived }.map { x -> x.conversationId }.toSet()) }
    }

    fun toggleMute(id: String) {
        viewModelScope.launch {
            runCatching { api.mute(id, com.xtalk.app.core.network.ChatFlagRequest(id !in _state.value.muted)) }
            loadFlags()
        }
    }

    fun toggleArchive(id: String) {
        viewModelScope.launch {
            runCatching { api.archive(id, com.xtalk.app.core.network.ChatFlagRequest(id !in _state.value.archived)) }
            loadFlags()
        }
    }

    fun togglePin(id: String) {
        viewModelScope.launch {
            runCatching { api.togglePin(id) }
            val p = runCatching { api.pins() }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.ids
            if (p != null) _state.update { it.copy(pinned = p.toSet()) }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            val p = runCatching { api.pins() }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.ids
            if (p != null) _state.update { it.copy(pinned = p.toSet()) }
            loadFlags()
            try {
                val res = api.conversations()
                if (res.isSuccessful) {
                    _state.update { it.copy(loading = false, conversations = res.body()?.results.orEmpty()) }
                } else {
                    _state.update { it.copy(loading = false, error = "Could not load chats (${res.code()})") }
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "Network error: ${e.message}") }
            }
        }
    }

    suspend fun openConversationWith(userId: String): String? = try {
        val res = api.create(mapOf("userId" to userId))
        if (res.isSuccessful) res.body()?.id else null
    } catch (_: Exception) { null }
}
