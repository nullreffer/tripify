package com.tripify.android.auto

import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * Entry-point for Android Auto.  The system binds to this service when the user
 * connects their phone to a head unit that supports the Car App Library.
 */
class TripifyCarAppService : CarAppService() {

    override fun createHostValidator(): HostValidator {
        // IMPORTANT: Switch to a restrictive allow-list before releasing to production.
        // ALLOW_ALL_HOSTS_VALIDATOR is acceptable during development/testing only.
        // Production example:
        //   HostValidator.Builder(applicationContext)
        //       .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
        //       .build()
        return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    }

    override fun onCreateSession(): Session = TripifySession()
}
