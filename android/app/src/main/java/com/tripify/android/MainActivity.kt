package com.tripify.android

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.tripify.android.auth.LoginActivity
import com.tripify.android.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

/**
 * Phone-side companion UI.
 *
 * This screen is intentionally minimal — the main experience is in Android Auto.
 * Its role is to:
 *  - Show sign-in / sign-out controls
 *  - Display the current user's name once authenticated
 *  - Inform the user to connect their phone to their car for the Auto experience
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val app get() = application as TripifyApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnLogin.setOnClickListener {
            startActivity(Intent(this, LoginActivity::class.java))
        }

        binding.btnLogout.setOnClickListener {
            app.authManager.logout()
        }

        // Observe auth state
        lifecycleScope.launch {
            app.isLoggedIn.collect { loggedIn ->
                updateUi(loggedIn)
            }
        }

        // Check existing session on startup
        app.authManager.checkSession()
    }

    private fun updateUi(loggedIn: Boolean) {
        binding.progressBar.visibility = View.GONE
        if (loggedIn) {
            val user = app.authManager.currentUser
            binding.tvStatus.text = "Connected to Android Auto"
            binding.tvUserInfo.text = "Signed in as ${user?.name ?: user?.email}"
            binding.tvUserInfo.visibility = View.VISIBLE
            binding.btnLogin.visibility = View.GONE
            binding.btnLogout.visibility = View.VISIBLE
        } else {
            binding.tvStatus.text = "Sign in to use Tripify in your car"
            binding.tvUserInfo.visibility = View.GONE
            binding.btnLogin.visibility = View.VISIBLE
            binding.btnLogout.visibility = View.GONE
        }
    }
}
