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
`shopping-lists-save-confirmation.sql`. Both changes are already applied to the
current project. These scripts create new objects and are not intended to be
rerun on an initialized database.

Drafting does not require a password. The server checks the parent PIN only
when saving content (and when deleting a list). A successful save issues a
random browser capability for later reading and checkbox updates. Only its
hash is stored in the private database schema; the browser stores the opaque
capability rather than the parent PIN. This capability cannot authorize content
edits or deletion. A new browser has no saved access until a parent confirms a
save there. Direct table access remains disabled.
