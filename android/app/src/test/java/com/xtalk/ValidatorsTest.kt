package com.xtalk

import com.xtalk.app.core.common.Validators
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ValidatorsTest {
    @Test fun `valid emails pass`() {
        assertTrue(Validators.isValidEmail("sara@example.com"))
        assertTrue(Validators.isValidEmail("  a.b+tag@sub.domain.org "))
    }

    @Test fun `invalid emails fail`() {
        assertFalse(Validators.isValidEmail("nope"))
        assertFalse(Validators.isValidEmail("a@b"))
        assertFalse(Validators.isValidEmail(""))
    }

    @Test fun `username rules match the backend`() {
        assertTrue(Validators.isValidUsername("sara_dev"))
        assertFalse(Validators.isValidUsername("ab"))            // too short
        assertFalse(Validators.isValidUsername("Has Upper"))     // uppercase/space
        assertFalse(Validators.isValidUsername("x".repeat(21)))  // too long
    }

    @Test fun `password needs 8+ chars, a letter and a digit`() {
        assertTrue(Validators.isValidPassword("passw0rd1"))
        assertFalse(Validators.isValidPassword("short1"))
        assertFalse(Validators.isValidPassword("allletters"))
        assertFalse(Validators.isValidPassword("12345678"))
    }

    @Test fun `date of birth parsing and age gate`() {
        val dob = Validators.parseDateOfBirth("2006-10-15")
        assertEquals(LocalDate.of(2006, 10, 15), dob)
        assertNull(Validators.parseDateOfBirth("15/10/2006"))
        assertTrue(Validators.isOldEnough(LocalDate.now().minusYears(20)))
        assertFalse(Validators.isOldEnough(LocalDate.now().minusYears(10)))
    }
}
