package com.xtalk.app.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * X TaIk logo mark (original): a rounded speech bubble whose inside is an "X"
 * built from four round-capped strokes in the brand colors, with a sound-dot at the center.
 */
@Composable
fun XTalkLogo(size: Dp = 120.dp, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val bubbleH = h * 0.86f
        // bubble body
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFF2B2468), Color(0xFF15122F))),
            size = Size(w, bubbleH),
            cornerRadius = CornerRadius(w * 0.28f, w * 0.28f),
        )
        // bubble tail
        val tail = Path().apply {
            moveTo(w * 0.22f, bubbleH - 2f)
            lineTo(w * 0.16f, h)
            lineTo(w * 0.42f, bubbleH - 2f)
            close()
        }
        drawPath(tail, Color(0xFF1F1A4C))
        // X strokes
        val c = Offset(w * 0.5f, bubbleH * 0.5f)
        val r = w * 0.27f
        val gap = w * 0.07f
        val sw = w * 0.13f
        fun arm(dx: Float, dy: Float, color: Color) = drawLine(
            color = color,
            start = Offset(c.x + dx * gap, c.y + dy * gap),
            end = Offset(c.x + dx * r, c.y + dy * r),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
        arm(-1f, -1f, XTeal)
        arm(1f, -1f, XAmber)
        arm(1f, 1f, XCoral)
        arm(-1f, 1f, XViolet)
        drawCircle(Color.White, radius = w * 0.04f, center = c)
        // sound arcs
        drawArc(
            color = Color.White.copy(alpha = 0.35f), startAngle = -40f, sweepAngle = 80f, useCenter = false,
            topLeft = Offset(c.x - w * 0.12f, c.y - w * 0.12f), size = Size(w * 0.24f, w * 0.24f),
            style = Stroke(width = w * 0.015f, cap = StrokeCap.Round),
        )
    }
}

@Composable
fun XTalkWordmark(sizeSp: Int = 34) {
    Text("X TaIk", color = Color.White, fontSize = sizeSp.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp)
}

/** Circle avatar with initial, optional country flag badge and online dot. */
@Composable
fun XAvatar(name: String, size: Dp, flag: String? = null, online: Boolean = false, modifier: Modifier = Modifier, photoUrl: String? = null) {
    Box(modifier.size(size)) {
        Box(
            Modifier.fillMaxSize().clip(CircleShape).background(
                Brush.linearGradient(listOf(XViolet, XTeal)),
            ),
            contentAlignment = Alignment.Center,
        ) {
            val bmp = androidx.compose.runtime.remember(photoUrl) { com.xtalk.app.core.common.ImageUtil.decodeDataUri(photoUrl) }
            if (bmp != null) {
                androidx.compose.foundation.Image(
                    bitmap = bmp.asImageBitmap(), contentDescription = null,
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                )
            } else if (photoUrl != null && photoUrl.startsWith("http")) {
                coil.compose.AsyncImage(
                    model = photoUrl, contentDescription = null,
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                )
            } else {
                Text(name.trim().take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.42f).sp)
            }
        }
        if (!flag.isNullOrBlank()) {
            Box(
                Modifier.align(Alignment.BottomEnd).size(size * 0.38f).clip(CircleShape).background(XSurface),
                contentAlignment = Alignment.Center,
            ) { Text(flag, fontSize = (size.value * 0.24f).sp) }
        }
        if (online) {
            Box(Modifier.align(Alignment.TopEnd).size(size * 0.2f).clip(CircleShape).background(Color(0xFF3DDC84)))
        }
    }
}

/** ISO-3166 alpha-2 code to flag emoji; empty for anything else. */
fun flagEmoji(code: String?): String? {
    val c = code?.trim()?.uppercase() ?: return null
    if (c.length != 2 || !c.all { it in 'A'..'Z' }) return null
    return String(Character.toChars(0x1F1E6 + (c[0] - 'A'))) + String(Character.toChars(0x1F1E6 + (c[1] - 'A')))
}

@Composable
fun GoldPill(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.clip(RoundedCornerShape(50)).background(XGold)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 5.dp),
    ) { Text(text, color = Color(0xFF3A2200), fontSize = 12.sp, fontWeight = FontWeight.Bold) }
}
