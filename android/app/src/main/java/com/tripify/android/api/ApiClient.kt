package com.tripify.android.api

import android.content.Context
import android.webkit.CookieManager
import com.tripify.android.BuildConfig
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Singleton OkHttpClient configured with:
 * - A [CookieJar] that syncs session cookies from Chrome Custom Tabs (WebView CookieManager)
 *   so that after the OAuth flow the API calls are automatically authenticated.
 * - Reasonable timeouts for in-car connectivity.
 */
class ApiClient(private val context: Context) {

    val baseUrl: String = BuildConfig.BACKEND_URL.trimEnd('/')

    /** In-memory cookie store backed by Android's WebKit CookieManager */
    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            val cookieManager = CookieManager.getInstance()
            cookies.forEach { cookie ->
                cookieManager.setCookie(url.toString(), cookie.toString())
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val cookieManager = CookieManager.getInstance()
            val rawCookie = cookieManager.getCookie(url.toString()) ?: return emptyList()
            return rawCookie.split(";")
                .mapNotNull { part ->
                    val trimmed = part.trim()
                    val eqIdx = trimmed.indexOf('=')
                    if (eqIdx <= 0) null
                    else {
                        val name = trimmed.substring(0, eqIdx).trim()
                        val value = trimmed.substring(eqIdx + 1).trim()
                        Cookie.Builder()
                            .name(name)
                            .value(value)
                            .domain(url.host)
                            .build()
                    }
                }
        }
    }

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * Clears all cookies for the backend domain (called on logout).
     */
    fun clearCookies() {
        val cookieManager = CookieManager.getInstance()
        cookieManager.removeAllCookies(null)
        cookieManager.flush()
    }
}
