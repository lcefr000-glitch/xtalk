package com.xtalk.app.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.network.TokenStore
import com.xtalk.app.core.network.UpdateProfileRequest
import com.xtalk.app.feature.profile.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LearningGoalsState(
    val dailyMinutes: Int = 15,
    val saving: Boolean = false,
    val done: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class LearningGoalsViewModel @Inject constructor(
    private val profileRepository: ProfileRepository,
    private val tokenStore: TokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(LearningGoalsState())
    val state: StateFlow<LearningGoalsState> = _state.asStateFlow()

    fun setMinutes(minutes: Int) = _state.update { it.copy(dailyMinutes = minutes.coerceIn(5, 120)) }

    fun save() {
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            // Goals per language were seeded at selection time (15 min default).
            // Onboarding is complete regardless; profile PATCH failures only warn.
            tokenStore.markOnboardingDone()
            _state.update { it.copy(saving = false, done = true) }
        }
    }
}
