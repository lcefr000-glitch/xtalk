package com.xtalk.app.feature.discover

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
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun DiscoverScreen(
    onOpenChat: (userId: String) -> Unit,
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Find partners", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = state.nativeFilter,
                onValueChange = { viewModel.onFiltersChanged(it, state.learningFilter) },
                label = { Text("Native in") }, singleLine = true,
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = state.learningFilter,
                onValueChange = { viewModel.onFiltersChanged(state.nativeFilter, it) },
                label = { Text("Learning") }, singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(8.dp))
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            state.results.isEmpty() -> Text(
                state.hint ?: "No partners found. Try different filters.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(32.dp),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.results, key = { it.id }) { user ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(user.profile?.displayName ?: user.username,
                                        style = MaterialTheme.typography.titleMedium)
                                    Text("@${user.username}" +
                                        (user.profile?.country?.let { " - $it" } ?: ""),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (user.isOnline == true) {
                                        Text("Online", style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                                if (user.id in state.followed) {
                                    OutlinedButton(onClick = { viewModel.toggleFollow(user.id) }) { Text("Following") }
                                } else {
                                    Button(onClick = { viewModel.toggleFollow(user.id) }) { Text("Follow") }
                                }
                            }
                            val langs = user.languages.joinToString {
                                "${it.languageCode}:${it.type.take(1)}"
                            }
                            if (langs.isNotBlank()) {
                                Spacer(Modifier.height(4.dp))
                                Text(langs, style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            user.profile?.bio?.takeIf { it.isNotBlank() }?.let {
                                Spacer(Modifier.height(4.dp))
                                Text(it, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                            }
                            Spacer(Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = { onOpenChat(user.id) },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Message") }
                        }
                    }
                }
            }
        }
    }
}
