# Tripify Android (Android Auto Companion)

A native Android app that connects Tripify to your car via **Android Auto**, providing:

- 🗺️ **Live map** with your current GPS location and trip route drawn on the car display
- 📍 **Stop list** — browse, view notes, and mark stops reached — hands-free
- 🤖 **Gemini voice assistant** — speak commands while driving:
  - *"Find a Costco near the next pin"*
  - *"Add it to the route"*
  - *"Mark this stop as reached"*
  - *"What are the notes for stop 3?"*
- 🔊 **Text-to-speech** replies so you never take your eyes off the road

---

## Architecture

```
[Tripify Backend (Node.js/Express)]
        ↑ existing REST API + new /api/places/nearby endpoint
[Android app (Kotlin)]
   ├── Phone UI      – sign-in, status
   └── Android Auto  – Car App Library screens
        ├── TripListScreen        (ListTemplate)
        ├── StopListScreen        (ListTemplate)
        ├── StopDetailScreen      (PaneTemplate)
        ├── TripNavigationScreen  (NavigationTemplate + SurfaceCallback)
        └── VoiceScreen           (MessageTemplate + SpeechRecognizer + TTS)
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Android Studio Hedgehog (2023.1+) | Or any IDE with Android SDK support |
| Android SDK 34 (API 34) | `compileSdk` |
| Android device / emulator running Android 6+ (API 23) | `minSdk` |
| [Android Auto Desktop Head Unit (DHU)](https://developer.android.com/training/cars/testing/dhu) | For testing Auto screens on your computer |
| Tripify backend deployed and reachable | See `backend/` README |

---

## Setup

### 1 — Configure the backend URL

Edit `app/build.gradle.kts` and set your backend URL:

```kotlin
buildConfigField("String", "BACKEND_URL", "\"https://your-backend.up.railway.app\"")
```

Or create `android/local.properties` and override it there.

### 2 — Enable mobile OAuth on the backend

The Android auth flow uses `?mobile=true` on the Google OAuth start URL.  
This is already implemented in `backend/src/routes/auth.js` — no extra setup needed.

Add the `tripify://auth/callback` URI to your Google Cloud OAuth **Authorised redirect URIs** list
(in addition to the existing backend callback URL):

```
tripify://auth/callback
```

> Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client → Authorised redirect URIs

### 3 — Build the app

```bash
cd android
# If you have Gradle installed:
gradle wrapper          # generates gradlew / gradle-wrapper.jar
./gradlew assembleDebug

# Or open the android/ folder in Android Studio and press ▶ Run
```

### 4 — Test with Android Auto DHU

1. Enable **Developer mode** on your Android device
2. Enable **Unknown sources** in Android Auto settings
3. Launch the Desktop Head Unit on your computer: `$ANDROID_HOME/extras/google/auto/desktop-head-unit`
4. Connect your phone via USB with USB debugging enabled
5. The Tripify car icon will appear on the DHU home screen

---

## Project structure

```
android/
├── app/
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/tripify/android/
│       │   ├── TripifyApp.kt              Application — global singletons + auth state
│       │   ├── MainActivity.kt            Phone UI (sign-in / sign-out)
│       │   ├── api/
│       │   │   ├── ApiClient.kt           OkHttp + cookie sync from Chrome Custom Tabs
│       │   │   ├── TripifyRepository.kt   All API calls (trips, stops, AI, places)
│       │   │   └── models/               Data classes matching backend JSON
│       │   ├── auth/
│       │   │   ├── AuthManager.kt         Session management
│       │   │   └── LoginActivity.kt       Chrome Custom Tabs OAuth flow
│       │   ├── auto/
│       │   │   ├── TripifyCarAppService.kt  Car App Library entry-point
│       │   │   ├── TripifySession.kt        Session — chooses initial screen
│       │   │   └── screens/
│       │   │       ├── SignInScreen.kt
│       │   │       ├── TripListScreen.kt
│       │   │       ├── StopListScreen.kt
│       │   │       ├── StopDetailScreen.kt
│       │   │       ├── TripNavigationScreen.kt  Map + GPS + route drawing
│       │   │       └── VoiceScreen.kt           SpeechRecognizer → Gemini → TTS
│       │   └── location/
│       │       └── LocationProvider.kt    FusedLocationProviderClient → Flow<Location>
│       └── res/
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/gradle-wrapper.properties
└── app/build.gradle.kts
```

---

## Backend changes

The following endpoints were added/modified to support Android Auto:

### `GET /api/places/nearby`
Proxies a POI search to Nominatim (OpenStreetMap, no API key required).

```
GET /api/places/nearby?q=costco&lat=37.77&lng=-122.42&radius=10
```

Response:
```json
[
  { "id": "123", "name": "Costco Wholesale", "lat": 37.78, "lng": -122.44, "address": "…" }
]
```

### `POST /api/trips/:tripId/ai` — `mode: "auto"`

When the Android app sends `{ "message": "…", "mode": "auto" }`, the AI response is:

```json
{
  "reply": "Found a Costco 3 miles from your next stop. Say 'add it' to add it to your route.",
  "actions": [
    { "type": "add_stop", "name": "Costco Wholesale", "lat": 37.78, "lng": -122.44, "address": "…" }
  ]
}
```

Action types: `add_stop`, `mark_reached`, `search_nearby`, `navigate_to`.

### `GET /auth/google?mobile=true`
Triggers the OAuth flow with a `tripify://auth/callback` deep-link redirect instead of
the web frontend URL.  The session cookie is set normally — Chrome Custom Tabs persists
it in Android's WebKit `CookieManager`, which `ApiClient.kt` syncs into OkHttp.

---

## Android Auto safety compliance

- All text input is **voice-only** in the car — the Car App Library enforces this
- Notes and details are **read-only** on car screens
- Lists are limited to 6 items per page (Car App Library guideline)
- Tap targets are ≥ 44dp
- Map drawing is Canvas-based — no animations, no video

---

## Publishing

Android Auto apps must be distributed via the **Google Play Store**.  Before publishing:

1. Fill out the [Android Auto app quality checklist](https://developer.android.com/cars/quality)
2. Request access to the `androidx.car.app.category.NAVIGATION` restricted category  
   (submit a form in Google Play Console → App content → Android Auto)
3. Test with a real car or the DHU against all [driving-mode restrictions](https://developer.android.com/training/cars/testing)
