package com.xtalk.app.feature.premium

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
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
    val wallet: com.xtalk.app.core.network.WalletDto? = null,
    val msg: String? = null,
    val expiresAt: String? = null,
)

@HiltViewModel
class PremiumViewModel @Inject constructor(
    private val api: SubscriptionsApi,
    private val economy: com.xtalk.app.core.network.EconomyApi,
    private val vipCache: com.xtalk.app.feature.common.VipCache,
) : ViewModel() {
    private val _state = MutableStateFlow(PremiumState())
    val state: StateFlow<PremiumState> = _state.asStateFlow()

    fun reloadWallet() {
        viewModelScope.launch {
            runCatching { economy.me() }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.let { w -> _state.update { it.copy(wallet = w) } }
        }
    }

    fun testCoins() {
        viewModelScope.launch {
            val r = runCatching { economy.testGrant() }.getOrNull()
            if (r != null && r.isSuccessful) _state.update { it.copy(wallet = r.body(), msg = "Test coins added (no payment was made)") }
            else _state.update { it.copy(msg = "Test coins unavailable: server update needed, or you already have plenty") }
        }
    }

    fun activate(tier: String) {
        viewModelScope.launch {
            val r = runCatching { api.devActivate(com.xtalk.app.core.network.DevActivateRequest(tier)) }.getOrNull()
            if (r != null && r.isSuccessful) {
                vipCache.reset()
                _state.update { it.copy(plan = r.body()?.plan ?: "PREMIUM", expiresAt = r.body()?.expiresAt, msg = "VIP activated in TEST mode (no payment)") }
            } else _state.update { it.copy(msg = "Could not activate (HTTP ${r?.code() ?: "network"}): server update needed") }
        }
    }

    init {
        reloadWallet()
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

private data class Vip(val id: String, val title: String, val price: String, val note: String, val best: Boolean = false)
private data class Pack(val coins: Int, val price: String, val bonus: String = "")

// PLACEHOLDER prices: real prices and Google Play products are set when billing is connected.
private val VIPS = listOf(
    Vip("m1", "VIP 1 month", "$4.99", "Billed monthly"),
    Vip("m3", "VIP 3 months", "$11.99", "Save 20%"),
    Vip("y1", "VIP 1 year", "$39.99", "Save 33%", best = true),
    Vip("life", "VIP Lifetime", "$99.99", "Pay once, keep forever"),
)
private val PACKS = listOf(
    Pack(100, "$0.99"), Pack(550, "$4.99", "+10%"), Pack(1200, "$9.99", "+20%"),
    Pack(3000, "$24.99", "+25%"), Pack(6500, "$49.99", "+30%"), Pack(14000, "$99.99", "+40%"),
)
private val BENEFITS = listOf(
    "VIP badge next to your name" to true,
    "Unlimited translations and corrections" to false,
    "Create voice rooms with more speaker seats" to false,
    "Priority in Discover and search" to false,
    "No ads" to false,
    "Exclusive profile frames and colours" to false,
    "See who viewed your profile" to false,
)

@Composable
fun PremiumScreen(onBack: () -> Unit, viewModel: PremiumViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var msg by androidx.compose.runtime.remember { mutableStateOf<String?>(null) }
    var selected by androidx.compose.runtime.remember { mutableStateOf("y1") }
    val gold = com.xtalk.app.core.designsystem.XGold

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(gold).padding(20.dp)) {
            Column {
                Text("X TaIk VIP", fontWeight = FontWeight.Bold, fontSize = 26.sp, color = Color(0xFF3A2200))
                Text("Current plan: ${if (state.loading) "..." else state.plan}", color = Color(0xFF3A2200))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text("Choose your VIP", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.height(8.dp))
        VIPS.forEach { v ->
            val sel = v.id == selected
            Card(
                Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = v.id }
                    .then(if (sel) Modifier.border(2.dp, com.xtalk.app.core.designsystem.XAmber, RoundedCornerShape(14.dp)) else Modifier),
                shape = RoundedCornerShape(14.dp),
            ) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(v.title + if (v.best) "  - best value" else "", fontWeight = FontWeight.Bold)
                        Text(v.note, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(v.price, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = com.xtalk.app.core.designsystem.XAmber)
                }
            }
        }
        Button(
            onClick = { viewModel.activate(selected) },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) { Text("Activate " + (VIPS.first { it.id == selected }.title) + " (TEST mode, free)") }
        Text("Test mode: no real payment exists yet. Activating is free and only for trying the app.",
            fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))

        Spacer(Modifier.height(20.dp))
        Text("VIP benefits", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        BENEFITS.forEach { (t, live) ->
            Row(Modifier.padding(vertical = 4.dp)) {
                Text(if (live) "\u2713  " else "\u2022  ", color = com.xtalk.app.core.designsystem.XTeal)
                Text(t, Modifier.weight(1f))
                if (!live) Text("coming soon", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        Spacer(Modifier.height(20.dp))
        Text("Coins", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        val w = state.wallet
        Card(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            Column(Modifier.padding(14.dp)) {
                Text("Balance: ${w?.coins ?: 0} coins", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text("Level ${w?.level ?: 1}  -  spent ${w?.totalSpent ?: 0} / ${w?.nextLevelAt ?: 50} coins for the next level", fontSize = 12.sp)
                val span = ((w?.nextLevelAt ?: 50) - (w?.levelStartsAt ?: 0)).coerceAtLeast(1)
                androidx.compose.material3.LinearProgressIndicator(
                    progress = { (((w?.totalSpent ?: 0) - (w?.levelStartsAt ?: 0)).toFloat() / span).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                )
                OutlinedButton(onClick = { viewModel.testCoins() }, modifier = Modifier.padding(top = 8.dp)) { Text("Get free TEST coins") }
            }
        }
        Text("Spend coins on gifts in voice rooms (gift button at the bottom of the room). The more you spend, the higher your level.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(8.dp))
        PACKS.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { p ->
                    Card(Modifier.weight(1f).clickable { msg = "Buying coins with money is not enabled yet. Use Get free TEST coins above." }) {
                        Column(Modifier.padding(12.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${p.coins}", fontWeight = FontWeight.Bold, fontSize = 22.sp, color = com.xtalk.app.core.designsystem.XAmber)
                            Text("coins" + if (p.bonus.isNotEmpty()) "  ${p.bonus}" else "", fontSize = 12.sp)
                            Text(p.price, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
        (state.msg ?: msg)?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
