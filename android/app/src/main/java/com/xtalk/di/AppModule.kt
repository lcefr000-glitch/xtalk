package com.xtalk.app.di

import android.content.Context
import androidx.room.Room
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.xtalk.app.BuildConfig
import com.xtalk.app.core.db.AppDatabase
import com.xtalk.app.core.network.AuthApi
import com.xtalk.app.core.network.AuthInterceptor
import com.xtalk.app.core.network.ChatApi
import com.xtalk.app.core.network.SessionsApi
import com.xtalk.app.core.network.FriendsApi
import com.xtalk.app.core.network.ProgressApi
import com.xtalk.app.core.network.CoursesApi
import com.xtalk.app.core.network.DiscoveryApi
import com.xtalk.app.core.network.MomentsApi
import com.xtalk.app.core.network.NotificationsApi
import com.xtalk.app.core.network.SubscriptionsApi
import com.xtalk.app.core.network.EconomyApi
import com.xtalk.app.core.network.TokenAuthenticator
import com.xtalk.app.core.network.ToolsApi
import com.xtalk.app.core.network.UserApi
import com.xtalk.app.core.network.VoiceApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

class RetrofitHolder(val authed: Retrofit)

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun json(): Json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    /** Unauthenticated client: used for login/register/refresh (avoids authenticator loops). */
    @Provides
    @Singleton
    fun authApi(json: Json, @ApplicationContext context: Context): AuthApi {
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(com.xtalk.app.core.network.StatusInterceptor())
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
                }
            }
            .build()
        return Retrofit.Builder()
            .baseUrl(com.xtalk.core.network.ServerConfig.baseUrl(context))
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AuthApi::class.java)
    }

    @Provides
    @Singleton
    fun retrofitHolder(
        json: Json,
        @ApplicationContext context: Context,
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
    ): RetrofitHolder {
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(com.xtalk.app.core.network.StatusInterceptor())
            .addInterceptor(authInterceptor)
            .authenticator(tokenAuthenticator)
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
                }
            }
            .build()
        val retrofit = Retrofit.Builder()
            .baseUrl(com.xtalk.core.network.ServerConfig.baseUrl(context))
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
        return RetrofitHolder(retrofit)
    }

    @Provides
    @Singleton
    fun userApi(holder: RetrofitHolder): UserApi = holder.authed.create(UserApi::class.java)

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "xtalk.db").build()

    @Provides
    fun discoveryApi(holder: RetrofitHolder): DiscoveryApi = holder.authed.create(DiscoveryApi::class.java)

    @Provides
    fun chatApi(holder: RetrofitHolder): ChatApi = holder.authed.create(ChatApi::class.java)

    @Provides
    fun friendsApi(holder: RetrofitHolder): FriendsApi = holder.authed.create(FriendsApi::class.java)

    @Provides
    fun progressApi(holder: RetrofitHolder): ProgressApi = holder.authed.create(ProgressApi::class.java)

    @Provides
    fun coursesApi(holder: RetrofitHolder): CoursesApi = holder.authed.create(CoursesApi::class.java)

    @Provides
    fun sessionsApi(holder: RetrofitHolder): SessionsApi = holder.authed.create(SessionsApi::class.java)

    @Provides
    fun momentsApi(holder: RetrofitHolder): MomentsApi = holder.authed.create(MomentsApi::class.java)

    @Provides
    fun voiceApi(holder: RetrofitHolder): VoiceApi = holder.authed.create(VoiceApi::class.java)

    @Provides
    @Singleton
    fun voiceSession(@ApplicationContext context: Context): com.xtalk.app.feature.voice.VoiceSession =
        com.xtalk.app.feature.voice.VoiceSession(context.applicationContext)

    @Provides
    fun notificationsApi(holder: RetrofitHolder): NotificationsApi = holder.authed.create(NotificationsApi::class.java)

    @Provides
    fun subscriptionsApi(holder: RetrofitHolder): SubscriptionsApi = holder.authed.create(SubscriptionsApi::class.java)

    @Provides
    fun economyApi(holder: RetrofitHolder): EconomyApi = holder.authed.create(EconomyApi::class.java)

    @Provides
    fun extrasApi(holder: RetrofitHolder): com.xtalk.app.core.network.ExtrasApi = holder.authed.create(com.xtalk.app.core.network.ExtrasApi::class.java)

    @Provides
    fun vocabApi(holder: RetrofitHolder): com.xtalk.app.core.network.VocabApi = holder.authed.create(com.xtalk.app.core.network.VocabApi::class.java)

    @Provides
    fun toolsApi(holder: RetrofitHolder): ToolsApi = holder.authed.create(ToolsApi::class.java)
}
