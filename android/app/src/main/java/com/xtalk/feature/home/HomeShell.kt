package com.xtalk.app.feature.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.R
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XCoral
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.feature.discover.DiscoverScreen
import com.xtalk.app.feature.messages.ChatListScreen
import com.xtalk.app.feature.messages.ChatListViewModel
import com.xtalk.app.feature.moments.MomentsScreen
import com.xtalk.app.feature.profile.ProfileScreen
import com.xtalk.app.feature.voice.VoiceRoomsContent

private data class Tab(val label: Int, val icon: ImageVector)

// Logical order. In RTL (Arabic) this renders Me | Voice | Moments | Connect | Chats from left to right.
private val tabs = listOf(
    Tab(R.string.tab_chats, Icons.Filled.Chat),
    Tab(R.string.tab_connect, Icons.Filled.Explore),
    Tab(R.string.tab_moments, Icons.Filled.PhotoLibrary),
    Tab(R.string.tab_voice, Icons.Filled.GraphicEq),
    Tab(R.string.tab_me, Icons.Filled.Person),
)
const val TAB_CHATS = 0
const val TAB_CONNECT = 1
const val TAB_MOMENTS = 2
const val TAB_VOICE = 3
const val TAB_ME = 4

@Composable
fun HomeShell(
    onLoggedOut: () -> Unit,
    onOpenChat: (conversationId: String) -> Unit,
    onChatWithUser: (userId: String) -> Unit,
    onOpenVoiceRooms: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenPremium: () -> Unit,
) {
    var selected by rememberSaveable { mutableIntStateOf(TAB_VOICE) }
    val chatVm: ChatListViewModel = hiltViewModel()
    val chatState by chatVm.state.collectAsStateWithLifecycle()
    val unread = chatState.conversations.sumOf { it.unreadCount }

    Scaffold(
        containerColor = XBg,
        bottomBar = {
            NavigationBar(containerColor = XSurface) {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = selected == index,
                        onClick = { selected = index },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = XViolet, selectedTextColor = XViolet,
                            indicatorColor = XSurface,
                        ),
                        icon = {
                            BadgedBox(badge = {
                                if (index == TAB_CHATS && unread > 0) {
                                    Badge(containerColor = XCoral) { Text(if (unread > 99) "99+" else "$unread") }
                                }
                            }) { Icon(tab.icon, contentDescription = stringResource(tab.label)) }
                        },
                        label = { Text(stringResource(tab.label)) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (selected) {
                TAB_CHATS -> ChatListScreen(
                    onOpenChat = onOpenChat,
                    onNewChat = { selected = TAB_CONNECT },
                    onOpenPremium = onOpenPremium,
                    onShortcut = { selected = it },
                    onOpenNotifications = onOpenNotifications,
                    viewModel = chatVm,
                )
                TAB_CONNECT -> DiscoverScreen(onOpenChat = onChatWithUser)
                TAB_MOMENTS -> MomentsScreen()
                TAB_VOICE -> VoiceRoomsContent(onOpenPremium = onOpenPremium)
                TAB_ME -> ProfileScreen(
                    onLoggedOut = onLoggedOut,
                    onOpenVoiceRooms = onOpenVoiceRooms,
                    onOpenNotifications = onOpenNotifications,
                    onOpenPremium = onOpenPremium,
                    onOpenMoments = { selected = TAB_MOMENTS },
                )
            }
        }
    }
}
