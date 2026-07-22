package com.tripify.android.api.models

data class Stop(
    val id: String,
    val tripId: String,
    val name: String,
    val address: String?,
    val lat: Double,
    val lng: Double,
    val order: Int,
    val pinType: String,
    val notes: String?,
    val targetDate: String?,
    val reached: Boolean,
    val reachedAt: String?,
    val createdAt: String,
    val updatedAt: String
)
