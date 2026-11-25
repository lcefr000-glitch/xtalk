package com.xtalk.app.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun EmailVerificationScreen(
    onVerified: () -> Unit,
    onSkip: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var token by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(state.devVerificationToken) {
        // Dev builds surface the token (no SMTP yet) - prefill for convenience.
        if (token.isBlank() && state.devVerificationToken != null) token = state.devVerificationToken!!
    }
    LaunchedEffect(state.emailVerified) { if (state.emailVerified) onVerified() }

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("Verify your email", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            "We sent a verification code to ${state.registeredEmail ?: "your email"}.",
            style = MaterialTheme.typography.bodyMedium,
        )
        state.devVerificationToken?.let {
            Spacer(Modifier.height(4.dp))
            Text(
                "Dev mode: the code was logged on the server and prefilled below.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(token, { token = it }, label = { Text("Verification code") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(24.dp))
        Button(onClick = { viewModel.verifyEmail(token) }, enabled = !state.loading,
            modifier = Modifier.fillMaxWidth()) {
            if (state.loading) CircularProgressIndicator(modifier = Modifier.height(20.dp)) else Text("Verify")
        }
        TextButton(onClick = { viewModel.resendVerification() }, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.resent) "Code sent again" else "Resend code")
        }
        TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
            Text("Skip for now")
        }
    }
}
