#!/bin/bash

# This script automates conflict resolution during a 'git rebase'.
# WARNING: It will automatically take 'their' version (the changes from the
# commit being applied, i.e., Branch A in your case) for *every* conflict
# without asking. Use with caution!

resolve_rebase() {
  # Check if a rebase is currently in progress
  if [ ! -d ".git/rebase-merge" ] && [ ! -d ".git/rebase-apply" ]; then
    echo "Error: No rebase operation is currently in progress."
    echo "Please start the rebase (e.g., 'git rebase dev') and let it stop on the first conflict before running this script."
    exit 1
  fi

  echo "--- Starting Automated Rebase Resolution ---"
  echo "Resolution strategy: Always prefer 'their' changes (Branch A's incoming commits)."

  while true; do
    # 1. Check for the state of the working directory
    if git diff --name-only --diff-filter=U | grep -q .; then
      # Conflict detected (unmerged files found)
      echo "Conflict detected! Automatically resolving by taking 'their' version (Branch A's change)..."

      # CRITICAL STEP: In 'git rebase', '--theirs' refers to the incoming commit
      # (the change from Branch A being applied).
      git checkout --theirs .

      # Stage the resolved files
      git add -A

      echo "Conflict resolved and changes staged. Continuing rebase."
    else
      # No conflicts detected (or already staged), try to continue rebase
      echo "No conflicts or files needing resolution. Attempting to continue rebase..."
    fi

    # 2. Attempt to continue the rebase
    git rebase --continue

    # 3. Check the exit status of the 'git rebase --continue' command
    if [ $? -eq 0 ]; then
      echo "--------------------------------------------------------"
      echo "Rebase successfully completed."
      break
    fi

    # 4. If continue failed, check if the rebase process is still active.
    if [ ! -d ".git/rebase-merge" ] && [ ! -d ".git/rebase-apply" ]; then
      echo "--------------------------------------------------------"
      echo "Rebase failed for an unknown reason (not a conflict or empty commit). Stopping."
      git status
      exit 1
    fi

    # Add a tiny delay to prevent hammering the loop
    sleep 0.2
  done
}

# Run the automation
resolve_rebase
