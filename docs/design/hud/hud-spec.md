# Unified XR HUD Design Specification

Derived from: ADR 0029 — Unified XR HUD Interaction Shell

Status: Draft for visual validation

## Purpose

This document turns ADR 0029 into a reproducible UI specification. It defines layout roles,
component behavior and interaction hierarchy without binding the architecture to exact product
features beyond the currently required QR example.

## HUD surfaces

### Launcher

- Persistent, compact, viewpoint-following.
- Default position: lower-left field-of-view.
- Closed state shows icon only.
- Opening the launcher reveals the navigation panel from the same region.
- Launcher remains available while result/detail panels are open.

### Navigation panel

- Single visible menu surface.
- Expands inward and upward from the launcher.
- Width should be sufficient for German labels without truncating ordinary feature names.
- Header shows current navigation path.
- One explicit back action when below root.
- Menu entries are either category rows, command rows or toggle rows.
- No feature-specific visual treatment.

Initial navigation example:

```text
Erkennung
└── QR-Code-Erkennung   [Ein/Aus]
```

### Status rail

- Persistent, compact, viewpoint-following.
- Located on right side of visible field.
- Vertical arrangement.
- Icon-first; no permanent text labels.
- Only active/relevant states shown.
- Each icon may expose tooltip/detail on focus/select.
- QR icon is shown only while QR recognition is enabled.

### Transient feedback

- One shared HUD surface.
- Appears close to center-bottom but outside the launcher/navigation footprint.
- Used for progress, success, warning and recoverable error feedback.
- Auto-dismiss for passive confirmations.
- Persistent until resolved/dismissed for errors requiring action.

### Result/detail panel

- Larger panel, preferably spatial/world-locked.
- Consistent HUD chrome.
- Header remains fixed.
- Content body scrolls.
- Action dock remains fixed.
- Long-running action state is shown in the panel and/or transient feedback layer.
- QR results are the first concrete implementation.

## Visual hierarchy

Priority from strongest to weakest:

1. selected primary action / critical confirmation,
2. panel title / active navigation context,
3. content,
4. secondary actions / metadata,
5. persistent status rail,
6. closed launcher.

The persistent HUD must never visually compete with working content.

## Interaction states

All actionable controls support:

- idle,
- focused,
- pressed,
- disabled,
- running where applicable,
- success/error feedback where applicable.

Focus must be obvious without depending on color alone.

## Menu behavior

- Closed launcher -> click/select -> root menu opens.
- Category -> opens one child level.
- Back -> returns one level.
- Launcher while open -> closes menu and resets path.
- Feature toggle -> changes authoritative feature state.
- Closing menu does not change enabled features.
- Opening menu does not pause active features.

## Status behavior

- Status is projection only.
- Selecting a status icon may navigate/open related detail but cannot directly mutate hidden state.
- Disabled features disappear from active status unless a warning/error remains important.
- Degraded/error can override normal active icon appearance.

## QR behavior

### Recognition

- No scan frame.
- No corner markers.
- First valid QR recognition wins.
- Recognition stops for that event once a valid payload is accepted.
- No side-effect action runs automatically.

### Result

Standard result panel:

- title: QR-Code erkannt
- type/semantic classification
- scrollable payload/content
- fixed action dock
- explicit close/new-scan affordance
- standard actions such as Open/Copy
- custom actions such as Bridge registration rendered with the same command components

## Layout guidance

These values are semantic starting points for mockups, not physical hardware calibration.

- Launcher: lower-left safe peripheral zone.
- Navigation: grows up/right from launcher.
- Status rail: right peripheral zone, upper-middle to middle.
- Feedback: lower-center, short vertical footprint.
- Result panel: central working area, not permanently head-locked.

## Accessibility / comfort

- Avoid continuous animation in peripheral vision.
- Use restrained transitions.
- Maintain readable contrast against passthrough.
- Persistent surfaces should use translucent material with clear edge separation.
- Controls must have sufficiently large XR hit targets.
- Avoid excessive panel depth changes during navigation.
- Long text never appears in the status rail or launcher.

## Mockup acceptance questions

The mockup set must allow review of:

1. Is the closed HUD quiet enough?
2. Is the menu discoverable and reachable?
3. Is the hierarchy understandable without explanation?
4. Is active-feature state visible but unobtrusive?
5. Does QR result content remain readable for long payloads?
6. Are actions visually separated from content?
7. Does the system feel like one HUD rather than separate feature UIs?
8. Can future features fit without redesigning the shell?
