# Fieldnotes

A mobile-first learning notebook: understand your code, practise recall, and prepare an honest interview story. A separate service inside MCP 1.0.0, not a replacement for its running model proxy.

## Start safely

Requires Node 22+. From this directory:

```sh
npm ci --ignore-scripts
npm test
npm start
```

Open http://127.0.0.1:3210. Direct local browsers authenticate automatically. Never build, stop, or restart the parent proxy for this portal. Ports 2999 and 3000 are forbidden portal ports. There is no parent proxy import, startup hook, or provider routing change.

Environment options:

| Variable | Default / meaning |
|---|---|
| PORTAL_PORT | 3210, loopback only |
| PORTAL_DATA_DIR | .data in this project |
| HOPPER_ROOT | Current user's Desktop/grasshopper/bitchat-android |
| PORTAL_PUBLIC_ORIGIN | Empty; otherwise exact HTTPS origin, no trailing slash |
| PORTAL_PROXY_URL | http://127.0.0.1:2999, loopback only |
| PORTAL_MODEL | zai.glm-5 |
| PORTAL_PROXY_KEY | Optional existing proxy authorization; never commit it |
| PORTAL_CHAT_ENABLED | Set false to disable external tutoring |
| PORTAL_GITHUB_REPO | Optional owner/repository; requires PORTAL_GITHUB_REPO_ID |
| PORTAL_GITHUB_REPO_ID | Positive immutable GitHub repository ID, not its name |
| PORTAL_GITHUB_BRANCH | main for saving; explicitly set for recovery |
| PORTAL_GITHUB_TOKEN | Optional server-only token; otherwise existing `gh auth token --hostname github.com` is captured internally |
| PORTAL_GITHUB_ENABLED | Set false to disable saving without removing configuration |

## One phone URL

A Cloudflare Quick Tunnel is sufficient for a first preview:

```sh
cloudflared tunnel --url http://127.0.0.1:3210 --no-autoupdate
```

Start the tunnel first, copy its generated HTTPS origin, and start the **portal only** with that origin:

```sh
PORTAL_PUBLIC_ORIGIN=https://YOUR-ASSIGNED-HOST.trycloudflare.com npm start
```

Do not configure a localhost Host-header override: public Host and forwarded headers must remain distinguishable from direct local access. Cloudflare terminates TLS and is part of the trust boundary. The public shell contains no notebook data; private APIs require pairing.

On the Mac, open http://127.0.0.1:3210 and choose **Connect phone** in the header. A QR code appears immediately. Scan it with your phone camera and open the link: Fieldnotes pairs the browser and opens the notebook without code typing or another confirmation. **Manual connection** on the Mac and **Enter a code instead** on the phone provide a fallback.

QR codes are generated locally, not by an external QR service. The single-use code is carried in a URL fragment, which is not sent in HTTP request URLs or referrers; the app removes it from the current history entry before submitting a same-origin JSON login. Camera/scanner apps may still retain the scanned link: use your own device and do not share or screenshot the QR. Codes expire after five minutes. **New QR code** replaces the previous code; closing the dialog hides but does not revoke it. Expired or failed links never retry automatically. Browser sessions expire after twelve hours or portal restart; remote cookies are Secure, HttpOnly and SameSite=Strict. Keep codes out of chat and logs. This is one personal notebook, not multi-user accounts. Scanning does not enable AI consent.

**Phone says “refused to connect”?** Do not use localhost or 127.0.0.1 on your phone: those addresses refer to the phone, not the Mac. Use the exact HTTPS address from **Connect phone**. A Mac LAN address is not a substitute because the portal is intentionally loopback-only. If the HTTPS address still fails, check that the Mac is awake, the portal and tunnel are running, and the address has not changed. If the pairing page loads, the connection is working; create a fresh code on the Mac. If only AI fails, that is a separate upstream-provider issue—do not restart the MCP proxy to troubleshoot the website.

The Mac, portal and tunnel must remain running. Quick Tunnel URLs change after restart and provide no uptime guarantee. A named tunnel/custom domain is a later operator setup, not configured automatically. A browser home-screen shortcut is possible; offline/PWA installation is not implemented. There is no service worker caching private content.

## Learning scope

- Learn (home): one next step, keeping the same lesson through Read → Try → Recall. Your 15/25/45-minute preference is a time suggestion, not measured completion.
- All lessons: six starter lessons on Kotlin, route ownership, coroutine lifecycle, contracts/tests, HTTP/proxies and honest interview attribution.
- Tutor: a persistent right-hand companion on desktop and an openable overlay on mobile, so the notebook stays the main workspace. Persistent means available while navigating the notebook, not a saved chat transcript. Teach, Guide and Interview modes support beginner English or Hinglish; existing lesson text is not automatically translated.
- Review: reveal before rating; buttons or horizontal touch swipes. The full deck includes unread lessons; the guided home path selects the lesson you just attempted. Review scheduling is not proof of mastery.
- An earlier review counts as recall activity even if it preceded the exercise; activity records do not certify an ordered learning sequence. A lesson's **Recall this lesson** button also allows extra practice before its next due date.
- Career: interview prompts and local keyword comparison with a job description, not hiring or readiness prediction.
- Code updates: published curated session notes are automatically organized newest first, with recorded changes, optional explicit tasks, evidence labels and linked learning steps. Reading and independent exercise attempts are distinct. This is not a record of every coding transcript.

Only four fixed excerpts are approved initially: Hopper's AGENTS.md, the feed MediaFeedRoute, proxy repository instructions, and proxy src/server.ts. They are resolved under configured roots, capped, redacted and hashed. No arbitrary file browser or whole-codebase semantic index exists. Source links provide context, not proof that every AI statement is correct. Changed source hashes make affected cards due again.

### Focused presentation

In Settings, choose **Learning presentation → Focused** and save. This is an optional preference for explicit structure, not a diagnosis or ability assessment. Standard remains available. Existing profiles remain compatible.

- One task at a time: read, try independently, then recall; no timer, streak penalty or claim of mastery.
- Curated definitions for the six starter lessons. Unknown/session terms are explicitly left for definition rather than invented.
- Optional **How the parts connect** prompts: input → responsible component → output → failure → evidence. These are scaffolds to fill in, not generated claims about the project.
- Optional **Question the assumption** prompts: assumption → alternative → tradeoff → distinguishing test. An unconventional answer is not automatically a correct answer; compare evidence.
- Deeper sections are opened deliberately. Focused presentation disables decorative motion; the operating system's reduced-motion preference is also respected in Standard.
- Ask shortcuts add questions to a draft only. Nothing is submitted and no AI consent is granted automatically. With explicit consent, focused tutoring requests precise definitions and source-supported system explanations.

The presentation preference syncs to GitHub; no medical label is stored. AI consent stays local, and restoring a backup always leaves it off. Stale settings cannot re-enable consent withdrawn by another browser: refresh the profile before deliberately granting consent again.

## AI and privacy

Chat requires saved explicit consent and a submitted question. Selected source excerpts, lesson context, the question and recent history go through the existing proxy to its configured external provider. That proxy may log and forward exchanges to Telegram. Fieldnotes does not change or suppress those existing behaviours.

Do not send private or confidential material. Pattern-based redaction is defense in depth, not a complete secret detector. Chat has no tools, shell, file-write, device-control or autonomous coding capability. Source text is labelled untrusted data, though prompt instructions cannot guarantee a model ignores all prompt injection.

Chat transcripts stay in this tab's memory, not portal persistence. The tutor receives at most four recent exchanges; history entries are shortened to 4,000 characters, questions to 2,000. Clearing the tab cannot undo provider processing or forwarding. Admission is one concurrent request, ten seconds apart, at most thirty attempts/hour per portal process. No automatic retries; a timeout or disconnect does not prove upstream work stopped.

Teach requests more depth for substantial questions: roughly 900 words when useful, with definitions, a worked example, tradeoffs and an independent check. Narrow questions should stay shorter; length is a prompt target, not a guaranteed result. Teach uses a 3,000-token output budget; Guide remains one hint under 200 words and Interview one question at a time under 250 words, each with a 1,400-token budget. The response safety cap remains 16,000 characters. A provider-reported output-limit stop is surfaced as potentially incomplete, without automatic continuation.

Tutor replies support only a small, text-safe formatting subset: paragraphs, headings, flat lists, fenced code, inline code, bold and emphasis. Raw HTML is never interpreted; links, images and tables are not rendered as interactive/rich content. This is not full Markdown or executable code. Formatting does not verify the answer or turn illustrative code into repository evidence.

## Publish a curated session

Future sessions require **deliberate publication by the agent/operator**. No transcript scraper, automatic VS Code Stop hook, or always-on session capture is installed. This avoids importing private prompts or inventing reasons from raw logs.

After meaningful work, produce a small JSON recap from observable changes and recorded rationale. Example (replace with real evidence, do not publish invented results):

```json
{
  "id": "route-owner-example",
  "title": "Keep UI coordination separate from storage",
  "date": "2026-09-16T00:00:00.000Z",
  "status": "incomplete",
  "summary": "Describe the actual change and remaining work.",
  "why": "Record the stated reason, not hidden internal reasoning.",
  "changes": ["Describe one concrete change."],
  "concepts": ["Ownership"],
  "exercise": "Draw the input, owner, output and one failure case yourself.",
  "sourceIds": ["hopper-contracts"],
  "evidence": [{"label": "Behaviour check", "state": "not-run", "reference": "No execution result recorded."}],
  "teaching": {
    "plainExplanation": "An owner is the part of the program responsible for a job.",
    "example": "A route forwards a tap; a repository stores data. The route does not write the database itself.",
    "checkQuestion": "Why should the route not own database writes?",
    "checkAnswer": "Keeping storage in the repository gives consistency and recovery one clear owner."
  }
}
```

```sh
npm run session:publish -- /absolute/path/to/curated-session.json
```

IDs are 2–64 lowercase letters/digits/hyphens, starting with a letter. Files are capped at 32KB. Approved source IDs: `hopper-contracts`, `feed-route`, `proxy-boundaries`, `proxy-routing`. The strict schema is in [server/schema.js](server/schema.js). `teaching` is optional for compatibility but should be supplied for new beginner lessons. If absent, the UI explicitly notes the missing beginner example rather than fabricating one.

`tasks` is optional: an array of at most 30 explicit objects with only `id`, `title` and `status`. Task IDs follow the same 2–64-character rule and must be unique **within that session**. Titles are trimmed, nonblank and at most 240 characters. Status is required and must be `todo`, `in-progress` or `done`; it is never inferred. An explicit empty array is valid. Omitting tasks leaves older immutable records unchanged—no default field is added during validation or snapshot serialization.

For example, a publisher may include `"tasks": [{"id":"verify-recovery","title":"Check recovery after failure","status":"todo"}]`. These are publisher-recorded task states, not editable personal checkboxes or independently certified completion. `changes` remains a separate list of recorded changes, never an inferred completed-task list. Session status, task status, evidence and learner activity are separate facts.

Evidence labels are `reported`, `verified`, `failed`, `not-run`. “Verified” is a producer assertion backed by its stated reference, not independent certification. State exact checks and limitations. Never attribute agent-written code to the learner. No raw transcripts, credentials, personal identifiers or full model responses.

The portal scans the inbox every 15 seconds. Return to the browser tab or press Refresh sessions. Invalid records are rejected; bootstrap includes import counts, not raw private error content.

Repeated identical IDs are idempotent; conflicting rewrites are rejected. A correction/completion uses a new ID plus `"supersedes": "earlier-id"`. The earlier record must already be imported and not already superseded. History is retained with a newer/earlier link; only current recaps become active lessons/cards. Import a chain in order, or allow subsequent polling passes. Capacity is 200 immutable sessions including historical versions; automatic archival is not implemented.

### Session organization and guided learning

Automatic organization starts **after deliberate publication**, not after every agent message. A published note is linked to its canonical `session-<session-id>` lesson and offers Read → Try → Recall using the existing activity rules. Publishing a note does not mark it read, complete an exercise, submit a tutor question or grant AI consent. Notes without a matching lesson remain visible but have no fabricated learning link. Historical superseded notes retain their changes, tasks and evidence but cannot launch their stale recap as a lesson.

Session cards and open notes offer a single next-step button: **Learn from this session** before reading, **Continue exercise** after reading, **Recall this lesson** after an attempt when recall is missing or due, and **Revisit lesson** when the recorded review is not yet due. Exercise continuation opens and focuses the exercise immediately; recall opens the matching question with its answer hidden. These shortcuts do not record activity, send an AI question, change consent or discard an unsent Ask draft. An unresolved review must still be saved before another recall can begin.

The integration helper [public/session-workspace.js](public/session-workspace.js) exports `organizeSessions(sessions, lessons, progress, reviews)`. It is a detached, pure view of supplied data: newest first, with equal dates ordered by session ID and missing/invalid dates last. Records expose explicit task groups/counts, counts for each producer-supplied evidence label, canonical lesson links and a learning stage. It does not write notebook state, collect transcripts, generate explanations or send network requests.

For deterministic organization, learning stages reflect recorded activity and explicitly invalidated reviews (`due: 0`), not the current wall clock. `done` means reading, an exercise attempt and recall activity exist; it does not mean mastery or that no review is due today. The helper exposes `reviewDue` separately; the existing Review scheduling UI owns current-time due checks. The scoped helper and schema do not by themselves render the workspace; browser integration owns the display and actions.

GitHub snapshot ownership, timing, privacy boundaries and conflict/recovery behaviour are unchanged. Optional published tasks travel as part of their curated session records; no new transcript collection or synchronization channel is added.

## Storage and recovery

Local progress, preferences, sessions and review receipts live under .data. Directories use mode 0700 and created files 0600; data is **not encrypted at rest**. Keep the Mac account and backups protected. All paired browsers share the notebook. Last 256 review request IDs deduplicate retries; retries outside that window have no exactly-once guarantee.

Writes are serialized, validated and atomically replaced with fsync. A persistence failure fences further writes until restart. After a post-rename failure, the live snapshot reflects the installed file, but power-loss durability may be uncertain. Stop **only the portal**, inspect storage, back up .data, and restore a valid backup if needed before restarting. Corrupt data is never silently replaced with an empty notebook. Stop the portal before taking/restoring a consistent backup. An owner lock prevents normal duplicate portal starts; never delete a live owner's lock.

### Automatic private GitHub saving

GitHub is a **versioned remote snapshot store**, not a transactional database or website host. Immediate saves use the Mac's working copy. A single background writer checks GitHub on startup and approximately every 60 seconds; only changed snapshots produce commits. An outage or rate limit preserves local progress and backs off up to 15 minutes. Unsynced local changes are not protected against loss of the Mac.

Configure environment variables above, or put this non-secret configuration in `.data/github-config.json` (ignored by Git):

```json
{"repo":"YOUR-ACCOUNT/YOUR-PRIVATE-REPOSITORY","repoId":123456,"branch":"main"}
```

The repository must already exist and be private, unarchived and match its immutable ID and owner/name. A fine-grained token needs repository metadata read and Contents read/write; `gh` credentials may have broader permissions, so protect the Mac account. Never paste tokens into browser settings, chat or committed configuration. Authentication errors are sanitized. Changing credentials/configuration requires restarting only Fieldnotes.

The fixed remote file is `fieldnotes/notebook.json`. It contains curated session lessons, read/exercise activity, recall schedules, the last 256 deduplication receipts and learning preferences. **Curated summaries and examples can contain code and prose.** It excludes chat transcripts, source-excerpt blobs, pairing codes, browser sessions and credentials. AI consent is exported as false without changing the local preference. Six starter lessons and application code remain in the application distribution, not this notebook snapshot. No automatic transcript ingestion or lesson generation has been added.

See **Settings → GitHub saving** for current state and the most recent acknowledged save. Refresh there updates only status, preserving unsaved settings. Status is authenticated, never part of public health responses.

Before an upload, an intent is durably recorded locally. If the upload response is lost, a later check can recognize the intended remote content without duplicating the write. Independently changed or deleted remote content stops syncing with **conflict**; there is no automatic merge or last-writer-wins overwrite. Contents SHAs compare file content, not complete branch history. A malformed successful upload response or local checkpoint persistence failure deliberately blocks the process until inspected and restarted. Do not delete checkpoints to force a push.

Private repositories are not end-to-end encryption. GitHub and authorized collaborators can access the data; commits retain old content. A privacy check cannot atomically prevent someone making a repository public during an upload. Keep the dedicated repository private, do not add collaborators casually, and curate every lesson. Removing a secret from the latest version does not erase Git history.

### Restore from GitHub without overwriting local work

Recovery is explicit, not bidirectional live sync. Set the repository, immutable ID and branch environment variables, then:

```sh
PORTAL_GITHUB_REPO=YOUR-ACCOUNT/YOUR-PRIVATE-REPOSITORY PORTAL_GITHUB_REPO_ID=123456 PORTAL_GITHUB_BRANCH=main npm run github:restore -- --destination /absolute/path/to/a-brand-new-directory
```

The parent directory must exist. Any existing destination—including an empty directory—is refused. Recovery reserves a private new directory and acquires the same exclusive owner lock as normal startup. It verifies repository identity/privacy, bounded content, strict schemas and session-correction relationships before installation. Consent remains false. Failures retain the reservation for inspection; they never reuse or delete existing work. Successful installation syncs both the notebook directory and its parent entry.

Inspect the restored copy. Stop the old portal gracefully, set `PORTAL_DATA_DIR` to that restored directory, supply the same GitHub configuration, and start only the portal. The first sync acknowledges matching remote content. The old directory remains intact for manual comparison. No conflict-resolution merger or automatic fallback to remote data is implemented.

Startup no longer guesses that a PID lock is stale and deletes it. After an unclean exit, inspect `owner.lock`, verify there is no active portal/recovery owner and back up the directory before manually removing a genuinely stale lock. Normal shutdown releases ownership only after in-flight requests, inbox writes and GitHub work finish.

## Validation

`npm test` covers authentication/CSRF boundaries, pairing, review deduplication, source freshness, schema limits, concurrent chatbot admission, missing-source recovery, immutable recap updates and storage failure fencing. Provider calls are mocked: passing tests do not prove live model availability or factual answers. Browser and phone acceptance, live-provider behaviour and tunnel uptime are separate checks. Human review owns final visual acceptance.

GitHub tests use injected responses to cover private-repository binding, lost upload responses, conflicts, rate limiting, concurrent local writes, restore ownership and durability failures. They never send real credentials or notebook data.

[test/session-workspace.test.js](test/session-workspace.test.js) specifies canonical session-to-lesson IDs, deterministic ordering, missing optional data, explicit task grouping, separate evidence counts, immutable inputs, superseded-history safety, journey activity stages, legacy serialization and strict task limits/duplicate rejection. These pure tests require no browser, provider or running service and run as part of `npm test`.

For isolated mobile browser checks:

```sh
npx playwright install chromium
npm run test:browser
```

The fixture server binds port 3211; all API calls are mocked. Normal clicks, preference persistence, consent boundaries, drafts, keyboard focus, GitHub status, reduced motion and narrow widths are exercised without changing your real notebook. These checks do not establish phone connectivity, subjective visual clarity or live AI answer quality.