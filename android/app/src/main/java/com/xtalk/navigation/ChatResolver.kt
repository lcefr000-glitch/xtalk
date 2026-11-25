package com.xtalk.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.ChatApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChatResolverViewModel @Inject constructor(private val api: ChatApi) : ViewModel() {
    var conversationId by mutableStateOf<String?>(null)
    var failed by mutableStateOf(false)

    fun resolve(userId: String) {
        viewModelScope.launch {
            try {
                val res = api.create(mapOf("userId" to userId))
                if (res.isSuccessful) conversationId = res.body()?.id else failed = true
            } catch (_: Exception) {
                failed = true
            }
        }
    }
}

/** Resolves a 1:1 conversation for a user id, then routes to the chat screen. */
@Composable
fun ChatWithUserResolver(
    userId: String,
    onResolved: (conversationId: String) -> Unit,
    onFailed: () -> Unit,
    viewModel: ChatResolverViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    LaunchedEffect(userId) { viewModel.resolve(userId) }
    LaunchedEffect(viewModel.conversationId, viewModel.failed) {
        viewModel.conversationId?.let(onResolved)
        if (viewModel.failed) onFailed()
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (viewModel.failed) Text("Could not open the conversation") else CircularProgressIndicator()
    }
}
