package com.xtalk.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XGold
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.designsystem.XViolet
import com.xtalk.app.core.network.AddUserLanguageRequest
import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.ExtrasApi
import com.xtalk.app.core.network.ExtrasDto
import com.xtalk.app.core.network.LanguageDto
import com.xtalk.app.core.network.UpdateProfileRequest
import com.xtalk.app.core.network.UserApi
import com.xtalk.app.core.network.UserLanguageDto
import com.xtalk.app.feature.common.LanguagePickerDialog
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class EditState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val message: String? = null,
    val userId: String = "",
    val username: String = "",
    val displayName: String = "",
    val bio: String = "",
    val country: String = "",
    val newUsername: String = "",
    val usernameNote: String? = null,
    val interests: String = "",
    val extras: ExtrasDto = ExtrasDto(),
    val languages: List<UserLanguageDto> = emptyList(),
    val catalogue: List<LanguageDto> = emptyList(),
)

@HiltViewModel
class EditProfileViewModel @Inject constructor(
    private val userApi: UserApi,
    private val authApi: AuthApi,
    private val extrasApi: ExtrasApi,
) : ViewModel() {
    private val _s = MutableStateFlow(EditState())
    val state: StateFlow<EditState> = _s.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            val me = runCatching { userApi.me() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val ex = runCatching { extrasApi.mine() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            val cat = runCatching { authApi.languages() }.getOrNull()?.takeIf { it.isSuccessful }?.body().orEmpty()
            _s.update {
                it.copy(
                    loading = false, userId = me?.id ?: it.userId, username = me?.username ?: it.username,
                    displayName = me?.profile?.displayName ?: it.displayName, bio = me?.profile?.bio ?: it.bio,
                    country = me?.profile?.country ?: it.country,
                    interests = me?.profile?.interests?.joinToString(", ") ?: it.interests,
                    languages = me?.userLanguages ?: it.languages,
                    extras = ex ?: it.extras, catalogue = cat.ifEmpty { it.catalogue },
                    message = if (me == null) "Could not load your profile" else it.message,
                )
            }
        }
    }

    fun checkUsername(u: String) {
        val v = u.trim().lowercase()
        _s.update { it.copy(newUsername = v, usernameNote = null) }
        if (v == _s.value.username || v.length < 3) return
        viewModelScope.launch {
            val r = runCatching { userApi.checkUsername(v) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            if (_s.value.newUsername == v) _s.update { it.copy(usernameNote = when {
                r == null -> null
                r.available -> "Available"
                r.reason == "invalid_format" -> "3-20 letters (a-z), digits or _"
                else -> "Already taken"
            }) }
        }
    }

    fun edit(f: (EditState) -> EditState) = _s.update(f)

    fun addLanguage(code: String, native: Boolean) {
        viewModelScope.launch {
            val r = runCatching {
                userApi.addLanguage(
                    if (native) AddUserLanguageRequest(code = code, type = "NATIVE", proficiency = "NATIVE")
                    else AddUserLanguageRequest(code = code, type = "LEARNING", proficiency = "BEGINNER", dailyMinutes = 15),
                )
            }.getOrNull()
            if (r?.isSuccessful == true) reloadLanguages() else _s.update { it.copy(message = "Could not add language") }
        }
    }

    fun removeLanguage(code: String) {
        viewModelScope.launch {
            runCatching { userApi.removeLanguage(code) }
            reloadLanguages()
        }
    }

    private suspend fun reloadLanguages() {
        val l = runCatching { userApi.myLanguages() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
        if (l != null) _s.update { it.copy(languages = l) }
    }

    fun save(onDone: () -> Unit) {
        val st = _s.value
        _s.update { it.copy(saving = true, message = null) }
        viewModelScope.launch {
            val p = runCatching {
                userApi.updateProfile(
                    UpdateProfileRequest(
                        displayName = st.displayName.trim().takeIf { it.isNotBlank() },
                        bio = st.bio.trim(),
                        country = st.country.trim().uppercase().takeIf { it.length == 2 },
                        interests = st.interests.split(",", "،").map { it.trim() }.filter { it.isNotEmpty() }.take(10),
                    ),
                )
            }.getOrNull()
            val wantName = st.newUsername.takeIf { it.isNotBlank() && it != st.username }
            val un = if (wantName != null) runCatching { userApi.updateUsername(com.xtalk.app.core.network.UpdateUsernameRequest(wantName)) }.getOrNull() else null
            val nameFail = wantName != null && un?.isSuccessful != true
            val e = runCatching { extrasApi.save(st.extras) }.getOrNull()
            val ok = p?.isSuccessful == true && e?.isSuccessful == true && !nameFail
            _s.update {
                it.copy(
                    saving = false,
                    message = when {
                        ok -> "Saved"
                        nameFail -> "Username not changed (taken or invalid). Other changes saved."
                        p?.isSuccessful == true -> "Profile saved, but the extra details need the server update (HTTP ${e?.code() ?: "?"})"
                        else -> "Save failed (HTTP ${p?.code() ?: "network"})"
                    },
                )
            }
            if (ok) onDone()
        }
    }
}

private val GENDERS = listOf("Male", "Female", "Other")
private val BLOOD = listOf("A", "B", "AB", "O")

@Composable
fun EditProfileScreen(
    onBack: () -> Unit,
    onOpenPremium: () -> Unit,
    onPreview: (String) -> Unit,
    vm: EditProfileViewModel = hiltViewModel(),
) {
    val st by vm.state.collectAsStateWithLifecycle()
    var pick by remember { mutableStateOf<Boolean?>(null) } // null closed, true native, false learning
    var pickCountry by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(XBg)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Back", color = XViolet, modifier = Modifier.clickable(onClick = onBack))
            Text("Edit profile", fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f).padding(start = 16.dp))
            Text(if (st.saving) "Saving..." else "Save", color = XViolet, fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(enabled = !st.saving && !st.loading) { vm.save(onBack) })
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp)) {
            st.message?.let { Text(it, color = if (it == "Saved") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp)) }
            Section("Basic")
            Field("Name", st.displayName, 50) { v -> vm.edit { it.copy(displayName = v) } }
            Field("Tagline", st.extras.tagline, 120) { v -> vm.edit { it.copy(extras = it.extras.copy(tagline = v)) } }
            Field("Bio", st.bio, 500, minLines = 3) { v -> vm.edit { it.copy(bio = v) } }
            OutlinedTextField(
                value = st.newUsername.ifBlank { st.username }, onValueChange = { vm.checkUsername(it.take(20)) },
                label = { Text("ID / username") }, singleLine = true, prefix = { Text("@") },
                supportingText = { st.usernameNote?.let { Text(it) } },
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            )

            Section("Languages")
            st.languages.forEach { ul ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(ul.language?.name ?: ul.languageCode, Modifier.weight(1f))
                    Text(ul.type.lowercase(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(end = 12.dp))
                    Text("Remove", color = Color(0xFFFF6B6B), fontSize = 12.sp, modifier = Modifier.clickable { vm.removeLanguage(ul.languageCode) })
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                OutlinedButton(onClick = { pick = true }) { Text("+ Native", fontSize = 12.sp) }
                OutlinedButton(onClick = { pick = false }) { Text("+ Learning", fontSize = 12.sp) }
            }

            Section("About me")
            Field("Interests (comma separated)", st.interests, 300) { v -> vm.edit { it.copy(interests = v) } }
            OutlinedButton(onClick = { pickCountry = true }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                Text("Country code: ${st.country.ifBlank { "not set" }}")
            }
            Field("Hometown", st.extras.hometown, 80) { v -> vm.edit { it.copy(extras = it.extras.copy(hometown = v)) } }
            Field("Occupation", st.extras.occupation, 80) { v -> vm.edit { it.copy(extras = it.extras.copy(occupation = v)) } }
            Field("School", st.extras.school, 80) { v -> vm.edit { it.copy(extras = it.extras.copy(school = v)) } }
            Text("Gender", modifier = Modifier.padding(top = 8.dp), fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GENDERS.forEach { g ->
                    FilterChip(selected = st.extras.gender == g, onClick = { vm.edit { it.copy(extras = it.extras.copy(gender = if (it.extras.gender == g) "" else g)) } }, label = { Text(g) })
                }
            }
            Text("Blood type", modifier = Modifier.padding(top = 8.dp), fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BLOOD.forEach { b ->
                    FilterChip(selected = st.extras.bloodType == b, onClick = { vm.edit { it.copy(extras = it.extras.copy(bloodType = if (it.extras.bloodType == b) "" else b)) } }, label = { Text(b) })
                }
            }
            Field("MBTI (e.g. INFP)", st.extras.mbti, 4) { v -> vm.edit { it.copy(extras = it.extras.copy(mbti = v.uppercase())) } }
            Spacer(Modifier.height(16.dp))
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { onPreview(st.userId) }, enabled = st.userId.isNotBlank(), modifier = Modifier.weight(1f)) { Text("Preview") }
            Text("Get VIP", color = Color(0xFF3A2200), fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(50)).background(XGold).clickable(onClick = onOpenPremium).padding(vertical = 12.dp))
        }
    }
    pick?.let { native ->
        LanguagePickerDialog(st.catalogue, allowClear = false, onPick = { l -> if (l != null) vm.addLanguage(l.code, native); pick = null }, onDismiss = { pick = null })
    }
    if (pickCountry) {
        var code by remember { mutableStateOf(st.country) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { pickCountry = false },
            title = { Text("Country code (2 letters, e.g. EG)") },
            text = { OutlinedTextField(value = code, onValueChange = { code = it.uppercase().take(2) }, singleLine = true) },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { vm.edit { it.copy(country = code) }; pickCountry = false }) { Text("OK") } },
        )
    }
}

@Composable
private fun Section(title: String) {
    Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = XViolet, modifier = Modifier.padding(top = 16.dp, bottom = 4.dp))
}

@Composable
private fun Field(label: String, value: String, max: Int, minLines: Int = 1, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = { onChange(it.take(max)) }, label = { Text(label) },
        minLines = minLines, singleLine = minLines == 1, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
    )
}
