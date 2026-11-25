package com.xtalk.app.feature.voice

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.R
import com.xtalk.app.core.designsystem.GoldPill
import com.xtalk.app.core.designsystem.XAmber
import com.xtalk.app.core.designsystem.XAvatar
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XCardIndigo
import com.xtalk.app.core.designsystem.XCoral
import com.xtalk.app.core.designsystem.XSurfaceHigh
import com.xtalk.app.core.designsystem.XTeal
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.core.designsystem.XVioletDark
import com.xtalk.app.core.designsystem.flagEmoji
import com.xtalk.app.core.network.VoiceRoomDto

/** Stand-alone route (opened from the Me tab): the same content with a Back button. */
@Composable
fun VoiceRoomsScreen(onBack: () -> Unit, viewModel: VoiceRoomsViewModel = hiltViewModel()) {
    Column(Modifier.fillMaxSize().background(XBg)) {
        Box(Modifier.weight(1f)) { VoiceRoomsContent(onOpenPremium = {}, viewModel = viewModel) }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Text(stringResource(R.string.back))
        }
    }
}

private data class Banner(val title: Int, val sub: Int, val colors: List<Color>)

private val banners = listOf(
    Banner(R.string.banner1_title, R.string.banner1_sub, listOf(XViolet, XVioletDark)),
    Banner(R.string.banner2_title, R.string.banner2_sub, listOf(XTeal, Color(0xFF0B5A57))),
    Banner(R.string.banner3_title, R.string.banner3_sub, listOf(XCoral, Color(0xFF7A1F44))),
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun VoiceRoomsContent(onOpenPremium: () -> Unit, viewModel: VoiceRoomsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var creating by rememberSaveable { mutableStateOf(false) }
    var title by rememberSaveable { mutableStateOf("") }
    var section by rememberSaveable { mutableIntStateOf(2) } // 0 Learn, 1 Live, 2 Voice room
    var langFilter by rememberSaveable { mutableStateOf<String?>(null) }

    if (creating) {
        AlertDialog(
            onDismissRequest = { creating = false },
            title = { Text(stringResource(R.string.new_room)) },
            text = {
                OutlinedTextField(value = title, onValueChange = { title = it },
                    placeholder = { Text(stringResource(R.string.room_title_hint)) }, singleLine = true)
            },
            confirmButton = {
                Button(onClick = { viewModel.create(title, langFilter); title = ""; creating = false },
                    enabled = title.trim().length >= 3 && !state.creating) { Text(stringResource(R.string.create)) }
            },
            dismissButton = { TextButton(onClick = { creating = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
    state.note?.let { note ->
        AlertDialog(
            onDismissRequest = viewModel::consumeNote,
            title = { Text(stringResource(R.string.voice_room)) },
            text = { Text(note) },
            confirmButton = { TextButton(onClick = viewModel::consumeNote) { Text(stringResource(R.string.ok)) } },
        )
    }

    val joinedId = state.joinedRoomId
    if (joinedId != null) {
        RoomPanel(state, viewModel, rooms = state.rooms.firstOrNull { it.id == joinedId })
        return
    }

    val langs = state.rooms.mapNotNull { it.language }.distinctBy { it.code }
    val rooms = state.rooms.filter { langFilter == null || it.language?.code == langFilter }

    LazyColumn(Modifier.fillMaxSize().background(XBg), contentPadding = PaddingValues(bottom = 16.dp)) {
        // Top bar: mic button, segmented text row, gold pill
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(42.dp).clip(CircleShape).background(XViolet).clickable { creating = true },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Mic, null, tint = Color.White) }
                Spacer(Modifier.weight(1f))
                listOf(R.string.voice_learn, R.string.voice_live, R.string.voice_room).forEachIndexed { i, res ->
                    Text(
                        stringResource(res),
                        modifier = Modifier.padding(horizontal = 9.dp).clickable { section = i },
                        fontSize = if (section == i) 20.sp else 15.sp,
                        fontWeight = if (section == i) FontWeight.Bold else FontWeight.Normal,
                        color = if (section == i) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.weight(1f))
                GoldPill(stringResource(R.string.premium), onClick = onOpenPremium)
            }
        }
        if (section != 2) {
            item {
                Text(stringResource(R.string.coming_soon), color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(48.dp), fontSize = 16.sp)
            }
            return@LazyColumn
        }
        // Language chips (built from the languages of real rooms)
        item {
            LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Chip(stringResource(R.string.all), langFilter == null) { langFilter = null } }
                items(langs, key = { it.code }) { l ->
                    Chip(l.nativeName.ifBlank { l.name }, langFilter == l.code) { langFilter = l.code }
                }
            }
        }
        // Promotional banner carousel (static, original art)
        item {
            val pager = rememberPagerState(pageCount = { banners.size })
            HorizontalPager(pager, contentPadding = PaddingValues(horizontal = 14.dp), pageSpacing = 10.dp,
                modifier = Modifier.padding(top = 14.dp)) { page ->
                val b = banners[page]
                Row(
                    Modifier.fillMaxWidth().height(96.dp).clip(RoundedCornerShape(18.dp))
                        .background(Brush.horizontalGradient(b.colors)).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(b.title), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Spacer(Modifier.height(4.dp))
                        Text(stringResource(b.sub), color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp, maxLines = 2)
                    }
                    Icon(Icons.Filled.GraphicEq, null, tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(44.dp))
                }
            }
        }
        item { Spacer(Modifier.height(14.dp)) }
        when {
            state.loading -> item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
            state.error != null -> item { Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
            rooms.isEmpty() -> item {
                Text(stringResource(R.string.no_rooms), color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(32.dp))
            }
            else -> items(rooms, key = { it.id }) { room ->
                RoomCard(room, joined = state.joinedRoomId == room.id,
                    onJoin = { viewModel.join(room.id) }, onLeave = viewModel::leave)
            }
        }
    }
}

@Composable
private fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50))
            .background(if (selected) XSurfaceHigh else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Text(text, color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
private fun RoomCard(room: VoiceRoomDto, joined: Boolean, onJoin: () -> Unit, onLeave: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 5.dp)
            .clip(RoundedCornerShape(20.dp)).background(XCardIndigo).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                room.language?.let {
                    Tag(it.code.uppercase(), filled = true)
                    Tag(it.name)
                }
                if (room.isLive) Tag(stringResource(R.string.live), color = XCoral)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.GraphicEq, null, tint = XTeal, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text(room.title, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            room.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(10.dp))
            if (joined) OutlinedButton(onClick = onLeave, border = BorderStroke(1.dp, XCoral), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 2.dp)) {
                Text(stringResource(R.string.leave), color = XCoral)
            } else Button(onClick = onJoin, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 2.dp)) {
                Text(stringResource(R.string.join))
            }
        }
        Spacer(Modifier.width(12.dp))
        val hostName = room.host?.profile?.displayName?.ifBlank { null } ?: room.host?.username ?: "?"
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(76.dp)) {
            XAvatar(hostName, 64.dp, flag = flagEmoji(room.host?.profile?.country))
            Spacer(Modifier.height(4.dp))
            Text(hostName, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Tag(text: String, filled: Boolean = false, color: Color = XAmber) {
    Text(
        text,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (filled) Color.Black else color,
        modifier = Modifier.clip(RoundedCornerShape(6.dp))
            .background(if (filled) XAmber else color.copy(alpha = 0.15f)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun RoomPanel(state: VoiceState, vm: VoiceRoomsViewModel, rooms: VoiceRoomDto?) {
    val ctx = LocalContext.current
    var denied by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResults.requestPermission) { ok ->
        denied = !ok
        if (ok) vm.toggleMic()
    }
    fun onMic() {
        val has = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (has) vm.toggleMic() else launcher.launch(Manifest.permission.RECORD_AUDIO)
    }
    val isHost = state.myRole == "HOST"
    val parts = state.detail?.participants.orEmpty()
    val speakers = parts.filter { it.role == "HOST" || it.role == "SPEAKER" }
    val listeners = parts.filter { it.role == "LISTENER" }
    val title = state.detail?.title ?: rooms?.title ?: ""

    LazyColumn(Modifier.fillMaxSize().background(XBg), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 22.sp)
            val status = when (state.link) {
                LinkState.CONNECTING -> stringResource(R.string.vr_connecting)
                LinkState.CONNECTED -> stringResource(R.string.vr_connected)
                else -> state.audioError ?: ""
            }
            if (status.isNotBlank()) Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            state.audioError?.takeIf { state.link == LinkState.CONNECTED }?.let {
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }
            if (denied) Text(stringResource(R.string.vr_mic_denied), color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }
        item { Text(stringResource(R.string.vr_speakers), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
        items(speakers, key = { "s" + it.userId }) { p -> ParticipantRow(p, state, isHost, vm) }
        item { Text(stringResource(R.string.vr_listeners), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
        items(listeners, key = { "l" + it.userId }) { p -> ParticipantRow(p, state, isHost, vm) }
        item {
            Spacer(Modifier.height(12.dp))
            if (state.canPublish && state.link == LinkState.CONNECTED) {
                Button(
                    onClick = { onMic() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(if (state.micOn) Icons.Filled.Mic else Icons.Filled.MicOff, null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(if (state.micOn) R.string.vr_mic_on else R.string.vr_mic_off))
                }
            } else if (state.link == LinkState.CONNECTED) {
                Text(stringResource(R.string.vr_listen_only), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = vm::leave, modifier = Modifier.fillMaxWidth(), border = BorderStroke(1.dp, XCoral)) {
                Text(stringResource(R.string.leave), color = XCoral)
            }
            if (isHost) {
                OutlinedButton(onClick = vm::closeRoom, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    Text(stringResource(R.string.vr_close_room))
                }
            }
        }
    }
}

@Composable
private fun ParticipantRow(p: com.xtalk.app.core.network.VoiceParticipantDto, state: VoiceState, isHost: Boolean, vm: VoiceRoomsViewModel) {
    val name = p.user?.profile?.displayName?.ifBlank { null } ?: p.user?.username ?: "?"
    val talking = p.userId in state.speaking
    val me = p.userId == state.myUserId
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XCardIndigo).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.clip(CircleShape).background(if (talking) XTeal else Color.Transparent).padding(3.dp)) {
            XAvatar(name, 40.dp, flag = flagEmoji(p.user?.profile?.country))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(name + if (me) " (" + stringResource(R.string.vr_you) + ")" else "", fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(p.role.lowercase() + if (p.isMuted) " - muted" else "", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (p.isMuted) Icon(Icons.Filled.MicOff, null, tint = XCoral, modifier = Modifier.size(18.dp))
        if (isHost && p.role != "HOST") {
            if (p.role == "LISTENER") TextButton(onClick = { vm.setRole(p.userId, "SPEAKER") }) { Text(stringResource(R.string.vr_to_speaker), fontSize = 11.sp) }
            else {
                TextButton(onClick = { vm.mute(p.userId, !p.isMuted) }) { Text(stringResource(if (p.isMuted) R.string.vr_unmute else R.string.vr_mute), fontSize = 11.sp) }
                TextButton(onClick = { vm.setRole(p.userId, "LISTENER") }) { Text(stringResource(R.string.vr_to_listener), fontSize = 11.sp) }
            }
            TextButton(onClick = { vm.kick(p.userId) }) { Text(stringResource(R.string.vr_remove), fontSize = 11.sp, color = XCoral) }
        }
    }
}

private object ActivityResults { val requestPermission = ActivityResultContracts.RequestPermission() }
