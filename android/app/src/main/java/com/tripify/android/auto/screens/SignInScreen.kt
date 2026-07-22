package com.tripify.android.auto.screens

import android.content.Intent
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarIcon
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template
import androidx.core.graphics.drawable.IconCompat
import com.tripify.android.R
import com.tripify.android.TripifyApp
import com.tripify.android.auth.LoginActivity

/**
 * Shown when the user is not authenticated.
 *
 * The Car App Library does not allow a full browser in the car, so we direct the user
 * to open the Tripify phone app and sign in from there.  Once the phone app detects
 * a successful login, [TripifySession] will replace this screen with [TripListScreen].
 */
class SignInScreen(carContext: CarContext) : Screen(carContext) {

    override fun onGetTemplate(): Template {
        return MessageTemplate.Builder(carContext.getString(R.string.sign_in_instructions))
            .setTitle(carContext.getString(R.string.sign_in_title))
            .addAction(
                Action.Builder()
                    .setTitle(carContext.getString(R.string.sign_in_button))
                    .setOnClickListener {
                        // Launch LoginActivity on the phone (starts Chrome Custom Tabs for OAuth)
                        val intent = Intent(carContext, LoginActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        carContext.startActivity(intent)
                    }
                    .build()
            )
            .build()
    }
}
