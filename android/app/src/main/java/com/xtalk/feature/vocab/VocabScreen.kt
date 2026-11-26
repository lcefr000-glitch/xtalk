package com.xtalk.app.feature.vocab

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.core.network.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VocabState(
    val loading: Boolean = true,
    val items: List<VocabItemDto> = emptyList(),
    val due: List<VocabItemDto> = emptyList(),
    val collections: List<VocabCollectionDto> = emptyList(),
    val stats: VocabStatsDto = VocabStatsDto(),
    val query: String = "",
    val collectionId: String? = null,
    val error: String? = null,
)

@HiltViewModel
class VocabViewModel @Inject constructor(private val api: VocabApi) : ViewModel() {
    private val _s = MutableStateFlow(VocabState())
    val state: StateFlow<VocabState> = _s.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            val st = _s.value
            val items = runCatching { api.items(st.query.ifBlank { null }, st.collectionId) }.getOrNull()
            val due = runCatching { api.due() }.getOrNull()?.takeIf { it.isSuccessful }?.body().orEmpty()
            val cols = runCatching { api.collections() }.getOrNull()?.takeIf { it.isSuccessful }?.body().orEmpty()
            val ls = runCatching { api.stats() }.getOrNull()?.takeIf { it.isSuccessful }?.body().orEmpty()
            val stats = VocabStatsDto(ls.sumOf { it.total }, ls.sumOf { it.due }, ls.sumOf { it.mastered })
            _s.update {
                it.copy(
                    loading = false, items = items?.takeIf { r -> r.isSuccessful }?.body()?.items ?: it.items, due = due,
                    collections = cols, stats = stats,
                    error = if (items?.isSuccessful == true) null else "Could not load (HTTP ${items?.code() ?: "network"}). The server may need the update.",
                )
            }
        }
    }

    fun search(q: String) { _s.update { it.copy(query = q) }; refresh() }
    fun pickCollection(id: String?) { _s.update { it.copy(collectionId = id) }; refresh() }

    fun add(text: String, translation: String, example: String, kind: String) {
        viewModelScope.launch {
            val r = runCatching {
                api.add(VocabItemRequest(kind = kind.uppercase(), term = text, translation = translation.ifBlank { null }, example = example.ifBlank { null }, collectionId = _s.value.collectionId))
            }.getOrNull()
            if (r?.isSuccessful != true) _s.update { it.copy(error = "Could not save (HTTP ${r?.code() ?: "network"})") }
            refresh()
        }
    }

    fun remove(id: String) { viewModelScope.launch { runCatching { api.remove(id) }; refresh() } }

    fun createCollection(name: String) { viewModelScope.launch { runCatching { api.createCollection(VocabCollectionRequest(name)) }; refresh() } }

    fun grade(id: String, grade: Int) { viewModelScope.launch { runCatching { api.review(id, VocabGradeRequest(intArrayOf(0, 3, 4, 5).getOrElse(grade) { 4 })) } } }
    fun finishReview() = refresh()
}

@Composable
fun VocabScreen(onBack: () -> Unit, vm: VocabViewModel = hiltViewModel()) {
    val st by vm.state.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(0) }
    var adding by remember { mutableStateOf(false) }
    var newCol by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(XBg).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_back)) }
            Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_vocabulary), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            if (tab == 0) TextButton(onClick = { adding = true }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_add)) }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(XSurface).padding(12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_saved) to st.stats.total, androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_due) to st.stats.due, androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_learned) to st.stats.learned).forEach { (l, v) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$v", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(l, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        TabRow(selectedTabIndex = tab, containerColor = XBg, modifier = Modifier.padding(top = 8.dp)) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_my_words)) })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_review_n, st.due.size)) })
        }
        st.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
        if (tab == 0) {
            OutlinedTextField(value = st.query, onValueChange = vm::search, singleLine = true, placeholder = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_search)) },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
            LazyRowChips(st, vm, onNew = { newCol = true })
            LazyColumn(Modifier.weight(1f)) {
                items(st.items, key = { it.id }) { it2 ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(it2.text, fontWeight = FontWeight.SemiBold)
                            it2.translation?.takeIf { t -> t.isNotBlank() }?.let { t -> Text(t, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            it2.example?.takeIf { t -> t.isNotBlank() }?.let { t -> Text(t, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_delete), color = MaterialTheme.colorScheme.error, fontSize = 12.sp, modifier = Modifier.clickable { vm.remove(it2.id) }.padding(8.dp))
                    }
                    HorizontalDivider()
                }
                if (st.items.isEmpty() && !st.loading) item { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_no_words), modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        } else {
            ReviewPane(st.due, vm)
        }
    }
    if (adding) AddDialog(onDismiss = { adding = false }, onSave = { t, tr, ex, k -> vm.add(t, tr, ex, k); adding = false })
    if (newCol) {
        var n by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { newCol = false }, title = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_new_collection)) },
            text = { OutlinedTextField(value = n, onValueChange = { n = it.take(60) }, singleLine = true) },
            confirmButton = { TextButton(onClick = { if (n.isNotBlank()) vm.createCollection(n); newCol = false }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_create)) } },
        )
    }
}

@Composable
private fun LazyRowChips(st: VocabState, vm: VocabViewModel, onNew: () -> Unit) {
    androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
        item { FilterChip(selected = st.collectionId == null, onClick = { vm.pickCollection(null) }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_all_items)) }) }
        items(st.collections, key = { it.id }) { c ->
            FilterChip(selected = st.collectionId == c.id, onClick = { vm.pickCollection(c.id) }, label = { Text("${c.name} (${c.count})") })
        }
        item { AssistChip(onClick = onNew, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_collection_add)) }) }
    }
}

@Composable
private fun ReviewPane(due: List<VocabItemDto>, vm: VocabViewModel) {
    var index by remember(due) { mutableStateOf(0) }
    var shown by remember(due) { mutableStateOf(false) }
    val card = due.getOrNull(index)
    if (card == null) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (due.isEmpty()) androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_nothing_due) else androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_session_done), fontSize = 18.sp)
            if (due.isNotEmpty()) TextButton(onClick = vm::finishReview) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_done)) }
        }
        return
    }
    Column(Modifier.fillMaxSize().padding(top = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("${index + 1} / ${due.size}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(
            Modifier.fillMaxWidth().padding(vertical = 16.dp).clip(RoundedCornerShape(20.dp)).background(XSurface).clickable { shown = true }.padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(card.text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            if (shown) {
                Spacer(Modifier.height(12.dp))
                Text(card.translation ?: card.definition ?: "(no translation saved)", fontSize = 18.sp, color = XViolet)
                card.example?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
            } else Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_tap_answer), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        }
        if (shown) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_again) to 0, androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_hard) to 1, androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_good) to 2, androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_easy) to 3).forEach { (l, g) ->
                OutlinedButton(onClick = { vm.grade(card.id, g); shown = false; index += 1 }) { Text(l, fontSize = 12.sp) }
            }
        }
    }
}

@Composable
private fun AddDialog(onDismiss: () -> Unit, onSave: (String, String, String, String) -> Unit) {
    var text by remember { mutableStateOf("") }
    var tr by remember { mutableStateOf("") }
    var ex by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("WORD") }
    AlertDialog(
        onDismissRequest = onDismiss, title = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_save_vocab)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("WORD" to androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_word), "EXPRESSION" to androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_phrase), "SENTENCE" to androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_sentence)).forEach { (k, l) ->
                        FilterChip(selected = kind == k, onClick = { kind = k }, label = { Text(l, fontSize = 12.sp) })
                    }
                }
                OutlinedTextField(value = text, onValueChange = { text = it.take(500) }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_text_label)) })
                OutlinedTextField(value = tr, onValueChange = { tr = it.take(500) }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_meaning)) })
                OutlinedTextField(value = ex, onValueChange = { ex = it.take(500) }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_example_opt)) })
            }
        },
        confirmButton = { TextButton(onClick = { if (text.isNotBlank()) onSave(text, tr, ex, kind) }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_cancel)) } },
    )
}
