package com.xtalk.app.feature.learn

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XSurface
import com.xtalk.app.core.network.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/** English or Arabic text by the device language (the app has no separate language switch). */
fun tr(en: String, ar: String): String = if (Locale.getDefault().language == "ar") ar else en

@Composable
private fun Page(title: String, onBack: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(XBg).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(tr("Back", "رجوع")) }
            Text(title, style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun CardRow(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(XSurface).padding(12.dp), verticalAlignment = Alignment.CenterVertically, content = content)
}

// ---------------- Hub ----------------

@Composable
fun LearnHubScreen(onBack: () -> Unit, onProgress: () -> Unit, onCourses: () -> Unit, onFriends: () -> Unit) {
    Page(tr("Learning and friends", "التعلم والأصدقاء"), onBack) {
        listOf(
            Triple(tr("Progress and achievements", "التقدم والإنجازات"), "\uD83C\uDFC6", onProgress),
            Triple(tr("Courses", "الدورات"), "\uD83C\uDF93", onCourses),
            Triple(tr("Friends and requests", "الأصدقاء والطلبات"), "\uD83E\uDD1D", onFriends),
        ).forEach { (label, icon, go) ->
            CardRow(Modifier.clickable(onClick = go)) { Text(icon, fontSize = 22.sp); Spacer(Modifier.width(10.dp)); Text(label, fontWeight = FontWeight.SemiBold) }
            Spacer(Modifier.height(10.dp))
        }
    }
}

// ---------------- Friends ----------------

data class FriendsState(
    val loading: Boolean = true, val friends: List<FriendRowDto> = emptyList(),
    val incoming: List<FriendRowDto> = emptyList(), val outgoing: List<FriendRowDto> = emptyList(),
)

@HiltViewModel
class FriendsViewModel @Inject constructor(private val api: FriendsApi) : ViewModel() {
    private val _s = MutableStateFlow(FriendsState())
    val state: StateFlow<FriendsState> = _s.asStateFlow()
    init { load() }
    private suspend fun <T> get(f: suspend () -> retrofit2.Response<T>): T? = runCatching { f() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
    fun load() {
        viewModelScope.launch {
            val f = get { api.friends() }.orEmpty(); val i = get { api.incoming() }.orEmpty(); val o = get { api.outgoing() }.orEmpty()
            _s.update { FriendsState(false, f, i, o) }
        }
    }
    fun accept(id: String) { viewModelScope.launch { runCatching { api.accept(id) }; load() } }
    fun decline(id: String) { viewModelScope.launch { runCatching { api.decline(id) }; load() } }
    fun unfriend(userId: String) { viewModelScope.launch { runCatching { api.unfriend(userId) }; load() } }
}

@Composable
fun FriendsScreen(onBack: () -> Unit, onOpenUser: (String) -> Unit, vm: FriendsViewModel = hiltViewModel()) {
    val st by vm.state.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(0) }
    Page(tr("Friends", "الأصدقاء"), onBack) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = tab == 0, onClick = { tab = 0 }, label = { Text(tr("Friends", "الأصدقاء") + " (${st.friends.size})") })
            FilterChip(selected = tab == 1, onClick = { tab = 1 }, label = { Text(tr("Requests", "الطلبات") + " (${st.incoming.size})") })
            FilterChip(selected = tab == 2, onClick = { tab = 2 }, label = { Text(tr("Sent", "المرسلة") + " (${st.outgoing.size})") })
        }
        Spacer(Modifier.height(8.dp))
        val list = when (tab) { 0 -> st.friends; 1 -> st.incoming; else -> st.outgoing }
        when {
            st.loading -> CircularProgressIndicator()
            list.isEmpty() -> Text(tr("Nothing here yet. Send friend requests from a profile.", "لا شيء هنا بعد. أرسل طلب صداقة من صفحة الملف الشخصي."))
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(list, key = { (it.requestId ?: it.id ?: "") + it.userId }) { f ->
                    CardRow(Modifier.clickable { onOpenUser(f.userId) }) {
                        Column(Modifier.weight(1f)) {
                            Text(f.displayName ?: f.username, fontWeight = FontWeight.SemiBold)
                            Text("@${f.username}" + (f.country?.let { " - $it" } ?: ""), style = MaterialTheme.typography.bodySmall)
                        }
                        when (tab) {
                            0 -> TextButton(onClick = { vm.unfriend(f.userId) }) { Text(tr("Remove", "إزالة")) }
                            1 -> {
                                TextButton(onClick = { (f.id ?: f.requestId)?.let(vm::accept) }) { Text(tr("Accept", "قبول")) }
                                TextButton(onClick = { (f.id ?: f.requestId)?.let(vm::decline) }) { Text(tr("Decline", "رفض")) }
                            }
                            else -> Text(tr("Pending", "قيد الانتظار"), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

// ---------------- Progress ----------------

@HiltViewModel
class ProgressViewModel @Inject constructor(private val api: ProgressApi) : ViewModel() {
    private val _s = MutableStateFlow<ProgressDto?>(null)
    val state: StateFlow<ProgressDto?> = _s.asStateFlow()
    private val _err = MutableStateFlow(false)
    val error: StateFlow<Boolean> = _err.asStateFlow()
    init {
        viewModelScope.launch {
            val r = runCatching { api.me() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            _s.value = r; _err.value = r == null
        }
    }
}

@Composable
fun ProgressScreen(onBack: () -> Unit, vm: ProgressViewModel = hiltViewModel()) {
    val p by vm.state.collectAsStateWithLifecycle()
    val err by vm.error.collectAsStateWithLifecycle()
    Page(tr("Progress", "التقدم"), onBack) {
        val d = p
        when {
            err -> Text(tr("Could not load progress.", "تعذر تحميل التقدم."), color = MaterialTheme.colorScheme.error)
            d == null -> CircularProgressIndicator()
            else -> Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CardRow { Text("\uD83D\uDD25 ${d.streakDays} " + tr("day streak", "يوم متتالي"), fontWeight = FontWeight.Bold, fontSize = 18.sp) }
                val t = d.today
                CardRow {
                    Column {
                        Text(tr("Today", "اليوم"), fontWeight = FontWeight.SemiBold)
                        Text(tr("Practice", "تدريب") + ": ${t.practiceSeconds / 60} / ${t.dailyGoalMinutes} " + tr("min", "دقيقة") + if (t.goalMet) "  \u2705" else "")
                        Text(tr("Words saved", "كلمات محفوظة") + ": ${t.wordsSaved}   " + tr("Reviews", "مراجعات") + ": ${t.reviewsDone}")
                        Text(tr("Messages", "رسائل") + ": ${t.messagesSent}   " + tr("Lessons", "دروس") + ": ${t.lessonsCompleted}")
                    }
                }
                Text(tr("Achievements", "الإنجازات"), fontWeight = FontWeight.SemiBold)
                d.achievements.forEach { a ->
                    CardRow {
                        Text(if (a.unlocked) a.emoji else "\uD83D\uDD12", fontSize = 22.sp); Spacer(Modifier.width(10.dp))
                        Column { Text(a.name, fontWeight = FontWeight.SemiBold); Text(a.description, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
        }
    }
}

// ---------------- Courses ----------------

data class CoursesState(
    val loading: Boolean = true, val courses: List<CourseDto> = emptyList(),
    val detail: CourseDetailDto? = null, val lesson: LessonDto? = null, val note: String? = null,
)

@HiltViewModel
class CoursesViewModel @Inject constructor(private val api: CoursesApi) : ViewModel() {
    private val _s = MutableStateFlow(CoursesState())
    val state: StateFlow<CoursesState> = _s.asStateFlow()
    init { load() }
    fun load() {
        viewModelScope.launch {
            val r = runCatching { api.list() }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            _s.update { it.copy(loading = false, courses = r.orEmpty(), note = if (r == null) "err" else null) }
        }
    }
    fun open(id: String) {
        viewModelScope.launch {
            val r = runCatching { api.detail(id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            _s.update { it.copy(detail = r, lesson = null) }
        }
    }
    fun enroll(id: String) { viewModelScope.launch { runCatching { api.enroll(id) }; open(id); load() } }
    fun openLesson(id: String) {
        viewModelScope.launch {
            val r = runCatching { api.lesson(id) }.getOrNull()?.takeIf { it.isSuccessful }?.body()
            _s.update { it.copy(lesson = r) }
        }
    }
    fun complete(lessonId: String, courseId: String) {
        viewModelScope.launch { runCatching { api.complete(lessonId) }; _s.update { it.copy(lesson = null) }; open(courseId); load() }
    }
    fun back(): Boolean {
        val s = _s.value
        return when {
            s.lesson != null -> { _s.update { it.copy(lesson = null) }; true }
            s.detail != null -> { _s.update { it.copy(detail = null) }; true }
            else -> false
        }
    }
}

@Composable
fun CoursesScreen(onBack: () -> Unit, vm: CoursesViewModel = hiltViewModel()) {
    val st by vm.state.collectAsStateWithLifecycle()
    val goBack = { if (!vm.back()) onBack() }
    androidx.activity.compose.BackHandler(enabled = st.detail != null) { vm.back() }
    Page(st.lesson?.title ?: st.detail?.title ?: tr("Courses", "الدورات"), goBack) {
        val lesson = st.lesson
        val detail = st.detail
        when {
            lesson != null && detail != null -> Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(lesson.kind, style = MaterialTheme.typography.labelMedium)
                Text(lesson.content)
                Button(onClick = { vm.complete(lesson.id, detail.id) }) { Text(tr("Mark as done", "تم إنهاء الدرس")) }
            }
            detail != null -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    detail.description?.let { Text(it) }
                    if (!detail.enrolled) Button(onClick = { vm.enroll(detail.id) }) { Text(tr("Enroll", "التسجيل")) }
                }
                items(detail.lessons, key = { it.id }) { l ->
                    CardRow(Modifier.clickable { vm.openLesson(l.id) }) {
                        Column(Modifier.weight(1f)) {
                            Text("${l.position + 1}. ${l.title}", fontWeight = FontWeight.SemiBold)
                            Text(l.kind + (l.durationMin?.let { " - $it " + tr("min", "دقيقة") } ?: ""), style = MaterialTheme.typography.bodySmall)
                        }
                        if (l.status == "COMPLETED") Text("\u2705")
                    }
                }
            }
            st.loading -> CircularProgressIndicator()
            st.courses.isEmpty() -> Text(
                if (st.note == "err") tr("Could not load courses.", "تعذر تحميل الدورات.")
                else tr("No courses have been published yet.", "لم يتم نشر أي دورات بعد."),
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(st.courses, key = { it.id }) { c ->
                    CardRow(Modifier.clickable { vm.open(c.id) }) {
                        Text(c.coverEmoji ?: "\uD83D\uDCD8", fontSize = 24.sp); Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.title, fontWeight = FontWeight.SemiBold)
                            Text("${c.languageCode.uppercase()} - ${c.level} - ${c.completedCount}/${c.lessonCount}", style = MaterialTheme.typography.bodySmall)
                        }
                        if (c.enrolled) Text("\u2714")
                    }
                }
            }
        }
    }
}
