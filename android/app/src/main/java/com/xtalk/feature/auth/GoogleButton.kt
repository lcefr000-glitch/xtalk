package com.xtalk.app.feature.auth

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.xtalk.app.BuildConfig
import kotlinx.coroutines.launch

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) { if (c is Activity) return c; c = c.baseContext }
    return null
}

/** "Continue with Google" + the one-time birth date / username step for new accounts. */
@Composable
fun GoogleSignInSection(viewModel: AuthViewModel, state: AuthUiState) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var dob by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }

    Spacer(Modifier.height(8.dp))
    OutlinedButton(
        onClick = {
            val activity = ctx.findActivity()
            if (activity == null) { viewModel.googleError("Could not find the Activity for Google sign-in"); return@OutlinedButton }
            if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isBlank()) {
                viewModel.googleError("Google sign-in is not set up in this build")
                return@OutlinedButton
            }
            scope.launch {
                viewModel.googleStatus("1/4 Opening Google account sheet...")
                try {
                    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
                    val req = GetCredentialRequest.Builder().addCredentialOption(option).build()
                    val result = CredentialManager.create(activity).getCredential(activity, req)
                    viewModel.googleStatus("2/4 Account chosen, reading token...")
                    val cred = result.credential
                    if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                        val token = GoogleIdTokenCredential.createFrom(cred.data).idToken
                        viewModel.googleStatus("3/4 Token OK (" + token.length + " chars), contacting server...")
                        viewModel.googleSignIn(token)
                    } else viewModel.googleError("Google returned an unexpected credential: " + cred.javaClass.simpleName + " / " + cred.type)
                } catch (e: androidx.credentials.exceptions.GetCredentialCancellationException) {
                    viewModel.googleError("Google sheet closed or cancelled (" + e.javaClass.simpleName + ": " + (e.message ?: "no message") + "). If you did pick an account, the Android OAuth client (package/SHA-1) is probably not matching.")
                } catch (e: Throwable) {
                    viewModel.googleError("Google sign-in failed at step: " + e.javaClass.name + ": " + (e.message ?: "no message"))
                }
            }
        },
        enabled = !state.loading,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Continue with Google") }
    val legacyLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { r ->
        try {
            val acct = com.google.android.gms.auth.api.signin.GoogleSignIn.getSignedInAccountFromIntent(r.data)
                .getResult(com.google.android.gms.common.api.ApiException::class.java)
            val t = acct.idToken
            if (t.isNullOrBlank()) viewModel.googleError("Alternative Google sign-in returned no token")
            else { viewModel.googleStatus("3/4 (alt) Token OK, contacting server..."); viewModel.googleSignIn(t) }
        } catch (e: com.google.android.gms.common.api.ApiException) {
            viewModel.googleError("Alternative Google sign-in failed: status code " + e.statusCode + " (" +
                com.google.android.gms.common.api.CommonStatusCodes.getStatusCodeString(e.statusCode) + "). 10 = developer error (Android OAuth client package/SHA-1 wrong), 12500 = config/consent screen, 12501 = cancelled.")
        } catch (e: Throwable) {
            viewModel.googleError("Alternative Google sign-in failed: " + e.javaClass.name + ": " + (e.message ?: ""))
        }
    }
    OutlinedButton(
        onClick = {
            if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isBlank()) { viewModel.googleError("Google sign-in is not set up in this build"); return@OutlinedButton }
            val opts = com.google.android.gms.auth.api.signin.GoogleSignInOptions.Builder(com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID).requestEmail().build()
            val client = com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(ctx, opts)
            viewModel.googleStatus("1/4 (alt) Opening Google account sheet...")
            client.signOut().addOnCompleteListener { legacyLauncher.launch(client.signInIntent) }
        },
        enabled = !state.loading,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Continue with Google (alternative method)") }
    state.status?.let { Text(it, style = androidx.compose.material3.MaterialTheme.typography.bodySmall) }

    if (state.googleNeedsProfile && state.googleToken != null) {
        if (username.isBlank()) username = state.googleSuggested
        AlertDialog(
            onDismissRequest = { viewModel.cancelGoogleProfile() },
            title = { Text("Finish your account") },
            text = {
                Column {
                    Text("Add your birth date and pick a username.")
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(dob, { dob = it }, label = { Text("Date of birth (YYYY-MM-DD)") }, singleLine = true)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(username, { username = it.lowercase() }, label = { Text("Username") }, singleLine = true)
                    state.error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { TextButton(onClick = { viewModel.googleSignIn(state.googleToken, dob, username) }) { Text("Create account") } },
            dismissButton = { TextButton(onClick = { viewModel.cancelGoogleProfile() }) { Text("Cancel") } },
        )
    }
}
