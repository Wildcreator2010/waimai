package com.wildcreator.mealreminder.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = BrandOrange,
    onPrimary = Color.White,
    primaryContainer = BrandOrangeLight,
    onPrimaryContainer = Color(0xFF3B0A00),
    secondary = SecondaryLight,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFDBCB),
    onSecondaryContainer = Color(0xFF2C160E),
    background = NeutralBackgroundLight,
    onBackground = Color(0xFF221A16),
    surface = NeutralSurfaceLight,
    onSurface = Color(0xFF221A16),
    surfaceVariant = Color(0xFFF2DFD8),
    onSurfaceVariant = Color(0xFF52443E),
    error = ErrorLight,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = BrandOrangeDark,
    onPrimary = Color(0xFF5C1900),
    primaryContainer = BrandOrangeContainerDark,
    onPrimaryContainer = BrandOrangeLight,
    secondary = SecondaryDark,
    onSecondary = Color(0xFF442A20),
    secondaryContainer = Color(0xFF5D4034),
    onSecondaryContainer = Color(0xFFFFDBCB),
    background = NeutralBackgroundDark,
    onBackground = Color(0xFFEFE0DA),
    surface = NeutralSurfaceDark,
    onSurface = Color(0xFFEFE0DA),
    surfaceVariant = Color(0xFF52443E),
    onSurfaceVariant = Color(0xFFD7C2BA),
    error = ErrorDark,
    onError = Color(0xFF690005),
)

/** Material 3 主题，跟随系统深色模式。 */
@Composable
fun MealReminderTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
