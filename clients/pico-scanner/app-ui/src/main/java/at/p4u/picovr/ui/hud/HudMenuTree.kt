package at.p4u.picovr.ui.hud

// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — hierarchical navigation is derived from declarative HUD contributions.
internal data class HudMenuNode(
    val name: String,
    val children: Map<String, HudMenuNode>,
    val items: List<HudMenuContribution>,
)

internal fun buildHudMenuTree(contributions: List<HudContribution>): HudMenuNode {
    class MutableNode(val name: String) {
        val children = linkedMapOf<String, MutableNode>()
        val items = mutableListOf<HudMenuContribution>()
    }

    val root = MutableNode("")
    contributions
        .flatMap { it.menu }
        .forEach { item ->
            var node = root
            item.path.forEach { segment ->
                node = node.children.getOrPut(segment) { MutableNode(segment) }
            }
            node.items += item
        }

    fun freeze(node: MutableNode): HudMenuNode =
        HudMenuNode(
            name = node.name,
            children = node.children.mapValues { freeze(it.value) },
            items = node.items.toList(),
        )

    return freeze(root)
}

internal fun HudMenuNode.resolve(path: List<String>): HudMenuNode? {
    var node = this
    path.forEach { segment ->
        node = node.children[segment] ?: return null
    }
    return node
}
