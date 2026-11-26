package com.xtalk.app.core.designsystem

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/** One selectable colour set. Names are shown in Settings. */
data class XPalette(
    val id: String, val name: String,
    val bg: Color, val surface: Color, val surfaceHigh: Color, val cardIndigo: Color,
    val primary: Color, val primaryDark: Color, val accent: Color, val amber: Color, val coral: Color,
    val room: Color, val seat: Color,
)

val XPalettes = listOf(
    XPalette("violet", "Violet", Color(0xFF09090E), Color(0xFF14141D), Color(0xFF1E1E2B), Color(0xFF1A1940),
        Color(0xFF7B5CFF), Color(0xFF3B2A8C), Color(0xFF22D3B6), Color(0xFFFFC145), Color(0xFFFF5C7A), Color(0xFF2A1B6B), Color(0xFF3C2A99)),
    XPalette("ocean", "Ocean", Color(0xFF050B14), Color(0xFF0E1A2A), Color(0xFF162739), Color(0xFF0F2A47),
        Color(0xFF2E9BFF), Color(0xFF14518F), Color(0xFF2EE6C5), Color(0xFFFFD166), Color(0xFFFF6B8A), Color(0xFF0C3566), Color(0xFF1B5CA8)),
    XPalette("sunset", "Sunset", Color(0xFF110806), Color(0xFF1F1210), Color(0xFF2D1B17), Color(0xFF3A1A22),
        Color(0xFFFF7A3D), Color(0xFF9A3A12), Color(0xFFFFC145), Color(0xFFFFD36B), Color(0xFFFF4D6D), Color(0xFF5C1F2E), Color(0xFF8A2F3F)),
    XPalette("emerald", "Emerald", Color(0xFF040E0A), Color(0xFF0D1B15), Color(0xFF15281F), Color(0xFF0F2E26),
        Color(0xFF1FCB7E), Color(0xFF0E6B41), Color(0xFF5CE1E6), Color(0xFFFFD166), Color(0xFFFF6B6B), Color(0xFF0B4A38), Color(0xFF18795A)),
    XPalette("rose", "Rose", Color(0xFF0E060B), Color(0xFF1C0F17), Color(0xFF2A1824), Color(0xFF3A1633),
        Color(0xFFFF5CA8), Color(0xFF8F1F5A), Color(0xFFB794FF), Color(0xFFFFD1A0), Color(0xFFFF8FB1), Color(0xFF55174A), Color(0xFF8A2B73)),
    XPalette("gold", "Midnight Gold", Color(0xFF0A0A0A), Color(0xFF171512), Color(0xFF24211A), Color(0xFF2B2412),
        Color(0xFFF5B83D), Color(0xFF7A5710), Color(0xFF3DD6C0), Color(0xFFFFE08A), Color(0xFFFF6B5C), Color(0xFF3D3210), Color(0xFF6B5415)),
)

object ThemeState {
    var current by mutableStateOf(XPalettes[0])
    private const val PREFS = "xtalk_theme"
    fun load(ctx: Context) {
        val id = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("palette", "violet")
        current = XPalettes.firstOrNull { it.id == id } ?: XPalettes[0]
    }
    fun select(ctx: Context, p: XPalette) {
        current = p
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("palette", p.id).apply()
    }
}

val XBg: Color get() = ThemeState.current.bg
val XSurface: Color get() = ThemeState.current.surface
val XSurfaceHigh: Color get() = ThemeState.current.surfaceHigh
val XCardIndigo: Color get() = ThemeState.current.cardIndigo
val XViolet: Color get() = ThemeState.current.primary
val XVioletDark: Color get() = ThemeState.current.primaryDark
val XTeal: Color get() = ThemeState.current.accent
val XAmber: Color get() = ThemeState.current.amber
val XCoral: Color get() = ThemeState.current.coral
val XRed = Color(0xFFFF3B4E)
val XTextDim = Color(0xFF9A9AB0)
val XGold = Brush.horizontalGradient(listOf(Color(0xFFFFD36B), Color(0xFFFF8FB1)))
val XPurpleBanner: Brush get() = Brush.horizontalGradient(listOf(ThemeState.current.primary, ThemeState.current.bg))
val XLightCard = Brush.verticalGradient(listOf(Color(0xFFF1ECFF), Color(0xFFFFE9F1)))

/** The app is dark-first in every system theme; the accent palette is user-selectable. */
@Composable
fun XTalkTheme(content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    androidx.compose.runtime.remember { ThemeState.load(ctx); true }
    val p = ThemeState.current
    val scheme = darkColorScheme(
        primary = p.primary, onPrimary = Color.White,
        primaryContainer = p.primaryDark, onPrimaryContainer = Color.White,
        secondary = p.amber, onSecondary = Color.Black, tertiary = p.accent,
        background = p.bg, onBackground = Color.White,
        surface = p.surface, onSurface = Color.White,
        surfaceVariant = p.surfaceHigh, onSurfaceVariant = XTextDim, error = XRed,
    )
    MaterialTheme(colorScheme = scheme) {
        androidx.compose.material3.Surface(color = p.bg, contentColor = Color.White, content = content)
    }
}
