# Research note

## Learner need

A useful low-level design submission explains responsibility, ownership, contracts, and state changes. Class names and diagrams alone cannot demonstrate behavior. This MVP asks for a response to each requirement, structured classes and relationships, a normal and failure walkthrough, and a justified alternative. An optional scratchpad supports thinking but is not evidence for grading.

The central question is whether feedback helps a learner make a specific revision. A score without a cited observation is insufficient. Findings therefore connect evidence, judgment, consequence, and suggested change. An omitted behavior is “Not demonstrated”; it is not automatically a contradiction. Several architectures may satisfy the same brief.

## Existing approaches

Public documentation was consulted on 11 September 2026. These observations are desk research, not trials of paid products or independent assessments of evaluator accuracy.

| Approach | Public observation | Decision for this prototype |
|---|---|---|
| [Hello Interview guided practice](https://www.hellointerview.com/practice/overview) | Organizes interview problems into steps with feedback. | Use Design, MCQs, and Review stages within one persistent attempt. |
| [Exercism feedback](https://exercism.org/docs/using/feedback) | Distinguishes immediate automated analysis from mentor and private feedback. | Label answer-key marks separately from AI-assessed design marks. Neither is presented as human certification. |
| [Refactoring.Guru patterns](https://refactoring.guru/design-patterns) | Describes reusable solutions and their applicability. | Reward a justified design decision under the stated requirements, rather than use of a named pattern. |

The application of those observations is our design judgment. No claim is made that this small prototype matches those platforms' capabilities.

## Content and evaluation

The problem scope is adapted from [ashishps1/awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design/tree/31595db8c21a8f7785b2ef45d90f16fd8053abad), pinned at `31595db8c21a8f7785b2ef45d90f16fd8053abad`. New conceptual questions and equivalent Java, Python, and C++ snippets are authored for the prototype. Repository-hosted briefs inform the requirements; linked external lessons are not copied.

Tic-Tac-Toe is small enough to expose turn validation, completion, and ownership decisions. Snake and Ladder adds a validated transition map and explicit dice rules. Its scope is one session: concurrent sessions are excluded. Players start at zero, must reach 100 exactly, remain in place after overshoot, receive no extra turn for six, and take at most one transition per roll.

Twenty questions per problem sample tracing, defects, responsibilities, contracts, and constrained changes: ten system-design fundamentals and ten problem-specific questions. MCQs produce reproducible marks; design assessment requires qualified judgment. Structural validation checks IDs and references, not architectural quality. AI output must cite valid frozen evidence, cover five rubric criteria, and cannot assign marks itself. One bounded clarification round can resolve ambiguous submitted intent.

## Gaps and trade-offs

Fixed questions make repeat practice possible but improvement may reflect recall. History therefore records repeat-question practice, language, and content/evaluator versions. Browser-local storage avoids account and infrastructure complexity but cannot provide cross-device continuity or tamper-proof assessment records. Export and explicit storage acknowledgments make the limitation visible.

Provider failure must leave deterministic feedback usable. Independent component states, immutable snapshots, explicit retries, and persist-before-dispatch transitions address failure without durable workers. Process-local admission controls are only best effort across serverless instances. Live calibration checks schema compatibility and obvious grading behavior; authored fixtures are not a substitute for independent human review.
