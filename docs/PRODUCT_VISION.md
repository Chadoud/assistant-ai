# Exosites — product vision (AI assistant platform)

## Vision

Users open Exosites to run **one or more AI assistants** that help them **organize and act** on their files and (optionally) connected cloud accounts—**safely** and from one desktop app.

## What Exosites is

- A **local-first** workspace: file sorting, classification with Ollama, output folders, history.
- **Assistants (bots)** with their own model and instructions, plus optional **user-authorized workspace paths** (declared in Settings) for chat context and allowlisted folder open actions — separate from the sort **output** folder.
- **Allowlisted actions** (navigation, chat panel, restarting the local sort service, opening preset apps, output folder, saving text under configured paths, future cloud operations) when the user enables **AI app actions** in Settings — fixed IDs and validation, not arbitrary automation.
- Chat receives a **compact job summary** when a sort is active so assistants can reason about phase and status—never raw file contents unless the user pastes them.
- Optional **cloud integrations** (OAuth to third-party providers), separate from the product **account / entitlement** login.

## What Exosites is not (near-term)

- Arbitrary shell commands or paths from model text.
- Unbounded web browsing or “drive my browser” automation without strict allowlists.
- A replacement for full IT admin or MDM tools.

## Non-goals (pivot v1)

- Replacing the core sort pipeline overnight.
- “Open any executable by name” without a curated launcher map.
- Storing third-party OAuth tokens in chat logs or sending them to the LLM.

## Related docs

- [AI_SYSTEM_COMMANDS.md](./AI_SYSTEM_COMMANDS.md) — threat model for structured actions.
- [INTEGRATIONS.md](./INTEGRATIONS.md) — cloud connections and feature flags.
