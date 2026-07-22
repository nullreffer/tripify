package com.tripify.android.api

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.tripify.android.api.models.AiAction
import com.tripify.android.api.models.AutoAiResponse
import com.tripify.android.api.models.NearbyPlace
import com.tripify.android.api.models.Stop
import com.tripify.android.api.models.Trip
import com.tripify.android.api.models.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

/**
 * All network calls to the Tripify backend.
 * Each function returns [Result] so callers can handle success/failure cleanly.
 */
class TripifyRepository(private val apiClient: ApiClient) {

    private val gson = Gson()
    private val base get() = apiClient.baseUrl
    private val http get() = apiClient.httpClient

    // ── Auth ──────────────────────────────────────────────────────────────────

    /** Returns the currently authenticated user, or null if not signed in. */
    suspend fun getMe(): Result<User> = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("$base/auth/me").get().build()
            val resp = http.newCall(req).execute()
            if (resp.code == 401) throw IllegalStateException("Not authenticated")
            val body = resp.body?.string() ?: throw Exception("Empty response")
            gson.fromJson(body, User::class.java)
        }
    }

    suspend fun logout(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url("$base/auth/logout")
                .post("{}".toRequestBody(JSON_MEDIA))
                .build()
            http.newCall(req).execute()
            apiClient.clearCookies()
            Unit
        }
    }

    // ── Trips ─────────────────────────────────────────────────────────────────

    suspend fun getTrips(): Result<List<Trip>> = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("$base/api/trips").get().build()
            val resp = http.newCall(req).execute()
            checkOk(resp)
            val body = resp.body?.string() ?: "[]"
            val type = object : TypeToken<List<Trip>>() {}.type
            gson.fromJson<List<Trip>>(body, type)
        }
    }

    // ── Stops ─────────────────────────────────────────────────────────────────

    suspend fun getStops(tripId: String): Result<List<Stop>> = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("$base/api/trips/$tripId/stops").get().build()
            val resp = http.newCall(req).execute()
            checkOk(resp)
            val body = resp.body?.string() ?: "[]"
            val type = object : TypeToken<List<Stop>>() {}.type
            gson.fromJson<List<Stop>>(body, type)
        }
    }

    suspend fun markStopReached(tripId: String, stopId: String, reached: Boolean): Result<Stop> =
        withContext(Dispatchers.IO) {
            runCatching {
                val payload = gson.toJson(mapOf("reached" to reached))
                val req = Request.Builder()
                    .url("$base/api/trips/$tripId/stops/$stopId/reach")
                    .post(payload.toRequestBody(JSON_MEDIA))
                    .build()
                val resp = http.newCall(req).execute()
                checkOk(resp)
                val body = resp.body?.string() ?: throw Exception("Empty response")
                gson.fromJson(body, Stop::class.java)
            }
        }

    suspend fun addStop(
        tripId: String,
        name: String,
        lat: Double,
        lng: Double,
        address: String? = null,
        pinType: String = "GENERAL"
    ): Result<Stop> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = gson.toJson(
                mapOf(
                    "name" to name,
                    "lat" to lat,
                    "lng" to lng,
                    "address" to address,
                    "pinType" to pinType
                )
            )
            val req = Request.Builder()
                .url("$base/api/trips/$tripId/stops")
                .post(payload.toRequestBody(JSON_MEDIA))
                .build()
            val resp = http.newCall(req).execute()
            checkOk(resp)
            val body = resp.body?.string() ?: throw Exception("Empty response")
            gson.fromJson(body, Stop::class.java)
        }
    }

    // ── AI ────────────────────────────────────────────────────────────────────

    /**
     * Sends a voice message to the AI endpoint in "auto" mode.
     * The backend returns a concise TTS reply and optional structured actions.
     */
    suspend fun sendAutoAiMessage(tripId: String, message: String): Result<AutoAiResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val payload = gson.toJson(mapOf("message" to message, "mode" to "auto"))
                val req = Request.Builder()
                    .url("$base/api/trips/$tripId/ai")
                    .post(payload.toRequestBody(JSON_MEDIA))
                    .build()
                val resp = http.newCall(req).execute()
                checkOk(resp)
                val body = resp.body?.string() ?: throw Exception("Empty response")
                val json = gson.fromJson(body, JsonObject::class.java)

                val reply = when {
                    json.has("reply") -> json.get("reply").asString
                    json.has("message") -> {
                        // Fallback: web-mode response shape { message: { content: ... } }
                        val msgObj = json.getAsJsonObject("message")
                        msgObj?.get("content")?.asString ?: "No response"
                    }
                    else -> "No response"
                }

                val actionType = object : TypeToken<List<AiAction>>() {}.type
                val actions: List<AiAction> = if (json.has("actions")) {
                    runCatching { gson.fromJson(json.getAsJsonArray("actions"), actionType) }
                        .getOrDefault(emptyList())
                } else emptyList()

                AutoAiResponse(reply = reply, actions = actions)
            }
        }

    // ── Places ────────────────────────────────────────────────────────────────

    suspend fun searchNearby(
        query: String,
        lat: Double,
        lng: Double,
        radiusMiles: Int = 10
    ): Result<List<NearbyPlace>> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "$base/api/places/nearby" +
                    "?q=${query.encodeUrl()}&lat=$lat&lng=$lng&radius=$radiusMiles"
            val req = Request.Builder().url(url).get().build()
            val resp = http.newCall(req).execute()
            checkOk(resp)
            val body = resp.body?.string() ?: "[]"
            val type = object : TypeToken<List<NearbyPlace>>() {}.type
            gson.fromJson<List<NearbyPlace>>(body, type)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun checkOk(resp: okhttp3.Response) {
        if (!resp.isSuccessful) throw Exception("HTTP ${resp.code}")
    }

    private fun String.encodeUrl() = java.net.URLEncoder.encode(this, "UTF-8")
}
