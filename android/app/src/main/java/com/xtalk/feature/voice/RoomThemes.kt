package com.xtalk.app.feature.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape

data class RoomTheme(val id: String, val label: String, val colors: List<Color>)

val RoomThemes = listOf(
    RoomTheme("default", "Default", listOf(Color(0xFF1B1530), Color(0xFF241B45))),
    RoomTheme("sunset", "Sunset", listOf(Color(0xFF7A1F44), Color(0xFFE2703A))),
    RoomTheme("ocean", "Ocean", listOf(Color(0xFF0B3C5D), Color(0xFF1F8A9E))),
    RoomTheme("forest", "Forest", listOf(Color(0xFF0F3D2E), Color(0xFF3C8D5A))),
    RoomTheme("night", "Night", listOf(Color(0xFF05060F), Color(0xFF1C2347))),
    RoomTheme("rose", "Rose", listOf(Color(0xFF6B2150), Color(0xFFD9648F))),
    RoomTheme("gold", "Gold", listOf(Color(0xFF3A2A06), Color(0xFFC79A2B))),
    RoomTheme("aurora", "Aurora", listOf(Color(0xFF1B1B52), Color(0xFF2BB59A))),
)

fun roomThemeBrush(id: String?): Brush =
    Brush.verticalGradient((RoomThemes.firstOrNull { it.id == id } ?: RoomThemes[0]).colors)

/** Small blue check mark for room moderators (no text). */
@Composable
fun ModTag(modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.Box(
        modifier.size(14.dp).clip(androidx.compose.foundation.shape.CircleShape).background(Color(0xFF1E88E5)),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) { Text("\u2713", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 9.sp) }
}
