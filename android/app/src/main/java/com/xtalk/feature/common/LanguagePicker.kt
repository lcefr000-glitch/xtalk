package com.xtalk.app.feature.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.xtalk.app.core.network.LanguageDto

/** Searchable list of ALL languages from the server catalogue (no hardcoded list). */
@Composable
fun LanguagePickerDialog(
    languages: List<LanguageDto>,
    onPick: (LanguageDto?) -> Unit,
    onDismiss: () -> Unit,
    allowClear: Boolean = true,
) {
    var q by remember { mutableStateOf("") }
    val shown = remember(q, languages) {
        val s = q.trim().lowercase()
        if (s.isEmpty()) languages
        else languages.filter { it.name.lowercase().contains(s) || it.nativeName.lowercase().contains(s) || it.code.lowercase() == s }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Language (${languages.size})") },
        text = {
            Column {
                OutlinedTextField(value = q, onValueChange = { q = it }, singleLine = true,
                    placeholder = { Text("Search") }, modifier = Modifier.fillMaxWidth())
                if (languages.isEmpty()) Text("Loading languages...", modifier = Modifier.padding(12.dp))
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(shown, key = { it.code }) { l ->
                        Row(Modifier.fillMaxWidth().clickable { onPick(l) }.padding(vertical = 10.dp)) {
                            Text(l.name, modifier = Modifier.padding(end = 8.dp))
                            Text(l.nativeName, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        },
        confirmButton = { if (allowClear) TextButton(onClick = { onPick(null) }) { Text("Any / clear") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Button-like field that shows the chosen language and opens the picker. */
@Composable
fun LanguageField(
    label: String,
    selectedCode: String,
    languages: List<LanguageDto>,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val name = languages.firstOrNull { it.code == selectedCode }?.name
    OutlinedButton(onClick = { open = true }, modifier = modifier) {
        Text(if (selectedCode.isBlank()) label else "$label: ${name ?: selectedCode}", maxLines = 1)
    }
    if (open) LanguagePickerDialog(languages, onPick = { onSelected(it?.code ?: ""); open = false }, onDismiss = { open = false })
}
