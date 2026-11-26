package com.xtalk.app.feature.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XAvatar
import com.xtalk.app.core.designsystem.XGold
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.core.designsystem.flagEmoji
import com.xtalk.app.core.network.*
import com.xtalk.app.feature.common.VipTag
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class UserCardState(
    val loaded: Boolean = false,
    val profile: PublicProfileDto? = null,
    val extras: ExtrasDto? = null,
    val honor: HonorDto? = null,
    val wishes: List<String> = emptyList(),
    val gifts: List<GiftDto> = emptyList(),
)

@HiltViewModel
class UserCardViewModel @Inject constructor(
    private val userApi: UserApi,
    private val extrasApi: ExtrasApi,
    private val economy: EconomyApi,
) : ViewModel() {
    private val _s = MutableStateFlow(UserCardState())
    val state: StateFlow<UserCardState> = _s.asStateFlow()
    private var forId: String? = null

    fun load(id: String) {
        if (forId == id) return
        forId = id
        _s.value = UserCardState()
        viewModelScope.launch {
            val p = runCatching { userApi.publicProfile(id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val e = runCatching { extrasApi.of(id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val h = runCatching { extrasApi.honor(id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val w = runCatching { extrasApi.wishlist(id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.giftIds.orEmpty()
            val g = runCatching { economy.gifts() }.getOrNull()?.takeIf { it.isSuccessful }?.body().orEmpty()
            if (forId == id) _s.value = UserCardState(true, p, e, h, w, g)
        }
    }

    fun toggleFollow() {
        val p = _s.value.profile ?: return
        viewModelScope.launch {
            val r = runCatching { if (p.isFollowing) userApi.unfollow(p.id) else userApi.follow(p.id) }.getOrNull()
            if (r?.isSuccessful == true) {
                val np = runCatching { userApi.publicProfile(p.id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
                if (np != null) _s.value = _s.value.copy(profile = np)
            }
        }
    }

    fun saveWishes(ids: List<String>) {
        viewModelScope.launch {
            val r = runCatching { extrasApi.setWishlist(WishlistDto(ids)) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            if (r != null) _s.value = _s.value.copy(wishes = r.giftIds)
        }
    }

    fun report(id: String) {
        viewModelScope.launch { runCatching { userApi.report(ReportRequest("USER", id, "Inappropriate behaviour")) } }
    }

    fun block(id: String, done: () -> Unit) {
        viewModelScope.launch { if (runCatching { userApi.block(id) }.getOrNull()?.isSuccessful == true) done() }
    }
}

/** Bottom-sheet card shown when tapping someone in a voice room. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomUserCard(
    userId: String,
    name: String,
    photoUrl: String?,
    country: String?,
    isSelf: Boolean,
    isMod: Boolean,
    isListener: Boolean,
    isMuted: Boolean,
    isManagerView: Boolean,
    canManage: Boolean,
    isHostView: Boolean,
    onDismiss: () -> Unit,
    onVisit: () -> Unit,
    onSendGift: () -> Unit,
    onInviteToMic: () -> Unit,
    onMute: () -> Unit,
    onToListener: () -> Unit,
    onToggleMod: () -> Unit,
    onKick: () -> Unit,
    vm: UserCardViewModel = hiltViewModel(),
) {
    LaunchedEffect(userId) { vm.load(userId) }
    val st by vm.state.collectAsStateWithLifecycle()
    var menu by remember { mutableStateOf(false) }
    var pickWish by remember { mutableStateOf(false) }
    var wishDraft by remember(st.wishes) { mutableStateOf(st.wishes) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                XAvatar(name, 64.dp, flag = flagEmoji(country), photoUrl = photoUrl)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(name, fontWeight = FontWeight.Bold, fontSize = 18.sp, maxLines = 1)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 4.dp)) {
                        VipTag(userId)
                        when (st.extras?.gender) {
                            "Male" -> Text("\u2642", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color(0xFF3B82F6)).padding(horizontal = 7.dp, vertical = 1.dp))
                            "Female" -> Text("\u2640", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color(0xFFEC4899)).padding(horizontal = 7.dp, vertical = 1.dp))
                        }
                        if (isMod) ModTag()
                    }
                }
                if (!isSelf) {
                    val following = st.profile?.isFollowing == true
                    Button(onClick = vm::toggleFollow, enabled = st.profile != null,
                        colors = if (following) ButtonDefaults.outlinedButtonColors() else ButtonDefaults.buttonColors()) {
                        Text(if (following) "Following" else "Follow", fontSize = 12.sp)
                    }
                }
                if (!isSelf) Box {
                    Text("\u22EE", fontSize = 22.sp, modifier = Modifier.clickable { menu = true }.padding(horizontal = 10.dp))
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (canManage) {
                            if (!isListener) DropdownMenuItem(text = { Text(if (isMuted) "Unmute" else "Mute") }, onClick = { menu = false; onMute(); onDismiss() })
                            if (!isListener) DropdownMenuItem(text = { Text("Move to listeners") }, onClick = { menu = false; onToListener(); onDismiss() })
                            if (isHostView) DropdownMenuItem(text = { Text(if (isMod) "Remove moderator" else "Make moderator") }, onClick = { menu = false; onToggleMod(); onDismiss() })
                            DropdownMenuItem(text = { Text("Remove from room", color = Color(0xFFFF6B6B)) }, onClick = { menu = false; onKick(); onDismiss() })
                        }
                        DropdownMenuItem(text = { Text("Report") }, onClick = { menu = false; vm.report(userId); onDismiss() })
                        DropdownMenuItem(text = { Text("Block", color = Color(0xFFFF6B6B)) }, onClick = { menu = false; vm.block(userId) { onDismiss() } })
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            // language pair
            val nat = st.profile?.languages.orEmpty().filter { it.type == "NATIVE" }.joinToString(", ") { it.name ?: it.code }
            val lrn = st.profile?.languages.orEmpty().filter { it.type == "LEARNING" }.joinToString(", ") { it.name ?: it.code }
            if (nat.isNotBlank() || lrn.isNotBlank()) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XSurface).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(nat.ifBlank { "-" }, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("\u2192", modifier = Modifier.padding(horizontal = 8.dp))
                    Text(lrn.ifBlank { "-" }, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { onDismiss(); onVisit() }, modifier = Modifier.weight(1f)) { Text("Visit page") }
                if (!isSelf && isManagerView && isListener) {
                    Button(onClick = { onInviteToMic(); onDismiss() }, modifier = Modifier.weight(1f)) { Text("Invite to mic") }
                }
            }
            Spacer(Modifier.height(12.dp))
            // gift wall
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XSurface).padding(12.dp)) {
                Row {
                    Text("Gift wall", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("Collected ${st.honor?.totalGifts ?: 0}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
                val got = st.honor?.giftsReceived.orEmpty()
                if (got.isEmpty()) Text(if (st.loaded) "No gifts yet" else "Loading...", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                else Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    got.take(6).forEach { g ->
                        Text((st.gifts.firstOrNull { it.id == g.giftId }?.emoji ?: "\uD83C\uDF81") + " x${g.count}", fontSize = 14.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            // wish list
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XSurface).padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Wish list", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("${st.wishes.size}/3", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    if (isSelf) Text("  Edit", color = XViolet, fontSize = 12.sp, modifier = Modifier.clickable { pickWish = !pickWish })
                }
                if (st.wishes.isEmpty() && !pickWish) Text("No wishes yet", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                else if (!pickWish) Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    st.wishes.forEach { id ->
                        val g = st.gifts.firstOrNull { it.id == id }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(g?.emoji ?: "\uD83C\uDF81", fontSize = 26.sp)
                            Text("${g?.price ?: "?"} coins", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (pickWish && isSelf) {
                    Text("Pick up to 3 gifts", fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        st.gifts.forEach { g ->
                            val on = g.id in wishDraft
                            Text(g.emoji, fontSize = 24.sp, modifier = Modifier.clip(RoundedCornerShape(10.dp))
                                .background(if (on) XViolet.copy(alpha = 0.5f) else Color.Transparent)
                                .clickable { wishDraft = if (on) wishDraft - g.id else if (wishDraft.size < 3) wishDraft + g.id else wishDraft }.padding(6.dp))
                        }
                    }
                    TextButton(onClick = { vm.saveWishes(wishDraft); pickWish = false }) { Text("Save wishes") }
                }
            }
            Spacer(Modifier.height(14.dp))
            if (!isSelf) {
                Text("Send gift", color = Color(0xFF3A2200), fontWeight = FontWeight.Bold, fontSize = 16.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(XGold).clickable { onDismiss(); onSendGift() }.padding(vertical = 14.dp))
            }
        }
    }
}
