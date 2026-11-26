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
                onLoggedIn = { navController.navigate(Routes.LANGUAGE_SELECTION) },
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
                onOpenUser = { id -> navController.navigate(Routes.userProfile(id)) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onOpenEditProfile = { navController.navigate(Routes.EDIT_PROFILE) },
                onOpenVocab = { navController.navigate(Routes.VOCAB) },
                onOpenSessions = { navController.navigate(Routes.SESSIONS) },
                onOpenTools = { navController.navigate(Routes.TOOLS) },
                onOpenHub = { navController.navigate(Routes.HUB) },
            )
        }
        composable(Routes.HUB) {
            com.xtalk.app.feature.learn.LearnHubScreen(
                onBack = { navController.popBackStack() },
                onProgress = { navController.navigate(Routes.PROGRESS) },
                onCourses = { navController.navigate(Routes.COURSES) },
                onFriends = { navController.navigate(Routes.FRIENDS) },
            )
        }
        composable(Routes.PROGRESS) { com.xtalk.app.feature.learn.ProgressScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.COURSES) { com.xtalk.app.feature.learn.CoursesScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.FRIENDS) {
            com.xtalk.app.feature.learn.FriendsScreen(
                onBack = { navController.popBackStack() },
                onOpenUser = { id -> navController.navigate(Routes.userProfile(id)) },
            )
        }
        composable(Routes.TOOLS) {
            com.xtalk.app.feature.tools.ToolsScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.SESSIONS) {
            com.xtalk.app.feature.sessions.SessionsScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.VOCAB) {
            com.xtalk.app.feature.vocab.VocabScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.BLOCKED) {
            com.xtalk.app.feature.profile.BlockedScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.EDIT_PROFILE) {
            com.xtalk.app.feature.profile.EditProfileScreen(
                onBack = { navController.popBackStack() },
                onOpenPremium = { navController.navigate(Routes.PREMIUM) },
                onPreview = { id -> navController.navigate(Routes.userProfile(id)) },
            )
        }
        composable(
            Routes.USER_PROFILE,
            arguments = listOf(navArgument("userId") { type = NavType.StringType }),
        ) { entry ->
            val userId = entry.arguments?.getString("userId") ?: return@composable
            com.xtalk.app.feature.profile.UserProfileScreen(
                userId = userId,
                onBack = { navController.popBackStack() },
                onMessage = { id -> navController.navigate(Routes.chatWithUser(id)) },
            )
        }
        composable(Routes.SETTINGS) {
            com.xtalk.app.feature.profile.SettingsScreen(
                onBack = { navController.popBackStack() },
                onLoggedOut = { navController.navigate(Routes.ONBOARDING) { popUpTo(0) { inclusive = true } } },
                onOpenConnections = { navController.navigate(Routes.connections(it)) },
                onOpenBlocked = { navController.navigate(Routes.BLOCKED) },
            )
        }
        composable(
            Routes.CONNECTIONS,
            arguments = listOf(navArgument("kind") { type = NavType.StringType }),
        ) { entry ->
            com.xtalk.app.feature.profile.ConnectionsScreen(
                kind = entry.arguments?.getString("kind") ?: "followers",
                onBack = { navController.popBackStack() },
                onOpenUser = { navController.navigate(Routes.userProfile(it)) },
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
