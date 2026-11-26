package com.xtalk.app.feature.moments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
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
            dismissButton = { TextButton(onClick = { composing = false }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_cancel)) } },
        )
    }

    Column(Modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxWidth().background(com.xtalk.app.core.designsystem.XPurpleBanner)
                .padding(horizontal = 16.dp, vertical = 18.dp),
        ) {
            Column {
                Text("Moments", fontWeight = FontWeight.Bold, fontSize = 26.sp, color = Color.White)
                Text("Share what you are learning with people around the world", fontSize = 12.sp, color = Color.White.copy(alpha = 0.8f))
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(28.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant).clickable { composing = true }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("What's on your mind?", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Post", color = com.xtalk.app.core.designsystem.XViolet, fontWeight = FontWeight.Bold)
        }
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            state.posts.isEmpty() -> Text(
                "No moments yet. Be the first to post.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(32.dp),
            )
            else -> LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 12.dp, end = 12.dp, bottom = 16.dp),
            ) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.FilterChip(selected = state.savedOnly, onClick = { viewModel.toggleSaved() }, label = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_saved_posts)) })
                        OutlinedTextField(
                            value = state.tag, onValueChange = { viewModel.setTag(it) },
                            placeholder = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_hashtag)) }, singleLine = true, modifier = Modifier.weight(1f),
                        )
                    }
                    state.note?.let { Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); androidx.compose.runtime.LaunchedEffect(it) { kotlinx.coroutines.delay(2000); viewModel.clearNote() } }
                }
                items(state.posts, key = { it.id }) { post ->
                    var editing by rememberSaveable(post.id) { mutableStateOf(false) }
                    var editText by rememberSaveable(post.id) { mutableStateOf(post.body) }
                    if (editing) {
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { editing = false }, title = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_edit_post)) },
                            text = { OutlinedTextField(value = editText, onValueChange = { editText = it.take(2000) }, modifier = Modifier.fillMaxWidth()) },
                            confirmButton = { TextButton(onClick = { viewModel.edit(post, editText); editing = false }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_save)) } },
                            dismissButton = { TextButton(onClick = { editing = false }) { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_cancel)) } },
                        )
                    }
                    var commentDraft by rememberSaveable(post.id) { mutableStateOf("") }
                    var showComment by rememberSaveable(post.id) { mutableStateOf(false) }
                    val name = post.author.profile?.displayName ?: post.author.username
                    Card(
                        Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(22.dp),
                        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                com.xtalk.app.core.designsystem.XAvatar(
                                    name, 42.dp, flag = com.xtalk.app.core.designsystem.flagEmoji(post.author.profile?.country),
                                    photoUrl = post.author.profile?.photoUrl,
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(name, fontWeight = FontWeight.Bold)
                                        Spacer(Modifier.width(6.dp))
                                        com.xtalk.app.feature.common.VipTag(post.author.id)
                                    }
                                    Text("@${post.author.username}  \u00B7  ${ago(post.createdAt)}", fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                post.languageCode?.let {
                                    Text(it.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                        color = com.xtalk.app.core.designsystem.XTeal,
                                        modifier = Modifier.clip(RoundedCornerShape(50)).background(com.xtalk.app.core.designsystem.XTeal.copy(alpha = 0.15f))
                                            .padding(horizontal = 10.dp, vertical = 4.dp))
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Text(post.body, fontSize = 16.sp, lineHeight = 22.sp)
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    (if (post.likedByMe) "\u2764 " else "\uD83E\uDD0D ") + post.likeCount,
                                    color = if (post.likedByMe) com.xtalk.app.core.designsystem.XCoral else MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { viewModel.toggleLike(post) }
                                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 8.dp),
                                )
                                Text(
                                    androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_post_save),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { viewModel.bookmark(post) }
                                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 8.dp),
                                )
                                if (post.author.id == state.myId) Text(
                                    androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_edit),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { editText = post.body; editing = true }
                                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 8.dp),
                                )
                                Text(
                                    "\uD83D\uDCAC ${post.commentCount}",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).clickable { showComment = !showComment }
                                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 8.dp),
                                )
                            }
                            if (showComment) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
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

private fun ago(iso: String): String = try {
    val mins = java.time.Duration.between(java.time.OffsetDateTime.parse(iso).toInstant(), java.time.Instant.now()).toMinutes()
    when {
        mins < 1 -> "now"
        mins < 60 -> "${mins}m"
        mins < 1440 -> "${mins / 60}h"
        else -> "${mins / 1440}d"
    }
} catch (e: Exception) { "" }
