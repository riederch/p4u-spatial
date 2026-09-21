package at.p4u.picovr.qr

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import com.bytedance.pico.secure_mr_demo.readback.ReadbackActivity
import java.util.UUID

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — keep QR scan/result lifecycle reusable and app business actions pluggable.
class QrReaderController(
    context: Context,
    customActions: List<QrAction> = emptyList(),
    includeStandardActions: Boolean = true,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val actions = buildList {
        if (includeStandardActions) addAll(StandardQrActions.all())
        addAll(customActions)
    }

    private var receiver: BroadcastReceiver? = null
    private var currentAction: String? = null

    var onStateChanged: ((QrReaderState) -> Unit)? = null
    var state: QrReaderState = QrReaderState.Idle
        private set

    fun scan() {
        if (state is QrReaderState.Scanning) return
        unregisterReceiver()

        val action = "${appContext.packageName}.QR_RESULT.${UUID.randomUUID()}"
        currentAction = action
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != action) return
                when (intent.getStringExtra(ReadbackActivity.EXTRA_STATUS)) {
                    ReadbackActivity.STATUS_DECODED -> {
                        val raw = intent.getStringExtra(ReadbackActivity.EXTRA_PAYLOAD) ?: return
                        val result = QrResult(raw, QrContentParser.parse(raw))
                        update(QrReaderState.Result(result, matchingActions(result)))
                        unregisterReceiver()
                    }
                    ReadbackActivity.STATUS_ERROR -> {
                        update(
                            QrReaderState.Error(
                                intent.getStringExtra(ReadbackActivity.EXTRA_MESSAGE)
                                    ?: "QR-Scanner konnte nicht gestartet werden."
                            )
                        )
                        unregisterReceiver()
                    }
                    ReadbackActivity.STATUS_CANCELLED -> {
                        update(QrReaderState.Idle)
                        unregisterReceiver()
                    }
                }
            }
        }

        appContext.registerReceiver(
            receiver,
            IntentFilter(action),
            Context.RECEIVER_NOT_EXPORTED,
        )

        update(QrReaderState.Scanning)
        appContext.startActivity(
            Intent(appContext, ReadbackActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(ReadbackActivity.EXTRA_RESULT_ACTION, action)
                putExtra(ReadbackActivity.EXTRA_RESULT_PACKAGE, appContext.packageName)
            }
        )
    }

    fun dismissResult() {
        update(QrReaderState.Idle)
    }

    fun availableActions(result: QrResult): List<QrAction> = matchingActions(result)

    private fun matchingActions(result: QrResult): List<QrAction> =
        actions.filter { runCatching { it.matches(result) }.getOrDefault(false) }

    private fun update(newState: QrReaderState) {
        state = newState
        onStateChanged?.invoke(newState)
    }

    private fun unregisterReceiver() {
        receiver?.let { runCatching { appContext.unregisterReceiver(it) } }
        receiver = null
        currentAction = null
    }

    override fun close() {
        unregisterReceiver()
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
