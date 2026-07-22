package com.tripify.android.auto

import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.tripify.android.TripifyApp
import com.tripify.android.auto.screens.SignInScreen
import com.tripify.android.auto.screens.TripListScreen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * One [Session] is created per connection to the car head unit.
 *
 * Responsibilities:
 *  - Return the correct initial screen based on auth state.
 *  - Observe the global auth [StateFlow] and invalidate/replace the top screen
 *    when the user logs in or out on their phone.
 */
class TripifySession : Session() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val app get() = TripifyApp.instance

    override fun onCreateScreen(intent: android.content.Intent): Screen {
        // Kick off a session check in case the cookies exist but we haven't checked yet
        app.authManager.checkSession()

        // Observe auth state changes so the car screen updates automatically
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) {
                scope.launch {
                    app.isLoggedIn.collect { loggedIn ->
                        val current = screenManager.top
                        if (loggedIn && current is SignInScreen) {
                            // Replace sign-in with trip list after phone login
                            screenManager.push(TripListScreen(carContext))
                        } else if (!loggedIn && current !is SignInScreen) {
                            // Pop back to sign-in if the user logged out
                            screenManager.pushForResult(SignInScreen(carContext)) {}
                        }
                    }
                }
            }

            override fun onDestroy(owner: LifecycleOwner) {
                scope.cancel()
            }
        })

        return if (app.authManager.isLoggedIn) {
            TripListScreen(carContext)
        } else {
            SignInScreen(carContext)
        }
    }
}
