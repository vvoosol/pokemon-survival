# Repository workflow

This directory is the canonical working copy for `vvoosol/pokemon-survival`.

- After completing a user-requested file or code change, run the relevant tests.
- When verification passes, commit only the files related to the completed request and push the commit to `origin/main` unless the user explicitly asks not to upload it.
- Never commit or push an unfinished or failing state.
- Preserve unrelated user changes and never force-push.
- If a commit or push fails, keep the local changes intact and report the failure clearly.
