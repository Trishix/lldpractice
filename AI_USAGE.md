# AI Usage

AI tools were used for implementation, test authoring, content drafting, design critique, and documentation. The final decisions were checked against the assignment scope, domain invariants, deterministic tests, browser tests, and code review. AI-generated suggestions were not treated as independent grading evidence.

## 1. Independent Evaluation Components

**Suggestion:** Couple MCQ scoring and AI design review into one evaluation request.

**Decision:** Rejected. The implementation keeps the components independent. MCQs use a deterministic answer key, while design review uses the provider. If AI review fails, the learner still keeps the knowledge score. A local save retry never repeats a provider call.

## 2. Structured Evidence Instead of Free-Form AI Feedback

**Suggestion:** Let the model return general prose feedback against the whole submission.

**Decision:** Rejected. The design uses stable IDs for requirements, classes, fields, methods, relationships, and walkthrough steps. The provider must reference exact frozen evidence, and the server verifies those references and quotes before publishing marks. This makes feedback inspectable and supports actionable revision.

## 3. One Canonical Architecture

**Suggestion:** Score the learner against a reference class diagram and named design pattern.

**Decision:** Rejected. The evaluator assesses requirements, ownership, behavior, relationships, and trade-offs rather than exact class names. The reference design is shown as “One valid approach,” not as the only correct solution. Supported alternatives can receive credit when their behavior and consequences are explained.

## 4. Strict Structured Provider Output

**Suggestion:** Accept model-generated prose and calculate a score from the response afterward.

**Decision:** Rejected. Groq receives a strict JSON schema. The server rejects malformed, truncated, refused, phase-inconsistent, or unsupported responses. It also rejects invented quotes, unknown requirement IDs, invalid evidence references, and strengths without real submitted evidence. The server calculates design marks; the model cannot assign marks directly.

The provider uses `openai/gpt-oss-120b`, medium reasoning, and an 8,192-token completion budget. A second call is allowed only after a JSON-schema generation failure, and only within the same evaluation attempt.

## 5. Small Monolith and Explicit Recovery

**Suggestion:** Add authentication, a database, background workers, and automatic provider retries.

**Decision:** Rejected for this two-day MVP. Browser-local persistence, immutable frozen submissions, explicit retries, and a small Next.js server are sufficient for the learner journey. The trade-off is that history is origin-local, process admission is best effort, and the product is not a tamper-proof assessment system.

## Verification

The implementation is validated with TypeScript, ESLint, unit/API tests, executable Java/Python/C++ content checks, Playwright browser journeys, production builds, and calibration fixtures. Live AI grading quality and independent human agreement remain separate verification tasks because mocked provider responses cannot establish them.

See the [research note](docs/research.md), [content notice](docs/third-party/NOTICE.md), and [verification record](docs/verification.md) for supporting context.
