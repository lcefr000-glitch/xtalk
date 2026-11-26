package com.xtalk.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.network.BlockedUserDto
import com.xtalk.app.core.network.UserApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BlockedState(val loading: Boolean = true, val users: List<BlockedUserDto> = emptyList(), val error: String? = null)

@HiltViewModel
class BlockedViewModel @Inject constructor(private val api: UserApi) : ViewModel() {
    private val _s = MutableStateFlow(BlockedState())
    val state: StateFlow<BlockedState> = _s.asStateFlow()
    init { load() }
    fun load() {
        viewModelScope.launch {
            val r = runCatching { api.blocked() }.getOrNull()
            _s.value = if (r?.isSuccessful == true) BlockedState(false, r.body()?.results.orEmpty())
            else BlockedState(false, emptyList(), "Could not load the list (HTTP ${r?.code() ?: "network"})")
        }
    }
    fun unblock(id: String) {
        viewModelScope.launch { runCatching { api.unblock(id) }; load() }
    }
}

@Composable
fun BlockedScreen(onBack: () -> Unit, vm: BlockedViewModel = hiltViewModel()) {
    val st by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(XBg).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("Back") }
            Text("Blocked users", style = MaterialTheme.typography.titleLarge)
        }
        st.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (!st.loading && st.users.isEmpty() && st.error == null) Text("You have not blocked anyone", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        LazyColumn {
            items(st.users, key = { it.id }) { u ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(u.profile?.displayName?.ifBlank { null } ?: u.username)
                        Text("@${u.username}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    OutlinedButton(onClick = { vm.unblock(u.id) }) { Text("Unblock") }
                }
            }
        }
    }
}
