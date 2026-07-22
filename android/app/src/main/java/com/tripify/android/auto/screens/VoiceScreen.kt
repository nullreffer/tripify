package com.tripify.android.auto.screens

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template
import com.tripify.android.R
import com.tripify.android.TripifyApp
import com.tripify.android.api.TripifyRepository
import com.tripify.android.api.models.AiAction
import com.tripify.android.api.models.Stop
import com.tripify.android.api.models.Trip
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Voice-activated Gemini assistant for Android Auto.
 *
 * Flow:
 *  1. Screen appears showing "Tap the mic to speak".
 *  2. User taps mic → [SpeechRecognizer] starts listening on the phone.
 *  3. Recognized text is sent to the backend AI endpoint with `mode=auto`.
 *  4. Backend returns a concise [reply] (read aloud via TTS) and optional [actions].
 *  5. Actions such as "add_stop", "mark_reached", or "search_nearby" are executed.
 *
 * Note: [SpeechRecognizer] must run on the main thread.
 */
class VoiceScreen(
    carContext: CarContext,
    private val trip: Trip,
    private var stops: List<Stop>
) : Screen(carContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val repository = TripifyRepository(TripifyApp.instance.apiClient)
    private val tts = android.speech.tts.TextToSpeech(carContext) {}

    private var state: VoiceState = VoiceState.IDLE
    private var statusText = carContext.getString(R.string.voice_tap_to_speak)
    private var recognizer: SpeechRecognizer? = null

    private enum class VoiceState { IDLE, LISTENING, THINKING, DONE }

    init {
        lifecycle.addObserver(object : androidx.lifecycle.DefaultLifecycleObserver {
            override fun onDestroy(owner: androidx.lifecycle.LifecycleOwner) {
                cleanUp()
                scope.cancel()
            }
        })
    }

    override fun onGetTemplate(): Template {
        val title = when (state) {
            VoiceState.IDLE -> carContext.getString(R.string.voice_assistant)
            VoiceState.LISTENING -> "🎤 Listening…"
            VoiceState.THINKING -> "🤔 Thinking…"
            VoiceState.DONE -> "✨ Done"
        }

        val micAction = Action.Builder()
            .setTitle(
                when (state) {
                    VoiceState.IDLE, VoiceState.DONE -> "🎤 Speak"
                    VoiceState.LISTENING -> "⏹ Stop"
                    VoiceState.THINKING -> "…"
                }
            )
            .setBackgroundColor(
                when (state) {
                    VoiceState.LISTENING -> CarColor.RED
                    else -> CarColor.GREEN
                }
            )
            .setOnClickListener {
                if (state == VoiceState.LISTENING) stopListening()
                else startListening()
            }
            .build()

        return MessageTemplate.Builder(statusText)
            .setTitle(title)
            .setHeaderAction(Action.BACK)
            .addAction(micAction)
            .build()
    }

    // ── Speech Recognition ────────────────────────────────────────────────────

    private fun startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(carContext)) {
            statusText = "Speech recognition not available on this device."
            state = VoiceState.DONE
            invalidate()
            return
        }

        state = VoiceState.LISTENING
        statusText = carContext.getString(R.string.voice_listening)
        invalidate()

        recognizer = SpeechRecognizer.createSpeechRecognizer(carContext)
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onEndOfSpeech() {
                if (state == VoiceState.LISTENING) {
                    state = VoiceState.THINKING
                    statusText = carContext.getString(R.string.voice_thinking)
                    invalidate()
                }
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val spoken = matches?.firstOrNull()
                if (spoken != null) {
                    sendToAi(spoken)
                } else {
                    state = VoiceState.DONE
                    statusText = "I didn't catch that. Please try again."
                    invalidate()
                }
            }

            override fun onError(error: Int) {
                val msg = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected. Please try again."
                    SpeechRecognizer.ERROR_NETWORK -> "Network error. Please check your connection."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                        "Microphone permission required."
                    else -> "Speech error ($error). Please try again."
                }
                state = VoiceState.DONE
                statusText = msg
                invalidate()
            }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, carContext.packageName)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        recognizer?.startListening(intent)
    }

    private fun stopListening() {
        recognizer?.stopListening()
    }

    private fun sendToAi(spokenText: String) {
        state = VoiceState.THINKING
        statusText = "You said: \"$spokenText\"\n\nThinking…"
        invalidate()

        scope.launch {
            repository.sendAutoAiMessage(trip.id, spokenText)
                .onSuccess { response ->
                    state = VoiceState.DONE
                    statusText = "🎤 \"$spokenText\"\n\n✨ ${response.reply}"
                    invalidate()

                    // Speak the reply aloud
                    tts.speak(response.reply, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "reply")

                    // Execute any structured actions
                    response.actions.forEach { executeAction(it) }
                }
                .onFailure { err ->
                    state = VoiceState.DONE
                    statusText = "Could not reach AI. ${err.message}"
                    invalidate()
                }
        }
    }

    // ── Action Execution ──────────────────────────────────────────────────────

    private fun executeAction(action: AiAction) {
        scope.launch {
            when (action.type) {
                "add_stop" -> {
                    val lat = action.lat ?: return@launch
                    val lng = action.lng ?: return@launch
                    val name = action.name ?: return@launch
                    repository.addStop(
                        tripId = trip.id,
                        name = name,
                        lat = lat,
                        lng = lng,
                        address = action.address
                    ).onSuccess { newStop ->
                        stops = stops + newStop
                        // Briefly announce the addition
                        tts.speak(
                            "Added $name to your trip.",
                            android.speech.tts.TextToSpeech.QUEUE_ADD, null, "add_stop"
                        )
                    }
                }

                "mark_reached" -> {
                    val stopId = action.stopId ?: return@launch
                    repository.markStopReached(trip.id, stopId, true)
                        .onSuccess { updated ->
                            stops = stops.map { if (it.id == updated.id) updated else it }
                        }
                }

                "search_nearby" -> {
                    val query = action.query ?: return@launch
                    val refStop = if (action.near == "next_stop") {
                        stops.firstOrNull { !it.reached }
                    } else null

                    if (refStop != null) {
                        val places = repository.searchNearby(
                            query = query,
                            lat = refStop.lat,
                            lng = refStop.lng
                        ).getOrElse { emptyList() }

                        if (places.isEmpty()) {
                            tts.speak(
                                "I couldn't find any $query nearby.",
                                android.speech.tts.TextToSpeech.QUEUE_ADD, null, "search_none"
                            )
                        } else {
                            val closest = places.first()
                            tts.speak(
                                "Found ${closest.name}. Say 'add it to the route' to add it.",
                                android.speech.tts.TextToSpeech.QUEUE_ADD, null, "search_found"
                            )
                            // Show result in status text
                            statusText += "\n\n🔍 Nearest: ${closest.name}" +
                                    (closest.address?.let { "\n$it" } ?: "")
                            invalidate()
                        }
                    }
                }
            }
        }
    }

    private fun cleanUp() {
        recognizer?.destroy()
        recognizer = null
        tts.shutdown()
    }
}
