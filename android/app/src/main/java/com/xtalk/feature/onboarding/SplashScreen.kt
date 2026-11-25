package com.xtalk.app.feature.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.unit.dp
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XTalkLogo
import com.xtalk.app.core.designsystem.XTalkWordmark
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.navigation.SessionState
import com.xtalk.app.navigation.SessionViewModel

@Composable
fun SplashScreen(
    onLoggedOut: () -> Unit,
    onLoggedIn: () -> Unit,
    viewModel: SessionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state) {
        when (state) {
            SessionState.LoggedOut -> onLoggedOut()
            SessionState.LoggedIn -> onLoggedIn()
            SessionState.Loading -> Unit
        }
    }
    Column(
        Modifier.fillMaxSize().background(XBg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        XTalkLogo(size = 140.dp)
        Spacer(Modifier.height(20.dp))
        XTalkWordmark(38)
    }
}
