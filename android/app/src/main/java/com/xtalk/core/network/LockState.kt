package com.xtalk.app.core.network

import android.content.Context
import com.xtalk.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Owner kill switch as seen by the app: the server said "locked" or "update required". */
data class LockInfo(val updateRequired: Boolean, val message: String)

object LockState {
    private val _lock = MutableStateFlow<LockInfo?>(null)
    val lock: StateFlow<LockInfo?> = _lock.asStateFlow()
    fun set(info: LockInfo?) { _lock.value = info }

    /** Reads /app/status at launch. Network errors are ignored (never lock on a flaky connection). */
    suspend fun check(context: Context) = withContext(Dispatchers.IO) {
        runCatching {
            val client = OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS).build()
            val req = Request.Builder().url(com.xtalk.core.network.ServerConfig.baseUrl(context) + "api/v1/app/status").header("X-App-Version", BuildConfig.VERSION_CODE.toString()).build()
            client.newCall(req).execute().use { r ->
                val body = r.body?.string().orEmpty()
                if (r.code == 503 || r.code == 426) { fromCode(r.code, body); return@use }
                if (!r.isSuccessful) return@use
                val j = JSONObject(body)
                val msg = j.optString("message")
                if (j.optBoolean("locked")) _lock.value = LockInfo(false, msg)
                else if (j.optInt("minVersionCode") > BuildConfig.VERSION_CODE) _lock.value = LockInfo(true, msg)
                else _lock.value = null
            }
        }
    }

    fun fromCode(code: Int, body: String) {
        val j = runCatching { JSONObject(body) }.getOrNull() ?: return
        when (j.optString("code")) {
            "LOCKED" -> _lock.value = LockInfo(false, j.optString("message"))
            "UPDATE_REQUIRED" -> _lock.value = LockInfo(true, j.optString("message"))
        }
    }
}

/** Sends the app version on every call and reacts to the server's lock responses. */
class StatusInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val resp = chain.proceed(chain.request().newBuilder().header("X-App-Version", BuildConfig.VERSION_CODE.toString()).build())
        if (resp.code == 503 || resp.code == 426) {
            runCatching { LockState.fromCode(resp.code, resp.peekBody(2048).string()) }
        }
        return resp
    }
}
