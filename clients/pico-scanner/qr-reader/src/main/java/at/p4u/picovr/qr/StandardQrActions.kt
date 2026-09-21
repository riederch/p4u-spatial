package at.p4u.picovr.qr

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri

object StandardQrActions {
    fun all(): List<QrAction> = listOf(OpenUriAction, CopyAction)

    private object OpenUriAction : QrAction {
        override val id = "standard.open"
        override val title = "Öffnen"

        override fun matches(result: QrResult): Boolean =
            result.content.kind in setOf(
                QrContentKind.WEB,
                QrContentKind.EMAIL,
                QrContentKind.PHONE,
                QrContentKind.SMS,
                QrContentKind.GEO,
                QrContentKind.URI,
            ) && result.content.uri != null

        override suspend fun execute(context: Context, result: QrResult): QrActionResult {
            val uri = result.content.uri ?: return QrActionResult.Failure("Keine URI vorhanden.")
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return runCatching {
                context.startActivity(intent)
                QrActionResult.Success()
            }.getOrElse { QrActionResult.Failure(it.message ?: "Aktion konnte nicht geöffnet werden.") }
        }
    }

    private object CopyAction : QrAction {
        override val id = "standard.copy"
        override val title = "Kopieren"

        override fun matches(result: QrResult): Boolean = true

        override suspend fun execute(context: Context, result: QrResult): QrActionResult {
            val clipboard = context.getSystemService(ClipboardManager::class.java)
            clipboard.setPrimaryClip(ClipData.newPlainText("QR-Code", result.raw))
            return QrActionResult.Success("In die Zwischenablage kopiert.")
        }
    }
}
