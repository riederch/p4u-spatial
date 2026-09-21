package at.p4u.picovr.qr

import android.content.Context

enum class QrContentKind {
    WEB,
    EMAIL,
    PHONE,
    SMS,
    GEO,
    WIFI,
    CONTACT,
    JSON,
    TEXT,
    URI,
}

data class QrContent(
    val kind: QrContentKind,
    val raw: String,
    val displayText: String = raw,
    val uri: String? = null,
)

data class QrResult(
    val raw: String,
    val content: QrContent,
)

sealed interface QrActionResult {
    data class Success(val message: String? = null) : QrActionResult
    data class Failure(val message: String) : QrActionResult
}

interface QrAction {
    val id: String
    val title: String
    fun matches(result: QrResult): Boolean
    suspend fun execute(context: Context, result: QrResult): QrActionResult
}
