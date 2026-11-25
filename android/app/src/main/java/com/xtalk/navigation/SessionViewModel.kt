package com.xtalk.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.TokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

sealed interface SessionState {
    data object Loading : SessionState
    data object LoggedOut : SessionState
    data object LoggedIn : SessionState
}

@HiltViewModel
class SessionViewModel @Inject constructor(tokenStore: TokenStore) : ViewModel() {
    val state: StateFlow<SessionState> =
        combine(tokenStore.session, tokenStore.onboardingDone) { session, _ ->
            if (session == null) SessionState.LoggedOut else SessionState.LoggedIn
        }.stateIn(viewModelScope, SharingStarted.Eagerly, SessionState.Loading)
}
