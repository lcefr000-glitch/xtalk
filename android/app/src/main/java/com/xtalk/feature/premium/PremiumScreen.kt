package com.xtalk.app.feature.premium

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.core.network.SubscriptionsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PremiumState(
    val loading: Boolean = true,
    val plan: String = "FREE",
    val features: List<String> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class PremiumViewModel @Inject constructor(private val api: SubscriptionsApi) : ViewModel() {
    private val _state = MutableStateFlow(PremiumState())
    val state: StateFlow<PremiumState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val me = api.me()
                val ent = api.entitlements()
                if (me.isSuccessful && ent.isSuccessful) {
                    _state.update {
                        it.copy(
                            loading = false,
                            plan = me.body()?.plan ?: "FREE",
                            features = ent.body()?.features.orEmpty(),
                        )
                    }
                } else {
                    _state.update { it.copy(loading = false, error = "Could not load subscription") }
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun PremiumScreen(onBack: () -> Unit, viewModel: PremiumViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var attemptedUpgrade by androidx.compose.runtime.remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("X TaIk Premium", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))
        if (state.loading) {
            CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
        } else {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Current plan: ${state.plan}", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    state.features.forEach { Text("- ${it.replace('_', ' ')}", style = MaterialTheme.typography.bodyMedium) }
                }
            }
            Spacer(Modifier.height(16.dp))
            if (state.plan != "PREMIUM") {
                Button(onClick = { attemptedUpgrade = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Upgrade to Premium")
                }
                if (attemptedUpgrade) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Google Play Billing is not connected in this build yet - purchases are never faked. Billing lands with the production phase.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
