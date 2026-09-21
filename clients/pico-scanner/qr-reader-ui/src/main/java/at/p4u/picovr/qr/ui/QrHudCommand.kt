package at.p4u.picovr.qr.ui

import android.content.Context
import at.p4u.picovr.qr.QrAction
import at.p4u.picovr.qr.QrActionResult
import at.p4u.picovr.qr.QrResult
import at.p4u.picovr.ui.hud.HudCommand
import at.p4u.picovr.ui.hud.HudCommandAvailability
import at.p4u.picovr.ui.hud.HudCommandResult
import at.p4u.picovr.ui.hud.HudCommandRole
import at.p4u.picovr.ui.hud.HudCommandState
import at.p4u.picovr.ui.hud.HudFeedback
import at.p4u.picovr.ui.hud.HudFeedbackKind

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — QR actions remain pluggable.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — QR actions adapt to the shared HUD command model instead of defining feature-specific chrome.
internal class QrHudCommand(
    private val context: Context,
    private val result: QrResult,
    private val action: QrAction,
    running: Boolean = false,
    blocked: Boolean = false,
) : HudCommand {
    override val id: String = action.id
    override val label: String = action.title
    override val role: HudCommandRole = HudCommandRole.SECONDARY
    override val state: HudCommandState = HudCommandState(
        availability = when {
            running -> HudCommandAvailability.RUNNING
            blocked -> HudCommandAvailability.DISABLED
            else -> HudCommandAvailability.ENABLED
        },
    )

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
