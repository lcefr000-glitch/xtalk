package com.xtalk.app.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.common.ApiResult
import com.xtalk.app.core.network.AddUserLanguageRequest
import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.LanguageDto
import com.xtalk.app.feature.profile.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LanguageSelectionState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val saved: Boolean = false,
    val search: String = "",
    val languages: List<LanguageDto> = emptyList(),
    val nativeCode: String? = null,
    val learningCodes: Set<String> = emptySet(),
    val error: String? = null,
)

@HiltViewModel
class LanguageSelectionViewModel @Inject constructor(
    private val authApi: AuthApi, // catalogue is public
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LanguageSelectionState())
    val state: StateFlow<LanguageSelectionState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init { load(null) }

    fun onSearch(query: String) {
        _state.update { it.copy(search = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300) // debounce
            load(query.ifBlank { null })
        }
    }

    private fun load(search: String?) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            try {
                val response = authApi.languages(search)
                if (response.isSuccessful) {
                    _state.update { it.copy(loading = false, languages = response.body().orEmpty()) }
                } else {
                    _state.update { it.copy(loading = false, error = "Could not load languages (HTTP ${response.code()})") }
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "Network error: ${e.message}") }
            }
        }
    }

    fun setNative(code: String) {
        _state.update { it.copy(nativeCode = code, learningCodes = it.learningCodes - code) }
    }

    fun toggleLearning(code: String) {
        _state.update {
            if (code == it.nativeCode) it
            else it.copy(
                learningCodes = if (code in it.learningCodes) it.learningCodes - code else it.learningCodes + code,
            )
        }
    }

    fun save() {
        val s = _state.value
        val native = s.nativeCode ?: return
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            val nativeRes = profileRepository.addLanguage(
                AddUserLanguageRequest(code = native, type = "NATIVE", proficiency = "NATIVE"),
            )
            if (nativeRes is ApiResult.Error) {
                _state.update { it.copy(saving = false, error = nativeRes.message) }
                return@launch
            }
            for (code in s.learningCodes) {
                val res = profileRepository.addLanguage(
                    AddUserLanguageRequest(code = code, type = "LEARNING", proficiency = "BEGINNER", dailyMinutes = 15),
                )
                if (res is ApiResult.Error) {
                    _state.update { it.copy(saving = false, error = res.message) }
                    return@launch
                }
            }
            _state.update { it.copy(saving = false, saved = true) }
        }
    }
}
