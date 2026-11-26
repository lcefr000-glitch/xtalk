package com.xtalk.app.core.common

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.util.LruCache
import java.io.ByteArrayOutputStream

object ImageUtil {
    private val cache = LruCache<String, Bitmap>(40)

    /** Reads an image from [uri], center-crops to a square, shrinks to [size] px, returns a data URI (JPEG). */
    fun pickedToDataUri(ctx: Context, uri: Uri, size: Int = 256): String? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= size && bounds.outHeight / (sample * 2) >= size) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val bmp = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
        val side = minOf(bmp.width, bmp.height)
        val square = Bitmap.createBitmap(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side)
        val scaled = Bitmap.createScaledBitmap(square, size, size, true)
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }.getOrNull()

    /** Decodes a data URI produced by [pickedToDataUri]; null for anything else. */
    fun decodeDataUri(uri: String?): Bitmap? {
        if (uri == null || !uri.startsWith("data:image")) return null
        cache.get(uri)?.let { return it }
        return runCatching {
            val b64 = uri.substringAfter("base64,")
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }.getOrNull()?.also { cache.put(uri, it) }
    }

    /** Whole days since an ISO-8601 timestamp (0 when unparsable). */
    fun daysSince(iso: String?): Long {
        if (iso.isNullOrBlank()) return 0
        return runCatching {
            val t = java.time.Instant.parse(iso).toEpochMilli()
            ((System.currentTimeMillis() - t) / 86_400_000L).coerceAtLeast(0)
        }.getOrDefault(0)
    }
}
