# Tripify Android – ProGuard rules

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Keep all data model classes so Gson can reflect on them
-keep class com.tripify.android.api.models.** { *; }

# Car App Library
-keep class androidx.car.app.** { *; }

# Google Play Services
-keep class com.google.android.gms.** { *; }
