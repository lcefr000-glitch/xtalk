package com.xtalk.app.feature.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XAvatar
import com.xtalk.app.core.network.DiscoveryApi
import com.xtalk.app.core.network.PartnerUserDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ConnectionsViewModel @Inject constructor(private val api: DiscoveryApi) : ViewModel() {
    suspend fun load(kind: String): Pair<List<PartnerUserDto>, String?> = try {
        val r = if (kind == "followers") api.myFollowers() else api.myFollowing()
        if (r.isSuccessful) (r.body()?.results.orEmpty() to null) else (emptyList<PartnerUserDto>() to "Could not load (HTTP ${r.code()})")
    } catch (e: Exception) { emptyList<PartnerUserDto>() to "Network error: ${e.message}" }
}

/** kind = "followers" or "following". */
@Composable
fun ConnectionsScreen(kind: String, onBack: () -> Unit, onOpenUser: (String) -> Unit, vm: ConnectionsViewModel = hiltViewModel()) {
    var loading by remember { mutableStateOf(true) }
    var items by remember { mutableStateOf<List<PartnerUserDto>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(kind) { val (l, e) = vm.load(kind); items = l; err = e; loading = false }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text(if (kind == "followers") "My followers" else "Following", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.padding(4.dp))
        when {
            loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(24.dp))
            err != null -> Text(err!!, color = MaterialTheme.colorScheme.error)
            items.isEmpty() -> Text("Nobody here yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn(Modifier.weight(1f)) {
                items(items, key = { it.id }) { u ->
                    Row(Modifier.fillMaxWidth().clickable { onOpenUser(u.id) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        XAvatar(u.profile?.displayName ?: u.username, 44.dp, photoUrl = u.profile?.photoUrl)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(u.profile?.displayName ?: u.username, style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.width(6.dp))
                                com.xtalk.app.feature.common.VipTag(u.id)
                            }
                            Text("@" + u.username, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Back") }
    }
}
