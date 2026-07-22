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
import com.tripify.android.api.models.Trip
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Displays the user's trip list in a [ListTemplate].
 * Tapping a trip pushes [TripNavigationScreen] onto the screen stack.
 */
class TripListScreen(carContext: CarContext) : Screen(carContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val repository = TripifyRepository(TripifyApp.instance.apiClient)

    private var trips: List<Trip> = emptyList()
    private var isLoading = true
    private var errorMsg: String? = null

    init {
        lifecycle.addObserver(object : androidx.lifecycle.DefaultLifecycleObserver {
            override fun onCreate(owner: androidx.lifecycle.LifecycleOwner) = loadTrips()
            override fun onDestroy(owner: androidx.lifecycle.LifecycleOwner) = scope.cancel()
        })
    }

    private fun loadTrips() {
        scope.launch {
            isLoading = true
            invalidate()
            repository.getTrips()
                .onSuccess { result ->
                    trips = result
                    isLoading = false
                    errorMsg = null
                }
                .onFailure { e ->
                    isLoading = false
                    errorMsg = e.message ?: carContext.getString(R.string.error_load_trips)
                }
            invalidate()
        }
    }

    override fun onGetTemplate(): Template {
        val headerAction = Action.Builder()
            .setTitle(carContext.getString(R.string.app_name))
            .setOnClickListener { /* no-op, title only */ }
            .build()

        if (isLoading) {
            return ListTemplate.Builder()
                .setLoading(true)
                .setHeaderAction(Action.APP_ICON)
                .build()
        }

        if (errorMsg != null) {
            return ListTemplate.Builder()
                .setHeaderAction(Action.APP_ICON)
                .setSingleList(
                    ItemList.Builder()
                        .addItem(
                            Row.Builder()
                                .setTitle(errorMsg!!)
                                .build()
                        )
                        .build()
                )
                .build()
        }

        val listBuilder = ItemList.Builder()

        if (trips.isEmpty()) {
            listBuilder.setNoItemsMessage(carContext.getString(R.string.no_trips))
        } else {
            trips.forEach { trip ->
                val progress = if (trip.stopCount > 0)
                    "${trip.reachedCount}/${trip.stopCount} stops"
                else "No stops"
                listBuilder.addItem(
                    Row.Builder()
                        .setTitle(trip.title)
                        .addText(progress)
                        .setOnClickListener {
                            screenManager.push(StopListScreen(carContext, trip))
                        }
                        .build()
                )
            }
        }

        return ListTemplate.Builder()
            .setHeaderAction(Action.APP_ICON)
            .setSingleList(listBuilder.build())
            .build()
    }
}
