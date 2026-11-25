package com.xtalk.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.network.MeResponse
import com.xtalk.app.core.network.TokenStore
import com.xtalk.app.core.network.UpdateProfileRequest
import com.xtalk.app.feature.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val loading: Boolean = true,
    val me: MeResponse? = null,
    val error: String? = null,
    val saving: Boolean = false,
    val saved: Boolean = false,
    val loggedOut: Boolean = false,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository,
    private val authRepository: AuthRepository,
    private val tokenStore: TokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val res = repository.me()) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, me = res.data) }
                is ApiResult.Error -> _state.update { it.copy(loading = false, error = res.message) }
            }
        }
    }

    fun saveBio(bio: String, country: String?) {
        _state.update { it.copy(saving = true, saved = false) }
        viewModelScope.launch {
            when (val res = repository.updateProfile(
                UpdateProfileRequest(
                    bio = bio.trim().ifBlank { null },
                    country = country?.trim()?.uppercase()?.ifBlank { null },
                ),
            )) {
                is ApiResult.Success -> {
                    _state.update { it.copy(saving = false, saved = true) }
                    refresh()
                }
                is ApiResult.Error -> _state.update { it.copy(saving = false, error = res.message) }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            repository.clearCache()
            _state.update { it.copy(loggedOut = true) }
        }
    }

    fun consumeSaved() = _state.update { it.copy(saved = false) }
}
