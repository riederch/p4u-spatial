package at.p4u.picovr.core.feature

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — app-core defines feature contracts without depending on concrete features.
data class FeatureSnapshot(
    val id: String,
    val title: String,
    val enabled: Boolean,
    val toggleable: Boolean,
    val menuPath: List<String> = emptyList(),
    val statusIconKey: String? = null,
)

interface AppFeature {
    val id: String
    val title: String
    val toggleable: Boolean
        get() = false
    val menuPath: List<String>
        get() = emptyList()
    val statusIconKey: String?
        get() = null

    fun snapshot(): FeatureSnapshot

    fun setEnabled(enabled: Boolean) {
        if (!toggleable) {
            error("Feature '$id' is not toggleable.")
        }
    }

    fun observe(listener: (FeatureSnapshot) -> Unit): AutoCloseable
}
