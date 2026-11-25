package com.xtalk.app.core.db

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/** Offline cache of the signed-in user's profile (Phase 1: profile only). */
@Entity(tableName = "cached_profile")
data class CachedProfile(
    @PrimaryKey val userId: String,
    val username: String,
    val displayName: String,
    val bio: String?,
    val country: String?,
    val photoUrl: String?,
    val languagesSummary: String,
    val cachedAt: Long,
)

@Dao
interface CachedProfileDao {
    @Query("SELECT * FROM cached_profile WHERE userId = :userId")
    fun observe(userId: String): Flow<CachedProfile?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: CachedProfile)

    @Query("DELETE FROM cached_profile")
    suspend fun clear()
}

@Database(entities = [CachedProfile::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cachedProfileDao(): CachedProfileDao
}
