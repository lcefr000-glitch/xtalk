package com.xtalk.app.feature.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.DiscoveryApi
import com.xtalk.app.core.network.PartnerUserDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DiscoverState(
    val loading: Boolean = true,
    val results: List<PartnerUserDto> = emptyList(),
    val followed: Set<String> = emptySet(),
    val nativeFilter: String = "",
    val learningFilter: String = "",
    val error: String? = null,
    val hint: String? = null,
    val mode: Mode = Mode.RECOMMENDED,
)

enum class Mode { RECOMMENDED, SEARCH }

@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val api: DiscoveryApi,
) : ViewModel() {

    private val _state = MutableStateFlow(DiscoverState())
    val state: StateFlow<DiscoverState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init { loadRecommendations() }

    fun loadRecommendations() {
        _state.update { it.copy(loading = true, mode = Mode.RECOMMENDED) }
        viewModelScope.launch {
            try {
                val res = api.recommendations()
                if (res.isSuccessful) {
                    _state.update { it.copy(loading = false, results = res.body()?.results.orEmpty(), hint = res.body()?.hint) }
                } else fail(res.code())
            } catch (e: Exception) { fail(e.message) }
        }
    }

    fun onFiltersChanged(native: String, learning: String) {
        _state.update { it.copy(nativeFilter = native, learningFilter = learning) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(400)
            if (native.isBlank() && learning.isBlank()) loadRecommendations() else search()
        }
    }

    private suspend fun search() {
        _state.update { it.copy(loading = true, mode = Mode.SEARCH) }
        try {
            val s = _state.value
            val res = api.search(
                native = s.nativeFilter.ifBlank { null },
                learning = s.learningFilter.ifBlank { null },
            )
            if (res.isSuccessful) {
                _state.update { it.copy(loading = false, results = res.body()?.results.orEmpty(), hint = null) }
            } else fail(res.code())
        } catch (e: Exception) { fail(e.message) }
    }

    fun toggleFollow(userId: String) {
        val isFollowing = userId in _state.value.followed
        viewModelScope.launch {
            try {
                val res = if (isFollowing) api.unfollow(userId) else api.follow(userId)
                if (res.isSuccessful) {
                    _state.update {
                        it.copy(followed = if (isFollowing) it.followed - userId else it.followed + userId)
                    }
                }
            } catch (_: Exception) { /* keep UI state on network error */ }
        }
    }

    private fun fail(detail: Any?) =
        _state.update { it.copy(loading = false, error = "Could not load partners ($detail)") }
}
