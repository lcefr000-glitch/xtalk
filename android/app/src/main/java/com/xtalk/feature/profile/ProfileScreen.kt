package com.xtalk.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.R
import com.xtalk.app.core.designsystem.XAvatar
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XCoral
import com.xtalk.app.core.designsystem.XGold
import com.xtalk.app.core.designsystem.XLightCard
import com.xtalk.app.core.designsystem.XPurpleBanner
import com.xtalk.app.core.designsystem.XRed
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.XTeal
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.core.designsystem.XAmber
import com.xtalk.app.core.designsystem.flagEmoji

@Composable
fun ProfileScreen(
    onLoggedOut: () -> Unit,
    onOpenVoiceRooms: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onOpenPremium: () -> Unit = {},
    onOpenMoments: () -> Unit = {},
    onOpenSettings: () -> Unit = {},
    onOpenEditProfile: () -> Unit = {},
    onOpenVocab: () -> Unit = {},
    onOpenSessions: () -> Unit = {},
    onOpenTools: () -> Unit = {},
    onOpenHub: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var bio by rememberSaveable { mutableStateOf<String?>(null) }
    var country by rememberSaveable { mutableStateOf<String?>(null) }
    var editing by rememberSaveable { mutableStateOf(false) }
    var nameEdit by rememberSaveable { mutableStateOf<String?>(null) }
    var interestsEdit by rememberSaveable { mutableStateOf<String?>(null) }
    val clipboard = LocalClipboardManager.current
    val pctx = androidx.compose.ui.platform.LocalContext.current
    val pickPhoto = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) viewModel.setPhoto(pctx, uri)
    }

    LaunchedEffect(state.loggedOut) { if (state.loggedOut) onLoggedOut() }
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, ev -> if (ev == androidx.lifecycle.Lifecycle.Event.ON_RESUME) viewModel.refresh() }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    when {
        state.loading && state.me == null -> Box(Modifier.fillMaxSize().background(XBg), Alignment.Center) { CircularProgressIndicator() }
        state.error != null && state.me == null -> Column(
            Modifier.fillMaxSize().background(XBg).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(12.dp))
            Button(onClick = viewModel::refresh) { Text(stringResource(R.string.retry)) }
        }
        else -> {
            val me = state.me!!
            val profile = me.profile
            val display = profile?.displayName?.ifBlank { null } ?: me.username
            Column(Modifier.fillMaxSize().background(XBg).verticalScroll(rememberScrollState()).padding(14.dp)) {
                // Top bar: logout + alerts on one side, premium on the other
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Icon(Icons.Filled.Logout, stringResource(R.string.logout), Modifier.clickable { viewModel.logout() })
                    Icon(Icons.Filled.Notifications, stringResource(R.string.notifications), Modifier.clickable(onClick = onOpenNotifications))
                    Icon(Icons.Filled.Settings, stringResource(R.string.settings), Modifier.clickable(onClick = onOpenSettings))
                    Spacer(Modifier.weight(1f))
                    Text(stringResource(R.string.premium), color = Color(0xFF3A2200), fontWeight = FontWeight.Bold, fontSize = 12.sp,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(XGold).clickable(onClick = onOpenPremium).padding(horizontal = 12.dp, vertical = 5.dp))
                }
                Spacer(Modifier.height(12.dp))
                // Subscription banner
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XPurpleBanner).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.sub_banner_title), fontWeight = FontWeight.Bold, color = Color.White)
                        Text(stringResource(R.string.sub_banner_sub), fontSize = 12.sp, color = Color.White.copy(alpha = 0.8f))
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.upgrade), color = Color(0xFF3A2200), fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(XGold).clickable(onClick = onOpenPremium).padding(horizontal = 14.dp, vertical = 7.dp))
                }
                Spacer(Modifier.height(16.dp))
                // Header: avatar, name, @username, edit button
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val meStatsVm: MeStatsViewModel = hiltViewModel()
                    val meStats by meStatsVm.stats.collectAsStateWithLifecycle()
                    LaunchedEffect(me.id) { meStatsVm.load() }
                    val vip = com.xtalk.app.feature.common.isVip(me.id)
                    val pct = profileCompletion(!profile?.photoUrl.isNullOrBlank(), !profile?.displayName.isNullOrBlank(), !profile?.bio.isNullOrBlank(),
                        !profile?.country.isNullOrBlank(), profile?.interests?.size ?: 0, me.userLanguages.size)
                    Box(contentAlignment = Alignment.Center) {
                        androidx.compose.material3.CircularProgressIndicator(
                            progress = { pct / 100f }, modifier = Modifier.size(98.dp), strokeWidth = 4.dp,
                            color = if (vip) XAmber else XTeal, trackColor = XSurface,
                        )
                        XAvatar(display, 84.dp, flag = flagEmoji(profile?.country), photoUrl = profile?.photoUrl,
                            modifier = Modifier.clickable { pickPhoto.launch("image/*") })
                        Text("$pct%", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.Black,
                            modifier = Modifier.align(Alignment.BottomCenter).clip(RoundedCornerShape(50)).background(if (vip) XAmber else XTeal).padding(horizontal = 6.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(display + (flagEmoji(profile?.country)?.let { " $it" } ?: ""), fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.weight(1f, fill = false))
                            Spacer(Modifier.width(6.dp))
                            com.xtalk.app.feature.common.VipTag(me.id)
                        }
                        Text(stringResource(R.string.change_photo), color = XViolet, fontSize = 12.sp,
                            modifier = Modifier.clickable { pickPhoto.launch("image/*") })
                        if (state.photoError) Text(stringResource(R.string.photo_failed), color = XRed, fontSize = 12.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("@${me.username}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(6.dp))
                            Icon(Icons.Filled.ContentCopy, stringResource(R.string.copy), tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp).clickable { clipboard.setText(AnnotatedString("@${me.username}")) })
                        }
                        Text(
                            stringResource(if (me.emailVerified) R.string.email_verified else R.string.email_not_verified),
                            fontSize = 12.sp, color = if (me.emailVerified) XTeal else XRed,
                        )
                    }
                    Box {
                        Text(stringResource(R.string.edit), color = Color.White, fontWeight = FontWeight.Bold,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(XViolet).clickable { onOpenEditProfile() }.padding(horizontal = 20.dp, vertical = 8.dp))
                        if (!me.emailVerified) Box(Modifier.align(Alignment.TopEnd).size(10.dp).clip(CircleShape).background(XRed))
                    }
                }
                run {
                    val st = androidx.compose.runtime.remember { mutableStateOf<MeStats?>(null) }
                    val vm2: MeStatsViewModel = hiltViewModel()
                    val ms by vm2.stats.collectAsStateWithLifecycle()
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                        listOf(
                            "Followers" to (ms.followers?.toString() ?: "-"),
                            "Following" to (ms.following?.toString() ?: "-"),
                            "Level" to (ms.wallet?.level?.toString() ?: "-"),
                            "Coins" to (ms.wallet?.coins?.toString() ?: "-"),
                        ).forEach { (label, v) ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(v, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                if (editing) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = nameEdit ?: profile?.displayName.orEmpty(), onValueChange = { nameEdit = it.take(50) },
                        label = { Text(stringResource(R.string.vr_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = bio ?: profile?.bio.orEmpty(), onValueChange = { bio = it.take(500) },
                        label = { Text(stringResource(R.string.bio)) }, minLines = 3, maxLines = 8,
                        supportingText = { Text("${(bio ?: profile?.bio.orEmpty()).length}/500") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = interestsEdit ?: profile?.interests.orEmpty().joinToString(", "), onValueChange = { interestsEdit = it },
                        label = { Text(stringResource(R.string.vr_interests_hint)) }, modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = country ?: profile?.country.orEmpty(), onValueChange = { country = it },
                        label = { Text(stringResource(R.string.country_hint)) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = {
                            viewModel.saveBio(
                                bio ?: profile?.bio.orEmpty(), country ?: profile?.country,
                                displayName = nameEdit,
                                interests = interestsEdit?.split(",", "،")?.map { it.trim() }?.filter { it.isNotEmpty() }?.take(10),
                            )
                        },
                        enabled = !state.saving, modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(if (state.saving) R.string.saving else if (state.saved) R.string.saved else R.string.save))
                    }
                } else if (!profile?.bio.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(profile?.bio.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (me.userLanguages.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
                        Text(stringResource(R.string.languages), fontWeight = FontWeight.Bold)
                        me.userLanguages.forEach { ul ->
                            Row(Modifier.padding(top = 6.dp)) {
                                Text(ul.language?.name ?: ul.languageCode, Modifier.weight(1f))
                                Text(ul.type.lowercase(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                // Two stat cards: interests and languages (real data)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatCard(Modifier.weight(1f), stringResource(R.string.interests), "${profile?.interests?.size ?: 0}",
                        profile?.interests?.take(2)?.joinToString(" · ").orEmpty().ifBlank { stringResource(R.string.no_interests) }, XCoral)
                    StatCard(Modifier.weight(1f), stringResource(R.string.languages), "${me.userLanguages.size}",
                        me.userLanguages.take(2).joinToString(" · ") { it.language?.name ?: it.languageCode }, XAmber)
                }
                Spacer(Modifier.height(10.dp))
                // Moments row
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).clickable(onClick = onOpenMoments).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.PhotoLibrary, null, tint = XViolet)
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.moments_row), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).clickable(onClick = onOpenVocab).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("\uD83D\uDCD2", fontSize = 20.sp)
                    Spacer(Modifier.width(10.dp))
                    Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_me_vocab), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).clickable(onClick = onOpenSessions).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("\uD83D\uDD12", fontSize = 20.sp)
                    Spacer(Modifier.width(10.dp))
                    Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_devices_history), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).clickable(onClick = onOpenTools).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("\uD83C\uDF10", fontSize = 20.sp)
                    Spacer(Modifier.width(10.dp))
                    Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_me_tools), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).clickable(onClick = onOpenHub).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("\uD83C\uDFC6", fontSize = 20.sp)
                    Spacer(Modifier.width(10.dp))
                    Text(com.xtalk.app.feature.learn.tr("Progress, courses and friends", "التقدم والدورات والأصدقاء"), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(14.dp))
                // Light comparison card with gold-pink upgrade button
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(XLightCard).padding(16.dp)) {
                    Text(stringResource(R.string.compare_title), color = Color(0xFF1E1236), fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Spacer(Modifier.height(8.dp))
                    listOf(
                        R.string.feat_ai to (R.string.limited to R.string.unlimited),
                        R.string.feat_grammar to (R.string.limited to R.string.unlimited),
                        R.string.feat_translate to (R.string.limited to R.string.unlimited),
                        R.string.feat_rooms to (R.string.limited to R.string.unlimited),
                    ).forEach { (feat, v) ->
                        Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(feat), Modifier.weight(1f), color = Color(0xFF1E1236))
                            Text(stringResource(v.first), color = Color(0xFF6B6785), fontSize = 12.sp, modifier = Modifier.width(72.dp))
                            Text(stringResource(v.second), color = Color(0xFF6D4BFF), fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.width(72.dp))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(stringResource(R.string.upgrade), color = Color(0xFF3A2200), fontWeight = FontWeight.Bold,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(XGold).clickable(onClick = onOpenPremium).padding(vertical = 12.dp))
                }
                Spacer(Modifier.height(14.dp))
                OutlinedButton(onClick = onOpenVoiceRooms, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.voice_rooms_entry)) }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = viewModel::logout, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.logout)) }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun StatCard(modifier: Modifier, title: String, big: String, sub: String, accent: Color) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(XSurface).padding(14.dp)) {
        Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        Spacer(Modifier.height(6.dp))
        Text(big, color = accent, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp)
        Text(sub, fontSize = 12.sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
