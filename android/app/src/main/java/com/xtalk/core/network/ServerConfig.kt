package com.xtalk.core.network

import android.content.Context
import com.xtalk.app.BuildConfig

/**
 * Debug-only runtime override of the API base URL (e.g. http://192.168.1.20:3000/).
 * Release builds always use BuildConfig.API_BASE_URL (https only).
 */
object ServerConfig {
    private const val PREFS = "xtalk_server"
    private const val KEY = "base_url"

    fun baseUrl(context: Context): String {
        if (!BuildConfig.DEBUG) return BuildConfig.API_BASE_URL
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        return normalize(saved) ?: BuildConfig.API_BASE_URL
    }

    fun save(context: Context, raw: String): Boolean {
        val n = normalize(raw) ?: return false
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, n).commit()
        return true
    }

    fun normalize(raw: String?): String? {
        var s = raw?.trim().orEmpty()
        if (s.isEmpty()) return null
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
        if (s.removePrefix("http://").removePrefix("https://").isBlank()) return null
        return if (s.endsWith("/")) s else "$s/"
    }
}
