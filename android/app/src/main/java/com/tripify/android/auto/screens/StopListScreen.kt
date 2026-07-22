package com.tripify.android.auto.screens

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import com.tripify.android.R
import com.tripify.android.TripifyApp
import com.tripify.android.api.TripifyRepository
import com.tripify.android.api.models.Stop
import com.tripify.android.api.models.Trip
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

private val PIN_EMOJI = mapOf(
    "GENERAL" to "📍", "STAY" to "🏠", "HOTEL" to "🏨",
    "CAMPGROUND" to "🏕", "HIKING_TRAIL" to "🥾", "RESTAURANT" to "🍴",
    "ATTRACTION" to "🎡", "GAS_STATION" to "⛽", "EV_CHARGER" to "⚡",
    "AIRPORT" to "✈", "PARKING" to "🅿", "OTHER" to "📌"
)

/**
 * Lists all stops for a trip.
 * - Tapping a stop pushes [StopDetailScreen].
 * - The "Navigate" header action pushes [TripNavigationScreen].
 */
class StopListScreen(
    carContext: CarContext,
    private val trip: Trip
) : Screen(carContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val repository = TripifyRepository(TripifyApp.instance.apiClient)

    private var stops: List<Stop> = emptyList()
    private var isLoading = true

    init {
        lifecycle.addObserver(object : androidx.lifecycle.DefaultLifecycleObserver {
            override fun onCreate(owner: androidx.lifecycle.LifecycleOwner) = loadStops()
            override fun onDestroy(owner: androidx.lifecycle.LifecycleOwner) = scope.cancel()
        })
    }

    private fun loadStops() {
        scope.launch {
            isLoading = true
            invalidate()
            repository.getStops(trip.id)
                .onSuccess { result ->
                    stops = result
                    isLoading = false
                }
                .onFailure {
                    isLoading = false
                }
            invalidate()
        }
    }

    override fun onGetTemplate(): Template {
        if (isLoading) {
            return ListTemplate.Builder()
                .setLoading(true)
                .setHeaderAction(Action.BACK)
                .build()
        }

        val listBuilder = ItemList.Builder()

        if (stops.isEmpty()) {
            listBuilder.setNoItemsMessage("No stops on this trip.")
        } else {
            stops.forEachIndexed { index, stop ->
                val emoji = PIN_EMOJI[stop.pinType] ?: "📍"
                val status = if (stop.reached) "✓ Reached" else "Stop ${index + 1}"
                val text = listOf(status, stop.address).filterNotNull().joinToString(" · ")

                listBuilder.addItem(
                    Row.Builder()
                        .setTitle("$emoji ${stop.name}")
                        .addText(text)
                        .setOnClickListener {
                            screenManager.push(StopDetailScreen(carContext, trip, stop, stops))
                        }
                        .build()
                )
            }
        }

        return ListTemplate.Builder()
            .setHeaderAction(Action.BACK)
            .setTitle(trip.title)
            .setActionStrip(
                androidx.car.app.model.ActionStrip.Builder()
                    .addAction(
                        Action.Builder()
                            .setTitle(carContext.getString(R.string.navigate))
                            .setOnClickListener {
                                screenManager.push(TripNavigationScreen(carContext, trip, stops))
                            }
                            .build()
                    )
                    .build()
            )
            .setSingleList(listBuilder.build())
            .build()
    }

    /** Called by child screens when they mutate a stop (e.g. mark reached). */
    fun refresh() = loadStops()
}
