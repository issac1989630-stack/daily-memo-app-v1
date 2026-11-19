<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d1b3e97b-8785-41d5-9bf6-d9c16233f191

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Shopping lists

For a new database, apply `shopping-lists-schema.sql` first, followed by
`shopping-lists-save-confirmation.sql` (and `trash-schema.sql`). These changes
are already applied to the current project.

Viewing saved shopping lists, checking off purchased items, and drafting or
editing shopping list entries do not prompt for a password. The UI prompts for
the parent PIN only when saving content (and when deleting a list), and the
server verifies the PIN on save and delete. Direct table access remains disabled.


## Trash and restore

Apply `trash-schema.sql` after `shopping-lists-schema.sql` and `shopping-lists-save-confirmation.sql` in the Supabase SQL editor. This migration adds reversible deletion for daily tasks, reward plans, and shopping lists. Deleted entries stay in the database, are hidden from the active lists, and appear in the trash after the parent PIN (`2026`) is verified. Restoring an entry returns it to its original section and date.
