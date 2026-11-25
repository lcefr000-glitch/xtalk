import java.util.Properties

plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.compose")
    kotlin("plugin.serialization")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun normalizeUrl(u: String) = if (u.endsWith("/")) u else "$u/"
// Debug: local dev backend (emulator default). Override with API_BASE_URL in local.properties.
val debugApiBaseUrl: String = normalizeUrl(localProps.getProperty("API_BASE_URL") ?: "http://10.0.2.2:3000/")
// Release: production URL, HTTPS only (sockets then use wss automatically).
// Set PROD_API_BASE_URL in local.properties or as an environment variable, e.g. https://api.example.com/
val prodApiBaseUrl: String = normalizeUrl(
    localProps.getProperty("PROD_API_BASE_URL") ?: System.getenv("PROD_API_BASE_URL") ?: "https://api.xtalk.example/",
)

android {
    namespace = "com.xtalk.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.xtalk.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 5
        versionName = "0.5.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        // Optional release keystore: set XTALK_KEYSTORE, XTALK_KEYSTORE_PASSWORD, XTALK_KEY_ALIAS, XTALK_KEY_PASSWORD.
        val ks = System.getenv("XTALK_KEYSTORE")
        if (ks != null) {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("XTALK_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("XTALK_KEY_ALIAS")
                keyPassword = System.getenv("XTALK_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"$prodApiBaseUrl\"")
            // Unsigned-by-us fallback: debug key (sideload/testing). Use XTALK_KEYSTORE for a real release key.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            isMinifyEnabled = false // R8 rules are not verified on a device yet; keep off until tested
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests { isIncludeAndroidResources = true } }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    implementation("com.google.dagger:hilt-android:2.52")
    ksp("com.google.dagger:hilt-android-compiler:2.52")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    implementation("androidx.datastore:datastore-preferences:1.1.1")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("io.socket:socket.io-client:2.1.0")
    implementation("io.livekit:livekit-android:2.8.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("io.mockk:mockk:1.13.13")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

// Fail fast: a release build must point at an HTTPS backend.
tasks.matching { it.name.startsWith("assembleRelease") || it.name.startsWith("bundleRelease") }.configureEach {
    doFirst {
        require(prodApiBaseUrl.startsWith("https://")) {
            "PROD_API_BASE_URL must start with https:// (got $prodApiBaseUrl)"
        }
        require(!prodApiBaseUrl.contains("xtalk.example")) {
            "Set PROD_API_BASE_URL to your real backend URL (still the placeholder)"
        }
    }
}
