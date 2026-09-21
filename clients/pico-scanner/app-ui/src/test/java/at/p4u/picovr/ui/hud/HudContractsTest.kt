package at.p4u.picovr.ui.hud

import at.p4u.picovr.core.feature.FeatureSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HudContractsTest {
    @Test
    fun scaleIsClampedAndSnappedToFivePercentSteps() {
        assertEquals(50, HudSettings(10).normalizedPeripheralHudScalePercent)
        assertEquals(100, HudSettings().normalizedPeripheralHudScalePercent)
        assertEquals(105, HudSettings(103).normalizedPeripheralHudScalePercent)
        assertEquals(105, HudSettings(107).normalizedPeripheralHudScalePercent)
        assertEquals(150, HudSettings(999).normalizedPeripheralHudScalePercent)
    }

    @Test
    fun featureContributionUsesAuthoritativeToggleAndStatusState() {
        val enabled = FeatureSnapshot(
            id = "qr",
            title = "QR-Code-Erkennung",
            enabled = true,
            toggleable = true,
            menuPath = listOf("Erkennung"),
            statusIconKey = "qr",
        ).toHudContribution()

        assertEquals(listOf("Erkennung"), enabled.menu.single().path)
        val toggle = enabled.menu.single().control as HudMenuControl.FeatureToggle
        assertTrue(toggle.value)
        assertEquals("qr", toggle.featureId)
        assertEquals("qr", enabled.status.single().iconKey)

        val disabled = FeatureSnapshot(
            id = "qr",
            title = "QR-Code-Erkennung",
            enabled = false,
            toggleable = true,
            menuPath = listOf("Erkennung"),
            statusIconKey = "qr",
        ).toHudContribution()

        assertFalse((disabled.menu.single().control as HudMenuControl.FeatureToggle).value)
        assertTrue(disabled.status.isEmpty())
    }

    @Test
    fun menuTreeIsDerivedFromContributionsAndResolvesHierarchy() {
        val qr = FeatureSnapshot(
            id = "qr",
            title = "QR-Code-Erkennung",
            enabled = true,
            toggleable = true,
            menuPath = listOf("Erkennung"),
            statusIconKey = "qr",
        ).toHudContribution()

        val root = buildHudMenuTree(
            listOf(
                qr,
                HudSettings(100).asContribution(),
            ),
        )

        assertEquals(setOf("Erkennung", "System"), root.children.keys)
        assertEquals("QR-Code-Erkennung", root.resolve(listOf("Erkennung"))?.items?.single()?.title)
        assertNotNull(root.resolve(listOf("System", "Anzeige")))
        val scale = root.resolve(listOf("System", "Anzeige"))?.items?.single()?.control
        assertTrue(scale is HudMenuControl.RangeSetting)
        assertEquals(100, (scale as HudMenuControl.RangeSetting).value)
        assertNull(root.resolve(listOf("Nicht vorhanden")))
    }
}
