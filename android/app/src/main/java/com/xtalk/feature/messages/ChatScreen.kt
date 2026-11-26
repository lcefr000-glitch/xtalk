package com.xtalk.app.feature.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private fun hhmm(iso: String): String = try {
    java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
} catch (e: Exception) { "" }

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var input by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    var menuFor by rememberSaveable { mutableStateOf<String?>(null) }
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
    LaunchedEffect(state.editing) { state.editing?.let { input = it.body.orEmpty() } }

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.size - 1)
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        if (state.loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(state = listState, modifier = Modifier.weight(1f)) {
                items(state.messages, key = { it.id }) { msg ->
                    val mine = msg.senderId == state.myUserId
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                    ) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = if (mine) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant,
                            ),
                            modifier = Modifier.widthIn(max = 300.dp).combinedClickable(onClick = {}, onLongClick = { menuFor = msg.id }),
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                msg.replyToId?.let { rid ->
                                    val q = state.messages.firstOrNull { it.id == rid }
                                    Text("\u21A9 " + (q?.body ?: "original message").take(80), style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2,
                                        modifier = Modifier.padding(bottom = 4.dp))
                                }
                                androidx.compose.material3.DropdownMenu(expanded = menuFor == msg.id, onDismissRequest = { menuFor = null }) {
                                    Row(Modifier.padding(horizontal = 8.dp)) {
                                        listOf("\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F").forEach { e ->
                                            Text(e, fontSize = 22.sp, modifier = Modifier.padding(6.dp).clickable { menuFor = null; viewModel.react(msg.id, e) })
                                        }
                                    }
                                    androidx.compose.material3.DropdownMenuItem(text = { Text("Reply") }, onClick = { menuFor = null; viewModel.startReply(msg) })
                                    androidx.compose.material3.DropdownMenuItem(text = { Text(androidx.compose.ui.res.stringResource(com.xtalk.app.R.string.n_star)) }, onClick = { menuFor = null; viewModel.star(msg.id) })
                                    androidx.compose.material3.DropdownMenuItem(text = { Text("Copy") }, onClick = { menuFor = null; clipboard.setText(androidx.compose.ui.text.AnnotatedString(msg.body.orEmpty())) })
                                    if (mine && msg.type == "TEXT") {
                                        androidx.compose.material3.DropdownMenuItem(text = { Text("Edit") }, onClick = { menuFor = null; viewModel.startEdit(msg) })
                                    }
                                    if (mine) {
                                        androidx.compose.material3.DropdownMenuItem(text = { Text("Delete") }, onClick = { menuFor = null; viewModel.delete(msg) })
                                    }
                                }
                                Text(msg.body.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                                state.translations[msg.id]?.let {
                                    Spacer(Modifier.padding(2.dp))
                                    Text(it, style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary)
                                }
                                state.reactions[msg.id]?.takeIf { it.isNotEmpty() }?.let { rs ->
                                    Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        rs.forEach { r ->
                                            Text(r.emoji + (if (r.count > 1) " ${r.count}" else ""), fontSize = 12.sp,
                                                modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(50))
                                                    .background(if (r.mine) MaterialTheme.colorScheme.primary.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surface.copy(alpha = 0.6f))
                                                    .clickable { viewModel.react(msg.id, r.emoji) }.padding(horizontal = 8.dp, vertical = 2.dp))
                                        }
                                    }
                                }
                                Text(hhmm(msg.createdAt) + (if (msg.editedAt != null) "  edited" else ""),
                                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (!mine && msg.type == "TEXT" && !msg.body.isNullOrBlank()) {
                                    TextButton(onClick = { viewModel.translate(msg.id, msg.body, "ar") }) {
                                        Text("Translate", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }
                }
                if (state.peerTyping) {
                    item {
                        Text("typing...", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(8.dp))
                    }
                }
            }
            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            (state.replyTo ?: state.editing)?.let { m ->
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text((if (state.editing != null) "Editing: " else "Replying: ") + m.body.orEmpty().take(60),
                        Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                    TextButton(onClick = { viewModel.cancelCompose(); input = "" }) { Text("Cancel") }
                }
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it; viewModel.onInputChanged() },
                    placeholder = { Text("Message") },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                )
                IconButton(
                    onClick = { viewModel.send(input); input = "" },
                    enabled = input.isNotBlank() && !state.sending,
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                }
            }
        }
    }
}
