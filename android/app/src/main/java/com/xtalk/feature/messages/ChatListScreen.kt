package com.xtalk.app.feature.messages

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.xtalk.app.core.designsystem.XCoral
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.XSurfaceHigh
import com.xtalk.app.core.designsystem.XTeal
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.core.designsystem.flagEmoji
import com.xtalk.app.core.network.ConversationSummaryDto
import com.xtalk.app.feature.home.TAB_CONNECT
import com.xtalk.app.feature.home.TAB_MOMENTS
import com.xtalk.app.feature.home.TAB_VOICE

private data class Shortcut(val label: Int, val icon: ImageVector, val color: Color, val action: Int)

@Composable
fun ChatListScreen(
    onOpenChat: (conversationId: String) -> Unit,
    onNewChat: () -> Unit = {},
    onOpenPremium: () -> Unit = {},
    onShortcut: (tab: Int) -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    viewModel: ChatListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableIntStateOf(0) } // 0 all, 1 unread, 2 by region

    fun other(c: ConversationSummaryDto) = c.members.firstOrNull { it.id != state.myUserId }
    fun nameOf(c: ConversationSummaryDto) = other(c)?.profile?.displayName?.ifBlank { null } ?: other(c)?.username ?: ""

    val shown = state.conversations
        .filter { query.isBlank() || nameOf(it).contains(query, ignoreCase = true) }
        .filter { filter != 1 || it.unreadCount > 0 }
        .let { l -> if (filter == 2) l.sortedBy { other(it)?.profile?.country ?: "~" } else l }

    val shortcuts = listOf(
        Shortcut(R.string.shortcut_discover, Icons.Filled.Explore, XTeal, TAB_CONNECT),
        Shortcut(R.string.shortcut_voice, Icons.Filled.GraphicEq, XViolet, TAB_VOICE),
        Shortcut(R.string.shortcut_moments, Icons.Filled.PhotoLibrary, XCoral, TAB_MOMENTS),
        Shortcut(R.string.shortcut_alerts, Icons.Filled.Notifications, XAmber, -1),
        Shortcut(R.string.shortcut_premium, Icons.Filled.Star, Color(0xFFFF8FB1), -2),
    )

    Column(Modifier.fillMaxSize().background(XBg)) {
        // Header
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(XSurfaceHigh).clickable(onClick = onNewChat), Alignment.Center) {
                Icon(Icons.Filled.Add, null)
            }
            Spacer(Modifier.weight(1f))
            Text(stringResource(R.string.language_chats), fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Spacer(Modifier.weight(1f))
            GoldPill(stringResource(R.string.premium), onClick = onOpenPremium)
        }
        // Shortcut tiles
        LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(shortcuts) { s ->
                Column(
                    Modifier.clickable {
                        when (s.action) { -1 -> onOpenNotifications(); -2 -> onOpenPremium(); else -> onShortcut(s.action) }
                    }.width(64.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(s.color.copy(alpha = 0.18f)), Alignment.Center) {
                        Icon(s.icon, null, tint = s.color)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(stringResource(s.label), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        // Search field
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp).clip(RoundedCornerShape(24.dp)).background(XSurfaceHigh)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            androidx.compose.foundation.text.BasicTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 15.sp),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(XViolet),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    if (query.isEmpty()) Text(stringResource(R.string.search), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    inner()
                },
            )
        }
        // Filter chips
        LazyRow(contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val labels = listOf(R.string.all, R.string.unread, R.string.by_region)
            items(labels.size) { i ->
                Text(
                    stringResource(labels[i]),
                    fontWeight = if (filter == i) FontWeight.Bold else FontWeight.Normal,
                    color = if (filter == i) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .background(if (filter == i) XSurfaceHigh else XSurface)
                        .clickable { filter = i }.padding(horizontal = 14.dp, vertical = 6.dp),
                )
            }
        }
        when {
            state.loading -> Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) { CircularProgressIndicator() }
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            shown.isEmpty() -> Text(
                stringResource(R.string.no_chats),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(32.dp),
            )
            else -> LazyColumn {
                items(shown, key = { it.id }) { conv ->
                    val o = other(conv)
                    val name = nameOf(conv).ifBlank { "?" }
                    Row(
                        Modifier.fillMaxWidth().clickable { onOpenChat(conv.id) }.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        XAvatar(name, 54.dp, flag = flagEmoji(o?.profile?.country))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(name, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                conv.lastMessage?.body ?: conv.lastMessage?.type?.lowercase()?.let { "[$it]" }
                                    ?: stringResource(R.string.no_messages),
                                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(horizontalAlignment = Alignment.End) {
                            Text(timeOf(conv.updatedAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (conv.unreadCount > 0) {
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    if (conv.unreadCount > 99) "99+" else "${conv.unreadCount}",
                                    color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.clip(CircleShape).background(XViolet).padding(horizontal = 7.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** ISO timestamp to local "HH:mm". */
private fun timeOf(iso: String): String = runCatching {
    java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
}.getOrDefault("")
