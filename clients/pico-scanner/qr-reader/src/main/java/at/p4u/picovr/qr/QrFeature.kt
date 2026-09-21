package at.p4u.picovr.qr

import android.content.Context
import at.p4u.picovr.core.feature.AppFeature
import at.p4u.picovr.core.feature.FeatureSnapshot

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — QR is a feature plug-in to the base system, not base-system behavior.
class QrFeature(
    context: Context,
) : AppFeature {
    private val settings = QrRecognitionSettings(context)

    override val id: String = ID
    override val title: String = "QR-Code-Erkennung"
    override val toggleable: Boolean = true
    override val menuPath: List<String> = listOf("Erkennung")
    override val statusIconKey: String = STATUS_ICON_KEY

    override fun snapshot(): FeatureSnapshot =
        FeatureSnapshot(
            id = id,
            title = title,
            enabled = settings.isEnabled(),
            toggleable = toggleable,
            menuPath = menuPath,
            statusIconKey = statusIconKey,
        )

    override fun setEnabled(enabled: Boolean) {
        settings.setEnabled(enabled)
    }

    override fun observe(listener: (FeatureSnapshot) -> Unit): AutoCloseable =
        settings.observe {
            listener(snapshot())
        }

    companion object {
        const val ID = "qr"
        const val STATUS_ICON_KEY = "qr"
    }
}
