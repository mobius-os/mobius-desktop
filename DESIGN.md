---
name: "Möbius Desktop"
description: "A trustworthy desktop doorway into the Möbius you own."
colors:
  ink: "#17151c"
  ink-soft: "#46424d"
  muted: "#6f6a76"
  line: "#ddd9e2"
  line-strong: "#c9c2d2"
  cloud: "#f7f6f8"
  paper: "#ffffff"
  violet: "#5c36ee"
  violet-deep: "#4521c7"
  violet-soft: "#ece8ff"
  plum: "#2b1058"
  plum-bright: "#6f43df"
  success: "#147a52"
  danger: "#ad2e3d"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(36px, 4.2vw, 68px)"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(34px, 4vw, 54px)"
    fontWeight: 680
    lineHeight: 1.04
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  xs: "7px"
  sm: "9px"
  field: "10px"
  button: "11px"
  tile: "13px"
  panel: "14px"
  feature: "20px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  field: "14px"
  md: "18px"
  rail: "20px"
  lg: "24px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 18px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.violet-deep}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "42px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "46px"
  choice-hosted:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.paper}"
    rounded: "{rounded.feature}"
    padding: "28px"
    height: "132px"
  choice-alternative:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "20px 8px"
  tag:
    backgroundColor: "{colors.violet-soft}"
    textColor: "{colors.violet-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 7px"
---

# Design System: Möbius Desktop

## Overview

**Creative North Star: "The Trustworthy Doorway"**

Möbius Desktop is an operating surface, not a dashboard and not a generic browser wrapper. A deep-plum ownership plane holds the canonical white Möbius mark and one plain promise; a white/cloud decision plane handles the current task with crisp hierarchy and generous room. The division makes ownership feel permanent while each decision remains calm and reversible.

The interface leads with the hosted path because it best fulfills the product promise, but it never disguises the existing-deployment or local-Docker alternatives. Möbius violet is the singular action voice. Rails, restrained dividers, and soft ambient depth keep the choice architecture legible without making it feel administrative.

**Key Characteristics:**
- Two continuous planes: deep plum for ownership, white/cloud for decisions.
- Hosted leads visually; alternatives remain equally honest in language.
- Möbius violet marks action, focus, and guidance rather than decoration.
- Inter carries a plain, assured voice with compact display tracking.
- Motion is slow in the environment, quick in controls, and optional throughout.
- The canonical Möbius mark appears white on the ownership plane.

## Colors

The palette moves from a grounded plum field through cloud-white working surfaces, with one vivid violet action voice and semantic green/red reserved for status.

### Primary
- **Möbius Violet** (`#5c36ee`): The sole action and focus color for primary buttons, hosted emphasis, selected guidance, and interactive accents.
- **Deep Action Violet** (`#4521c7`): Hover and pressed emphasis for violet actions; it deepens intent rather than introducing another hue.
- **Soft Violet** (`#ece8ff`): Quiet icon fields, numbered steps, and gentle recommendation context.

### Neutral
- **Ownership Plum** (`#2b1058`): The persistent brand plane and full-screen loading/fatal-state field.
- **Bright Plum** (`#6f43df`): A supporting ambient hue inside the ownership plane; never a competing action color.
- **Ink** (`#17151c`): Primary text and selected control text.
- **Soft Ink** (`#46424d`): Secondary headings, labels, and navigation copy.
- **Muted Aubergine** (`#6f6a76`): Explanatory copy, metadata, and quiet controls.
- **Crisp Line** (`#ddd9e2`) and **Strong Line** (`#c9c2d2`): Rail division and field boundaries.
- **Cloud** (`#f7f6f8`) and **Paper** (`#ffffff`): App ground and active decision surface.

### Semantic
- **Ownership Green** (`#147a52`): Confirmed ready/running state, always paired with explicit text or an icon.
- **Protective Red** (`#ad2e3d`): Destructive affordances and errors, never used as decoration.

### Named Rules
**The One Voice Rule.** Violet is the only general-purpose accent. Blue, green, and red appear only where their meaning is specific and named.

**The Honest Alternative Rule.** Hosted may occupy the richest violet surface; existing and local options keep full legibility on neutral rails rather than being hidden or visually disabled.

## Typography

**Display Font:** Inter (with system-ui and sans-serif fallbacks)
**Body Font:** Inter (with system-ui and sans-serif fallbacks)
**Label Font:** Inter (with system-ui and sans-serif fallbacks)

**Character:** A single incumbent face keeps setup language direct and familiar. Large headlines use tight tracking and compact leading for conviction; supporting copy relaxes into readable line lengths and ordinary sentence case.

### Hierarchy
- **Display** (650, `clamp(36px, 4.2vw, 68px)`, 0.98): Short brand promises on the plum ownership plane, balanced at roughly 11 characters per line.
- **Headline** (680, `clamp(34px, 4vw, 54px)`, 1.04): The current decision or destination, generally capped near 14–17 characters per line.
- **Title** (600, `18px`, 1.2): Choice names, form sections, and compact screen landmarks.
- **Body** (400, `16px`, 1.55): Primary explanatory text, normally held to 58ch or less.
- **Label** (600, `13px`, 1.2): Form labels, button text, metadata, and status copy. Uppercase is reserved for compact categorical pills.

### Named Rules
**The Plain-Language Rule.** Type should make ownership and consequences easier to understand. Prefer one clear sentence over infrastructure terminology, and expose technical detail only where it helps a decision.

## Layout

Operate mode uses a stable two-plane shell: `minmax(290px, 34%) 1fr` on large windows, a fixed 270px ownership rail below 980px, and a stacked 190px brand header below 760px. The decision plane scrolls independently and centers a working column no wider than 760px. Its responsive padding ranges from 34–72px vertically and 36–84px horizontally; the compact layout settles at 24px side padding.

The system favors continuous surfaces and bordered rails over nested cards. Repeated rows use one-pixel dividers, 12–20px internal gaps, and 18–28px action spacing. Hosted is a single large feature choice; alternatives line up beneath it as honest, equally readable rails. At compact widths, action groups wrap or stack without reordering the decision story.

## Elevation & Depth

Depth is a restrained hybrid. The plum plane carries one blurred ambient glow and a broad tonal arc, while the paper plane stays flat and precise. Shadows belong to decisive violet actions or selected controls, not to every container.

### Shadow Vocabulary
- **Hosted Lift** (`0 16px 40px rgba(69, 33, 199, 0.22)`): The recommended hosted choice at rest.
- **Hosted Hover Lift** (`0 20px 50px rgba(69, 33, 199, 0.28)`): A brief increase when the feature choice is hovered.
- **Action Lift** (`0 8px 22px rgba(69, 33, 199, 0.18)`): Primary buttons only.
- **Selected Toggle** (`0 2px 7px rgba(23, 21, 28, 0.1)`): A small tactile cue inside segmented access controls.

### Named Rules
**The Ambient-Not-Ornamental Rule.** Use blur and shadow to clarify plane, recommendation, or selection. Flat rails and forms remain flat at rest.

## Shapes

The system is softly squared. Fields and secondary controls sit at 9–11px radii; icon tiles and notice panels use 13–14px; the singular hosted feature expands to 20px. Pills and status orbs may be fully round when the shape carries a compact category or state. Borders are crisp one-pixel lines in the violet-neutral family. Avoid turning every surface into a floating rounded card.

## Components

### Buttons
- **Shape:** Softly squared, 11px for primary and 10px for secondary; default heights are 46px and 42px.
- **Primary:** White on Möbius violet with `0 18px` padding and restrained action lift.
- **Hover / Focus:** Deepen to `#4521c7`, lift by one pixel, and use the shared three-pixel translucent violet focus ring. Pressed state returns toward the plane.
- **Secondary / Icon:** Paper with a strong-line border, or transparent for icon-only controls. Destructive color appears on hover only when the action is truly destructive.

### Chips
- **Style:** Category pills are quiet neutral capsules with compact uppercase labels. The recommendation pill is translucent white inside the hosted surface.
- **State:** Segmented access choices use a muted track; the selected choice becomes paper with ink text and a low tactile shadow.

### Cards / Containers
- **Corner Style:** Use 14px for notices and reminders, 20px only for the primary hosted choice.
- **Background:** White/cloud for work, soft violet for guidance, deep plum for ownership.
- **Shadow Strategy:** Feature recommendation and selected control only; lists and alternative choices use rails.
- **Internal Padding:** 18–20px for notices, 28px for the hosted feature.

### Inputs / Fields
- **Style:** White field, 46px height, 14px horizontal padding, 10px radius, one-pixel strong-line border.
- **Focus:** Violet border plus the shared visible focus ring; placeholder remains muted.
- **Error / Disabled:** Errors use plain-language next actions on pale red; disabled actions retain their silhouette at 48% opacity.

### Navigation
- **Style:** Back navigation is text-and-icon on transparent paper. Alternative setup paths are full-width rail buttons with icons, strong titles, explanatory copy, and a trailing arrow.
- **State:** Hover adds only a near-paper tint and moves the arrow four pixels; focus remains explicit. On small windows, navigation preserves reading order and expands vertically.

### Hosted Choice
The hosted choice is the signature decision component: a 20px violet feature surface with a quiet circular ornament, a white icon field, a recommendation pill, and an arrow. It is prominent because it is the durable default, not because alternatives are concealed.

### Ownership Panel
The ownership panel is a continuous deep-plum plane containing the white canonical mark, product name, one short promise, and the line “Yours to run. Yours to change.” Its slow blurred drift supplies atmosphere; it never competes with the active decision.

## Do's and Don'ts

### Do:
- **Do** preserve the plum ownership plane and white/cloud decision plane as the primary spatial model.
- **Do** let hosted lead with the singular violet feature treatment while keeping existing and local paths visible, legible, and plainly described.
- **Do** use rails and dividers for recurring alternatives, deployments, folders, and status rows.
- **Do** pair every color status with text, an icon, or both, and preserve the three-pixel visible focus ring.
- **Do** honor reduced motion by collapsing all transitions and animations to effectively immediate feedback.
- **Do** use the canonical Möbius mark in white on deep plum.

### Don't:
- **Don't** turn the launcher into a dense dashboard, browser chrome, or a grid of interchangeable cards.
- **Don't** introduce a second general-purpose accent or use semantic green/red as decoration.
- **Don't** overstate local durability, conceal Docker dependence, or make local file access appear available to remote deployments.
- **Don't** use shadows on every surface; recommendation, action, and selected state must earn depth.
- **Don't** replace direct ownership language with infrastructure-first copy.
