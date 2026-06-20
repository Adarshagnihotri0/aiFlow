# Planning-Execution Pipeline (PRP) Documentation

## Structure Overview

This directory contains the Planning-Review-Approval workflow system for systematic codebase development.

```
docs/
├── copilot-instructions.md     # Global workspace rules for all interactions
├── agents/                     # Specialized agent definitions
│   ├── prp-analyst.agent.md   # Read-only pattern analyst
│   └── prp-executor.agent.md  # Implementation executor with tests
└── prompts/                    # Task-specific prompt templates
    ├── prp-story-create.prompt.md   # Story → Plan converter
    └── prp-story-execute.prompt.md  # Plan → Implementation executor
```

## Workflow

### 1. **Planning Phase** (Story Creation)
- **Prompt**: `prp-story-create.prompt.md`
- **Purpose**: Convert user stories into implementation plans
- **Output**: Task list with CREATE/UPDATE/ADD/REMOVE/REFACTOR/MIRROR tags
- **Mode**: Read-only analysis (no code changes)

### 2. **Execution Phase** (Plan Implementation)
- **Prompt**: `prp-story-execute.prompt.md`
- **Purpose**: Execute planned tasks sequentially
- **Key Requirement**: Run tests after each task
- **Mode**: Implementation with validation gates

## Agent Roles

### **PRP Analyst** (`agents/prp-analyst.agent.md`)
- **Mission**: Investigate codebase patterns without editing
- **Capabilities**: Search, find conventions, identify files
- **Output**: Structured findings for developer action
- **Constraint**: NEVER creates, edits, or deletes files

### **PRP Executor** (`agents/prp-executor.agent.md`)
- **Mission**: Implement planned tasks with validation
- **Capabilities**: Edit files, run tests, execute commands
- **Workflow**: Smallest change → Test → Fix if needed → Next task
- **Constraint**: Never proceeds with broken state

## Global Rules

All interactions follow `copilot-instructions.md`:
- **Search before creating**: Find existing patterns
- **Task tagging**: CREATE, UPDATE, ADD, REMOVE, REFACTOR, MIRROR
- **Validation gate**: Tests must pass before task completion
- **Style consistency**: Match existing repository conventions

## Usage Pattern

1. User provides a feature request/story
2. Run `prp-story-create` → produce implementation plan
3. Review plan (optional human approval)
4. Run `prp-story-execute` → implement step by step
5. All changes validated by test suite

## Key Principles

- **Separation of concerns**: Planning vs. execution
- **Validation-first**: Every change tested immediately
- **Minimal deltas**: Small, reviewable diffs
- **Pattern consistency**: Mirror existing conventions

---

## 📚 Complete Documentation Index

| Document | Purpose |
|----------|---------|
| [README.md](./README.md) | This file - PRP workflow overview |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture diagrams |
| [TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md) | Complete technical specification |
| [FLOW_DIAGRAM.md](./FLOW_DIAGRAM.md) | Request/response flow diagrams |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | Quick start guide and cheat sheet |

---

**Integration Status**: ✅ Files organized and documented  
**Location**: `/Users/adarshagnihotri/future/mcp1.0.0/docs/`  
**Workflow**: Planning → Approval → Execution → Validation
