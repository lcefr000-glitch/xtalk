package com.xtalk.app.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// X TaIk original palette: near-black canvas, electric violet primary, teal/amber/coral accents.
val XBg = Color(0xFF09090E)
val XSurface = Color(0xFF14141D)
val XSurfaceHigh = Color(0xFF1E1E2B)
val XCardIndigo = Color(0xFF1A1940)
val XViolet = Color(0xFF7B5CFF)
val XVioletDark = Color(0xFF3B2A8C)
val XTeal = Color(0xFF22D3B6)
val XAmber = Color(0xFFFFC145)
val XCoral = Color(0xFFFF5C7A)
val XRed = Color(0xFFFF3B4E)
val XTextDim = Color(0xFF9A9AB0)
val XGold = Brush.horizontalGradient(listOf(Color(0xFFFFD36B), Color(0xFFFF8FB1)))
val XPurpleBanner = Brush.horizontalGradient(listOf(Color(0xFF6D4BFF), Color(0xFF1A1235)))
val XLightCard = Brush.verticalGradient(listOf(Color(0xFFF1ECFF), Color(0xFFFFE9F1)))

private val DarkColors = darkColorScheme(
    primary = XViolet,
    onPrimary = Color.White,
    primaryContainer = XVioletDark,
    onPrimaryContainer = Color.White,
    secondary = XAmber,
    onSecondary = Color.Black,
    tertiary = XTeal,
    background = XBg,
    onBackground = Color.White,
    surface = XSurface,
    onSurface = Color.White,
    surfaceVariant = XSurfaceHigh,
    onSurfaceVariant = XTextDim,
    error = XRed,
)

/** The app is dark-first (matches the requested near-black look) in every system theme. */
@Composable
fun XTalkTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColors) {
        androidx.compose.material3.Surface(color = XBg, contentColor = androidx.compose.ui.graphics.Color.White, content = content)
    }
}
