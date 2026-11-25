package com.xtalk.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.xtalk.app.feature.auth.EmailVerificationScreen
import com.xtalk.app.feature.auth.LoginScreen
import com.xtalk.app.feature.auth.RegisterScreen
import com.xtalk.app.feature.home.HomeShell
import com.xtalk.app.feature.messages.ChatScreen
import com.xtalk.app.feature.notifications.NotificationsScreen
import com.xtalk.app.feature.onboarding.LanguageSelectionScreen
import com.xtalk.app.feature.onboarding.LearningGoalsScreen
import com.xtalk.app.feature.onboarding.OnboardingScreen
import com.xtalk.app.feature.onboarding.SplashScreen
import com.xtalk.app.feature.premium.PremiumScreen
import com.xtalk.app.feature.voice.VoiceRoomsScreen

@Composable
fun XTalkNavHost(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) {
            SplashScreen(
                onLoggedOut = {
                    navController.navigate(Routes.ONBOARDING) { popUpTo(Routes.SPLASH) { inclusive = true } }
                },
                onLoggedIn = {
                    navController.navigate(Routes.HOME) { popUpTo(Routes.SPLASH) { inclusive = true } }
                },
            )
        }
        composable(Routes.ONBOARDING) {
            OnboardingScreen(
                onLogin = { navController.navigate(Routes.LOGIN) },
                onRegister = { navController.navigate(Routes.REGISTER) },
            )
        }
        composable(Routes.LOGIN) {
            LoginScreen(
                onBack = { navController.popBackStack() },
                onLoggedIn = {
                    navController.navigate(Routes.HOME) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
                },
                onGoRegister = { navController.navigate(Routes.REGISTER) },
            )
        }
        composable(Routes.REGISTER) {
            RegisterScreen(
                onBack = { navController.popBackStack() },
                onRegistered = { navController.navigate(Routes.VERIFY_EMAIL) },
                onGoLogin = { navController.navigate(Routes.LOGIN) },
            )
        }
        composable(Routes.VERIFY_EMAIL) {
            EmailVerificationScreen(
                onVerified = { navController.navigate(Routes.LANGUAGE_SELECTION) },
                onSkip = { navController.navigate(Routes.LANGUAGE_SELECTION) },
            )
        }
        composable(Routes.LANGUAGE_SELECTION) {
            LanguageSelectionScreen(
                onContinue = { navController.navigate(Routes.LEARNING_GOALS) },
            )
        }
        composable(Routes.LEARNING_GOALS) {
            LearningGoalsScreen(
                onFinish = {
                    navController.navigate(Routes.HOME) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
                },
            )
        }
        composable(Routes.HOME) {
            HomeShell(
                onLoggedOut = {
                    navController.navigate(Routes.ONBOARDING) { popUpTo(0) { inclusive = true } }
                },
                onOpenChat = { id -> navController.navigate(Routes.chat(id)) },
                onChatWithUser = { userId -> navController.navigate(Routes.chatWithUser(userId)) },
                onOpenVoiceRooms = { navController.navigate(Routes.VOICE_ROOMS) },
                onOpenNotifications = { navController.navigate(Routes.NOTIFICATIONS) },
                onOpenPremium = { navController.navigate(Routes.PREMIUM) },
            )
        }
        composable(
            Routes.CHAT,
            arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
        ) {
            ChatScreen()
        }
        composable(
            Routes.CHAT_WITH_USER,
            arguments = listOf(navArgument("userId") { type = NavType.StringType }),
        ) { entry ->
            val userId = entry.arguments?.getString("userId") ?: return@composable
            ChatWithUserResolver(
                userId = userId,
                onResolved = { convId ->
                    navController.navigate(Routes.chat(convId)) {
                        popUpTo(Routes.CHAT_WITH_USER) { inclusive = true }
                    }
                },
                onFailed = { navController.popBackStack() },
            )
        }
        composable(Routes.VOICE_ROOMS) {
            VoiceRoomsScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.NOTIFICATIONS) {
            NotificationsScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.PREMIUM) {
            PremiumScreen(onBack = { navController.popBackStack() })
        }
    }
}
