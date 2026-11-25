package com.xtalk

import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.graphics.asAndroidBitmap
import com.xtalk.app.core.designsystem.XTalkTheme
import com.xtalk.app.feature.onboarding.OnboardingScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xhdpi")
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<androidx.activity.ComponentActivity>()

    @Test fun welcome() {
        rule.setContent { XTalkTheme { OnboardingScreen(onLogin = {}, onRegister = {}) } }
        rule.waitForIdle()
        val v = rule.activity.window.decorView
        v.measure(android.view.View.MeasureSpec.makeMeasureSpec(1080, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(2220, android.view.View.MeasureSpec.EXACTLY))
        v.layout(0, 0, 1080, 2220)
        val bmp = android.graphics.Bitmap.createBitmap(1080, 2220, android.graphics.Bitmap.Config.ARGB_8888)
        v.draw(android.graphics.Canvas(bmp))
        File("/tmp/shots").mkdirs()
        File("/tmp/shots/welcome.png").outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
}
