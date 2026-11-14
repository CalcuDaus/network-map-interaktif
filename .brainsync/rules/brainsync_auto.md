

# Project Memory — network-map-interaktif
> 41 notes | Score threshold: >40

## Safety — Never Run Destructive Commands

> Dangerous commands are actively monitored.
> Critical/high risk commands trigger error notifications in real-time.

- **NEVER** run `rm -rf`, `del /s`, `rmdir`, `format`, or any command that deletes files/directories without EXPLICIT user approval.
- **NEVER** run `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or any destructive database operation.
- **NEVER** run `git push --force`, `git reset --hard`, or any command that rewrites history.
- **NEVER** run `npm publish`, `docker rm`, `terraform destroy`, or any irreversible deployment/infrastructure command.
- **NEVER** pipe remote scripts to shell (`curl | bash`, `wget | sh`).
- **ALWAYS** ask the user before running commands that modify system state, install packages, or make network requests.
- When in doubt, **show the command first** and wait for approval.

**Stack:** JavaScript

## 📝 NOTE: 1 uncommitted file(s) in working tree.\n\n## Active: `.`

- **🟢 Edited docker-compose.yml (73 changes, 8min) — confirmed 3x**
- **🟢 Edited index.html (5 changes, 15min) — confirmed 3x**
- **convention in .gitignore**
- **🟢 Edited docker-compose.yml (72 changes, 57min)**
- **🟢 Edited docker-compose.yml (150 changes, 28min)**

## Project Standards

- 🟢 Edited docker-compose.yml (73 changes, 8min) — confirmed 3x
- 🟢 Edited index.html (5 changes, 15min) — confirmed 3x
- convention in .gitignore
- convention in .gitignore
- convention in .gitignore
- Version your API from day 1 (/api/v1/)
- Use consistent response format across all endpoints
- Implement soft delete for important data — don't hard delete without confirmation

## Learned Patterns

- When encountering this, fix by: Fixed null crash in Displays — prevents null/undefined runtime crashes (seen 2x)
- Agent generates new migration for every change (squash related changes)
- Agent installs packages without checking if already installed

### 📚 Core Framework Rules: [czlonkowski/n8n-code-javascript]
# JavaScript Code Node

Expert guidance for writing JavaScript code in n8n Code nodes.

---

## Quick Start



### Essential Rules

1. **Choose "Run Once for All Items" mode** (recommended for most use cases)
2. **Access data**: `$input.all()`, `$input.first()`, or `$input.item`
3. **CRITICAL**: Must return `[{json: {...}}]` format
4. **CRITICAL**: Webhook data is under `$json.body` (not `$json` directly)
5. **Built-ins available**: $helpers.httpRequest(), DateTime (Luxon), $jmespath()

---

## Mode Selection Guide

The Code node offers two execution modes. Choose based on your use case:

### Run Once for All Items (Recommended - Default)

**Use this mode for:** 95% of use cases

- **How it works**: Code executes **once** regardless of input count
- **Data access**: `$input.all()` or `items` array
- **Best for**: Aggregation, filtering, batch processing, transformations, API calls with all data
- **Performance**: Faster for multiple items (single execution)



**When to use:**
- ✅ Comparing items across the dataset
- ✅ Calculating totals, averages, or statistics
- ✅ Sorting or ranking items
- ✅ Deduplication
- ✅ Building aggregated reports
- ✅ Combining data from multiple items

##...
(truncated)

- [JavaScript/TypeScript] Use === not == (strict equality prevents type coercion bugs)
- [JavaScript/TypeScript] Use const by default, let when reassignment needed, never var
- [Docker] Use multi-stage builds to reduce image size
- [Docker] Don't run as root in containers (use USER directive)

## Available Tools (ON-DEMAND only)
- `sys_core_01(q)` — Deep search when stuck
- `sys_core_05(query)` — Full-text lookup
> Context above IS your context. Do NOT call sys_core_14() at startup.
