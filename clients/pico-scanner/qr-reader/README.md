# qr-reader

Reusable QR interaction library for the PICO Android clients.

The module owns the public QR API and content/action model. PICO SecureMR/OpenXR remains an
implementation detail behind `QrReaderController`; applications register their own `QrAction`
implementations without teaching the scanner about application business logic.

## Usage

```kotlin
val reader = QrReaderController(
    context,
    customActions = listOf(MyBridgeRegistrationAction(...)),
)

reader.onStateChanged = { state ->
    when (state) {
        is QrReaderState.Result -> showResult(state.result, state.actions)
        else -> Unit
    }
}

reader.scan()
```

A scan never executes an action automatically. The first valid QR decode is latched and the
scanner closes; the host app then presents the decoded content and lets the user choose an action.
This makes QR codes shown on phones or moving displays responsive while preserving an explicit
confirmation boundary.
