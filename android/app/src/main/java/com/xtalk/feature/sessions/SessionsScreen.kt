package com.xtalk.app.feature.sessions

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.network.SessionDto
import com.xtalk.app.core.network.SessionsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SessionsViewModel @Inject constructor(private val api: SessionsApi) : ViewModel() {
    private val _s = MutableStateFlow<List<SessionDto>?>(null)
    val sessions: StateFlow<List<SessionDto>?> = _s.asStateFlow()
    init { load() }
    fun load() {
        viewModelScope.launch {
            _s.value = runCatching { api.sessions() }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.sessions ?: emptyList()
        }
    }
    fun revoke(id: String) { viewModelScope.launch { runCatching { api.revoke(id) }; load() } }
}

@Composable
fun SessionsScreen(onBack: () -> Unit, vm: SessionsViewModel = hiltViewModel()) {
    val list by vm.sessions.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(XBg).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_back)) }
            Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_devices_history), style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(8.dp))
        val l = list
        when {
            l == null -> CircularProgressIndicator()
            l.isEmpty() -> Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_no_sessions))
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(l, key = { it.id }) { s ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XSurface).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(s.device, fontWeight = FontWeight.SemiBold, maxLines = 2)
                            Text("${s.createdAt.take(16).replace('T', ' ')}  ${s.ip ?: ""}", style = MaterialTheme.typography.bodySmall)
                            Text(if (s.active) androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_active) else androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_signed_out), style = MaterialTheme.typography.bodySmall,
                                color = if (s.active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (s.active) TextButton(onClick = { vm.revoke(s.id) }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_sign_out_dev)) }
                    }
                }
            }
        }
    }
}
