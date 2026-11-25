package com.xtalk.app.core.common

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/** Input validation mirroring the backend rules (fail fast client-side). */
object Validators {

    private val emailRegex = Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
    private val usernameRegex = Regex("^[a-z0-9_]{3,20}$")

    fun isValidEmail(email: String): Boolean = emailRegex.matches(email.trim())

    fun isValidUsername(username: String): Boolean = usernameRegex.matches(username.trim().lowercase())

    /** 8-72 chars, at least one letter and one digit (matches backend). */
    fun isValidPassword(password: String): Boolean =
        password.length in 8..72 && password.any { it.isLetter() } && password.any { it.isDigit() }

    /** Parses YYYY-MM-DD; null when invalid. */
    fun parseDateOfBirth(value: String): LocalDate? = runCatching {
        LocalDate.parse(value.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
    }.getOrNull()

    fun age(dateOfBirth: LocalDate, today: LocalDate = LocalDate.now()): Int =
        ChronoUnit.YEARS.between(dateOfBirth, today).toInt()

    fun isOldEnough(dateOfBirth: LocalDate, minAge: Int = 13): Boolean = age(dateOfBirth) >= minAge
}
