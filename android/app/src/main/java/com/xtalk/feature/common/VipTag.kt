package com.xtalk.app.feature.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.core.designsystem.XGold
import com.xtalk.app.core.network.SubscriptionsApi
import com.xtalk.app.core.network.VipLookupRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** Remembers which users are VIP; asks the server in small batches. Entries expire after 3 minutes. */
@Singleton
class VipCache @Inject constructor(private val api: SubscriptionsApi, private val economy: com.xtalk.app.core.network.EconomyApi) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _vip = MutableStateFlow<Set<String>>(emptySet())
    val vip: StateFlow<Set<String>> = _vip.asStateFlow()
    private val _lv = MutableStateFlow<Map<String, Int>>(emptyMap())
    val levels: StateFlow<Map<String, Int>> = _lv.asStateFlow()
    private val asked = HashMap<String, Long>()
    private val pending = LinkedHashSet<String>()
    private var flushing = false

    @Synchronized
    fun want(id: String) {
        val t = asked[id]
        if (t != null && System.currentTimeMillis() - t < 180_000) return
        pending.add(id)
        if (!flushing) {
            flushing = true
            scope.launch { delay(200); flush() }
        }
    }

    fun reset() { synchronized(this) { asked.clear() } }
    fun setLevel(id: String, level: Int) { _lv.update { it + (id to level) } }

    private suspend fun flush() {
        val batch: List<String> = synchronized(this) { val b = pending.take(100); pending.removeAll(b.toSet()); b }
        if (batch.isNotEmpty()) {
            val now = System.currentTimeMillis()
            try {
                val lr = economy.levels(VipLookupRequest(batch))
                val lm = lr.body()?.levels
                if (lr.isSuccessful && lm != null) _lv.update { it + lm }
            } catch (_: Exception) { }
            try {
                val r = api.vipLookup(VipLookupRequest(batch))
                val ids = r.body()?.vipIds
                if (r.isSuccessful && ids != null) {
                    synchronized(this) { batch.forEach { asked[it] = now } }
                    _vip.update { cur -> (cur - batch.toSet()) + ids }
                }
            } catch (_: Exception) { }
        }
        val more = synchronized(this) { if (pending.isEmpty()) { flushing = false; false } else true }
        if (more) flush()
    }
}

@HiltViewModel
class VipViewModel @Inject constructor(private val cache: VipCache) : ViewModel() {
    val vip: StateFlow<Set<String>> = cache.vip
    val levels: StateFlow<Map<String, Int>> = cache.levels
    fun want(id: String) = cache.want(id)
}

/** Small level chip ("Lv 3") plus a gold "VIP" tag when the user has an active VIP plan. */
@Composable
fun VipTag(userId: String?, modifier: Modifier = Modifier) {
    if (userId.isNullOrBlank()) return
    val vm: VipViewModel = hiltViewModel()
    LaunchedEffect(userId) { vm.want(userId) }
    val set by vm.vip.collectAsStateWithLifecycle()
    val lv by vm.levels.collectAsStateWithLifecycle()
    androidx.compose.foundation.layout.Row(modifier) {
        lv[userId]?.let { n ->
            Text(
                "Lv $n", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.sp,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color(0xFF2E7D6B)).padding(horizontal = 7.dp, vertical = 2.dp),
            )
        }
        if (userId in set) {
            androidx.compose.foundation.layout.Spacer(Modifier.padding(start = 4.dp))
            Text(
                "VIP", color = Color(0xFF3A2200), fontWeight = FontWeight.Bold, fontSize = 10.sp,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(XGold).padding(horizontal = 7.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
fun isVip(userId: String?): Boolean {
    if (userId.isNullOrBlank()) return false
    val vm: VipViewModel = hiltViewModel()
    LaunchedEffect(userId) { vm.want(userId) }
    val set by vm.vip.collectAsStateWithLifecycle()
    return userId in set
}
