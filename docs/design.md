# LLD Practice: Interface Design

**Status:** Implemented interface; see [verification](verification.md) for executed checks and remaining external calibration gates.  
**Audience:** Engineers building the prototype and reviewers assessing the learner experience.  
**Direction:** Black canvas. White reading text. Yellow emphasis. As little interface as the task allows.

## 1. Design authority and reference

This document defines presentation and interaction. The [Final Consolidated MVP Plan](plan.md), [HLD](hld/README.md), and [LLD](lld/README.md) remain authoritative for product behavior, domain rules, and APIs. The [assignment](assignment.md) establishes the practice loop and two-day scope. The [initial sketch](intialplan.excalidraw) supplies historical context; its chatbot and separate rough-book/entity/UML screens are superseded. [AI usage](../AI_USAGE.md) records implementation decisions. The [updated diagram](lldpractice-v3.excalidraw) shows the current flow.

Use [AlgoMaster’s Tic-Tac-Toe page](https://algomaster.io/learn/lld/design-tic-tac-toe) for navigation, content proportions, and section hierarchy. The user’s final plan supersedes the older OpenAI-only layout direction. Its [official design guidelines](https://openai.com/brand/) describe geometric precision, approachable typography, clear hierarchy, and open space. Apply those qualities through restrained sans-serif type, deliberate alignment, and generous spacing. This is an adaptation for LLD Practice, not an official OpenAI design system. Keep the LLD Practice name and use the font stack below; OpenAI logos and OpenAI Sans are not required assets.

Use familiar design vocabulary: typography, hierarchy, clear space, alignment, contrast, and proportion. These terms explain the interface, not learner-facing marketing copy. Headings and actions should name the task directly.

The requested `minimalist-ui` and `design-taste-frontend` skills inform restraint, typography, and component consistency. The user's black/yellow/white palette overrides their default colors. The latter skill's marketing-layout rules do not govern this multi-step practice workspace. Required imagery, bento grids, serif headlines, light mode, and decorative animation do not apply.

| Design dial | Value | Application |
|---|---:|---|
| `DESIGN_VARIANCE` | 3 | Predictable alignment and stable controls |
| `MOTION_INTENSITY` | 1 | Static content; immediate interaction feedback |
| `VISUAL_DENSITY` | 3 | Spacious sections with compact related fields |

## 2. Visual foundations

### Palette

Only these three authored colors are permitted throughout the product, including forms, dialogs, snippets, diagrams, selection, and browser controls where styling is supported. Do not introduce gray through reduced opacity. Normal font antialiasing is not an additional design color.

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#000000` | Page and every component background |
| `--text` | `#FFFFFF` | Reading text, labels, secondary actions, necessary boundaries |
| `--accent` | `#FFD84D` | Primary action text, current selection, focus, attention |

Every surface stays black. Buttons are black with white or yellow text; there are no yellow-filled or white-filled buttons. Use white outlines only where they identify a control or separate genuinely different content. Yellow is not a success/error scale: explicit words communicate outcomes.

Body text and metadata remain white. Establish secondary hierarchy with size, weight, position, and spacing instead of gray. Use yellow text on black for text selection, preserving the black canvas. Links remain white unless they represent the primary action; underline inline links and give navigation a separate selected indicator.

No gradients, shadows, glow, textures, tinted cards, glass effects, decorative photography, illustrations, progress rings, or background tracks. No theme switch. Native control styling should request a dark scheme, with explicit black surfaces and white text wherever supported; browser-owned pickers and accessibility overrides are outside the application's color guarantee.

### Typography and spacing

| Use | Specification |
|---|---|
| Main font | `"Helvetica Neue", Helvetica, Arial, sans-serif` |
| Code font | `ui-monospace, "SFMono-Regular", Consolas, monospace` |
| Page heading | 40px desktop, 32px below 768px; weight 500; line-height 1.15 |
| Section heading | 24px; weight 500; line-height 1.25 |
| Body and controls | 16px; weight 400; line-height 1.6 |
| Metadata and helper text | 14px; weight 400; line-height 1.5 |
| Code | 14px; line-height 1.6; preserve whitespace |
| Emphasis | Weight 500 or 600 within the same family |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64px |
| Corners | 4px on controls and necessary containers; no pill shapes |

Use sentence case. Keep page headings short and left-aligned. Avoid uppercase eyebrows, decorative numbering, forced line breaks, emojis, and promotional slogans. Use tabular numerals for scores and elapsed time. Snippets are white on black without multicolor syntax highlighting.

Constrain the outer shell to 1440px with 24px desktop gutters and gaps, a 240px left navigation, flexible workspace, and 220px right outline/help panel. Use 16px mobile gutters. Reading prose should stay within 65ch; structured forms can use the available column. Use 48px between major desktop sections, 32px on mobile, 24px within groups, and 8px between labels and controls. Space replaces boxes wherever possible.

### Controls

- **Primary action:** black background, yellow label, 1px yellow outline, 4px radius. Use one primary action per active task area. Keep labels short and on one line.
- **Secondary action:** black background, white label, 1px white outline. Text-only actions are underlined and have the same accessible hit area.
- **Hover and active:** underline the label while preserving colors and position. No scale, lift, or animated transitions.
- **Focus:** 2px yellow outline with a 2px offset. Never remove the browser indicator without this replacement.
- **Unavailable action:** white text and dashed white outline, no hover feedback, disabled semantics, and adjacent text explaining why. Do not dim it or rely on shape alone.
- **Inputs:** visible label above, black surface, white text and border. Show helper/error text below. Placeholders are optional examples, never labels.
- **Selections:** use labeled radio controls for exclusive choices. Indicate selection through checked state, yellow label, and text or shape; color alone is insufficient.
- **Disclosures:** plain heading/action followed by expanded content. Use text such as “Show brief” and “Hide brief” instead of adding an icon dependency.
- **Dialogs:** black surface with a white boundary; no translucent scrim. Make the underlying page inert, contain focus, and restore focus on dismissal. Use only for consequential confirmation.

Interactive targets are at least 44px by 44px. Controls may wrap into additional rows on narrow screens; labels inside buttons should not wrap. System dialogs and assistive technology may override presentation.

## 3. Screen layouts

Keep the existing routes from the [LLD presentation contract](lld/README.md#9-presentation-and-accessibility). Navigation uses **Practice**, **History**, and **Settings**, with the LLD Practice name linking to `/`. Use a 64px desktop header. Keep navigation on one line; on mobile put the name and a “Menu” disclosure on that line, with links expanded below it. Mark the current destination with yellow text, an underline, and `aria-current`.

### Catalogue `/`

Lead with “Practice low-level design” and one sentence explaining the task. Show Tic-Tac-Toe and Snake and Ladder as two restrained outlined problem cards, side by side on desktop and stacked on mobile. Each contains its title, concepts, authored duration estimate, local attempt count, and an action to open setup. Do not fabricate difficulty, duration, scores, or popularity metrics.

Expand setup inline beneath the selected problem. Offer **Quick practice** and **Full practice**, then Java, Python, and C++ with a read-only preview snippet. Use the stored mode/language preference; on first use, leave these choices explicit rather than silently inventing a learner preference. “Start practice” becomes available when both choices are made. Existing drafts expose “Resume attempt”; multiple drafts lead to history for selection.

Explain that quick practice contains ten MCQs and full practice adds structured design. Language and mode are fixed when the attempt starts. A different language starts a separate attempt. API setup does not become an onboarding gate.

### Workspace `/attempts/[attemptId]`

Use a compact heading with problem name, language, mode, and a persistent local-save status. Full practice has **Design**, **MCQs**, and **Review** step navigation; quick practice has only **MCQs** and **Review**. Steps remain revisitable while the attempt is a draft and preserve work when switching.

At 1280px and above, show the 240px navigation and 220px right outline/help beside the workspace. Below 1280px, move contextual help into a disclosure. Below 1024px, collapse navigation into an accessible Menu. Mobile form groups use one column. The problem brief is a disclosure above the worksheet; revision feedback replaces authored help. Keep the save status in normal document flow, visible near the active workspace controls without covering content.

The brief contains requirements, example, exclusions, and reviewed FAQ. It is not a chat interface. The main design form groups inputs into:

1. **Assumptions and requirements:** assumptions and a response for each requirement.
2. **Classes and interfaces:** responsibilities, fields, methods, and contracts. Expand the item being edited; retain a readable summary for collapsed items.
3. **Relationships:** selectors for declared classes, relationship kind, multiplicity, and explanation.
4. **Walkthroughs:** normal and failure scenarios with ordered actions, expected outcomes, and class/method selectors.
5. **Design decision:** chosen approach, alternative, and justification.

Examples explain input format using an unrelated domain. Learners never enter internal IDs. Add/remove actions name their target. Before deleting referenced classes or methods, show affected relationships and walkthrough steps; require explicit reassignment or removal. Do not silently cascade-delete work.

“Show UML” reveals a deterministic, read-only projection of the same structured data. Use black fills and white text/lines. Provide a class-and-relationship text outline alongside the diagram alternative. Diagram layout has no grading significance.

The optional scratchpad is collapsed by default and labeled “Not included in review.” The optional elapsed timer is off by default, has no deadline, and never triggers submission. Preserve panel/timer preferences.

For MCQs, show one question at a time with its assumptions, snippet, and labeled answer choices. “Previous” and “Next” preserve selection. A wrapping question index exposes answered/unanswered state in text and allows direct navigation. Show “Question 3 of 10” and an answered count as functional progress. Answers and explanations are revealed only after scoring. Confine horizontal scrolling to snippets and diagrams.

### Review, submission, and feedback

Review presents the design summary and MCQ completion together. Link every structural error to the field that needs repair. Malformed references block submission. Incomplete sections and unanswered questions require explicit acknowledgment; edits invalidate earlier acknowledgments. Explain that submission freezes this attempt and later changes require a revision.

Before full-practice submission, show:

> Your practice is saved on this browser. Submitting for AI review sends your design through the application server to Groq. Design scores are AI-assessed. Your scratchpad is not sent for review.

Persist the submission before dispatch. If saving fails, keep the draft editable and offer recovery; do not imply that evaluation started. Once submitted, replace editing controls with read-only evidence and evaluation status on the same route.

Lead feedback with simple score text, not charts or metric cards:

- **Knowledge score:** marks out of 50, labeled “Answer-key scored.” Quick practice also shows its percentage and has no design or combined score.
- **Design score:** marks out of 50, labeled “AI-assessed.”
- **Combined score:** marks out of 100 only when both full-practice components succeed. Otherwise display “Combined score pending.”

Show strengths and up to three prioritized improvements next. Each finding presents its category, evidence, judgment, consequence, and suggested revision. Use the categories **Contradiction**, **Not demonstrated**, and **Trade-off** as written labels rather than colored badges. Link evidence to the exact field in the frozen submission; open its section and move focus to the target with a yellow outline.

Keep detailed rubric ratings, per-option MCQ explanations, and reference design in disclosures below the main findings. Label the reference “One valid approach.” Do not fabricate a score for missing, failed, or invalid review output.

### Clarification and revision

When clarification is required, display the one or two questions inline with their referenced submitted statements. Each offers an answer field or explicit “Skip question” choice. “Continue review” freezes those choices and starts the final review round. The original design remains read-only; this is not an open chat or design-editing opportunity.

“Revise” creates a linked draft with copied design and scratchpad, reset MCQs, and the same pinned language/content. Preserve the parent's report. At desktop widths of at least 1280px, previous feedback occupies the 220px right panel, replacing authored help. Below that width it appears in a disclosure above the editor. Keep the parent attempt identified. If referenced content was removed, show “Not present in this revision” rather than pointing to similarly named content.

### History `/history`

Use a compact list, newest activity first, with drafts and submitted attempts clearly labeled. Each entry shows problem, date, language, mode, status, available scores, and its resume/open action. Group related metadata with spacing; use a single separator between attempt groups. On mobile, stack metadata below the problem title.

Identify parent/revision relationships with links. A two-attempt comparison shows knowledge marks and the five rubric categories as plain numbers and explanations. Keep language and content/rubric/model/evaluator versions available in an “Attempt details” disclosure. Label repeat-question practice and explain when differing versions prevent a controlled improvement comparison.

### Settings `/settings`

Use one reading-width column with **AI review** and **Practice data** sections.

AI review offers **Use platform API** and **Use my own API key**. Platform access is the default. Personal keys are Groq keys, entered in a masked field with “Show key,” “Hide key,” and “Remove key.” “Remember key on this device” is unchecked by default. Explain that remembered keys are stored in this browser and browser storage is not an encrypted secret vault. Show the configured provider/model as information, not a new model selector. Link [Groq data controls](https://console.groq.com/docs/your-data) for provider handling details.

Do not switch credentials silently. Changes do not affect a running review. A failed existing session requiring new configuration offers an explicit restart and explains that another provider request is needed.

Practice data provides **Export practice data**, **Import backup**, and **Clear local data**. Explain that history belongs to this browser/origin and has no cross-device sync. Exports exclude credentials. Validate import before requesting replacement confirmation; import replaces practice history while leaving preferences and credentials unchanged. Clear confirmation explains that practice data, preferences, and remembered keys are removed. Preserve and report the LLD's partial-failure behavior.

## 4. State and copy matrix

Submission, evaluation, and saving are separate facts. Never collapse them into one success/error badge. White is the default status text; yellow may draw attention, but the message and action carry the meaning.

| State | Visible copy or behavior | Action |
|---|---|---|
| Hydrating history | “Loading saved practice” in the final content region; no shimmer or false empty state | Disable actions that could overwrite saved data |
| Empty history | “No attempts saved on this browser” | “Start practice” links to the catalogue |
| Missing local attempt | “This attempt is not saved on this browser” | “View practice” and “Import backup” |
| Draft debounce | “Unsaved changes” | Continue editing |
| Write queued/in progress | “Saving” | Continue editing unless a critical transition is active |
| Current revision acknowledged | “Saved on this browser” | No extra action |
| Save failure | “Save failed. Your latest work is available in this tab” | “Retry save” and “Export practice data” |
| Invalid references | “Fix the highlighted references before submitting” plus field-specific errors | Focus the first error; link all blocking fields |
| Incomplete draft | List actual incomplete sections and unanswered questions | Edit or explicitly acknowledge omissions |
| Evaluation active | Separate “Scoring MCQs” and “Reviewing design” labels as applicable | Disable duplicate submit/retry actions; no invented percent progress |
| Partial evaluation success | Example: “Knowledge: 35/50. Design review failed” | “Retry design review”; retain knowledge results |
| Reverse partial success | “Design review complete. MCQ scoring failed” | “Retry MCQ scoring”; retain design results |
| Result received, save failed | “Review complete. Result not saved on this browser” | “Retry save” or export; no provider retry |
| Clarification needed | “Clarification needed” and the returned questions | Answer or skip, then “Continue review” |
| Interrupted request | “Review interrupted. Retry available” | Explicit component retry; explain another provider call may occur |
| Review timeout/invalid report | “Design review could not be completed” with a specific safe reason | Explicit retry where allowed; no partial AI score |
| Rate or quota limit | Explain the limit and known retry delay | Enable explicit retry when allowed; never auto-submit |
| Missing/rejected key | Identify the selected access mode and how to fix it | Open AI review settings; MCQs remain available |
| Configuration changed | “Review settings changed. Start a new review session to continue” | Explicit restart, preserving the frozen submission |
| Editing elsewhere | “Editing is active in another tab” | Read-only history; “Enable editing” only after ownership becomes available |
| Conflicting saved changes | “Saved practice changed in another tab” | Pause writes, export local work, or explicitly reload latest |
| Corrupt/unsupported storage | “Saved practice could not be loaded” with a specific explanation | Export original practice data or explicitly reset; no silent overwrite |
| Storage/browser support unavailable | Explain that saving and submission are unavailable | Read saved data where possible; allow memory-only drafting and export |
| Invalid import | State why the backup was rejected | Keep existing history; choose another file |
| Import/clear failure | State exactly what was not replaced or removed | Safe retry; never show a blanket success |
| Content version unavailable | Explain that this version can no longer be evaluated | Read/export old work or start a separate current-version attempt |

Use short, factual copy. Avoid promises of automatic recovery, durable background processing, verified design correctness, or improvement unsupported by comparable evidence. User and provider text renders as escaped content.

## 5. Accessibility and acceptance

These are implementation acceptance checks, not reported test results. This document adds no API, domain-type, dependency, or application-code changes.

- Verify the three-color rule across all application-controlled states. White and yellow text must meet at least 4.5:1 contrast on black; focus and control boundaries must meet 3:1. Never communicate correctness, selection, or failure through color alone.
- Complete both practice modes using only the keyboard. Give every input a visible label, use semantic fieldsets for answer groups, and make add/remove controls identify their target.
- Move focus predictably after adding/removing items, opening/closing dialogs, validation errors, and following evidence links. Step navigation exposes the current step and remains operable without a pointer.
- Announce save/evaluation changes through a restrained polite live region. Do not announce every keystroke or timer tick. Use an assertive announcement only for a blocking action failure.
- Check catalogue, workspace, results, history, settings, and confirmations at 320px, 768px, and 1280px widths, and at 200% zoom. No page-level horizontal scrolling, clipped controls, or overlapping panels.
- Preserve complete diagram information in a text outline. Keep code copyable and horizontal scrolling keyboard-accessible within its own region.
- Keep the interface usable with reduced motion and forced colors. Respect accessibility overrides even when they replace the authored palette.
- Exercise partial results, failed saves, interrupted review, clarification, missing keys, read-only tabs, and corrupt storage. Every retry must target the correct operation.
- Check Markdown links and consistency with the [LLD state invariants](lld/README.md#4-state-machines-and-invariants). Do not treat visual polish as evidence that runtime behavior has passed testing.

### Requirement coverage

| HLD requirement | Design coverage |
|---|---|
| FR-01: Two problems | Catalogue and brief |
| FR-02: Three snippet languages | Setup and MCQ presentation |
| FR-03: Quick/full practice | Mode selection and workspace steps |
| FR-04: Structured design | Five design groups, selectors, UML alternative |
| FR-05: Deterministic knowledge score | Answer-key label, marks, percentage, explanations |
| FR-06: Explainable assessment | Rubric, evidence links, findings, suggested revisions |
| FR-07: Bounded clarification | Inline answer-or-skip round |
| FR-08: Local continuity | Save status, hydration, resume, history |
| FR-09: Credential choices | AI review settings and explicit configuration changes |
| FR-10: Safe recovery | Independent result/save states and targeted retries |
| FR-11: Revision | Linked draft, reset MCQs, preserved parent feedback |
| FR-12: Local-data controls | Export, validated import, confirmed clearing |
