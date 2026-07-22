package com.tripify.android.api.models

import com.google.gson.annotations.SerializedName

data class Trip(
    val id: String,
    val title: String,
    val description: String?,
    val coverImage: String?,
    val startDate: String?,
    val endDate: String?,
    val stopCount: Int,
    val reachedCount: Int,
    val memberRole: String?,
    val updatedAt: String,
    val createdAt: String
)
