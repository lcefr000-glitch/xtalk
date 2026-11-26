package com.xtalk.app.feature.voice

import android.content.Context
import com.twilio.audioswitch.AudioDevice
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.audio.AudioSwitchHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class LinkState { IDLE, CONNECTING, CONNECTED, FAILED }

/** One LiveKit connection at a time (the voice room the user is in). Audio playback is automatic. */
class VoiceSession(private val appContext: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var room: Room? = null
    private var events: Job? = null

    private val _link = MutableStateFlow(LinkState.IDLE)
    val link: StateFlow<LinkState> = _link.asStateFlow()
    private val _speaking = MutableStateFlow<Set<String>>(emptySet())
    /** User ids currently speaking (LiveKit identity == user id). */
    val speaking: StateFlow<Set<String>> = _speaking.asStateFlow()
    private val _micOn = MutableStateFlow(false)
    val micOn: StateFlow<Boolean> = _micOn.asStateFlow()
    private val _canPublish = MutableStateFlow(false)
    val canPublish: StateFlow<Boolean> = _canPublish.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun connect(url: String, token: String, canPublish: Boolean, startMic: Boolean) {
        disconnect()
        VoiceService.start(appContext, false)
        _link.value = LinkState.CONNECTING
        _error.value = null
        _canPublish.value = canPublish
        val handler = AudioSwitchHandler(appContext).apply {
            // Loudspeaker first (the default prefers the earpiece); headsets still win when plugged in.
            preferredDeviceList = listOf(
                AudioDevice.BluetoothHeadset::class.java,
                AudioDevice.WiredHeadset::class.java,
                AudioDevice.Speakerphone::class.java,
                AudioDevice.Earpiece::class.java,
            )
        }
        val r = LiveKit.create(appContext, overrides = LiveKitOverrides(audioOptions = io.livekit.android.AudioOptions(audioHandler = handler)))
        room = r
        events = scope.launch {
            launch {
                r.events.events.collect { ev ->
                    when (ev) {
                        is RoomEvent.ActiveSpeakersChanged ->
                            _speaking.value = ev.speakers.mapNotNull { it.identity?.value }.toSet()
                        is RoomEvent.Disconnected -> {
                            if (_link.value != LinkState.IDLE) _error.value = "Audio disconnected" + (ev.reason?.let { ": $it" } ?: "")
                            _link.value = LinkState.FAILED; _micOn.value = false
                        }
                        is RoomEvent.ParticipantPermissionsChanged ->
                            if (ev.participant == r.localParticipant) {
                                val can = ev.newPermissions?.canPublish == true
                                _canPublish.value = can
                                if (!can) { _micOn.value = false }
                            }
                        else -> {}
                    }
                }
            }
            try {
                r.connect(url, token)
                _link.value = LinkState.CONNECTED
                if (canPublish && startMic) setMic(true)
            } catch (e: Exception) {
                _error.value = e.message ?: "Could not connect to audio"
                _link.value = LinkState.FAILED
            }
        }
    }

    /** Needs RECORD_AUDIO granted and publish rights; returns false when the server refused. */
    fun setMic(on: Boolean) {
        val r = room ?: return
        scope.launch {
            try {
                r.localParticipant.setMicrophoneEnabled(on)
                _micOn.value = on
                if (on) VoiceService.start(appContext, true)
            } catch (e: Exception) {
                _error.value = e.message ?: "Microphone error"
                _micOn.value = false
            }
        }
    }

    fun disconnect() {
        VoiceService.stop(appContext)
        events?.cancel(); events = null
        room?.let { runCatching { it.disconnect(); it.release() } }
        room = null
        _link.value = LinkState.IDLE
        _micOn.value = false
        _speaking.value = emptySet()
        _canPublish.value = false
    }
}
