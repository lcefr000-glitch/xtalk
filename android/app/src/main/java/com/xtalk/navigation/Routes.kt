package com.xtalk.app.navigation

object Routes {
    const val SPLASH = "splash"
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val VERIFY_EMAIL = "verify_email"
    const val LANGUAGE_SELECTION = "language_selection"
    const val LEARNING_GOALS = "learning_goals"
    const val HOME = "home"
    const val CHAT = "chat/{conversationId}"
    const val CHAT_WITH_USER = "chat_user/{userId}"
    const val VOICE_ROOMS = "voice_rooms"
    const val NOTIFICATIONS = "notifications"
    const val PREMIUM = "premium"

    fun chat(conversationId: String) = "chat/$conversationId"
    fun chatWithUser(userId: String) = "chat_user/$userId"
}
