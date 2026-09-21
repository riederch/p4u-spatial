package at.p4u.picovr.qr

import android.content.Context

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — keep QR scan/result lifecycle reusable and app business actions pluggable.
// ADR: docs/adr/app/0031-hud-controlled-ambient-feature-lifecycle.md — QR recognition is controlled by feature state and resumes automatically after closing a result.
class QrReaderController(
    context: Context,
    private val scannerBackend: QrScannerBackend,
    customActions: List<QrAction> = emptyList(),
    includeStandardActions: Boolean = true,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val actions = buildList {
        if (includeStandardActions) addAll(StandardQrActions.all())
        addAll(customActions)
    }

    private var enabled = false

    var onStateChanged: ((QrReaderState) -> Unit)? = null
    var state: QrReaderState = QrReaderState.Idle
        private set

    fun setEnabled(enabled: Boolean) {
        if (this.enabled == enabled) return
        this.enabled = enabled

        if (!enabled) {
            scannerBackend.stop()
            update(QrReaderState.Idle)
            return
        }

        if (state !is QrReaderState.Result) {
            startRecognition()
        }
    }

    fun dismissResult() {
        update(QrReaderState.Idle)
        if (enabled) {
            startRecognition()
        }
    }

    fun availableActions(result: QrResult): List<QrAction> = matchingActions(result)

    private fun startRecognition() {
        if (!enabled || state is QrReaderState.Scanning) return

        update(QrReaderState.Scanning)
        scannerBackend.start(
            object : QrScannerBackend.Listener {
                override fun onDecoded(raw: String) {
                    if (!enabled || state !is QrReaderState.Scanning) return
                    scannerBackend.stop()
                    val result = QrResult(raw, QrContentParser.parse(raw))
                    update(QrReaderState.Result(result, matchingActions(result)))
                }

                override fun onError(message: String) {
                    if (!enabled) return
                    scannerBackend.stop()
                    update(QrReaderState.Error(message))
                }
            },
        )
    }

    private fun matchingActions(result: QrResult): List<QrAction> =
        actions.filter { runCatching { it.matches(result) }.getOrDefault(false) }

    private fun update(newState: QrReaderState) {
        state = newState
        onStateChanged?.invoke(newState)
    }

    override fun close() {
        enabled = false
        scannerBackend.close()
        onStateChanged = null
    }
}

sealed interface QrReaderState {
    data object Idle : QrReaderState
    data object Scanning : QrReaderState
    data class Result(
        val result: QrResult,
        val actions: List<QrAction>,
    ) : QrReaderState
    data class Error(val message: String) : QrReaderState
}
