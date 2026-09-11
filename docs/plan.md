# LLD Practice Platform — Final Consolidated MVP Plan

> The September 11 completion plan supplied by the user supersedes older execution details in this document. The active flow is Choose → Draft → Save frozen submission → Evaluate → Feedback → Revise → History. Current implementation and release evidence are in [HLD](hld/README.md), [LLD](lld/README.md), and [verification](verification.md). Content 2.0.0 retains 1.0.0 for saved attempts; review uses design-v2/review-v2, medium reasoning and 8,192 completion tokens, with one retry only for provider JSON-schema generation failures. The interface uses a 1440px shell, 240px navigation, 220px help panel, and 24px gaps. Optional phase/fallback/calibration keys are server-only. Live calibration and independent human grading remain separate external gates.

## 1. Goal, scope, and research

Build a two-day prototype that supports:

Choose problem → Think/design → Submit → Understand feedback → Revise →
Review improvement.

Prioritize the platform’s domain model, useful evaluation, and complete
learner journey. Keep infrastructure small.

### Confirmed decisions

 Area                       Decision
━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Problems                   Tic-Tac-Toe and Snake and Ladder
─────────────────────────  ─────────────────────────────────────────────
 Practice content source    ashishps1/awesome-low-level-design
─────────────────────────  ─────────────────────────────────────────────
 Modes                      MCQ-only and comprehensive
─────────────────────────  ─────────────────────────────────────────────
 MCQ languages              Java, Python, C++
─────────────────────────  ─────────────────────────────────────────────
 Learner coding             Read snippets and answer MCQs; no manual
                            coding
─────────────────────────  ─────────────────────────────────────────────
 Design format              Structured classes, relationships,
                            walkthroughs, and reasoning
─────────────────────────  ─────────────────────────────────────────────
 Comprehensive weighting    MCQs 50 marks + design 50 marks
─────────────────────────  ─────────────────────────────────────────────
 Storage                    Zustand with browser-local persistence
─────────────────────────  ─────────────────────────────────────────────
 AI access                  Platform-provided default API or learner’s
                            own key
─────────────────────────  ─────────────────────────────────────────────
 Runtime AI                 Normally one design-review call; one
                            additional call for clarification
─────────────────────────  ─────────────────────────────────────────────
 History                    Local drafts, submissions, feedback, and
                            revision lineage
─────────────────────────  ─────────────────────────────────────────────
 Authentication             None for the MVP
─────────────────────────  ─────────────────────────────────────────────
 Infrastructure             Web monolith with stateless server
                            endpoints; no learner database or durable
                            worker

Evaluation boundary: MCQs have reproducible answer-key scores.
Structural checks verify consistency. Original-design quality remains a
qualified review judgment; do not claim perfect automated evaluation.

### Existing artifacts and project location

- Build directly in `/Users/trishitswarnakar/Documents/lldpractice`.
- Preserve [the original sketch](intialplan.excalidraw).
- The updated [v3 diagram](lldpractice-v3.excalidraw) records local storage,
  API settings, independent results, and interrupted-review recovery.
- The [superseded proposal](archive/superseded-plan.md) is historical only.
- Do not modify the sibling VFLOW reference project.

### Research direction

Document these observations in the research note:

 Platform                Relevant approach        Application to this
                                                  MVP
━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━
 AlgoMaster (https://    Staged LLD practice      Guided practice and
 algomaster.io/          and history              repeat attempts
 interview/low-level-
 design)
──────────────────────  ───────────────────────  ───────────────────────
 Hello Interview         Step-by-step practice    Manageable workspace
 (https://                                        stages
 www.hellointerview.c
 om/practice/
 overview)
──────────────────────  ───────────────────────  ───────────────────────
 Exercism (https://      Separate automated       Distinguish verified
 exercism.org/docs/      and mentor feedback      checks from judgment
 using/feedback)
──────────────────────  ───────────────────────  ───────────────────────
 HackerRank (https://    Evaluation tailored      Deterministic MCQs
 support.hackerrank.c    to question format       and qualitative
 om/                                              design review
 articles/4666032442-
 scoring-
 questions-%28overvie
 w%29)
──────────────────────  ───────────────────────  ───────────────────────
 CodeCrafters            Concrete practice        Clear outcomes and
 (https://               stages                   next actions
 app.codecrafters.io/
 concepts/overview)
──────────────────────  ───────────────────────  ───────────────────────
 Educative (https://     Requirements, OOD,       Connect
 www.educative.io/       diagrams, and            responsibilities to
 courses/grokking-       implementation           behaviour
 the-low-level-
 design-interview-
 using-ood-
 principles)
──────────────────────  ───────────────────────  ───────────────────────
 CodeSignal (https://    Overall and component    Visible score
 support.codesignal.c    feedback                 breakdowns
 om/hc/en-us/
 articles/13408542717
 079-Understanding-
 Assessment-Score)
──────────────────────  ───────────────────────  ───────────────────────
 Refactoring.Guru        Pattern intent and       Assess justification
 (https://               applicability            rather than pattern
 refactoring.guru/                                names
 design-patterns)

These are public-documentation findings, not independent validation of
paid evaluators. Other platforms inform product decisions; practice
content comes from the selected repository.

## 2. Content and final learner experience

### Problem packages

Prepare two versioned packages containing:

- Introduction, requirements, examples, and exclusions.
- Reviewed clarification FAQ.
- Normal and failure scenario prompts.
- Ten conceptual MCQs with three language variants.
- Private answer keys and explanations.
- Problem-specific design rubric.
- Reference design and source attribution.

Pin the source commit and record adaptations. The repository links to
external concept lessons; distinguish those references from
repository-hosted material and preserve applicable notices. Source
repository (https://github.com/ashishps1/awesome-low-level-design/)

Tic-Tac-Toe scope: two local players, 3×3 board, legal moves, turn
order, wins, draws, and rejection of moves after completion. Exclude
bots, networking, and undo.

Snake and Ladder scope: one session with multiple players, a fixed
validated board, dice rolls, transitions, turn order, and completion.
Explicit MVP rules: start at zero, reach 100 exactly, overshoot
preserves position, no extra turn for six, and no chained transitions.
Document the exclusion of the source problem’s concurrent-session
requirement. Source problem
(https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/snake-and-ladder.md)

### Catalogue and setup

Show two problem cards with concepts, estimated duration, and previous
attempts.

Offer:

- Quick practice: ten fixed code-snippet MCQs.
- Full practice: structured design plus ten MCQs.

Ask for Java, Python, or C++, show a preview snippet, and remember the
preference.

Freeze language and content version when the attempt starts. A language
change creates another attempt; it does not overwrite existing work.

Default API access is already selected. Learners can change it through
settings without interrupting ordinary practice.

### Workspace

Use one workspace with:

- Collapsible problem brief and clarification FAQ.
- Design, MCQs, and Review steps.
- Optional ungraded rough book.
- Local-save status.
- Optional elapsed timer; no forced submission.
- Generated read-only UML preview.

The design editor collects:

1. Assumptions and requirement handling.
2. Classes/interfaces, responsibilities, important fields, and methods.
3. Relationships referencing declared classes.
4. A normal and failure walkthrough referencing objects and methods.
5. One trade-off: chosen approach, alternative, and justification.

Keep this notation language-neutral. Use unrelated examples to explain
input format without supplying the target solution.

Learners may edit design and MCQs until final submission. This is
assisted practice; the component scores are not independent
measurements.

### User-friendliness

- Use labelled fields, selectors for references, and clear add/remove
  actions.

- Explain consequences before deleting referenced classes.
- Provide keyboard navigation, visible focus, and text alternatives to
  the diagram.

- Use text alongside colours for status.
- Collapse side panels on smaller screens.
- Display “Saved on this browser,” “Saving,” or a specific save failure.
- Do not block MCQ-only practice because an API key is unavailable.

### Submit, review, and revise

Before submission:

- Block malformed references.
- Allow acknowledged incomplete sections.
- Warn about unanswered MCQs.

Submission freezes a snapshot through application rules. Since storage
is client-controlled, this is not a tamper-proof examination record.

Results show:

- Knowledge score.
- AI-assessed design score.
- Combined score when both exist.
- Strengths and up to three prioritized improvements.
- Evidence links to relevant fields.
- MCQ explanations.
- A reference design labelled as one valid approach.

“Revise” copies the design into a linked draft, resets MCQ answers, and
preserves previous feedback. History identifies language, mode, content
version, evaluator version, and repeat-question practice.

## 3. Evaluation and API configuration

### Fixed multilingual MCQs

Create 20 conceptual questions × 3 languages = 60 reviewed variants.

Each problem includes two questions in each category:

- Code behaviour.
- Bugs and state transitions.
- Responsibilities and encapsulation.
- Relationships and contracts.
- Changes under explicit constraints.

Variants share the concept and marks, but each has its own snippet,
options, answer, and explanations.

Review requirements:

- One defensible answer under stated constraints.
- Equivalent reasoning across languages.
- No undefined behaviour or obscure syntax trivia.
- Executable snippet outcomes verified during content preparation.
- No runtime AI generation or translation.
- Rewrite questions that cannot be made equivalent.

Store private keys on the server and score submitted answer IDs through
a stateless endpoint. Persist the returned result locally. This endpoint
does not retain learner history.

Answer secrecy discourages accidental exposure; without authentication
or an authoritative attempt ledger, this remains a practice product
rather than a secure examination system.

### Score calculation

Each correct MCQ earns five marks; incorrect or unanswered earns zero.

Design criteria:

 Criterion                                Maximum
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━
 Requirements and assumptions                  10
───────────────────────────────────────  ─────────
 Responsibilities and encapsulation            10
───────────────────────────────────────  ─────────
 Relationships and contracts                   10
───────────────────────────────────────  ─────────
 Behaviour and edge cases                      10
───────────────────────────────────────  ─────────
 Trade-off reasoning and extensibility         10

Each criterion receives a rating from zero to four:

Not demonstrated → Major gaps → Partial → Coherent → Well-supported.

Application code calculates:

- MCQ marks: 5 × correct answers.
- Design marks: 2.5 × sum of five criterion ratings.
- Comprehensive total: MCQ marks + design marks.
- MCQ-only percentage: 10 × correct answers.

Structural validation is ungraded. Filling fields or matching reference
class names earns no design marks.

### Minimal AI review

Send only the versioned requirements, rubric, frozen design, and
clarification answers. Exclude MCQ answers, MCQ score, previous results,
and scratchpad.

Require:

Evidence → Judgment → Consequence → Suggested revision.

Distinguish:

- Contradiction: submitted behaviour violates requirements.
- Not demonstrated: necessary evidence is absent.
- Trade-off: a valid choice with a cost.

Allow different class structures and approaches. Do not reward pattern
names or treat described behaviour as executed code.

Normally return a report in one call. If an existing statement is
materially ambiguous, return up to two neutral questions. Permit one
answer-or-skip round and one further call.

Clarification appends evidence; it cannot silently replace contradictory
content.

Validate response schema, rating bounds, criterion coverage, evidence
references, and quoted excerpts. Represent missing evidence with a
relevant section reference rather than an invented quote.

Validation catches malformed reports, not all incorrect reasoning. Label
design scores AI-assessed.

### Default API and bring-your-own-key

Settings offer:

1. Use platform API — default.
2. Use my own API key.

MVP provider default: Groq for both choices, using the same configured
model and rubric. Additional providers remain possible through the
adapter, but are outside this two-day implementation.

Default model: openai/gpt-oss-120b on Groq, with medium reasoning,
configurable server-side and recorded with each report. Use GROQ_API_KEY,
GROQ_MODEL, and GROQ_REASONING_EFFORT. Both credential choices use Groq keys.

Use groq-sdk with strict JSON-schema output, no streaming/tools, a
60-second timeout, and maxRetries: 0. Validate evidence and ratings in
application code even when strict structured output succeeds.

Model decision updated 11 September 2026: compare GPT-OSS 20B for speed
and Qwen 3.8 27B as a preview evaluation candidate. Do not switch models
automatically; keep 120B as default pending actual rubric calibration.
See [HLD model comparison](hld/README.md#model-selection-and-alternatives)
and [Groq models](https://console.groq.com/docs/models).

Platform key

- Supplied through a server environment variable.
- Never included in browser bundles, Zustand, or exports.
- Accessed only by the evaluation endpoint.

User key

- Entered in a masked field with show/remove controls.
- Kept in memory by default.
- Optional “Remember key on this device” persists it separately in
  browser storage.

- Excluded from attempt history, backups, logs, and report metadata.
- Sent over HTTPS to the evaluation endpoint only for the selected
  request; not persisted server-side.

Explain that browser storage is not an encrypted secret vault. Do not
describe localStorage as inherently secure.

Do not silently fall back between credentials. Invalid keys, quota
limits, and unavailable default access produce an actionable error and
preserve work.

Lock the chosen credential mode and model for an evaluation run.
Switching configuration applies to a new run.

## 4. Local storage and application architecture

### Stack and persistence

Use Next.js with TypeScript, Zustand, browser localStorage, and
stateless Node.js route handlers.

Remove Prisma, SQLite, and the durable background worker from the
earlier plan.

Zustand manages state; its persistence middleware serializes selected
data to localStorage. Use namespaced keys, explicit persisted fields,
schema versions, migrations, and hydration handling. Zustand persistence
documentation
(https://zustand.docs.pmnd.rs/integrations/persisting-store-data)

Stores:

 Store               Contents
━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 practiceStore       Drafts, snapshots, answers, reports, clarification
                     state, revision links
──────────────────  ────────────────────────────────────────────────────
 preferencesStore    Language, selected mode, UI preferences, API
                     credential mode
──────────────────  ────────────────────────────────────────────────────
 credentialsStore    In-memory user key; optional separately persisted
                     key
──────────────────  ────────────────────────────────────────────────────
 Transient state     Hydration, active requests, abort controllers,
                     unsaved errors

Do not persist controllers, request promises, raw provider responses, or
credentials inside attempts.

Use versioned public content with each attempt’s required public
snapshot so older work remains readable after content changes.

### Local-storage behaviour

- Rehydrate before enabling actions that could overwrite saved work.
- Version and validate persisted data.
- Never silently reset corrupt or unsupported data.
- On write/quota failure, preserve in-memory work, show that saving
  failed, and offer export.

- Provide Export practice data, Import backup, and Clear local data.
- Exports exclude all credentials.
- Validate imports before replacing local data; require confirmation
  before replacement.

- Detect changes from another tab and pause conflicting edits until the
  learner reloads the latest state.

Saved data belongs to that browser and origin. Clearing site data
removes it; there is no cross-device sync.

Once the application is loaded, learners can edit local drafts without
connectivity. MCQ marking and AI review require connectivity. Do not
promise a complete offline application without implementing a service
worker.

### Domain responsibilities

 Class/interface                      Responsibility
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ProblemPackage                       Versioned content and rubric
───────────────────────────────────  ───────────────────────────────────
 ConceptQuestion / QuestionVariant    Concept identity and language-
                                      specific material
───────────────────────────────────  ───────────────────────────────────
 Attempt                              Editing rules, submission,
                                      revision lineage
───────────────────────────────────  ───────────────────────────────────
 SubmissionSnapshot                   Frozen evidence within the
                                      application
───────────────────────────────────  ───────────────────────────────────
 SubmissionValidator                  Structural checks
───────────────────────────────────  ───────────────────────────────────
 McqEvaluator                         Answer-key scoring
───────────────────────────────────  ───────────────────────────────────
 DesignEvaluator                      Assessment or clarification
───────────────────────────────────  ───────────────────────────────────
 ScorePolicy                          Weighting and normalization
───────────────────────────────────  ───────────────────────────────────
 EvaluationCoordinator                Client lifecycle and server
                                      requests
───────────────────────────────────  ───────────────────────────────────
 AttemptRepository                    Persistence interface implemented
                                      through Zustand

Keep domain behaviour independent of React components. Stores call
domain operations rather than containing all rules inline.

Future formats use evidence adapters. Future evaluation providers
implement DesignEvaluator.

### Server boundary

Provide only:

- MCQ scoring against private versioned keys.
- Design evaluation and clarification completion.
- Non-secret API configuration/availability metadata.

Construct rubric prompts server-side. Validate inputs and bound request
sizes. Add a simple single-instance rate limiter for the platform-funded
API; document its limits.

No learner database, server-side history, or recoverable job queue.

The interface must accurately state:

> Your practice is saved on this browser. Submitting for AI review sends
> your design through the application server to the selected AI
> provider.

### Evaluation lifecycle

Local statuses:

Draft → Submitted → Evaluating → Completed / Failed

Optional:

Evaluating → Awaiting clarification → Evaluating

Persist the submission before network requests. Store MCQ and design
results independently as they arrive.

- Closing or refreshing during evaluation may interrupt the request.
- On reload, mark an unfinished active request as Interrupted — retry
  available.

- Do not automatically repeat potentially billable requests.
- Apply a 60-second provider timeout.
- Ignore responses whose run ID no longer matches the active run.
- Disable duplicate submission/retry actions while active.
- Preserve any completed MCQ result if design review fails.
- Keep the overall score pending until both components succeed.
- Reopening a completed report never invokes AI.

If the provider completed a request but the browser lost the response,
retry may incur another call. Document this limitation instead of
implying exactly-once processing.

## 5. Tests, deliverables, and two-day execution

### Tests

Content and scoring

- Twenty concepts and sixty reviewed language variants.
- Exactly one correct answer per variant.
- Equivalent weights and deterministic totals.
- No keys in public question responses.
- Versioned results remain stable.

Local persistence

- Refresh restores drafts and reports.
- Hydration does not overwrite existing data.
- Migration, corrupt data, unavailable storage, and quota failure.
- Export/import preserves history and excludes credentials.
- Tab conflicts do not silently overwrite work.
- Clearing data requires confirmation.

Domain and evaluation

- Invalid references and acknowledged incompleteness.
- Frozen submission and separate revisions.
- Clarification answered/skipped.
- Malformed report and invented evidence.
- Timeout, interrupted review, retry, duplicate actions, and stale
  responses.

- Default versus user-key routing.
- No silent credential fallback.
- Failed AI review preserves MCQ results.
- API keys absent from logs, reports, and backups.

End-to-end

- MCQ-only flow in all three languages.
- Comprehensive flow through feedback and revision.
- Resume after refresh.
- Keyboard navigation and narrow-screen layout.

### Calibration and usability

Prepare five manually reviewed designs per problem:

1. Strong conventional design.
2. Strong alternative design.
3. Incomplete design.
4. Known behavioural contradiction.
5. Verbose or adversarial submission.

Keep these separate from prompt examples. Repeat strong fixtures three
times.

Initial targets:

- No invalid evidence references in published reports.
- Relevant findings for known contradictions.
- No penalties solely for alternate class structures.
- At least 90% of criterion ratings within one level of manual review.
- No more than five design marks of variation across repeated strong
  fixtures.

Report measured results and disagreements. These are small-sample
development targets, not a claim of universal accuracy.

If available, observe two or three learners starting, submitting,
understanding a finding, and revising without assistance. Record actual
observations only.

### Two-day sequence

 Period             Work
━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Day 1 morning      Research note, two problem scopes, MCQs, language
                    variants, rubric
─────────────────  ─────────────────────────────────────────────────────
 Day 1 afternoon    Domain model, Zustand persistence, catalogue,
                    editor, language/API settings, submission, history
─────────────────  ─────────────────────────────────────────────────────
 Day 2 morning      Stateless scoring/review endpoints, clarification,
                    feedback, interruption/retry
─────────────────  ─────────────────────────────────────────────────────
 Day 2 afternoon    Calibration, end-to-end tests, usability fixes,
                    documentation, demo rehearsal

Complete one Tic-Tac-Toe loop first. Add Snake and Ladder through the
same content and evaluation interfaces to demonstrate extensibility.

### Required deliverables

- Research note: 1–2 pages covering learner needs, researched
  approaches, gaps, and product direction.

- Design note: domain responsibilities, state/data flow, rubric, local-
  storage trade-offs, API handling, and extensibility.

- Working prototype: both problems, three languages, two modes, both API
  credential choices.

- Tests: important behaviour, persistence, and failure cases.
- README: setup, environment variables, storage behaviour, API options,
  tests, demo, and limitations.

- AI_USAGE.md: 3–5 actual accepted/rejected AI decisions.
- Updated Excalidraw: preserve the original hand-drawn style; add API
  settings and local-data controls, and replace durable-job wording with
  interrupted-request recovery.

### Definition of done

A learner can practise in a familiar snippet language, save work
locally, submit using the platform API or their own key, understand the
distinction between deterministic scores and design judgments, and
revise without losing history.

The reviewer can inspect clear domain responsibilities, versioned
content, explainable feedback, meaningful tests, and practical failure
handling.

Exclude authentication, manual coding, executable design models,
unrestricted chat, custom diagram editing, multiple AI judges,
additional providers, additional problems, cross-device sync,
leaderboards, and distributed infrastructure.
