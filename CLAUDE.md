# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mobility with Simon** is a Progressive Web App (PWA) for physiotherapy exercise tracking. Users sign in with Google, manage their personalized exercise programs, log workout sessions with detailed metrics (reps, weight, pain levels, variations), and track weekly activity.

**Tech Stack:**
- **Frontend:** Vanilla JavaScript (ES modules), HTML5, Tailwind CSS, Sortable.js for drag-drop
- **Backend:** Firebase (Firestore for data, Google Auth)
- **Hosting:** Netlify
- **Build:** Node.js scripts for config templating and deployment

## Development Commands

**Setup:**
- No `npm install` required—this is not an npm project. Dependencies (Tailwind, Firebase SDKs, Sortable.js) are loaded via CDN in `index.html`.

**Local Development:**
- Open `index.html` directly in a browser, or serve locally with `python -m http.server 8000` (or `npx http-server`). The app will prompt for Google sign-in, but will fail without valid Firebase credentials in `js/config.js`.
- For offline testing without Firebase, comment out the Google Auth button and modify `app.js` to use mock data.

**Config Setup:**
- Copy `js/config.template.js` to `js/config.js` and fill in Firebase project credentials manually for local development.
- During Netlify build, `scripts/build.js` automatically generates `js/config.js` from the template by substituting environment variables (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, etc.).

**Deployment:**
- Run `node scripts/deploy.js` to commit changes, push to Git, and trigger a Netlify rebuild via API. Requires:
  - Git repository configured with a remote
  - `.env` file containing `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` (or set them as environment variables before running)

## Architecture & Data Model

**Firestore Structure:**
```
users/{userId}/
  ├── exercises/
  │   └── {Exercise_ID}: {Name, Focus_Area, Target_Sets, Target_Reps, Weight_Used_Initial, Video_Link, Physio_Notes, order}
  └── logs/
      └── {Log_ID}: {Exercise_ID, Date, SetNumber, Actual_Reps, Weight_Used, Pain_Level, Variation}
```

**Key App State** (in `js/app.js`):
- `exercises[]` — list of user's exercises, ordered by the `order` field
- `sessionLogs[]` — all workout logs, populated on auth and updated via real-time listeners
- `currentExerciseId` — ID of the exercise being viewed in detail
- `userId` — authenticated user's ID from Firebase Auth

**Rendering Flow:**
1. **Dashboard Tab** (`#dashboard-tab`): Displays weekly activity (session count by day) and quick action buttons.
2. **My Program Tab** (`#my-program`): Sortable list of exercises. Drag-drop reorders and updates `order` field in Firestore.
3. **Log Workout Tab** (`#log-workout-tab`): Dynamically generated form. Select an exercise → render recent logs + form to log new sets.
4. **Program Detail** (`#program-detail`): Shows exercise details, physio notes, video, recent session logs.
5. **History Tab** (`#history-tab`): Full log history grouped by date.

**Key Functions:**
- `renderExercises()` — renders exercise cards with Sortable.js integration
- `switchTab(tabId)` — shows/hides tab content and updates header styling
- `openAddExerciseForm(exerciseToEdit)` — form for creating/editing exercises
- `renderWeeklyActivity()` — dashboard summary of this week's workouts
- `renderRelatedLogs(exerciseId)` — last 5 workout sessions for an exercise

**Real-time Data Sync:**
- `onSnapshot()` listeners (set during auth) keep `exercises[]` and `sessionLogs[]` in sync with Firestore.
- Any update from the UI (add/edit exercise, log a set) is saved to Firestore immediately.

## Important Implementation Details

**Google Auth & User Isolation:**
- Users must sign in with Google. Auth state is managed by `onAuthStateChanged()`.
- All Firestore reads/writes use `getPrivateCollectionPath(collectionName)` to scope data to `users/{userId}/{collectionName}`, ensuring data isolation.

**Dark Mode:**
- Tailwind's `dark:` class prefix handles dark mode. The app respects the system preference via the CSS media query `prefers-color-scheme`.

**PWA & Offline:**
- `manifest.json` declares app metadata for "Add to Home Screen" and standalone display mode.
- No service worker currently implemented; offline caching is not available.

**Drag-Drop Reordering:**
- Sortable.js reorders exercises in the UI and updates the `order` field in Firestore using a batch write for atomicity.

**Form Editing:**
- The add exercise form is used for both create and edit. If `exerciseToEdit` is passed, it pre-fills the form and updates the existing document on submit.

**Configuration & Secrets:**
- Firebase config (API keys, project IDs) must not be hardcoded in version control. Use environment variables during build.
- `.env` is in `.gitignore`; `js/config.js` is also ignored (generated during build).

## File Structure

- `index.html` — main UI (Tailwind + tab structure)
- `js/app.js` — app logic, Firebase operations, UI rendering (1200+ lines)
- `js/config.template.js` — Firebase config template; replaced with `config.js` during build
- `js/config.js` — **generated; do not edit directly**
- `css/style.css` — custom CSS overrides (minimal; most styling via Tailwind classes)
- `scripts/build.js` — Node script to generate config.js from template + env vars
- `scripts/deploy.js` — Node script to commit, push, and trigger Netlify build
- `img/`, `app-icon.jpg` — app branding assets
- `.netlify/` — Netlify metadata
- `.gitignore` — ignores `.env`, `js/config.js`, `specs/`

## Common Changes & Patterns

**Adding a New Field to Exercises:**
1. Add the input to the form in `index.html` (in `#add-exercise-tab`).
2. Update the form submission handler in `app.js` to read the input and include it in the Firestore doc.
3. Update `renderExercises()` or `renderProgramDetail()` to display the field.

**Modifying Log Fields:**
1. Update the logging form in `#log-workout-tab` (dynamically generated in `app.js`).
2. Update the Firestore write to include the new field.
3. Update `renderRelatedLogs()` to display the field.

**Styling:**
- Use Tailwind classes in HTML; avoid inline styles unless necessary.
- Custom CSS goes in `style.css`.
- Dark mode: add `dark:` prefixed classes alongside light-mode classes.

**Firestore Queries:**
- Use `query()` + `where()`, `orderBy()`, `limit()` for filtering. Examples in `app.js` show patterns for getting last 5 logs or filtering by user.

## Debugging & Testing

**Console Logging:**
- `setLogLevel('Debug')` in `app.js` (line 6, commented out) can be uncommented to enable Firebase debug logs in the browser console.

**Mock Data (Local Dev Without Firebase):**
- Comment out the Google Auth button in `index.html` and define mock `exercises` and `sessionLogs` objects in `app.js` to test UI locally.

**Netlify Logs:**
- Check Netlify's build logs if deployment fails. The build runs `scripts/build.js` to generate `js/config.js`.
- If `js/config.js` is missing at runtime, the app will fail silently when trying to import Firebase modules.
