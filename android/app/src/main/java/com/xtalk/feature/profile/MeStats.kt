package com.xtalk.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.DiscoveryApi
import com.xtalk.app.core.network.EconomyApi
import com.xtalk.app.core.network.WalletDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MeStats(val followers: Int? = null, val following: Int? = null, val wallet: WalletDto? = null)

@HiltViewModel
class MeStatsViewModel @Inject constructor(
    private val discovery: DiscoveryApi,
    private val economy: EconomyApi,
) : ViewModel() {
    private val _s = MutableStateFlow(MeStats())
    val stats: StateFlow<MeStats> = _s.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val f = runCatching { discovery.myFollowers(1) }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.total
            val g = runCatching { discovery.myFollowing(1) }.getOrNull()?.takeIf { it.isSuccessful }?.body()?.total
            val w = runCatching { economy.me() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            _s.value = MeStats(f, g, w)
        }
    }
}

/** Profile completion in percent, from what the user has actually filled in. */
fun profileCompletion(hasPhoto: Boolean, hasName: Boolean, hasBio: Boolean, hasCountry: Boolean, interests: Int, languages: Int): Int {
    var p = 0
    if (hasName) p += 15
    if (hasPhoto) p += 20
    if (hasBio) p += 20
    if (hasCountry) p += 10
    if (interests >= 1) p += 15
    if (languages >= 2) p += 20
    return p
}
