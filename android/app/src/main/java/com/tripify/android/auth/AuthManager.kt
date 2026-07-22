package com.tripify.android.auth

import android.content.Context
import android.webkit.CookieManager
import com.tripify.android.api.ApiClient
import com.tripify.android.api.TripifyRepository
import com.tripify.android.api.models.User
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Manages authentication state for the Tripify app.
 *
 * After Chrome Custom Tabs completes the Google OAuth flow, the backend sets a
 * session cookie that CookieManager persists.  [onAuthStateChanged] is called
 * whenever the login status changes so observers (MainActivity, TripifySession)
 * can react.
 */
class AuthManager(
    private val context: Context,
    private val apiClient: ApiClient,
    private val onAuthStateChanged: (loggedIn: Boolean) -> Unit
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val repository = TripifyRepository(apiClient)

    var currentUser: User? = null
        private set

    /**
     * Call once at startup (and after receiving the OAuth deep-link callback)
     * to determine whether we already have a valid session.
     */
    fun checkSession() {
        scope.launch {
            val result = repository.getMe()
            result.onSuccess { user ->
                currentUser = user
                onAuthStateChanged(true)
            }.onFailure {
                currentUser = null
                onAuthStateChanged(false)
            }
        }
    }

    /**
     * Called by [LoginActivity] after the OAuth deep-link `tripify://auth/callback`
     * is received.  Cookies have been written by Chrome Custom Tabs at this point.
     */
    fun onOAuthCallbackReceived() {
        // Sync WebKit cookies to our OkHttp CookieJar by forcing a flush
        CookieManager.getInstance().flush()
        checkSession()
    }

    fun logout() {
        scope.launch {
            repository.logout()
            currentUser = null
            onAuthStateChanged(false)
        }
    }

    val isLoggedIn: Boolean get() = currentUser != null

    /** Full URL to start the Google OAuth flow in Chrome Custom Tabs (mobile=true tells
     *  the backend to redirect back to the tripify:// deep link instead of the web app). */
    fun buildAuthUrl(): String =
        "${apiClient.baseUrl}/auth/google?mobile=true"
}
