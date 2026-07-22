package com.tripify.android

import android.app.Application
import com.tripify.android.api.ApiClient
import com.tripify.android.auth.AuthManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Application class. Holds global singletons so they survive configuration changes and
 * are accessible from both the phone UI and the CarAppService.
 */
class TripifyApp : Application() {

    // Shared auth state observed by MainActivity and TripifySession
    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn

    lateinit var authManager: AuthManager
        private set

    lateinit var apiClient: ApiClient
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        apiClient = ApiClient(this)
        authManager = AuthManager(this, apiClient) { loggedIn ->
            _isLoggedIn.value = loggedIn
        }
    }

    companion object {
        lateinit var instance: TripifyApp
            private set
    }
}
