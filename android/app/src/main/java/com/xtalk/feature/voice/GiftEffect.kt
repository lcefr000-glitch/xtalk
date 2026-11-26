package com.xtalk.app.feature.voice

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin

/** Full-room gift animation: a big emoji pops in the middle, small ones float up. Plays once per gift. */
@Composable
fun GiftEffect(emoji: String, nonce: Int, modifier: Modifier = Modifier) {
    val t = remember(nonce) { Animatable(0f) }
    LaunchedEffect(nonce) { t.snapTo(0f); t.animateTo(1f, tween(2400, easing = LinearEasing)) }
    val p = t.value
    if (p <= 0f || p >= 1f) return
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        // big centre emoji: grows fast, holds, then fades
        val grow = (p / 0.25f).coerceAtMost(1f)
        val fade = if (p < 0.7f) 1f else (1f - (p - 0.7f) / 0.3f)
        Text(emoji, fontSize = 96.sp, modifier = Modifier.scale(0.4f + 0.9f * grow).alpha(fade))
        // floating particles
        for (i in 0 until 14) {
            val seed = (i * 37 + nonce * 11) % 100
            val x = ((seed % 21) - 10) * 15 + (sin((p * 6f + i).toDouble()) * 14).toFloat()
            val start = (i % 7) * 0.04f
            val q = ((p - start) / (1f - start)).coerceIn(0f, 1f)
            val y = 200f - q * 520f
            Text(emoji, fontSize = (16 + (seed % 14)).sp, modifier = Modifier.offset(x.dp, y.dp).alpha((1f - q).coerceIn(0f, 1f)))
        }
    }
}
