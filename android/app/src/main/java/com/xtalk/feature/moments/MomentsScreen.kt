package com.xtalk.app.feature.moments

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun MomentsScreen(viewModel: MomentsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var composing by rememberSaveable { mutableStateOf(false) }
    var draft by rememberSaveable { mutableStateOf("") }

    if (composing) {
        AlertDialog(
            onDismissRequest = { composing = false },
            title = { Text("New moment") },
            text = {
                OutlinedTextField(
                    value = draft, onValueChange = { draft = it },
                    placeholder = { Text("Share something, ask a question...") },
                    minLines = 3,
                )
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.publish(draft, null); draft = ""; composing = false },
                    enabled = draft.isNotBlank() && !state.publishing,
                ) { Text("Publish") }
            },
            dismissButton = { TextButton(onClick = { composing = false }) { Text("Cancel") } },
        )
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Moments", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            Button(onClick = { composing = true }) { Text("Post") }
        }
        Spacer(Modifier.height(8.dp))
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            state.posts.isEmpty() -> Text(
                "No moments yet. Be the first to post.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(32.dp),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.posts, key = { it.id }) { post ->
                    var commentDraft by rememberSaveable(post.id) { mutableStateOf("") }
                    var showComment by rememberSaveable(post.id) { mutableStateOf(false) }
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(post.author.profile?.displayName ?: post.author.username,
                                style = MaterialTheme.typography.titleSmall)
                            Text("@${post.author.username}", style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(6.dp))
                            Text(post.body, style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                TextButton(onClick = { viewModel.toggleLike(post) }) {
                                    Text(if (post.likedByMe) "Liked (${post.likeCount})" else "Like (${post.likeCount})")
                                }
                                TextButton(onClick = { showComment = !showComment }) {
                                    Text("Comments (${post.commentCount})")
                                }
                            }
                            if (showComment) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    OutlinedTextField(
                                        value = commentDraft,
                                        onValueChange = { commentDraft = it },
                                        placeholder = { Text("Write a comment") },
                                        modifier = Modifier.weight(1f),
                                        singleLine = true,
                                    )
                                    TextButton(
                                        onClick = {
                                            viewModel.comment(post.id, commentDraft) { }
                                            commentDraft = ""
                                        },
                                        enabled = commentDraft.isNotBlank(),
                                    ) { Text("Send") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
