package at.p4u.picovr.qr.ui

import android.content.Context
import at.p4u.picovr.qr.QrAction
import at.p4u.picovr.qr.QrActionResult
import at.p4u.picovr.qr.QrResult
import at.p4u.picovr.ui.hud.HudCommand
import at.p4u.picovr.ui.hud.HudCommandResult
import at.p4u.picovr.ui.hud.HudCommandRole
import at.p4u.picovr.ui.hud.HudFeedback
import at.p4u.picovr.ui.hud.HudFeedbackKind

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — QR actions remain pluggable.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — QR actions adapt to the shared HUD command model instead of defining feature-specific chrome.
internal class QrHudCommand(
    private val context: Context,
    private val result: QrResult,
    private val action: QrAction,
) : HudCommand {
    override val id: String = action.id
    override val label: String = action.title
    override val role: HudCommandRole = HudCommandRole.SECONDARY

    override suspend fun execute(): HudCommandResult =
        when (val outcome = action.execute(context, result)) {
            is QrActionResult.Success ->
                HudCommandResult(
                    feedback = HudFeedback(
                        kind = HudFeedbackKind.SUCCESS,
                        message = outcome.message ?: "Aktion ausgeführt.",
                    ),
                )

            is QrActionResult.Failure ->
                HudCommandResult(
                    feedback = HudFeedback(
                        kind = HudFeedbackKind.ERROR,
                        message = outcome.message,
                    ),
                )
        }
}
