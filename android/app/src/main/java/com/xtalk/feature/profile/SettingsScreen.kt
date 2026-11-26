package com.xtalk.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.R
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XCoral
import com.xtalk.app.core.network.SettingsDto
import com.xtalk.app.core.network.UpdateProfileRequest
import com.xtalk.app.core.network.UpdateSettingsRequest
import com.xtalk.app.core.network.UserApi
import com.xtalk.app.feature.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsState(
    val loading: Boolean = true,
    val settings: SettingsDto = SettingsDto(),
    val showOnline: Boolean = true,
    val showLastActive: Boolean = true,
    val publicProfile: Boolean = true,
    val message: String? = null,
    val loggedOut: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val api: UserApi,
    private val auth: AuthRepository,
    private val repo: ProfileRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(SettingsState())
    val state: StateFlow<SettingsState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val me = runCatching { api.me() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            _state.update {
                it.copy(
                    loading = false,
                    settings = me?.settings ?: it.settings,
                    showOnline = me?.profile?.showOnlineStatus ?: true,
                    showLastActive = me?.profile?.showLastActive ?: true,
                    publicProfile = me?.profile?.profileIsPublic ?: true,
                    message = if (me == null) "Could not load your settings" else null,
                )
            }
        }
    }

    private fun fail(code: Int?) = _state.update {
        it.copy(message = if (code == 404) "Server update needed for this setting" else "Could not save (${code ?: "network"})")
    }

    fun notif(req: UpdateSettingsRequest, apply: (SettingsDto) -> SettingsDto) {
        val old = _state.value.settings
        _state.update { it.copy(settings = apply(old), message = null) }
        viewModelScope.launch {
            val r = runCatching { api.updateSettings(req) }.getOrNull()
            if (r == null || !r.isSuccessful) { _state.update { it.copy(settings = old) }; fail(r?.code()) }
        }
    }

    fun privacy(req: UpdateProfileRequest, apply: (SettingsState) -> SettingsState) {
        val old = _state.value
        _state.update { apply(it).copy(message = null) }
        viewModelScope.launch {
            val r = runCatching { api.updateProfile(req) }.getOrNull()
            if (r == null || !r.isSuccessful) { _state.value = old; fail(r?.code()) }
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            val r = runCatching { api.deleteMe() }.getOrNull()
            if (r != null && r.isSuccessful) { auth.logout(); repo.clearCache(); _state.update { it.copy(loggedOut = true) } }
            else fail(r?.code())
        }
    }

    fun logout() {
        viewModelScope.launch { auth.logout(); repo.clearCache(); _state.update { it.copy(loggedOut = true) } }
    }
}

@Composable
fun SettingsScreen(onBack: () -> Unit, onLoggedOut: () -> Unit, onOpenConnections: (String) -> Unit = {}, onOpenBlocked: () -> Unit = {}, viewModel: SettingsViewModel = hiltViewModel()) {
    val st by viewModel.state.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf(false) }
    LaunchedEffect(st.loggedOut) { if (st.loggedOut) onLoggedOut() }
    val s = st.settings

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.delete_account)) },
            text = { Text(stringResource(R.string.delete_confirm)) },
            confirmButton = { TextButton(onClick = { confirmDelete = false; viewModel.deleteAccount() }) { Text(stringResource(R.string.delete), color = XCoral) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }

    Column(Modifier.fillMaxSize().background(XBg)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(stringResource(R.string.settings), fontWeight = FontWeight.Bold, fontSize = 22.sp)
            st.message?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
            Section(stringResource(R.string.notif_settings))
            Toggle(stringResource(R.string.n_msgs), s.notifyMessages) { v -> viewModel.notif(UpdateSettingsRequest(notifyMessages = v)) { it.copy(notifyMessages = v) } }
            Toggle(stringResource(R.string.n_followers), s.notifyFollowers) { v -> viewModel.notif(UpdateSettingsRequest(notifyFollowers = v)) { it.copy(notifyFollowers = v) } }
            Toggle(stringResource(R.string.n_likes), s.notifyLikes) { v -> viewModel.notif(UpdateSettingsRequest(notifyLikes = v)) { it.copy(notifyLikes = v) } }
            Toggle(stringResource(R.string.n_comments), s.notifyComments) { v -> viewModel.notif(UpdateSettingsRequest(notifyComments = v)) { it.copy(notifyComments = v) } }
            Toggle(stringResource(R.string.n_rooms), s.notifyRoomInvitations) { v -> viewModel.notif(UpdateSettingsRequest(notifyRoomInvitations = v)) { it.copy(notifyRoomInvitations = v) } }
            Toggle(stringResource(R.string.n_calls), s.notifyCalls) { v -> viewModel.notif(UpdateSettingsRequest(notifyCalls = v)) { it.copy(notifyCalls = v) } }
            Section(stringResource(R.string.privacy_settings))
            Toggle(stringResource(R.string.show_online), st.showOnline) { v -> viewModel.privacy(UpdateProfileRequest(showOnlineStatus = v)) { it.copy(showOnline = v) } }
            Toggle(stringResource(R.string.show_last_active), st.showLastActive) { v -> viewModel.privacy(UpdateProfileRequest(showLastActive = v)) { it.copy(showLastActive = v) } }
            Toggle(stringResource(R.string.public_profile), st.publicProfile) { v -> viewModel.privacy(UpdateProfileRequest(profileIsPublic = v)) { it.copy(publicProfile = v) } }
            Section("My people")
            OutlinedButton(onClick = { onOpenConnections("followers") }, modifier = Modifier.fillMaxWidth()) { Text("My followers") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onOpenBlocked, modifier = Modifier.fillMaxWidth()) { Text("Blocked users") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { onOpenConnections("following") }, modifier = Modifier.fillMaxWidth()) { Text("People I follow") }
            Section("Colours")
            val ctxT = androidx.compose.ui.platform.LocalContext.current
            androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                items(com.xtalk.app.core.designsystem.XPalettes.size) { i ->
                    val pal = com.xtalk.app.core.designsystem.XPalettes[i]
                    val sel = pal.id == com.xtalk.app.core.designsystem.ThemeState.current.id
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { com.xtalk.app.core.designsystem.ThemeState.select(ctxT, pal) }) {
                        Box(Modifier.size(52.dp).clip(androidx.compose.foundation.shape.CircleShape)
                            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(pal.primary, pal.room)))
                            .then(if (sel) Modifier.border(3.dp, androidx.compose.ui.graphics.Color.White, androidx.compose.foundation.shape.CircleShape) else Modifier))
                        Text(pal.name, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
            Section(stringResource(R.string.account_settings))
            OutlinedButton(onClick = viewModel::logout, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.logout)) }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.delete_account), color = XCoral)
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(12.dp)) { Text(stringResource(R.string.back)) }
    }
}

@Composable
private fun Section(title: String) {
    Spacer(Modifier.height(18.dp))
    Text(title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
}

@Composable
private fun Toggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
