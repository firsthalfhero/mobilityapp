---
name: mobility-tracker
description: Manage the 'Mobility with Simon' physiotherapy app data (v2.0.0) — exercises, workouts, sections, and workout logs stored in Firestore. Triggers when the user asks to view, add, update or delete exercises or workout logs, manage workouts and sections, asks what exercises are in a program, asks about workout history, or wants to log a session. Also triggers for questions like "what did Simon do last Tuesday", "update the hip exercise", "add a new exercise", "which workout has X", "create a new workout".
metadata:
  {
    "openclaw":
      {
        "emoji": "🏋️",
        "requires":
          {
            "bins": ["python3"],
            "env": ["FIREBASE_SERVICE_ACCOUNT"],
          },
        "primaryEnv": "FIREBASE_SERVICE_ACCOUNT",
      },
  }
---

# 🏋️ Mobility Tracker (v2.0.0)

Manage exercises, workouts, sections, and workout logs for the Mobility with Simon physiotherapy app.

## Data Structure

Firestore paths:
- `users/users/workouts/{WorkoutID}` — workouts with sections array
- `users/users/exercises/{ExerciseID}` — exercises (now with `workoutId` and `sectionId`)
- `users/users/logs/{LogID}` — workout log entries

Script: `/home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py`

ALWAYS run the script. NEVER fabricate exercise names, workout IDs, or log data.

---

## Workouts & Sections

### List all workouts

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-workouts
```

### Get workout details (including sections)

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py get-workout <workoutId>
```

### Add a new workout

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py add-workout \
  --name "Home Workout" \
  --description "Quick routine for home" \
  --section "Warm-up" \
  --section "Main Lift" \
  --section "Cool-down"
```

First section is required. Additional sections are optional.

### Update a workout

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py update-workout <workoutId> \
  --name "Updated Workout Name" \
  --description "New description"
```

Pass only the fields to change.

### Delete a workout

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py delete-workout <workoutId> --yes
```

---

## Exercises

### List all exercises (ordered by position)

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-exercises
```

### Filter exercises by workout

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-exercises --workout-id <workoutId>
```

### Filter exercises by section (within a workout)

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-exercises --workout-id <workoutId> --section-id <sectionId>
```

### Get full details of one exercise

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py get-exercise <exerciseId>
```

### Add a new exercise to a workout section

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py add-exercise \
  --name "Hip Flexor Stretch" \
  --focus-area "Hip" \
  --target-sets 3 \
  --target-reps "45 secs" \
  --workout-id <workoutId> \
  --section-id <sectionId> \
  --weight "Bodyweight" \
  --notes "Keep spine neutral." \
  --video "https://..."
```

`--weight`, `--notes`, and `--video` are optional.

### Update an exercise

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py update-exercise <exerciseId> \
  --target-sets 4 \
  --notes "Updated physio notes."
```

Pass only the fields to change.

### Delete an exercise (also deletes all its logs)

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py delete-exercise <exerciseId> --yes
```

---

## Workout Logs

### List recent logs

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-logs
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-logs --limit 50
```

### Filter logs by exercise

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-logs --exercise-id <exerciseId>
```

### Filter logs by date

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py list-logs --date 2026-03-20
```

### Add a log entry

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py add-log \
  --exercise-id <exerciseId> \
  --set-number 1 \
  --reps "12" \
  --weight "Red band" \
  --variation "Half kneeling" \
  --rpe 16 \
  --pain 2 \
  --comments "Felt strong today."
```

`--weight`, `--variation`, `--rpe` (6-20 Borg scale), `--pain` (1-5 VAS), and `--comments` are optional.

### Delete a log entry

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py delete-log <logId>
```

---

## Summary

```bash
python3 /home/node/.claude/skills/mobility-tracker/scripts/mobility_cli.py summary
```

---

## Rules

- **Workouts**: v2.0.0 introduces multiple workouts with sections. Always ask which workout if unclear.
- ALWAYS run `list-workouts` first if the user refers to a workout by name — you need the document ID.
- ALWAYS run `list-exercises --workout-id <id>` to see exercises in a specific workout.
- ALWAYS run `list-exercises` first if the user refers to an exercise by name — you need the document ID.
- NEVER guess or fabricate Firestore document IDs.
- When the user says "delete X exercise", confirm the name match from `list-exercises` output before deleting.
- When adding an exercise, you MUST specify `--workout-id` and `--section-id` — fetch these from `list-workouts` and the workout details.
- RPE (Rating of Perceived Exertion) is 6-20 Borg scale. Pain is 1-5 VAS scale.
- After any add/update/delete, confirm the outcome to the user.
- The app is used by one person (Simon) — there is one set of workouts, exercises, and logs.
