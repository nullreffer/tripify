package com.tripify.android.auto.screens

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.location.Location
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.model.Distance
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.Destination
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.RoutingInfo
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.TravelEstimate
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.tripify.android.R
import com.tripify.android.TripifyApp
import com.tripify.android.api.TripifyRepository
import com.tripify.android.api.models.Stop
import com.tripify.android.api.models.Trip
import com.tripify.android.location.LocationProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * The primary driving screen.
 *
 * Uses [NavigationTemplate] with a [SurfaceCallback] to draw:
 *  - Trip route (polyline connecting stops in order)
 *  - Stop markers (numbered circles, green = reached, orange = next, grey = upcoming)
 *  - User's current GPS location (blue puck)
 *
 * The navigation info panel shows the next unreached stop and a rough distance estimate.
 * A mic button in the action strip opens [VoiceScreen] for Gemini voice commands.
 */
class TripNavigationScreen(
    carContext: CarContext,
    private val trip: Trip,
    private var stops: List<Stop>
) : Screen(carContext), SurfaceCallback {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val repository = TripifyRepository(TripifyApp.instance.apiClient)
    private val locationProvider = LocationProvider(carContext)

    private var surfaceContainer: SurfaceContainer? = null
    private var visibleArea: Rect? = null
    private var userLocation: Location? = null

    // Paint objects (reused across draw calls for efficiency)
    private val bgPaint = Paint().apply { color = Color.parseColor("#1e293b") }
    private val routePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#f97316")
        strokeWidth = 8f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val reachedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#22c55e")
        strokeWidth = 8f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val stopFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stopStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        strokeWidth = 3f
        style = Paint.Style.STROKE
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = 24f
        isFakeBoldText = true
    }
    private val locationPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#3b82f6")
        style = Paint.Style.FILL
    }
    private val locationRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        strokeWidth = 4f
        style = Paint.Style.STROKE
    }

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) {
                registerSurfaceCallback()
                startLocationUpdates()
            }

            override fun onDestroy(owner: LifecycleOwner) {
                try {
                    carContext.getCarService(AppManager::class.java)
                        .setSurfaceCallback(null)
                } catch (_: Exception) {}
                scope.cancel()
            }
        })
    }

    private fun registerSurfaceCallback() {
        try {
            carContext.getCarService(AppManager::class.java).setSurfaceCallback(this)
        } catch (e: Exception) {
            // Surface not available on all head units
        }
    }

    private fun startLocationUpdates() {
        if (!hasLocationPermission()) return
        scope.launch {
            locationProvider.locationFlow()
                .catch { /* ignore; location unavailable */ }
                .collect { location ->
                    userLocation = location
                    drawRoute()
                }
        }
    }

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(
            carContext, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

    // ── SurfaceCallback ──────────────────────────────────────────────────────

    override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
        this.surfaceContainer = surfaceContainer
        drawRoute()
    }

    override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) {
        this.surfaceContainer = null
    }

    override fun onVisibleAreaChanged(visibleArea: Rect) {
        this.visibleArea = visibleArea
        drawRoute()
    }

    override fun onStableAreaChanged(stableArea: Rect) {
        drawRoute()
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    private fun drawRoute() {
        val container = surfaceContainer ?: return
        val surface = container.surface ?: return

        val canvas: Canvas
        try {
            canvas = surface.lockHardwareCanvas() ?: surface.lockCanvas(null) ?: return
        } catch (_: Exception) {
            return
        }

        try {
            draw(canvas, container.width, container.height)
        } finally {
            surface.unlockCanvasAndPost(canvas)
        }
    }

    private fun draw(canvas: Canvas, w: Int, h: Int) {
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), bgPaint)

        if (stops.isEmpty()) return

        val padding = 80f

        // Collect all points for bounding box (stops + user location)
        val allLats = stops.map { it.lat }.toMutableList()
        val allLngs = stops.map { it.lng }.toMutableList()
        userLocation?.let { allLats.add(it.latitude); allLngs.add(it.longitude) }

        val minLat = allLats.min()
        val maxLat = allLats.max()
        val minLng = allLngs.min()
        val maxLng = allLngs.max()

        val latRange = if (maxLat - minLat < 0.001) 0.01 else maxLat - minLat
        val lngRange = if (maxLng - minLng < 0.001) 0.01 else maxLng - minLng

        // Project geo → pixel (simple linear, good enough for trip-scale maps)
        fun px(lng: Double) = padding + ((lng - minLng) / lngRange) * (w - 2 * padding)
        fun py(lat: Double) = (h - padding) - ((lat - minLat) / latRange) * (h - 2 * padding)

        val nextStop = stops.firstOrNull { !it.reached }

        // Draw route lines
        for (i in 0 until stops.size - 1) {
            val s = stops[i]
            val e = stops[i + 1]
            val paint = if (s.reached && e.reached) reachedPaint else routePaint
            canvas.drawLine(px(s.lng).toFloat(), py(s.lat).toFloat(),
                px(e.lng).toFloat(), py(e.lat).toFloat(), paint)
        }

        // Draw user location puck
        userLocation?.let { loc ->
            val ux = px(loc.longitude).toFloat()
            val uy = py(loc.latitude).toFloat()
            canvas.drawCircle(ux, uy, 18f, locationPaint)
            canvas.drawCircle(ux, uy, 18f, locationRingPaint)
        }

        // Draw stop markers
        stops.forEachIndexed { idx, stop ->
            val cx = px(stop.lng).toFloat()
            val cy = py(stop.lat).toFloat()
            val radius = if (stop.id == nextStop?.id) 28f else 22f

            stopFillPaint.color = when {
                stop.reached -> Color.parseColor("#22c55e")
                stop.id == nextStop?.id -> Color.parseColor("#f97316")
                else -> Color.parseColor("#475569")
            }

            canvas.drawCircle(cx, cy, radius, stopFillPaint)
            canvas.drawCircle(cx, cy, radius, stopStrokePaint)

            textPaint.textSize = if (stop.id == nextStop?.id) 20f else 16f
            val label = if (stop.reached) "✓" else "${idx + 1}"
            canvas.drawText(label, cx, cy + textPaint.textSize / 3, textPaint)
        }
    }

    // ── NavigationTemplate ────────────────────────────────────────────────────

    override fun onGetTemplate(): Template {
        val nextStop = stops.firstOrNull { !it.reached }
        val remaining = stops.count { !it.reached }

        val navInfoBuilder = RoutingInfo.Builder()

        if (nextStop != null) {
            val distanceMiles = userLocation?.let { loc ->
                haversineDistanceMiles(loc.latitude, loc.longitude, nextStop.lat, nextStop.lng)
            } ?: 0.0

            navInfoBuilder.setCurrentStep(
                Step.Builder("Next: ${nextStop.name}")
                    .setCue(nextStop.address ?: nextStop.name)
                    .build(),
                Distance.create(distanceMiles, Distance.UNIT_MILES)
            )

            navInfoBuilder.setRemainingSteps(
                Distance.create(
                    stops.filter { !it.reached }.sumOf { s ->
                        userLocation?.let { loc ->
                            haversineDistanceMiles(loc.latitude, loc.longitude, s.lat, s.lng)
                        } ?: 0.0
                    },
                    Distance.UNIT_MILES
                ),
                remaining
            )
        }

        val travelEstimate = if (nextStop != null) {
            TravelEstimate.Builder(
                Distance.create(
                    userLocation?.let { loc ->
                        haversineDistanceMiles(loc.latitude, loc.longitude, nextStop.lat, nextStop.lng)
                    } ?: 0.0,
                    Distance.UNIT_MILES
                ),
                ZonedDateTime.now(ZoneId.systemDefault())
            )
                .setRemainingTimeSeconds(
                    // Rough ETA: distance / 60 mph * 3600 seconds
                    ((userLocation?.let { loc ->
                        haversineDistanceMiles(loc.latitude, loc.longitude, nextStop.lat, nextStop.lng)
                    } ?: 0.0) / 60.0 * 3600.0).toLong()
                )
                .build()
        } else null

        return NavigationTemplate.Builder()
            .setNavigationInfo(navInfoBuilder.build())
            .apply {
                travelEstimate?.let { setDestinationTravelEstimate(it) }
            }
            .setActionStrip(
                ActionStrip.Builder()
                    .addAction(Action.BACK)
                    .addAction(
                        Action.Builder()
                            .setTitle("🎤 Ask AI")
                            .setOnClickListener {
                                screenManager.push(VoiceScreen(carContext, trip, stops))
                            }
                            .build()
                    )
                    .addAction(
                        Action.Builder()
                            .setTitle("Stops")
                            .setOnClickListener {
                                screenManager.push(StopListScreen(carContext, trip))
                            }
                            .build()
                    )
                    .build()
            )
            .setMapActionStrip(
                ActionStrip.Builder()
                    .addAction(Action.PAN)
                    .build()
            )
            .build()
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private fun haversineDistanceMiles(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ): Double {
        val R = 3_958.8 // Earth radius in miles
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = Math.sin(dLat / 2).let { it * it } +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                Math.sin(dLng / 2).let { it * it }
        return R * 2 * Math.asin(sqrt(a))
    }
}
