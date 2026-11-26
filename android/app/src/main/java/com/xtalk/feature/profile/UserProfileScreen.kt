package com.xtalk.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.R
import com.xtalk.app.core.common.ImageUtil
import com.xtalk.app.core.designsystem.XAvatar
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.flagEmoji
import com.xtalk.app.core.network.PublicProfileDto
import com.xtalk.app.core.network.UserApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class UserProfileState(val loading: Boolean = true, val profile: PublicProfileDto? = null, val error: String? = null)

@HiltViewModel
class UserProfileViewModel @Inject constructor(private val api: UserApi) : ViewModel() {
    private val _state = MutableStateFlow(UserProfileState())
    val state: StateFlow<UserProfileState> = _state.asStateFlow()

    fun load(id: String) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val r = api.publicProfile(id)
                if (r.isSuccessful && r.body() != null) _state.update { UserProfileState(false, r.body()) }
                else _state.update {
                    it.copy(loading = false, error = when (r.code()) {
                        403 -> "This profile is private or unavailable"
                        404 -> "User not found (or the server needs the update)"
                        else -> "Could not load profile (HTTP ${r.code()})"
                    })
                }
            } catch (e: Exception) { _state.update { it.copy(loading = false, error = "Network error: ${e.message}") } }
        }
    }

    fun block(onDone: () -> Unit) {
        val p = _state.value.profile ?: return
        viewModelScope.launch {
            val r = runCatching { api.block(p.id) }.getOrNull()
            if (r?.isSuccessful == true) onDone()
        }
    }

    fun report(reason: String) {
        val p = _state.value.profile ?: return
        viewModelScope.launch { runCatching { api.report(com.xtalk.app.core.network.ReportRequest("USER", p.id, reason)) } }
    }

    fun toggleFollow() {
        val p = _state.value.profile ?: return
        viewModelScope.launch {
            val r = runCatching { if (p.isFollowing) api.unfollow(p.id) else api.follow(p.id) }.getOrNull()
            if (r != null && r.isSuccessful) load(p.id)
        }
    }
}

@Composable
fun UserProfileScreen(
    userId: String,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
    viewModel: UserProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(userId) { viewModel.load(userId) }
    Column(Modifier.fillMaxSize().background(XBg)) {
        Box(Modifier.weight(1f)) {
            val p = state.profile
            when {
                state.loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                p == null -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.error ?: "Error", color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { viewModel.load(userId) }) { Text(stringResource(R.string.retry)) }
                }
                else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    val name = p.displayName.ifBlank { p.username }
                    XAvatar(name, 110.dp, flag = flagEmoji(p.country), photoUrl = p.photoUrl)
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(name + (flagEmoji(p.country)?.let { " $it" } ?: ""), fontWeight = FontWeight.Bold, fontSize = 24.sp)
                        Spacer(Modifier.width(8.dp))
                        com.xtalk.app.feature.common.VipTag(userId)
                    }
                    Text("@${p.username}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val days = ImageUtil.daysSince(p.createdAt)
                    Text(
                        if (days <= 0L) stringResource(R.string.registered_today) else stringResource(R.string.registered_days, days.toInt()),
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        Stat("${p.followers}", stringResource(R.string.followers))
                        Stat("${p.following}", stringResource(R.string.following))
                    }
                    if (!p.isSelf) {
                        Spacer(Modifier.height(14.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            Button(onClick = { onMessage(p.id) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.message)) }
                            OutlinedButton(onClick = viewModel::toggleFollow, modifier = Modifier.weight(1f)) {
                                Text(stringResource(if (p.isFollowing) R.string.unfollow else R.string.follow))
                            }
                        }
                        var confirm by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(0) }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            androidx.compose.material3.TextButton(onClick = { confirm = 1 }) { Text("Block", color = MaterialTheme.colorScheme.error) }
                            androidx.compose.material3.TextButton(onClick = { confirm = 2 }) { Text("Report") }
                        }
                        if (confirm != 0) androidx.compose.material3.AlertDialog(
                            onDismissRequest = { confirm = 0 },
                            title = { Text(if (confirm == 1) "Block this user?" else "Report this user?") },
                            text = { Text(if (confirm == 1) "You will not see each other's profiles, posts or rooms. You can unblock from Settings." else "Send a report about this user to the moderators.") },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    if (confirm == 1) viewModel.block(onBack) else viewModel.report("Inappropriate behaviour")
                                    confirm = 0
                                }) { Text("OK") }
                            },
                            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirm = 0 }) { Text("Cancel") } },
                        )
                    }
                    val tabsVm: PublicTabsViewModel = hiltViewModel()
                    androidx.compose.runtime.LaunchedEffect(userId) { tabsVm.load(userId) }
                    val tabs by tabsVm.state.collectAsStateWithLifecycle()
                    var tab by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(0) }
                    Spacer(Modifier.height(12.dp))
                    androidx.compose.material3.TabRow(selectedTabIndex = tab, containerColor = XBg) {
                        listOf("Profile", "Moments", "Honor").forEachIndexed { i, t ->
                            androidx.compose.material3.Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) })
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    when (tab) {
                        0 -> {
                            if (!p.bio.isNullOrBlank()) {
                        Spacer(Modifier.height(14.dp))
                        Text(p.bio, Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp))
                    }
                    if (p.interests.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
                            Text(stringResource(R.string.interests), fontWeight = FontWeight.Bold)
                            Text(p.interests.joinToString(" · "), Modifier.padding(top = 4.dp))
                        }
                    }
                    if (p.languages.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
                            Text(stringResource(R.string.languages), fontWeight = FontWeight.Bold)
                            p.languages.forEach { l ->
                                Row(Modifier.padding(top = 6.dp)) {
                                    Text(l.name ?: l.code, Modifier.weight(1f))
                                    Text((l.type ?: "").lowercase(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                                }
                            }
                        }
                    }

                            val ex = tabs.extras
                            val rows = listOfNotNull(
                                ex?.tagline?.takeIf { it.isNotBlank() }?.let { "Tagline" to it },
                                ex?.hometown?.takeIf { it.isNotBlank() }?.let { "Hometown" to it },
                                ex?.occupation?.takeIf { it.isNotBlank() }?.let { "Occupation" to it },
                                ex?.school?.takeIf { it.isNotBlank() }?.let { "School" to it },
                                ex?.gender?.takeIf { it.isNotBlank() }?.let { "Gender" to it },
                                ex?.bloodType?.takeIf { it.isNotBlank() }?.let { "Blood type" to it },
                                ex?.mbti?.takeIf { it.isNotBlank() }?.let { "MBTI" to it },
                            )
                            if (rows.isNotEmpty()) {
                                Spacer(Modifier.height(10.dp))
                                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
                                    Text("About", fontWeight = FontWeight.Bold)
                                    rows.forEach { (k, v) ->
                                        Row(Modifier.padding(top = 6.dp)) {
                                            Text(k, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            Text(v)
                                        }
                                    }
                                }
                            }
                        }
                        1 -> {
                            if (tabs.posts.isEmpty()) Text(if (tabs.loaded) "No moments yet" else "Loading...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            tabs.posts.forEach { post ->
                                Column(Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
                                    Text(post.body)
                                    Text("${post.likeCount} likes  ·  ${post.commentCount} comments", fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                                }
                            }
                        }
                        else -> {
                            val h = tabs.honor
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
                                Text("Level ${h?.level ?: 1}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                                Text("Gifts received: ${h?.totalGifts ?: 0}", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                            }
                            h?.giftsReceived.orEmpty().forEach { g ->
                                val gift = tabs.gifts.firstOrNull { it.id == g.giftId }
                                Row(Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(gift?.emoji ?: "\uD83C\uDF81", fontSize = 24.sp)
                                    Text(gift?.name ?: g.giftId, Modifier.weight(1f).padding(start = 10.dp))
                                    Text("x${g.count}", fontWeight = FontWeight.Bold)
                                }
                            }
                            if (h != null && h.giftsReceived.isEmpty()) Text("No gifts yet", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(12.dp)) { Text(stringResource(R.string.back)) }
    }
}

@Composable
private fun Stat(big: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(big, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

data class PublicTabsState(
    val loaded: Boolean = false,
    val extras: com.xtalk.app.core.network.ExtrasDto? = null,
    val posts: List<com.xtalk.app.core.network.FeedPostDto> = emptyList(),
    val honor: com.xtalk.app.core.network.HonorDto? = null,
    val gifts: List<com.xtalk.app.core.network.GiftDto> = emptyList(),
)

@dagger.hilt.android.lifecycle.HiltViewModel
class PublicTabsViewModel @javax.inject.Inject constructor(
    private val api: com.xtalk.app.core.network.ExtrasApi,
    private val economy: com.xtalk.app.core.network.EconomyApi,
) : androidx.lifecycle.ViewModel() {
    private val _s = kotlinx.coroutines.flow.MutableStateFlow(PublicTabsState())
    val state: kotlinx.coroutines.flow.StateFlow<PublicTabsState> = _s
    private var loadedFor: String? = null

    fun load(userId: String) {
        if (loadedFor == userId) return
        loadedFor = userId
        viewModelScope.launch {
            val ex = runCatching { api.of(userId) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val posts = runCatching { api.posts(userId) }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.results.orEmpty()
            val honor = runCatching { api.honor(userId) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val gifts = runCatching { economy.gifts() }.getOrNull()?.takeIf { it.isSuccessful }?.body().orEmpty()
            _s.value = PublicTabsState(true, ex, posts, honor, gifts)
        }
    }
}
