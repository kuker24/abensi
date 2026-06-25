package id.sch.man1rokanhulu.absensi.ui.theme

import android.app.Activity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

// ── Dark Nocturne Color Palette (matches web styles.css) ──

// Background layers
private val Bg = Color(0xFF16181C)
private val Bg2 = Color(0xFF1E2025)
private val Bg3 = Color(0xFF232529)

// Surface layers
private val Surface = Color(0xFF1E2025)
private val Surface2 = Color(0xFF26282F)
private val Surface3 = Color(0xFF343741)
private val SurfaceElevated = Color(0xFF2D3038)

// Border layers
private val Border = Color(0x0FFFFFFF) // rgba(255,255,255,0.06)
private val Border2 = Color(0x1AFFFFFF) // rgba(255,255,255,0.10)
private val BorderStrong = Color(0x24FFFFFF) // rgba(255,255,255,0.14)

// Text layers
private val Fg = Color(0xFFF0EDE8)
private val FgSecondary = Color(0xFFC8C4BD)
private val FgMuted = Color(0xFFA8A29E)
private val FgDim = Color(0xFF78716C)

// Primary (Amber/Gold)
private val Amber = Color(0xFFF59E0B)
private val Amber2 = Color(0xFFFBBF24)
private val Amber3 = Color(0xFFD97706)
private val AmberDim = Color(0x26F59E0B) // rgba(245,158,11,0.15)
private val AmberSoft = Color(0x1FF59E0B) // rgba(245,158,11,0.12)

// Secondary (Sky Blue)
private val Sky = Color(0xFF0EA5E9)
private val Sky2 = Color(0xFF38BDF8)
private val SkyDim = Color(0x260EA5E9)

// Tertiary (Violet)
private val Violet = Color(0xFFA78BFA)
private val Violet2 = Color(0xFFC4B5FD)

// Semantic status
private val Ok = Color(0xFF34D399)
private val OkSoft = Color(0x1F34D399)
private val Warn = Color(0xFFF97316)
private val WarnSoft = Color(0x1FF97316)
private val Bad = Color(0xFFF87171)
private val BadSoft = Color(0x1FF87171)
private val Info = Color(0xFF60A5FA)
private val InfoSoft = Color(0x1F60A5FA)

private val DarkColors = darkColorScheme(
    primary = Amber,
    onPrimary = Color(0xFF1C1917),
    primaryContainer = AmberDim,
    onPrimaryContainer = Amber2,
    secondary = Sky,
    onSecondary = Color(0xFF1C1917),
    secondaryContainer = SkyDim,
    onSecondaryContainer = Sky2,
    tertiary = Violet,
    onTertiary = Color(0xFF1C1917),
    tertiaryContainer = Color(0x26A78BFA),
    onTertiaryContainer = Violet2,
    error = Bad,
    onError = Color.White,
    errorContainer = BadSoft,
    onErrorContainer = Bad,
    background = Bg,
    onBackground = Fg,
    surface = Surface,
    onSurface = Fg,
    surfaceVariant = Bg3,
    onSurfaceVariant = FgMuted,
    outline = Border,
    outlineVariant = Border2,
    inverseSurface = Fg,
    inverseOnSurface = Bg,
    inversePrimary = Amber3,
    scrim = Color.Black
)

object SemanticColors {
    val success: Color = Ok
    val warning: Color = Warn
    val error: Color = Bad
    val info: Color = Info
    val neutral: Color = FgDim
    val successSoft: Color = OkSoft
    val warningSoft: Color = WarnSoft
    val errorSoft: Color = BadSoft
    val infoSoft: Color = InfoSoft
    val surface: Color = Surface
    val surface2: Color = Surface2
    val surface3: Color = Surface3
    val border: Color = Border
    val border2: Color = Border2
    val fg: Color = Fg
    val fgSecondary: Color = FgSecondary
    val fgMuted: Color = FgMuted
    val fgDim: Color = FgDim
    val amber: Color = Amber
    val amberDim: Color = AmberDim
}

private val ReaderTypography = Typography(
    displayLarge = TextStyle(fontSize = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).sp),
    headlineLarge = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).sp),
    headlineMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).sp),
    headlineSmall = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.01).sp),
    titleLarge = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.02.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.04.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.06.sp)
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    val colors = DarkColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            window?.let {
                it.statusBarColor = Bg.toArgb()
                it.navigationBarColor = Bg.toArgb()
                WindowCompat.getInsetsController(it, view).isAppearanceLightStatusBars = false
                WindowCompat.getInsetsController(it, view).isAppearanceLightNavigationBars = false
            }
        }
    }
    MaterialTheme(colorScheme = colors, typography = ReaderTypography) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = colors.background,
            contentColor = colors.onBackground,
            content = content
        )
    }
}

private fun Color.toArgb(): Int = android.graphics.Color.argb(
    (alpha * 255f).toInt(),
    (red * 255f).toInt(),
    (green * 255f).toInt(),
    (blue * 255f).toInt()
)
