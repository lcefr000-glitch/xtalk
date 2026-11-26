package com.xtalk.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.common.Validators
import com.xtalk.app.core.network.RegisterRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val loggedIn: Boolean = false,
    val registeredEmail: String? = null,
    val devVerificationToken: String? = null,
    val emailVerified: Boolean = false,
    val resent: Boolean = false,
    val status: String? = null,
    val googleToken: String? = null,
    val googleNeedsProfile: Boolean = false,
    val googleName: String = "",
    val googleSuggested: String = "",
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun login(email: String, password: String) {
        if (!Validators.isValidEmail(email)) {
            _state.update { it.copy(error = "Enter a valid email address") }
            return
        }
        if (password.isBlank()) {
            _state.update { it.copy(error = "Enter your password") }
            return
        }
        submit { repository.login(email, password) }
    }

    fun register(email: String, username: String, password: String, displayName: String, dateOfBirth: String) {
        when {
            !Validators.isValidEmail(email) ->
                return _state.update { it.copy(error = "Enter a valid email address") }
            !Validators.isValidUsername(username) ->
                return _state.update { it.copy(error = "Username: 3-20 lowercase letters, digits or _") }
            !Validators.isValidPassword(password) ->
                return _state.update { it.copy(error = "Password: 8+ chars with a letter and a digit") }
            displayName.isBlank() ->
                return _state.update { it.copy(error = "Enter your display name") }
            Validators.parseDateOfBirth(dateOfBirth) == null ->
                return _state.update { it.copy(error = "Date of birth must be YYYY-MM-DD") }
            !Validators.isOldEnough(Validators.parseDateOfBirth(dateOfBirth)!!) ->
                return _state.update { it.copy(error = "You must be at least 13 years old") }
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val res = repository.register(
                RegisterRequest(
                    email = email.trim().lowercase(),
                    username = username.trim().lowercase(),
                    password = password,
                    displayName = displayName.trim(),
                    dateOfBirth = dateOfBirth.trim(),
                ),
            )) {
                is ApiResult.Success -> _state.update {
                    it.copy(
                        loading = false,
                        registeredEmail = email.trim().lowercase(),
                        devVerificationToken = res.data.devVerificationToken,
                    )
                }
                is ApiResult.Error -> _state.update { it.copy(loading = false, error = res.message) }
            }
        }
    }

    fun verifyEmail(token: String) {
        if (token.isBlank()) return _state.update { it.copy(error = "Enter the verification code") }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val res = repository.verifyEmail(token)) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, emailVerified = true) }
                is ApiResult.Error -> _state.update { it.copy(loading = false, error = res.message) }
            }
        }
    }

    fun resendVerification() {
        val email = _state.value.registeredEmail ?: return
        viewModelScope.launch {
            when (repository.resendVerification(email)) {
                is ApiResult.Success -> _state.update { it.copy(resent = true) }
                is ApiResult.Error -> _state.update { it.copy(error = it.error) } // keep quiet on resend errors (anti-enumeration)
            }
        }
    }

    fun googleStatus(msg: String) = _state.update { it.copy(loading = true, error = null, status = msg) }

    fun googleError(msg: String) = _state.update { it.copy(loading = false, status = null, error = msg) }

    fun googleSignIn(idToken: String, dob: String? = null, username: String? = null) {
        if (dob != null) {
            val parsed = Validators.parseDateOfBirth(dob)
            if (parsed == null) return _state.update { it.copy(error = "Date of birth must be YYYY-MM-DD") }
            if (!Validators.isOldEnough(parsed)) return _state.update { it.copy(error = "You must be at least 13 years old") }
            if (username == null || !Validators.isValidUsername(username)) return _state.update { it.copy(error = "Username: 3-20 lowercase letters, digits or _") }
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val res0 = try { repository.google(idToken, dob?.trim(), username?.trim()?.lowercase()) } catch (e: Throwable) {
                _state.update { it.copy(loading = false, status = null, error = "Server reply could not be processed: " + e.javaClass.name + ": " + (e.message ?: "")) }
                return@launch
            }
            when (val res = res0) {
                is ApiResult.Success ->
                    if (res.data.needsProfile) _state.update {
                        it.copy(loading = false, status = "4/4 New account: finish the details", googleToken = idToken, googleNeedsProfile = true,
                            googleName = res.data.name.orEmpty(), googleSuggested = res.data.suggestedUsername.orEmpty())
                    } else _state.update { it.copy(loading = false, status = null, loggedIn = true, googleNeedsProfile = false) }
                is ApiResult.Error -> _state.update { it.copy(loading = false, status = null, error = "Server (auth/google) said: " + res.message + (res.code?.let { " [HTTP $it]" } ?: "")) }
            }
        }
    }

    fun cancelGoogleProfile() = _state.update { it.copy(googleNeedsProfile = false, googleToken = null) }

    fun consumeError() = _state.update { it.copy(error = null) }

    private fun submit(block: suspend () -> ApiResult<com.xtalk.app.core.network.AuthResponse>) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val res = block()) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, loggedIn = true) }
                is ApiResult.Error -> _state.update { it.copy(loading = false, error = res.message) }
            }
        }
    }
}
