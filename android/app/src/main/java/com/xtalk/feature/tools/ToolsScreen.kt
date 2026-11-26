package com.xtalk.app.feature.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.LanguageDto
import com.xtalk.app.core.network.ToolsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject

data class ToolsState(
    val languages: List<LanguageDto> = emptyList(),
    val busy: Boolean = false,
    val result: String? = null,
    val note: String? = null,
)

@HiltViewModel
class ToolsViewModel @Inject constructor(private val api: ToolsApi, private val authApi: AuthApi) : ViewModel() {
    private val _s = MutableStateFlow(ToolsState())
    val state: StateFlow<ToolsState> = _s.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { authApi.languages(null) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
                ?.let { l -> _s.update { it.copy(languages = l) } }
        }
    }

    private fun str(o: kotlinx.serialization.json.JsonObject?, k: String) = (o?.get(k) as? JsonPrimitive)?.takeIf { it.isString }?.content

    fun translate(text: String, target: String) {
        if (text.isBlank() || target.isBlank()) return
        _s.update { it.copy(busy = true, result = null, note = null) }
        viewModelScope.launch {
            val r = runCatching { api.translate(mapOf("text" to text.take(2000), "target" to target)) }.getOrNull()
            val t = if (r?.isSuccessful == true) str(r.body(), "translatedText") else null
            _s.update { it.copy(busy = false, result = t, note = if (t == null) "tr" else null) }
        }
    }

    fun check(text: String, lang: String) {
        if (text.isBlank()) return
        _s.update { it.copy(busy = true, result = null, note = null) }
        viewModelScope.launch {
            val body = mutableMapOf("text" to text.take(2000))
            if (lang.isNotBlank()) body["language"] = lang
            val r = runCatching { api.correct(body) }.getOrNull()
            val o = if (r?.isSuccessful == true) r.body() else null
            val corrected = str(o, "correctedText")
            val why = str(o, "explanation")
            _s.update { it.copy(busy = false, result = corrected?.let { c -> if (why.isNullOrBlank()) c else "$c\n\n$why" },
                note = if (corrected == null) "gr" else null) }
        }
    }
}

@Composable
fun ToolsScreen(onBack: () -> Unit, vm: ToolsViewModel = hiltViewModel()) {
    val st by vm.state.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(0) }
    var text by remember { mutableStateOf("") }
    var lang by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(XBg).padding(14.dp).verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_back)) }
            Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_lang_tools), style = MaterialTheme.typography.titleLarge)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = tab == 0, onClick = { tab = 0 }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_translate_btn)) })
            FilterChip(selected = tab == 1, onClick = { tab = 1 }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_check_grammar)) })
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(value = text, onValueChange = { text = it.take(2000) }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_text_label)) }, modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp))
        Spacer(Modifier.height(8.dp))
        com.xtalk.app.feature.common.LanguageField(
            label = if (tab == 0) androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_translate_to) else androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_lang_of_text), selectedCode = lang, languages = st.languages,
            onSelected = { lang = it }, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Button(onClick = { if (tab == 0) vm.translate(text, lang) else vm.check(text, lang) }, enabled = !st.busy && text.isNotBlank() && (tab == 1 || lang.isNotBlank())) {
            Text(if (tab == 0) androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_translate_btn) else androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_check_btn))
        }
        Spacer(Modifier.height(12.dp))
        if (st.busy) CircularProgressIndicator()
        st.result?.let { Text(it, Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XSurface).padding(14.dp)) }
        st.note?.let { Text(if (it == "tr") androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_tool_fail_tr) else androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_tool_fail_gr), color = MaterialTheme.colorScheme.error) }
    }
}
