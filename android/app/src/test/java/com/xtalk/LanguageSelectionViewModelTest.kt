package com.xtalk

import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.LanguageDto
import com.xtalk.app.feature.onboarding.LanguageSelectionViewModel
import com.xtalk.app.feature.profile.ProfileRepository
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

class LanguageSelectionViewModelTest {

    @get:Rule val mainDispatcherRule = MainDispatcherRule()

    private val authApi = mockk<AuthApi>()
    private val profileRepository = mockk<ProfileRepository>()

    private val langs = listOf(
        LanguageDto("ar", "Arabic", "العربية", isRtl = true),
        LanguageDto("en", "English", "English"),
        LanguageDto("de", "German", "Deutsch"),
    )

    @Test fun `catalogue loads on init`() = runTest {
        coEvery { authApi.languages(any()) } returns Response.success(langs)
        val vm = LanguageSelectionViewModel(authApi, profileRepository)
        assertEquals(3, vm.state.value.languages.size)
    }

    @Test fun `native and learning picks are mutually exclusive`() = runTest {
        coEvery { authApi.languages(any()) } returns Response.success(langs)
        val vm = LanguageSelectionViewModel(authApi, profileRepository)
        vm.toggleLearning("en")
        vm.setNative("en") // moving en to native must drop it from learning
        assertEquals("en", vm.state.value.nativeCode)
        assertTrue(vm.state.value.learningCodes.isEmpty())
    }
}
