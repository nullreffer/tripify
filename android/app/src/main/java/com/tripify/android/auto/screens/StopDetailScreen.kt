package com.tripify.android.auto.screens

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.LongMessageTemplate
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
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

/**
 * Shows details for a single stop:
 *  - Name, address, notes
 *  - "Mark Reached" / "Mark Unreached" action
 */
class StopDetailScreen(
    carContext: CarContext,
    private val trip: Trip,
    private stop: Stop,
    private val allStops: List<Stop>
) : Screen(carContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val repository = TripifyRepository(TripifyApp.instance.apiClient)
    private var isBusy = false

    init {
        lifecycle.addObserver(object : androidx.lifecycle.DefaultLifecycleObserver {
            override fun onDestroy(owner: androidx.lifecycle.LifecycleOwner) = scope.cancel()
        })
    }

    override fun onGetTemplate(): Template {
        val stopIndex = allStops.indexOfFirst { it.id == stop.id }
        val stopNumber = if (stopIndex >= 0) "Stop ${stopIndex + 1} of ${allStops.size}" else ""

        val bodyLines = buildList {
            add(stopNumber)
            stop.address?.let { add("📍 $it") }
            stop.targetDate?.let { add("🗓 Target: $it") }
            stop.notes?.let { if (it.isNotBlank()) add("📝 $it") }
            if (stop.reached && stop.reachedAt != null) add("✅ Reached")
        }

        val reachedLabel = if (stop.reached)
            "Mark Not Reached"
        else
            carContext.getString(R.string.mark_reached)

        return PaneTemplate.Builder(
            Pane.Builder()
                .addRow(
                    Row.Builder()
                        .setTitle(stop.name)
                        .apply { bodyLines.forEach { addText(it) } }
                        .build()
                )
                .addAction(
                    Action.Builder()
                        .setTitle(reachedLabel)
                        .setBackgroundColor(
                            if (stop.reached) CarColor.DEFAULT else CarColor.GREEN
                        )
                        .setOnClickListener { toggleReached() }
                        .build()
                )
                .setIsLoading(isBusy)
                .build()
        )
            .setHeaderAction(Action.BACK)
            .setTitle(stop.name)
            .build()
    }

    private fun toggleReached() {
        scope.launch {
            isBusy = true
            invalidate()
            repository.markStopReached(trip.id, stop.id, !stop.reached)
                .onSuccess { updated ->
                    stop = updated
                }
            isBusy = false
            invalidate()
        }
    }
}
