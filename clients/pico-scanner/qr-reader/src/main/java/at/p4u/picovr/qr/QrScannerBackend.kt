package at.p4u.picovr.qr

// ADR: docs/adr/app/0020-securemr-qr-scanner-backend.md — QR depends on a scanner role, not a PICO-specific implementation.
// ADR: docs/adr/app/0031-hud-controlled-ambient-feature-lifecycle.md — ambient recognition starts/stops from feature state without a foreground scan screen.
interface QrScannerBackend : AutoCloseable {
    interface Listener {
        fun onDecoded(raw: String)
        fun onError(message: String)
    }

    fun start(listener: Listener)
    fun stop()

    override fun close() {
        stop()
    }
}
