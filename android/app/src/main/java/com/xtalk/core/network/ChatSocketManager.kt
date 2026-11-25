package com.xtalk.app.core.network

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thin socket.io client for the /ws gateway. Realtime delivery is a
 * convenience layer: REST stays the source of truth (screens refetch).
 */
@Singleton
class ChatSocketManager @Inject constructor(
    private val tokenStore: TokenStore,
    private val json: Json,
    private val baseUrlProvider: BaseUrlProvider,
) {
    private var socket: Socket? = null

    private val _incoming = MutableSharedFlow<MessageDto>(extraBufferCapacity = 64)
    val incoming: SharedFlow<MessageDto> = _incoming.asSharedFlow()

    private val _typing = MutableSharedFlow<String>(extraBufferCapacity = 16) // userId
    val typing: SharedFlow<String> = _typing.asSharedFlow()

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    fun connect() {
        if (socket != null) return
        val token = kotlinx.coroutines.runBlocking { tokenStore.currentSession()?.accessToken } ?: return
        val opts = IO.Options().apply {
            path = "/ws"
            transports = arrayOf("websocket")
            auth = mapOf("token" to token)
            reconnection = true
        }
        val s = IO.socket(baseUrlProvider.baseUrl, opts)
        s.on(Socket.EVENT_CONNECT) { _connected.value = true }
        s.on(Socket.EVENT_DISCONNECT) { _connected.value = false }
        s.on("message:new") { args ->
            (args.firstOrNull() as? JSONObject)?.let { raw ->
                runCatching { json.decodeFromString(MessageDto.serializer(), raw.toString()) }
                    .getOrNull()?.let { _incoming.tryEmit(it) }
            }
        }
        s.on("typing") { args ->
            (args.firstOrNull() as? JSONObject)?.optString("userId")?.let { _typing.tryEmit(it) }
        }
        s.connect()
        socket = s
    }

    fun join(conversationId: String) {
        socket?.emit("conversation:join", JSONObject(mapOf("conversationId" to conversationId)))
    }

    fun sendTyping(conversationId: String) {
        socket?.emit("typing", JSONObject(mapOf("conversationId" to conversationId)))
    }

    fun markRead(conversationId: String) {
        socket?.emit("read", JSONObject(mapOf("conversationId" to conversationId)))
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
        _connected.value = false
    }
}

@Singleton
class BaseUrlProvider @Inject constructor(@dagger.hilt.android.qualifiers.ApplicationContext context: android.content.Context) {
    val baseUrl: String = com.xtalk.core.network.ServerConfig.baseUrl(context).trimEnd('/')
}
