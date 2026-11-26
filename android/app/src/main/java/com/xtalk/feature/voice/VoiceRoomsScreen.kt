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
import androidx.compose.material.icons.filled.Edit
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
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
fun VoiceRoomsContent(
    onOpenPremium: () -> Unit,
    onOpenUser: (String) -> Unit = {},
    onMinimize: () -> Unit = {},
    viewModel: VoiceRoomsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var creating by rememberSaveable { mutableStateOf(false) }
    var title by rememberSaveable { mutableStateOf("") }
    var section by rememberSaveable { mutableIntStateOf(2) } // 0 Learn, 1 Live, 2 Voice room
    var langFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var newLang by rememberSaveable { mutableStateOf("") }

    if (creating) {
        AlertDialog(
            onDismissRequest = { creating = false },
            title = { Text(stringResource(R.string.new_room)) },
            text = {
                Column {
                    OutlinedTextField(value = title, onValueChange = { title = it },
                        placeholder = { Text(stringResource(R.string.room_title_hint)) }, singleLine = true)
                    com.xtalk.app.feature.common.LanguageField(
                        label = "Language", selectedCode = newLang, languages = state.languages,
                        onSelected = { newLang = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
            },
            confirmButton = {
                Button(onClick = { viewModel.create(title, newLang.ifBlank { langFilter }); title = ""; creating = false },
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
        RoomPanel(state, viewModel, rooms = state.rooms.firstOrNull { it.id == joinedId }, onOpenUser = onOpenUser, onMinimize = onMinimize)
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

private val RoomBg: Color get() = com.xtalk.app.core.designsystem.ThemeState.current.room
private val SeatBg = Color(0x33FFFFFF)

@Composable
private fun RoomPanel(state: VoiceState, vm: VoiceRoomsViewModel, rooms: VoiceRoomDto?, onOpenUser: (String) -> Unit, onMinimize: () -> Unit) {
    var showGifts by rememberSaveable { mutableStateOf(false) }
    var giftTo by rememberSaveable { mutableStateOf<String?>(null) }
    var giftPick by rememberSaveable { mutableStateOf<String?>(null) }
    val ctx = LocalContext.current
    var denied by rememberSaveable { mutableStateOf(false) }
    var menuFor by rememberSaveable { mutableStateOf<String?>(null) }
    var showRequests by rememberSaveable { mutableStateOf(false) }
    var showMods by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResults.requestPermission) { ok ->
        denied = !ok
        if (ok) vm.toggleMic()
    }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResults.requestPermission) { }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    fun onMic() {
        val has = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (has) vm.toggleMic() else launcher.launch(Manifest.permission.RECORD_AUDIO)
    }
    val isHost = state.myRole == "HOST"
    val mods = state.detail?.moderatorIds.orEmpty()
    val isManager = isHost || (state.myUserId != null && state.myUserId in mods)
    val requests = state.detail?.stageRequests.orEmpty()
    val iRequested = state.myUserId != null && state.myUserId in requests
    val parts = state.detail?.participants.orEmpty()
    val seated = (parts.filter { it.role == "HOST" } + parts.filter { it.role == "SPEAKER" }).take(8)
    val listeners = parts.filter { it.role == "LISTENER" }
    val title = state.detail?.title ?: rooms?.title ?: ""
    val iAmSeated = seated.any { it.userId == state.myUserId }
    val menuUser = parts.firstOrNull { it.userId == menuFor }

    fun nameOf(p: com.xtalk.app.core.network.VoiceParticipantDto): String {
        val n = p.user?.profile?.displayName?.ifBlank { null } ?: p.user?.username ?: "?"
        return n + (flagEmoji(p.user?.profile?.country)?.let { " $it" } ?: "")
    }
    if (menuUser != null) {
        val canManage = isManager && menuUser.role != "HOST" && (isHost || menuUser.userId !in mods) && menuUser.userId != state.myUserId
        RoomUserCard(
            userId = menuUser.userId,
            name = nameOf(menuUser),
            photoUrl = menuUser.user?.profile?.photoUrl,
            country = menuUser.user?.profile?.country,
            isSelf = menuUser.userId == state.myUserId,
            isMod = menuUser.userId in mods,
            isListener = menuUser.role == "LISTENER",
            isMuted = menuUser.isMuted,
            isManagerView = isManager,
            canManage = canManage,
            isHostView = isHost,
            onDismiss = { menuFor = null },
            onVisit = { onOpenUser(menuUser.userId) },
            onSendGift = { giftTo = menuUser.userId; showGifts = true },
            onInviteToMic = { vm.setRole(menuUser.userId, "SPEAKER") },
            onMute = { vm.mute(menuUser.userId, !menuUser.isMuted) },
            onToListener = { vm.setRole(menuUser.userId, "LISTENER") },
            onToggleMod = { vm.setModerator(menuUser.userId, menuUser.userId !in mods) },
            onKick = { vm.kick(menuUser.userId) },
        )
    }
    if (showRequests && isManager) {
        AlertDialog(
            onDismissRequest = { showRequests = false },
            title = { Text(stringResource(R.string.stage_requests)) },
            text = {
                Column {
                    val pending = requests.mapNotNull { id -> parts.firstOrNull { it.userId == id } }
                    if (pending.isEmpty()) Text(stringResource(R.string.no_requests))
                    pending.forEach { p ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                            Text(nameOf(p), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            TextButton(onClick = { vm.setRole(p.userId, "SPEAKER") }) { Text(stringResource(R.string.accept)) }
                            TextButton(onClick = { vm.rejectStage(p.userId) }) { Text(stringResource(R.string.reject), color = XCoral) }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showRequests = false }) { Text(stringResource(R.string.ok)) } },
        )
    }
    if (showMods && isHost) {
        AlertDialog(
            onDismissRequest = { showMods = false },
            title = { Text(stringResource(R.string.moderators)) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    val others = parts.filter { it.role != "HOST" }
                    if (others.isEmpty()) Text(stringResource(R.string.no_one_else))
                    others.forEach { p ->
                        val isMod = p.userId in mods
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                            Text(nameOf(p), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            TextButton(onClick = { vm.setModerator(p.userId, !isMod) }) {
                                Text(stringResource(if (isMod) R.string.remove_moderator else R.string.make_moderator),
                                    color = if (isMod) XCoral else XTeal)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showMods = false }) { Text(stringResource(R.string.ok)) } },
        )
    }

    if (showGifts) {
        androidx.compose.runtime.LaunchedEffect(Unit) { vm.loadGifts() }
        val targets = parts.filter { it.userId != state.myUserId }
        AlertDialog(
            onDismissRequest = { showGifts = false; vm.clearGiftMsg() },
            title = { Text("Send a gift") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    val w = state.wallet
                    Text("Coins: ${w?.coins ?: 0}   Level ${w?.level ?: 1}", fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = { vm.testCoins() }) { Text("Get free TEST coins (no payment)") }
                    Text("To:", fontSize = 12.sp)
                    if (targets.isEmpty()) Text("No one else in the room yet.", fontSize = 12.sp)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(targets, key = { it.userId }) { p ->
                            androidx.compose.material3.FilterChip(
                                selected = giftTo == p.userId, onClick = { giftTo = p.userId },
                                label = { Text(nameOf(p), maxLines = 1) },
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Gift:", fontSize = 12.sp)
                    state.gifts.chunked(3).forEach { row ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            row.forEach { g ->
                                val sel = giftPick == g.id
                                Column(
                                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                                        .background(if (sel) XViolet.copy(alpha = 0.35f) else Color(0x22FFFFFF))
                                        .clickable { giftPick = g.id }.padding(vertical = 8.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Text(g.emoji, fontSize = 28.sp)
                                    Text(g.name, fontSize = 11.sp, maxLines = 1)
                                    Text("${g.price}", fontSize = 11.sp, color = XAmber, fontWeight = FontWeight.Bold)
                                }
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                    state.giftMsg?.let { Text(it, color = XAmber, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
                }
            },
            confirmButton = {
                Button(
                    onClick = { vm.sendGift(giftTo!!, giftPick!!) },
                    enabled = giftTo != null && giftPick != null,
                ) { Text("Send") }
            },
            dismissButton = { TextButton(onClick = { showGifts = false; vm.clearGiftMsg() }) { Text("Close") } },
        )
    }

    var showThemes by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    if (showThemes) {
        AlertDialog(
            onDismissRequest = { showThemes = false },
            title = { Text("Room theme") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    RoomThemes.chunked(4).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { t ->
                                Column(Modifier.width(60.dp).clickable { vm.setTheme(t.id); showThemes = false }, horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(Brush.verticalGradient(t.colors)))
                                    Text(t.label, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showThemes = false }) { Text("Close") } },
        )
    }
    Box(Modifier.fillMaxSize().background(roomThemeBrush(state.detail?.theme))) {
    Column(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
        Spacer(Modifier.height(20.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 20.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                    rooms?.language?.let { Tag(it.code.uppercase(), filled = true) }
                    Tag("${parts.size}", color = XTeal)
                }
            }
            OutlinedButton(onClick = onMinimize, modifier = Modifier.padding(end = 8.dp)) { Text("Minimize", fontSize = 12.sp) }
            if (isHost) Text("\uD83C\uDFA8", fontSize = 22.sp, modifier = Modifier.padding(end = 10.dp).clickable { showThemes = true })
            if (isHost) Icon(Icons.Filled.Edit, stringResource(R.string.moderators), tint = Color.White,
                modifier = Modifier.padding(end = 10.dp).size(24.dp).clickable { showMods = true })
            if (isHost) OutlinedButton(onClick = vm::closeRoom) { Text(stringResource(R.string.vr_close_room), fontSize = 12.sp) }
        }
        val status = when (state.link) {
            LinkState.CONNECTING -> stringResource(R.string.vr_connecting)
            LinkState.CONNECTED -> stringResource(R.string.vr_connected)
            else -> state.audioError ?: "Audio not connected"
        }
        Text(status, color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
        state.audioError?.takeIf { state.link == LinkState.CONNECTED }?.let { Text(it, color = XCoral, fontSize = 12.sp) }
        state.rosterError?.let { Text(it, color = XCoral, fontSize = 12.sp) }
        if (denied) Text(stringResource(R.string.vr_mic_denied), color = XCoral, fontSize = 12.sp)
        if (isManager && requests.isNotEmpty()) {
            Text(
                stringResource(R.string.n_requests, requests.size),
                color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.padding(top = 8.dp).clip(RoundedCornerShape(50)).background(XAmber)
                    .clickable { showRequests = true }.padding(horizontal = 14.dp, vertical = 6.dp),
            )
        }
        Spacer(Modifier.height(14.dp))
        // 8 seats, 4 per row
        for (row in 0..1) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                for (col in 0..3) {
                    val idx = row * 4 + col
                    val p = seated.getOrNull(idx)
                    Column(Modifier.width(76.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (p != null) {
                            val name = nameOf(p)
                            val talking = p.userId in state.speaking
                            Box(
                                Modifier.size(68.dp).clip(CircleShape)
                                    .background(if (talking) XTeal else Color.Transparent).padding(3.dp)
                                    .clickable { menuFor = p.userId },
                                contentAlignment = Alignment.Center,
                            ) {
                                XAvatar(name, 62.dp, flag = flagEmoji(p.user?.profile?.country), photoUrl = p.user?.profile?.photoUrl)
                                if (p.isMuted) Icon(Icons.Filled.MicOff, null, tint = XCoral,
                                    modifier = Modifier.align(Alignment.BottomEnd).size(18.dp))
                            }
                            Text(name, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                            com.xtalk.app.feature.common.VipTag(p.userId)
                            if (p.userId in mods) ModTag(Modifier.padding(top = 2.dp))
                        } else {
                            Box(
                                Modifier.size(68.dp).clip(CircleShape).background(SeatBg)
                                    .clickable(enabled = !iAmSeated && !isManager) { if (iRequested) vm.cancelStageRequest() else vm.requestStage() },
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Filled.Mic, null, tint = Color.White.copy(alpha = 0.8f)) }
                            Text("${idx + 1}", fontSize = 12.sp, color = Color.White.copy(alpha = 0.7f), modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        if (listeners.isNotEmpty()) {
            Text(stringResource(R.string.vr_listeners) + " (${listeners.size})", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 6.dp)) {
                items(listeners, key = { it.userId }) { p ->
                    val name = nameOf(p)
                    Column(Modifier.width(60.dp).clickable { menuFor = p.userId }, horizontalAlignment = Alignment.CenterHorizontally) {
                        XAvatar(name, 40.dp, flag = flagEmoji(p.user?.profile?.country), photoUrl = p.user?.profile?.photoUrl)
                        Text(name, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        com.xtalk.app.feature.common.VipTag(p.userId)
                        if (p.userId in mods) ModTag(Modifier.padding(top = 2.dp))
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f))
        // pinned notice
        Text(
            "Be kind. Keep the room safe: no hate, harassment or illegal content.",
            fontSize = 12.sp, color = Color.White.copy(alpha = 0.85f),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x33000000)).padding(12.dp),
        )
        Spacer(Modifier.height(10.dp))
        // bottom bar
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 12.dp)) {
            if (state.canPublish && state.link == LinkState.CONNECTED) {
                Box(
                    Modifier.size(52.dp).clip(CircleShape).background(if (state.micOn) XTeal else XViolet).clickable { onMic() },
                    contentAlignment = Alignment.Center,
                ) { Icon(if (state.micOn) Icons.Filled.Mic else Icons.Filled.MicOff, null, tint = Color.White) }
            }
            if (!iAmSeated && !isManager) {
                if (iRequested) OutlinedButton(onClick = vm::cancelStageRequest) { Text(stringResource(R.string.cancel_request), fontSize = 12.sp) }
                else Button(onClick = vm::requestStage) { Text(stringResource(R.string.request_stage), fontSize = 12.sp) }
            }
            if (iAmSeated && !isHost) OutlinedButton(onClick = vm::leaveSeat) { Text(stringResource(R.string.vr_to_listener), fontSize = 12.sp) }
            Box(
                Modifier.size(52.dp).clip(CircleShape).background(XAmber).clickable { showGifts = true },
                contentAlignment = Alignment.Center,
            ) { Text("\uD83C\uDF81", fontSize = 24.sp) }
            Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = vm::leave, border = BorderStroke(1.dp, XCoral)) { Text(stringResource(R.string.leave), color = XCoral) }
        }
    }
    state.giftEffect?.let { (e, n) -> GiftEffect(e, n) }
    state.giftBanner?.let {
        Text(it, color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 70.dp, start = 16.dp, end = 16.dp)
                .clip(RoundedCornerShape(50)).background(XAmber).padding(horizontal = 16.dp, vertical = 8.dp))
    }
    }
}

private object ActivityResults { val requestPermission = ActivityResultContracts.RequestPermission() }
