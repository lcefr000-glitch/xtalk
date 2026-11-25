package com.xtalk.app.feature.onboarding

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun LanguageSelectionScreen(
    onContinue: () -> Unit,
    viewModel: LanguageSelectionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    androidx.compose.runtime.LaunchedEffect(state.saved) { if (state.saved) onContinue() }

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Your languages", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(4.dp))
        Text("Pick your native language and the languages you want to learn.",
            style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.search, onValueChange = viewModel::onSearch,
            label = { Text("Search languages") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        if (state.loading) {
            CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(24.dp))
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(state.languages, key = { it.code }) { lang ->
                    val isNative = state.nativeCode == lang.code
                    val isLearning = state.learningCodes.contains(lang.code)
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(lang.name, style = MaterialTheme.typography.titleSmall)
                            Text(lang.nativeName, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        FilterChip(
                            selected = isNative,
                            onClick = { viewModel.setNative(lang.code) },
                            label = { Text("Native") },
                        )
                        Spacer(Modifier.padding(horizontal = 4.dp))
                        FilterChip(
                            selected = isLearning,
                            onClick = { viewModel.toggleLearning(lang.code) },
                            label = { Text("Learning") },
                        )
                    }
                }
            }
        }
        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = viewModel::save,
            enabled = !state.saving && state.nativeCode != null && state.learningCodes.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.saving) CircularProgressIndicator(modifier = Modifier.height(20.dp))
            else Text("Continue")
        }
    }
}
