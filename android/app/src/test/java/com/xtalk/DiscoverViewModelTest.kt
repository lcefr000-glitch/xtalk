package com.xtalk

import com.xtalk.app.core.network.DiscoveryApi
import com.xtalk.app.core.network.PartnerUserDto
import com.xtalk.app.core.network.RecommendationsResponse
import com.xtalk.app.core.network.SearchResponse
import com.xtalk.app.feature.discover.DiscoverViewModel
import com.xtalk.app.feature.discover.Mode
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

class DiscoverViewModelTest {

    @get:Rule val mainDispatcherRule = MainDispatcherRule()

    private val api = mockk<DiscoveryApi>()

    private val partner = PartnerUserDto(id = "u2", username = "bert_b")

    @Test fun `recommendations load on init`() = runTest {
        coEvery { api.recommendations() } returns Response.success(RecommendationsResponse(listOf(partner)))
        val vm = DiscoverViewModel(api)
        assertEquals(1, vm.state.value.results.size)
        assertEquals(Mode.RECOMMENDED, vm.state.value.mode)
    }

    @Test fun `follow then unfollow toggles state`() = runTest {
        coEvery { api.recommendations() } returns Response.success(RecommendationsResponse(listOf(partner)))
        coEvery { api.follow("u2") } returns Response.success(mapOf("following" to true))
        coEvery { api.unfollow("u2") } returns Response.success(mapOf("following" to false))
        val vm = DiscoverViewModel(api)
        vm.toggleFollow("u2")
        assertTrue("u2" in vm.state.value.followed)
        vm.toggleFollow("u2")
        assertTrue("u2" !in vm.state.value.followed)
    }

    @Test fun `failed recommendations surface an error`() = runTest {
        coEvery { api.recommendations() } returns Response.error(500, okhttp3.ResponseBody.create(null, ByteArray(0)))
        val vm = DiscoverViewModel(api)
        assertTrue(vm.state.value.error != null)
    }

    @Test fun `search mode activates when filters are set`() = runTest {
        coEvery { api.recommendations() } returns Response.success(RecommendationsResponse(listOf(partner)))
        coEvery { api.search(any(), any(), any(), any(), any()) } returns
            Response.success(SearchResponse(1, 20, 1, listOf(partner)))
        val vm = DiscoverViewModel(api)
        vm.onFiltersChanged("de", "")
        kotlinx.coroutines.delay(600) // debounce
        assertEquals(Mode.SEARCH, vm.state.value.mode)
        assertEquals(1, vm.state.value.results.size)
    }
}
