package com.xtalk.app.feature.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.core.network.NotificationDto
import com.xtalk.app.core.network.NotificationsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotificationsState(
    val loading: Boolean = true,
    val items: List<NotificationDto> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val api: NotificationsApi) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsState())
    val state: StateFlow<NotificationsState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            try {
                val res = api.list()
                if (res.isSuccessful) _state.update { it.copy(loading = false, items = res.body()?.results.orEmpty()) }
                else _state.update { it.copy(loading = false, error = "HTTP ${res.code()}") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun readAll() {
        viewModelScope.launch {
            runCatching { api.readAll() }
            refresh()
        }
    }
}

private fun label(type: String): String = when (type) {
    "NEW_MESSAGE" -> "sent you a message"
    "NEW_FOLLOWER" -> "started following you"
    "LIKE" -> "liked your post"
    "COMMENT" -> "commented on your post"
    "REPLY" -> "replied to your comment"
    "ROOM_INVITATION" -> "invited you to a voice room"
    "INCOMING_CALL" -> "called you"
    "ACCOUNT" -> "Account notification"
    "SECURITY" -> "Security notification"
    else -> type.lowercase().replace('_', ' ')
}

@Composable
fun NotificationsScreen(onBack: () -> Unit, viewModel: NotificationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Notifications", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            TextButton(onClick = viewModel::readAll) { Text("Mark all read") }
        }
        Spacer(Modifier.height(8.dp))
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            state.items.isEmpty() -> Text("Nothing yet.", style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(32.dp))
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(state.items, key = { it.id }) { n ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp)) {
                            Text(
                                "${n.actor?.profile?.displayName ?: n.actor?.username ?: "X TaIk"} ${label(n.type)}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (n.readAt == null) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
