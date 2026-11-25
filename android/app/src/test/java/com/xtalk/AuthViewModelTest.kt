package com.xtalk

import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.network.AuthResponse
import com.xtalk.app.core.network.UserDto
import com.xtalk.app.feature.auth.AuthRepository
import com.xtalk.app.feature.auth.AuthViewModel
import io.mockk.coEvery
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AuthViewModelTest {

    @get:Rule val mainDispatcherRule = MainDispatcherRule()

    private val repository = mockk<AuthRepository>()
    private val viewModel = AuthViewModel(repository)

    private val authResponse = AuthResponse(
        user = UserDto(id = "u1", email = "sara@example.com", username = "sara_dev", emailVerified = true),
        accessToken = "access",
        accessTokenExpiresIn = 900,
        refreshToken = "refresh",
        refreshTokenExpiresAt = "2026-12-25T00:00:00.000Z",
    )

    @Test fun `login with invalid email surfaces a local error and never hits the network`() {
        viewModel.login("not-an-email", "passw0rd1")
        assertNotNull(viewModel.state.value.error)
    }

    @Test fun `successful login flips loggedIn`() {
        coEvery { repository.login(any(), any()) } returns ApiResult.Success(authResponse)
        viewModel.login("sara@example.com", "passw0rd1")
        assertTrue(viewModel.state.value.loggedIn)
        assertNull(viewModel.state.value.error)
    }

    @Test fun `backend error is shown to the user`() {
        coEvery { repository.login(any(), any()) } returns ApiResult.Error("Invalid credentials", 401)
        viewModel.login("sara@example.com", "passw0rd1")
        assertEquals("Invalid credentials", viewModel.state.value.error)
    }

    @Test fun `underage registration is blocked client-side`() {
        val thisYear = java.time.LocalDate.now().year
        viewModel.register("kid@example.com", "kid_user", "passw0rd1", "Kid", "$thisYear-01-01")
        assertEquals("You must be at least 13 years old", viewModel.state.value.error)
    }

    @Test fun `successful registration exposes the dev token and email`() {
        coEvery { repository.register(any()) } returns ApiResult.Success(authResponse.copy(devVerificationToken = "dev-token"))
        viewModel.register("sara@example.com", "sara_dev", "passw0rd1", "Sara", "2002-04-10")
        assertEquals("sara@example.com", viewModel.state.value.registeredEmail)
        assertEquals("dev-token", viewModel.state.value.devVerificationToken)
    }
}
