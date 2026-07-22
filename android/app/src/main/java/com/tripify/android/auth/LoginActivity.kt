package com.tripify.android.auth

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import com.tripify.android.R
import com.tripify.android.TripifyApp

/**
 * Handles the Google OAuth login flow via Chrome Custom Tabs.
 *
 * Flow:
 *  1. MainActivity starts LoginActivity when the user taps "Sign In".
 *  2. LoginActivity immediately launches a Custom Tab to {backend}/auth/google?mobile=true.
 *  3. Google OAuth redirects back to the backend callback, which sets the session cookie
 *     and then redirects to tripify://auth/callback.
 *  4. Android resolves that URI back to LoginActivity (via the intent-filter in manifest).
 *  5. [onNewIntent] is called → we notify AuthManager → session check → update UI.
 */
class LoginActivity : AppCompatActivity() {

    private val authManager get() = TripifyApp.instance.authManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // If we were launched by the deep-link callback, handle it here
        if (intent?.data?.scheme == "tripify") {
            handleOAuthCallback()
            return
        }

        // Otherwise, open Chrome Custom Tabs for the OAuth flow
        launchCustomTab()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.data?.scheme == "tripify") {
            setIntent(intent)
            handleOAuthCallback()
        }
    }

    private fun launchCustomTab() {
        val primaryColor = getColor(R.color.colorPrimary)
        val tabIntent = CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(primaryColor)
                    .build()
            )
            .setShowTitle(true)
            .build()

        tabIntent.launchUrl(this, Uri.parse(authManager.buildAuthUrl()))
    }

    private fun handleOAuthCallback() {
        authManager.onOAuthCallbackReceived()
        // Return to MainActivity
        val intent = Intent(this, com.tripify.android.MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
        finish()
    }
}
