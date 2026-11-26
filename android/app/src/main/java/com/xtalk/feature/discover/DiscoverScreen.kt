package com.xtalk.app.feature.discover

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.width
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
    onOpenUser: (userId: String) -> Unit = {},
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Find partners", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.query, onValueChange = { viewModel.onQueryChanged(it.take(30)) },
            label = { Text("Search by username or name") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            com.xtalk.app.feature.common.LanguageField(
                label = "Native in", selectedCode = state.nativeFilter, languages = state.languages,
                onSelected = { viewModel.onFiltersChanged(it, state.learningFilter) },
                modifier = Modifier.weight(1f),
            )
            com.xtalk.app.feature.common.LanguageField(
                label = "Learning", selectedCode = state.learningFilter, languages = state.languages,
                onSelected = { viewModel.onFiltersChanged(state.nativeFilter, it) },
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = state.country, onValueChange = { viewModel.onCountryChanged(it) },
                label = { Text("Country (e.g. EG)") }, singleLine = true, modifier = Modifier.weight(1f),
            )
            androidx.compose.material3.FilterChip(
                selected = state.onlineOnly, onClick = { viewModel.toggleOnline() }, label = { Text("Online now") },
            )
            androidx.compose.material3.FilterChip(
                selected = state.sortMatch, onClick = { viewModel.toggleMatch() }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_best_match)) },
            )
        }
        Spacer(Modifier.height(8.dp))
        val shown = if (state.onlineOnly) state.results.filter { it.isOnline == true } else state.results
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            shown.isEmpty() -> Text(
                state.hint ?: "No partners found. Try different filters.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(32.dp),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(shown, key = { it.id }) { user ->
                    Card(Modifier.fillMaxWidth().clickable { onOpenUser(user.id) }) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                com.xtalk.app.core.designsystem.XAvatar(
                                    user.profile?.displayName ?: user.username, 44.dp,
                                    photoUrl = user.profile?.photoUrl,
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text((user.profile?.displayName ?: user.username) +
                                        (com.xtalk.app.core.designsystem.flagEmoji(user.profile?.country)?.let { " $it" } ?: ""),
                                        style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f, fill = false))
                                    Spacer(Modifier.width(6.dp))
                                    com.xtalk.app.feature.common.VipTag(user.id)
                                    }
                                    Text("@${user.username}" +
                                        (user.profile?.country?.let { " - $it" } ?: ""),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (user.matchScore > 0) {
                                        Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_match_pct, user.matchScore), style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.tertiary)
                                    }
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
