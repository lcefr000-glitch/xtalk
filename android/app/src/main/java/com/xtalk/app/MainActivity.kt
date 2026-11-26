package com.xtalk.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.xtalk.app.core.designsystem.XTalkTheme
import com.xtalk.app.navigation.XTalkNavHost
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtalk.app.core.network.LockInfo
import kotlinx.coroutines.launch
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main).launch { com.xtalk.app.core.network.LockState.check(applicationContext) }
        setContent {
            XTalkTheme {
                val lock by com.xtalk.app.core.network.LockState.lock.collectAsStateWithLifecycle()
                val info = lock
                if (info != null) LockedScreen(info) else XTalkNavHost()
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun LockedScreen(info: LockInfo) {
    val ar = java.util.Locale.getDefault().language == "ar"
    val title = if (info.updateRequired) (if (ar) "يلزم تحديث التطبيق" else "Update required") else (if (ar) "التطبيق متوقف مؤقتًا" else "Temporarily unavailable")
    val fallback = if (info.updateRequired) (if (ar) "هذا الإصدار لم يعد مدعومًا. من فضلك ثبّت أحدث إصدار." else "This version is no longer supported. Please install the latest version.")
        else (if (ar) "الخدمة متوقفة الآن. حاول مرة أخرى لاحقًا." else "The service is paused right now. Please try again later.")
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("\uD83D\uDD12", style = MaterialTheme.typography.displayMedium)
            Spacer(Modifier.height(16.dp))
            Text(title, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Text(info.message.ifBlank { fallback }, textAlign = TextAlign.Center)
        }
    }
}
