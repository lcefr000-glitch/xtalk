package com.xtalk.app.feature.moments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.network.CreatePostRequest
import com.xtalk.app.core.network.FeedPostDto
import com.xtalk.app.core.network.MomentsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MomentsState(
    val loading: Boolean = true,
    val posts: List<FeedPostDto> = emptyList(),
    val publishing: Boolean = false,
    val myId: String = "",
    val savedOnly: Boolean = false,
    val tag: String = "",
    val note: String? = null,
    val error: String? = null,
)

@HiltViewModel
class MomentsViewModel @Inject constructor(
    private val api: MomentsApi,
    private val tokenStore: com.xtalk.app.core.network.TokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(MomentsState())
    val state: StateFlow<MomentsState> = _state.asStateFlow()

    init {
        viewModelScope.launch { _state.update { it.copy(myId = tokenStore.currentSession()?.userId.orEmpty()) } }
        refresh()
    }

    fun toggleSaved() { _state.update { it.copy(savedOnly = !it.savedOnly) }; refresh() }

    fun setTag(t: String) { _state.update { it.copy(tag = t.trim().removePrefix("#").filter { c -> c.isLetterOrDigit() || c == '_' }.take(40)) }; refresh() }

    fun bookmark(post: FeedPostDto) {
        viewModelScope.launch {
            val r = runCatching { api.bookmark(post.id) }.getOrNull()
            _state.update { it.copy(note = if (r?.isSuccessful == true) "Saved/unsaved" else "Could not save") }
            if (_state.value.savedOnly) refresh()
        }
    }

    fun edit(post: FeedPostDto, body: String) {
        if (body.isBlank()) return
        viewModelScope.launch {
            val r = runCatching { api.editPost(post.id, com.xtalk.app.core.network.EditPostRequest(body.trim())) }.getOrNull()
            if (r?.isSuccessful != true) _state.update { it.copy(note = "Could not edit") }
            refresh()
        }
    }

    fun clearNote() { _state.update { it.copy(note = null) } }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val res = api.feed(saved = if (_state.value.savedOnly) "1" else null, tag = _state.value.tag.ifBlank { null })
                if (res.isSuccessful) {
                    _state.update { it.copy(loading = false, posts = res.body()?.results.orEmpty()) }
                } else fail("HTTP ${res.code()}")
            } catch (e: Exception) { fail(e.message) }
        }
    }

    fun publish(body: String, languageCode: String?) {
        if (body.isBlank()) return
        _state.update { it.copy(publishing = true) }
        viewModelScope.launch {
            try {
                val res = api.createPost(CreatePostRequest(body.trim(), languageCode?.ifBlank { null }))
                if (res.isSuccessful) refresh() else fail("HTTP ${res.code()}")
            } catch (e: Exception) { fail(e.message) }
            _state.update { it.copy(publishing = false) }
        }
    }

    fun toggleLike(post: FeedPostDto) {
        // optimistic update, rolled back on failure
        _state.update { s ->
            s.copy(posts = s.posts.map {
                if (it.id == post.id) it.copy(
                    likedByMe = !it.likedByMe,
                    likeCount = it.likeCount + if (it.likedByMe) -1 else 1,
                ) else it
            })
        }
        viewModelScope.launch {
            try {
                val res = if (post.likedByMe) api.unlike(post.id) else api.like(post.id)
                if (!res.isSuccessful) rollbackLike(post)
            } catch (_: Exception) { rollbackLike(post) }
        }
    }

    private fun rollbackLike(post: FeedPostDto) {
        _state.update { s ->
            s.copy(posts = s.posts.map {
                if (it.id == post.id) it.copy(likedByMe = post.likedByMe, likeCount = post.likeCount) else it
            })
        }
    }

    fun comment(postId: String, body: String, onDone: () -> Unit) {
        if (body.isBlank()) return
        viewModelScope.launch {
            try {
                val res = api.comment(postId, mapOf("body" to body.trim()))
                if (res.isSuccessful) {
                    _state.update { s ->
                        s.copy(posts = s.posts.map {
                            if (it.id == postId) it.copy(commentCount = it.commentCount + 1) else it
                        })
                    }
                    onDone()
                }
            } catch (_: Exception) { /* surface via refresh */ }
        }
    }

    private fun fail(detail: Any?) =
        _state.update { it.copy(loading = false, error = "Feed error ($detail)") }
}
