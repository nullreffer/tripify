package com.tripify.android.api.models

/**
 * Response from POST /api/trips/:tripId/ai when mode = "auto".
 *
 * The backend returns both a human-readable [reply] and an optional list of
 * structured [actions] that the car UI can execute without the user having to
 * type anything.
 */
data class AutoAiResponse(
    /** Concise spoken reply (2-3 sentences), suitable for TTS. */
    val reply: String,
    val actions: List<AiAction> = emptyList()
)

/**
 * A single action the AI wants the app to perform.
 *
 * [type] is one of:
 *  - "add_stop"      → add a new stop (lat/lng/name required)
 *  - "mark_reached"  → mark an existing stop as reached (stopId required)
 *  - "search_nearby" → search for a POI near a point (query required)
 *  - "navigate_to"   → launch system navigation to an existing stop (stopId required)
 */
data class AiAction(
    val type: String,
    /** For add_stop / navigate_to */
    val stopId: String? = null,
    val name: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val address: String? = null,
    /** For search_nearby */
    val query: String? = null,
    val near: String? = null
)

/** Nearby place returned by GET /api/places/nearby */
data class NearbyPlace(
    val id: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    val address: String?
)
