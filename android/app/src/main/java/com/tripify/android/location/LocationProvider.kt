package com.tripify.android.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Wraps [FusedLocationProviderClient] and exposes location updates as a [Flow].
 *
 * The caller is responsible for checking / requesting ACCESS_FINE_LOCATION permission
 * before collecting the flow.
 */
class LocationProvider(context: Context) {

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission")
    fun locationFlow(intervalMs: Long = 3_000L): Flow<Location> = callbackFlow {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateDistanceMeters(10f)
            .build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { trySend(it) }
            }
        }

        fusedClient.requestLocationUpdates(request, callback, null)

        awaitClose {
            fusedClient.removeLocationUpdates(callback)
        }
    }

    /**
     * Returns the last known location (fast, no guaranteed accuracy).
     * Returns null if no location is available.
     */
    @SuppressLint("MissingPermission")
    suspend fun getLastLocation(): Location? {
        val task = fusedClient.lastLocation
        return try {
            com.google.android.gms.tasks.Tasks.await(task)
        } catch (_: Exception) {
            null
        }
    }
}
