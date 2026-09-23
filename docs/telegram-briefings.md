# Curated Telegram briefings

A one-shot **manual producer adapter**, not automatic subagent capture. The main agent curates structured findings at meaningful milestones, previews each report, then explicitly publishes approved data. Nothing scrapes logs, transcripts, model responses, or action inboxes. No second poller, background reporter, proxy restart, or Android change is introduced.

## Staged question reliability and workspace command compatibility

**Source/build changes only, not deployed to the existing port-2999 process.** Building and mocked tests do not activate these handlers or register Telegram commands. The current runtime and its LaunchAgent are deliberately left untouched; no second live poller, real Telegram message, model probe, or workspace action is required by these tests. Do not assume the live bot has the command names below until a separately authorized rollout and acceptance check. Historical runtime knowledge is not a deployment receipt for this staged change.

The Telegram bot is **independent of this VS Code session**. `/ask` has no workspace tools, does not attach to an editor conversation, and cannot inspect its session state. An inbox request does not automatically schedule this session or a local agent. The existing legacy workspace helper starts a separate bounded Claude Code operation only for an authorized legacy command; it does not take over an existing session. No broader executor has been added.

### Question inference

- [telegram-inference.ts](../src/services/telegram-inference.ts) gives each actual question a fixed **60-second** deadline. Its abort signal is passed through [bedrock.ts](../src/bedrock.ts) to Mantle fetch, including body reading. A deadline race also releases question processing if a transport fails to settle after abort. Timers are cleaned up on every outcome; no automatic retry or provider/routing change is introduced.
- Failure replies and structured diagnostics include only fixed outcome/cause codes, bounded numeric HTTP status, completion timestamp and duration. Known transport codes such as `ENOTFOUND`, `ECONNRESET` and Undici timeout codes are allowlisted; other errors become `UNKNOWN`. No raw upstream body, URL, error message, stack, prompt, response, user/topic identifier, or arbitrary cause code is logged by the question failure path. The non-streaming OpenAI HTTP error path cancels rather than reads/logs an error body.
- `/status` reports **this topic's actual question inference in the current process**: last completed success/failure, safe failure code/status, last success and failure timestamps, pending state, timeout, and history size. Before a call it says none observed, not Ready. This is not a provider health probe or workspace execution status. `/clear` clears history only; outcomes remain until process restart.
- History is capped at **20 messages (10 complete user/assistant pairs)**. Requests retain the last nine pairs plus the new user turn; only a valid nonempty text response commits the new pair. Failure, timeout, malformed/empty response, and late completion after timeout never append or evict committed turns. A clear during a call cannot resurrect old history. A same-topic overlap is refused while the question is pending.

### Separate confirmation namespaces

[telegram-polling.ts](../src/telegram-polling.ts) restores the existing [workspace-agent.ts](../src/services/workspace-agent.ts) capabilities alongside the queue-only inbox:

| Commands | Authorization and effect after rollout |
| --- | --- |
| `/action <code>`, `/actions`, `/confirm <request-id> <challenge>`, `/cancel <request-id>` | Existing explicit inbox user allowlist, or group-creator fallback only when that list is empty. Hopper-only action intake. Confirmation **queues**, never executes. Explicit local pickup remains separate. |
| `/work <request>` | Group creator only, even if other users are inbox-allowlisted. Read-only plan in the enabled, privately configured topic workspace; returns a ten-minute token. |
| `/workconfirm <token>` | Creator-only plan execution through the existing helper's Read/Glob/Grep/Edit/Write tools, not arbitrary shell. Token must match owner/topic, unexpired plan and unchanged workspace fingerprint; the binding must still be enabled and unchanged. Single-use consumption happens before asynchronous validation/execution; failure also consumes it. |
| `/workcancel <token>` | Cancels only a matching owner's pending legacy plan in the same topic. Cannot cancel an inbox action. |
| `/check <name>` | Creator only; delegates only to the existing administrator-provisioned executable/arguments helper (shell disabled). Defaults to build. Never interprets free text as shell. |

`/confirm` and `/cancel` cannot approve or cancel legacy plans; `/workconfirm` and `/workcancel` cannot approve or cancel inbox requests. Unauthorized/wrong-chat/bot messages are rejected before typing, workspace resolution, inbox effects, or model calls. Creator lookup errors fail closed. Workspace helper errors return a fixed unverified-completion message rather than leaking subprocess output; agent return alone is not claimed as independently verified implementation success.

### Offline evidence and remaining acceptance

The focused build plus inference/commands/integration run passed **17 mocked tests**. [test-telegram-inference.js](../scripts/test-telegram-inference.js) covers abort propagation, deadlines, late results, safe diagnostics, real Bedrock signal forwarding with mocked fetch, and bounded valid history. [test-telegram-commands.js](../scripts/test-telegram-commands.js) covers real dispatch with mocked Telegram/workspace helpers and isolated inbox files: separate command namespaces, unauthorized no-effects, expired/stale/remapped tokens, owner/topic binding, single-use/concurrent confirmation, failure reporting, and actual-inference status. [test-telegram-integration.js](../scripts/test-telegram-integration.js) checks the existing single consumer and registration through mocked HTTPS only. These suites are included in `npm test`.

Full validation on 2026-09-13: `npm test` passed TypeScript builds, prompt-cache assertions, and **46 Telegram tests, zero failures**. `git diff --check` passed. Read-only process/listener inspection confirmed the original process still owned port 2999 with its original start time; `/health` returned HTTP 200 before and after. This verifies runtime preservation, not deployment of the new code.

No real planning, edit, build-check workspace action, live Telegram delivery, or command registration was performed as acceptance evidence. Later rollout needs explicit authorization, confirmation that only the existing process owner polls, and human acceptance of question success/timeout/status plus the renamed legacy commands. Until then all behavior described in this section remains staged.

## Report and producer contract

Each update combines a CEO summary and impact with named subagent engineering findings, evidence states, explicit TRADEOFFS (options, benefits, costs, selection and concise rationale), ASCII architecture, important RESEARCH/unknowns, and owned next actions. `deployment` describes the implementation's **live versus staged** state; it does not select whether to send the report.

Evidence states are **producer assertions, not certification by the adapter**:
- `reported`: an agent/source reported the finding; independent executable proof is absent.
- `verified`: the producer supplies a concise reference to a check that actually ran and supports the finding.
- `failed`: the referenced check failed; do not imply a repair succeeded.
- `not-run`: the check has not run.

Agent `done` means scoped agent work only, not overall product completion. Supply public decision rationale in `why`, never private reasoning or chain-of-thought. Name agents/roles accurately; do not invent participation or evidence. For mixed deployment, describe the split explicitly in `deployment.detail`.

## Exact schema (version 1)

Every property below is **required**. No additional properties are accepted at any object depth. Lists must be dense, with no extra properties. The TypeScript contract and runtime validator are in [telegram-briefing.ts](../src/services/telegram-briefing.ts). A fully populated, tested example is [telegram-briefing.example.json](../scripts/fixtures/telegram-briefing.example.json).

Lengths below are maximum JavaScript string lengths (UTF-16 units). All text must be nonempty. There are **64 total list items**, including diagram lines and nested items, in addition to individual list caps.

| Object | Exact fields and limits |
| --- | --- |
| Root | `version: 1`, `run`, `sequence`, `title: text(80)`, `deployment`, `executive`, `agents[1..4]`, `decisions[1..2]`, `architecture[1..2]`, `research[1..3]`, `actions[1..5]` |
| Identity | `run`: non-sensitive slug matching `^[a-z][a-z0-9-]{2,47}$`; `sequence`: positive safe integer increasing within that run |
| deployment | `state: live / staged`, `detail: text(240)` |
| executive | `summary: text(360)`, `impact: text(240)` |
| agents[] | `name: text(48)`, `role: text(64)`, `status: working / blocked / done`, `findings[1..3]` |
| findings[] | `summary: text(240)`, `evidence` |
| evidence | `state: reported / verified / failed / not-run`, `reference: text(180)` |
| decisions[] | `question: text(160)`, `options[2..3]`, `selected: option id`, `why: text(240)` |
| options[] | `id: same slug rule as run`, `label: text(80)`, `benefits: text(160)`, `costs: text(160)`; IDs unique within decision |
| architecture[] | `title: text(80)`, `lines[1..16]`: printable ASCII strings, each at most **48 columns**, nonblank, no backticks |
| research[] | `question: text(160)`, `why: text(180)`, `nextEvidence: text(180)`, `owner: text(48)` |
| actions[] | `action: text(180)`, `owner: text(48)`, `state: next / in-progress / blocked` |

Prose is single-line, trimmed, plain text: no backticks, asterisks, underscores, tildes, control/format characters, or unpaired surrogates. Diagrams preserve spaces and are fenced by the renderer, not by the producer. Literal HTML characters are escaped by the existing formatter. Evidence references may be curated check labels or safe repository-relative paths, not copied logs.

### Privacy boundary

Strict field allowlists reject transcript, reasoning, token, location, arbitrary response-body and other unrecognized fields. Text rejection guards include known credentials (existing sender redaction patterns plus temporary AWS keys/JWT-shaped values), absolute/private/parent paths, URLs, email addresses, coordinate pairs, and location-label assignments. IDs also pass text safety checks. Rejected input/errors are not echoed by the CLI.

**Automatic redaction cannot be guaranteed. The producer must curate every value.** Unknown credential formats, private names/places, encoded secrets, sensitive relative filenames, addresses, or a transcript pasted into an allowed summary can evade lexical guards. Do not put them in the report. This is not a DLP system. No raw subagent text should be sent to this adapter for automatic summarization. The existing sender's redactor is defense in depth, not authorization to include private content.

## Preview, then explicitly send

From the proxy root, after building:

```sh
npm run build
node scripts/telegram-briefing.js < scripts/fixtures/telegram-briefing.example.json
node scripts/telegram-briefing.js preview < scripts/fixtures/telegram-briefing.example.json
```

Both forms above are dry runs: no state reservation, configuration loading, or network request. Preview is the exact Markdown passed to the sender, with separators between parts; it is not a Telegram rendering test.

Only after main-agent review, explicit send is:

```sh
node scripts/telegram-briefing.js send < scripts/fixtures/telegram-briefing.example.json
```

The `send` command reads the existing proxy configuration without editing it and calls existing `sendProgressText`. It currently uses the sender's **Hopper progress** label and cached **bitchat-android workspace topic**, or General fallback. This is a report about Hopper work implemented in the existing proxy, not a new Android subsystem. It does not create a topic, poll, or require transcript forwarding to be enabled. No live demo delivery is claimed by these mock tests.

CLI accepts JSON on stdin only, with at most **16,384 UTF-8 input bytes** (invalid UTF-8 rejected). The library also caps serialized input to that size. Exit codes: `0` preview/delivered/duplicate; `1` validation, build, state, lock or setup failure; `2` uncertain delivery; `3` rate-deferred. Successful send output contains receipts, not report content. A send-time missing configuration can conservatively reserve an uncertain report; inspect configuration before explicit sending.

For an in-process producer, `validateBriefing(input)` returns a detached canonical snapshot; `renderBriefing(input)` additionally checks final pagination and returns Markdown parts. Call `publishBriefing(input, sendProgressText)` only after curation/review. No route or agent hook invokes it automatically. Produce a fresh full curated snapshot with an increased sequence for each meaningful ongoing update; there is no timer or automatic collection integration.

## Formatting and durable delivery

- At most **6 numbered parts**, each at most **2,200 UTF-16 units**, below the existing sender's 3,000-character cap. Escaped HTML including its current header is bounded to **3,800 UTF-8 bytes per part** (at most 22,800 bytes across six parts), conservatively below Telegram's 4,096 post-entity character limit.
- Entire findings, decisions, research entries and diagrams stay in one part. No mid-diagram/code-fence splits or silent truncation. If a block, total parts, or another budget exceeds a limit, publication is rejected before any send. Individual field maxima do not guarantee that every maximum-sized combination fits.
- The renderer uses `formatTelegramRichText` for exact HTML sizing, then sends Markdown once through `sendProgressText` and its existing formatter. Do not preformat to HTML and pass it to that sender.
- Uses existing `withTelegramState` locking, atomic fsynced replacement, private directory/file permissions, and bounded state reads. Separate state is stored as `briefings.json` in the existing Telegram progress state directory. Only run/sequence, semantic hashes, timestamps, part counts, statuses and receipts persist; never report text.
- Reserve the entire report and its message budget **before** any network side effect, then persist each acknowledgement. Semantic dedup ignores root run/sequence when hashing and canonicalizes object-key order, but is scoped to the run; list order remains meaningful.
- Same retained sequence with changed content fails as a conflict. Sequence watermarks prevent stale replay even after old delivered entries are evicted. Semantic dedup lasts while the matching entry is retained.
- A thrown send, malformed acknowledgement, or crash-left `sending` entry is **uncertain**. Partial delivery stops immediately and blocks all further publication for that run, including changed sequences. No automatic resend/resume, no claim of remote exactly-once delivery, and no assumption that an unacknowledged message was not delivered. Even a delivered message whose final state save failed is treated conservatively.
- Budget: one report reservation per **30 seconds**, at most **120 reserved part messages per rolling 24 hours** across this adapter's runs, at most **8 runs / 128 entries**. All parts, including uncertain/unsent reserved parts, consume budget. Multipart sends are sequential through the existing sender queue. These budgets are separate from catalog progress and other forwarding, not bot-wide rate coordination; Telegram rate errors remain uncertain. No autonomous retry worker.
- Clock rollback defers. Old delivered entries may be evicted only after 24 hours at capacity; unresolved entries are never evicted. The underlying lock is not stolen after a crash. Long calls retain the lock and inherit the existing sender's request timeout; another process may fail busy rather than wait indefinitely.
- For uncertainty, stale locks, or capacity exhaustion, **inspect locally**: compare acknowledged IDs and actual Telegram messages, establish whether an owner is alive, and review private state with the main agent. There is intentionally no remote reset/retry command. Do not bypass uncertainty by inventing another run ID. Any local reconciliation/archive is a separate explicit operator action; deleting state loses dedup protection.

## Validation and remaining gates

`npm run test:telegram-briefing` builds and runs only the mock briefing suite. `npm test` runs prompt-cache then Telegram suites serially, with the briefing tests integrated. Tests cover strict fields/enums/privacy guards, bounded input/items/parts/HTML, whole code fences, canonical durable dedup, partial/missing receipts, crash-left state, permissions/corruption, overlap/stale locks, rate windows/capacity, and CLI preview/send with mocked HTTPS and isolated temporary state.

Mock success does not prove live Telegram rendering, credentials/topic configuration, Android compilation, sync transport/privacy, or device behavior. The example intentionally says Telegram reporting is being validated, the earlier Android compile failed and repair is unverified, and sync findings are reported but not runtime-proven. The full serial mock suite passed as recorded above. Live demo review/delivery and phone acceptance remain separate, explicitly authorized gates; Android validation remains separately owned.
