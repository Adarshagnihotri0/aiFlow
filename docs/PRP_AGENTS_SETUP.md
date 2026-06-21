# PRP Agents - Setup Complete

**Created:** 2026-06-21  
**Status:** ✅ Ready to use

---

## What Was Created

### 1. Agent Files (Already Existed)
- ✅ `.github/agents/prp-analyst.agent.md` - Read-only analyst
- ✅ `.github/agents/prp-executor.agent.md` - Implementation executor

### 2. Index File (Created)
- ✅ `.github/agents.md` - VS Code discovery file

---

## How to Use

### Step 1: Reload VS Code
**Required:** You MUST reload the window for agents to appear.

```
Cmd+Shift+P → "Reload Window" → Enter
```

### Step 2: Open Copilot Chat
1. Open Copilot Chat panel (Cmd+Shift+I)
2. Click the agent dropdown (top right, next to @mention)
3. Select an agent:
   - **PRP Analyst** - For investigation phase
   - **PRP Executor** - For implementation phase

### Step 3: Use the Agents

#### PRP Analyst (Read-Only)
```
User: "Add a new endpoint to server.ts that returns the server time"

Agent will:
- Search codebase for patterns
- Find existing similar endpoints
- Identify conventions
- Report findings (no code changes)
```

#### PRP Executor (Implementation)
```
User: [Paste the plan from PRP Analyst]

Agent will:
- Implement smallest change
- Run tests after each change
- Show real test output
- Fix failures before proceeding
```

---

## Agent Capabilities

### PRP Analyst
**Tools:** search, codebase, usages, findTestFiles  
**Cannot:** Edit, create, or delete files  
**Output:** "Findings" summary

### PRP Executor
**Tools:** edit, search, codebase, usages, runCommands, terminal  
**Must:** Run tests after changes  
**Stops:** On validation failures

---

## Troubleshooting

### Agents Not Showing?

1. **Check file exists:**
   ```bash
   ls -la .github/agents.md
   ```

2. **Reload VS Code window:**
   ```
   Cmd+Shift+P → "Reload Window"
   ```

3. **Check Copilot Chat:**
   - Open panel (Cmd+Shift+I)
   - Look for agent dropdown (top right)
   - Should show: "PRP Analyst" and "PRP Executor"

### Still Not Working?

If agents don't appear after reload:
1. Close and reopen VS Code completely
2. Check that you're in the correct workspace
3. Verify `.github/agents.md` is committed or staged

---

## File Structure

```
.github/
├── agents.md                          # Index file (NEW)
├── agents/
│   ├── prp-analyst.agent.md           # Read-only agent
│   └── prp-executor.agent.md          # Implementation agent
└── prompts/
    ├── prp-decide.prompt.md
    ├── prp-execute.prompt.md
    ├── prp-story-create.prompt.md
    └── prp-story-execute.prompt.md
```

---

## Next Steps

1. ✅ Reload VS Code window (required)
2. Open Copilot Chat
3. Try PRP Analyst with: "Investigate how health endpoint works"
4. Try PRP Executor with: "Add a time endpoint following health endpoint pattern"

---

**Status:** Ready for use after window reload.
