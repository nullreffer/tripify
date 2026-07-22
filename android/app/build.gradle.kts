plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.tripify.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tripify.android"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // Override in local.properties or CI with the actual backend URL
        buildConfigField("String", "BACKEND_URL", "\"https://your-backend.up.railway.app\"")

        manifestPlaceholders["appAuthRedirectScheme"] = "tripify"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.constraintlayout)
    implementation(libs.activity.ktx)
    implementation(libs.lifecycle.viewmodel.ktx)
    implementation(libs.lifecycle.runtime.ktx)

    // Android Auto / Car App Library
    implementation(libs.car.app)

    // Networking
    implementation(libs.okhttp)
    implementation(libs.gson)

    // Coroutines
    implementation(libs.coroutines.android)

    // Location (GPS)
    implementation(libs.play.services.location)

    // Chrome Custom Tabs (OAuth login)
    implementation(libs.browser)

    // Encrypted session storage
    implementation(libs.security.crypto)
}
