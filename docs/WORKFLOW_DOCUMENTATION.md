# MCP 1.0.0 - PRP Workflow Documentation

## 🎯 Complete Workflow Guide

This document explains how the **Planning-Review-Pipeline (PRP)** system works in VS Code Copilot.

---

## 📁 File Structure & Roles

### Three Types of Files, Three Different Roles

| File Type | Location | When It Runs | What It Does |
|-----------|----------|--------------|--------------|
| **copilot-instructions.md** | `.github/copilot-instructions.md` | **Always, silently** | Background rules injected into every chat message |
| **Prompt files** | `.github/prompts/*.prompt.md` | **Manually triggered** | Pre-written instruction templates + tool restrictions |
| **Agent files** | `.github/agents/*.agent.md` | **Persona switch** | Defines AI capabilities (edit allowed/disallowed, tool access) |

---

## 🔄 How They Connect

### Case 1: Normal Chat (Without Slash Commands)

```
You: "Create a React login form"
       ↓
copilot-instructions.md silently applies (context-engineering rules, task tags)
       ↓
Default Agent (standard mode) implements directly
```

**Result:** `prp-analyst` and `prp-executor` are NOT involved here — they only activate when explicitly triggered.

---

### Case 2: Structured PRP Flow (Recommended for Real Features)

```
You: /prp-story-create
       ↓
VS Code opens prompt file → agent: prp-analyst loads automatically
       ↓
prp-analyst (read-only persona) analyzes codebase, produces structured plan
       ↓
You review the plan, approve it
       ↓
You: /prp-story-execute (paste the plan)
       ↓
VS Code opens prompt file → agent: prp-executor loads automatically
       ↓
prp-executor (edit + terminal persona) implements task-by-task + runs tests
```

---

## 🔗 The Connection: `agent:` Field

**Key Insight:** The `agent:` field in prompt files is what connects them to their persona.

### Example: `prp-story-create.prompt.md`

```yaml
---
description: Convert a user story into a structured implementation plan (no code yet)
agent: prp-analyst          ← THIS LINE CONNECTS IT
tools: ['search', 'codebase', 'usages']
---
```

**When you type `/prp-story-create`:**
1. VS Code loads the prompt file
2. Reads `agent: prp-analyst`
3. **Automatically switches** to `prp-analyst.agent.md` persona
4. No manual agent dropdown selection needed!

---

## 📊 Complete File Map

```
mcp1.0.0/.github/
├── copilot-instructions.md              ← Global rules (always active)
├── agents/
│   ├── prp-analyst.agent.md           ← Read-only investigator
│   └── prp-executor.agent.md          ← Implementation executor
└── prompts/
    ├── prp-story-create.prompt.md     ← Story → Plan (uses prp-analyst)
    └── prp-story-execute.prompt.md    ← Plan → Code (uses prp-executor)
```

---

## 🎓 How Each File Works

### 1. `copilot-instructions.md` (Always Active)

**Purpose:** Background rules for every conversation

**Current Rules:**
- Search codebase before creating new patterns
- Use task tags: CREATE, UPDATE, ADD, REMOVE, REFACTOR, MIRROR
- Validate with tests before marking done
- Match existing repo conventions

**Activation:** Automatic (no `/` command needed)

**Example:**
```markdown
# Context Engineering Rules

## Before writing any code
- Search the codebase for existing patterns...
- Reference exact file paths and function names...
- Check package.json for library versions...

## How to structure work
Break every feature into tasks tagged with:
- CREATE, UPDATE, ADD, REMOVE, REFACTOR, MIRROR
```

---

### 2. `prp-analyst.agent.md` (Persona: Read-Only Investigator)

**Purpose:** Define read-only mode with specific tool access

**Frontmatter:**
```yaml
---
description: Read-only codebase pattern analyst
tools: ['search', 'codebase', 'usages', 'findTestFiles']
---
```

**Behavior:**
- ✅ Can search, read, analyze
- ❌ Cannot create, edit, delete files
- ✅ Produces structured findings

**Usage:** Automatically loaded when `agent: prp-analyst` is set in prompt

---

### 3. `prp-executor.agent.md` (Persona: Implementation Executor)

**Purpose:** Define implementation mode with full tool access

**Frontmatter:**
```yaml
---
description: Implements planned tasks and runs tests
tools: ['edit', 'search', 'codebase', 'usages', 'runCommands', 'terminal']
---
```

**Behavior:**
- ✅ Can edit files
- ✅ Can run terminal commands
- ✅ Must run tests after each task
- ❌ Never skips validation

**Usage:** Automatically loaded when `agent: prp-executor` is set in prompt

---

### 4. `prp-story-create.prompt.md` (Template: Story → Plan)

**Purpose:** Convert user stories into structured implementation plans

**Frontmatter:**
```yaml
---
description: Convert a user story into a structured implementation plan
agent: prp-analyst          ← WIRES TO ANALYST PERSONA
tools: ['search', 'codebase', 'usages']
---
```

**Workflow:**
1. User types `/prp-story-create`
2. Prompt opens with input field: `${input:story:Describe the feature}`
3. VS Code loads `prp-analyst.agent.md` persona
4. Agent searches codebase, finds patterns, produces plan

**Output Format:**
```markdown
## Plan: Add user authentication

**Files to change:**
- src/auth/login.ts (UPDATE)
- src/models/user.ts (CREATE)

**Dependencies:**
- bcrypt: ^5.1.0 (check package.json)

**Task list:**
1. CREATE: src/auth/login.ts — Add login logic
2. UPDATE: src/models/user.ts — Add password field
3. ADD: tests/auth.test.ts — Add auth tests

**Open questions:**
- Should we use JWT or session-based auth?
```

---

### 5. `prp-story-execute.prompt.md` (Template: Plan → Code)

**Purpose:** Execute planned tasks with test validation

**Frontmatter:**
```yaml
---
description: Implement a plan produced by prp-story-create
agent: prp-executor        ← WIRES TO EXECUTOR PERSONA
tools: ['edit', 'search', 'codebase', 'usages', 'runCommands', 'terminal']
---
```

**Workflow:**
1. User types `/prp-story-execute`
2. Prompt opens with input field: `${input:plan:Paste the task list}`
3. User pastes plan from previous step
4. VS Code loads `prp-executor.agent.md` persona
5. Agent implements task-by-task, runs tests after each

**Validation Rules:**
- Run test command after each task
- Show actual output (no "it should work" claims)
- Stop on failure, don't proceed to next task
- Keep changes minimal and focused

---

## 🎯 Recommended Usage Pattern

### For Small/Trivial Changes
```
Direct chat → copilot-instructions.md applies → Default agent implements
```

**Example:**
```
You: "Fix typo in README.md"
→ Default agent handles it directly
```

---

### For Real Features (Use PRP Workflow)

```
Step 1: /prp-story-create → Structured plan produced
Step 2: Review plan, approve it
Step 3: /prp-story-execute → Implement with validation
```

**Example:**
```
You: /prp-story-create
Input: "Add OAuth2 authentication with Google and GitHub"

→ prp-analyst produces:
  ## Plan: OAuth2 Authentication
  
  Files to change:
  - src/auth/oauth.ts (CREATE)
  - src/middleware/auth.ts (UPDATE)
  
  Tasks:
  1. CREATE: OAuth provider config
  2. UPDATE: Auth middleware
  3. ADD: OAuth tests

You: (review plan, approve)

You: /prp-story-execute
Input: (paste plan)

→ prp-executor implements:
  ✓ Task 1: Created oauth.ts
  ✓ Tests passed: 3/3
  ✓ Task 2: Updated auth.ts
  ✓ Tests passed: 5/5
  ✓ Task 3: Added oauth.test.ts
  ✓ Tests passed: 8/8
  
  Summary: All tasks completed, tests green
```

---

## ⚡ Quick Reference

| What You Want | How To Do It |
|---------------|--------------|
| Quick fix | Direct chat (no slash command) |
| Structured implementation | `/prp-story-create` → review → `/prp-story-execute` |
| Analyze codebase | `/prp-story-create` (stop after plan) |
| Execute existing plan | `/prp-story-execute` (paste plan) |
| Understand existing rules | Read `.github/copilot-instructions.md` |

---

## 🔧 Technical Details

### How VS Code Discovers These Files

**Scan locations (in order):**
1. `.github/copilot-instructions.md` — Always loaded
2. `.github/prompts/*.prompt.md` — Available as `/` commands
3. `.github/agents/*.agent.md` — Referenced by prompts

**Discovery is workspace-root specific:**
- If workspace root is `future/` → looks in `future/.github/`
- If workspace root is `mcp1.0.0/` → looks in `mcp1.0.0/.github/`

**Best Practice:** Open the specific project folder (not parent) for clean `.github` discovery.

---

## 🎓 Learning from Rajat's Workflow

**Rajat's Pattern:**
- Never directly implements features in chat
- Always starts with planning phase
- Uses structured workflow to avoid rework

**Implemented Here:**
- `/prp-story-create` → Planning phase (read-only)
- `/prp-story-execute` → Implementation phase (with validation)

**Adoption Strategy:**
- Small fixes → Use normal chat
- Real features → Always use PRP workflow
- Build habit: `/prp-story-create` is the starting point

---

## ✅ Verification Checklist

After setup, you should be able to:

- [ ] Type `/prp-story-create` in chat panel
- [ ] See input field for user story
- [ ] Get structured plan output
- [ ] Review plan, approve it
- [ ] Type `/prp-story-execute` in chat panel
- [ ] Paste plan
- [ ] Watch implementation with test validation

**If slash commands don't appear:**
1. Reload VS Code window (Cmd+Shift+P → "Reload Window")
2. Check `.github/` folder is in workspace root
3. Verify files have correct frontmatter

---

## 📚 Further Reading

- [Architecture Documentation](./docs/ARCHITECTURE.md)
- [Technical Details](./docs/TECHNICAL_DETAILS.md)
- [Quick Reference](./docs/QUICK_REFERENCE.md)
- [Flow Diagrams](./docs/FLOW_DIAGRAM.md)

---

**Last Updated:** June 20, 2026  
**Version:** MCP 1.0.0  
**Status:** ✅ Wired and Ready
