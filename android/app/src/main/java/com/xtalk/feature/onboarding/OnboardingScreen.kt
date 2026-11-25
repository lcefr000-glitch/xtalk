package com.xtalk.app.feature.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.xtalk.app.R
import com.xtalk.app.core.designsystem.XBg
import com.xtalk.app.core.designsystem.XTalkLogo
import com.xtalk.app.core.designsystem.XTalkWordmark

/** Login / welcome screen: near-black canvas, X TaIk mark + wordmark, two clear actions. */
@Composable
fun OnboardingScreen(onLogin: () -> Unit, onRegister: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().background(XBg).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        XTalkLogo(size = 130.dp)
        Spacer(Modifier.height(18.dp))
        XTalkWordmark(36)
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.tagline), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.tagline2),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(44.dp))
        Button(onClick = onRegister, shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(stringResource(R.string.create_account))
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onLogin, shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(stringResource(R.string.have_account))
        }
    }
}
