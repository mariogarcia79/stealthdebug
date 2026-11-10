# CI/CD Runbook

This document covers every aspect of operating the CI/CD pipeline for stealthdebug: what each piece does, how to set it up, how to deploy, how to roll back, and how to handle failures.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Workflows — what each one does and why](#2-workflows--what-each-one-does-and-why)
3. [One-time setup](#3-one-time-setup)
4. [First deployment procedure](#4-first-deployment-procedure)
5. [Day-to-day deployments](#5-day-to-day-deployments)
6. [Rolling back](#6-rolling-back)
7. [What to do when something fails](#7-what-to-do-when-something-fails)
8. [Alerts and notifications](#8-alerts-and-notifications)
9. [AI review — cost control and false positives](#9-ai-review--cost-control-and-false-positives)
10. [MongoDB: backup and restore](#10-mongodb-backup-and-restore)

---

## 1. Architecture overview

```
Developer pushes branch
        │
        ▼
  Opens PR on GitHub
        │
        ├─► ci.yml  ─► typecheck + test + audit-deps + trivy-fs
        │                       │
        │               build-images (dry-run, no push)
        │
        ├─► ai-review.yml  ─► Claude reviews diff, posts inline PR comments
        │
  PR approved & merged to main
        │
        ▼
  ci.yml (push to main)
        │
        ├─► typecheck + test + audit-deps + trivy-fs  (same as above)
        ├─► build-images  ──► push to ghcr.io (SHA tag + latest tag)
        ├─► trivy-images  ──► scan published images, upload SARIF
        └─► deploy        ──► SSH to VPS → git pull + podman pull + systemctl restart
                                                │
                              (rollback if any step fails)
```

**Image registry:** `ghcr.io/mariogarcia79/stealthdebug/backend` and `.../frontend`
- SHA tag: `ghcr.io/.../backend:abc1234` — immutable, one per commit
- `latest` tag: always points to the most recent successful main push

**VPS deployment:** GitHub Actions SSHes into the VPS as the `deploy` user, sets `BACKEND_IMAGE` and `FRONTEND_IMAGE` to the SHA-tagged images, and runs `deploy.sh`. The script pulls the pre-built images and retags them as `localhost/backend:latest` and `localhost/frontend:latest`, which is what the Podman quadlet files reference. No compilation happens on the VPS.

---

## 2. Workflows — what each one does and why

### `ci.yml`

Triggered on every pull request to `main` and every push to `main`.

| Job | Tool | What it checks | Why it can block a merge |
|-----|------|---------------|--------------------------|
| `typecheck` | `tsc --noEmit` | TypeScript type errors in backend and frontend | Catches missing null checks, wrong API contracts, broken imports before runtime |
| `test` | Jest (`--passWithNoTests`) | Unit tests | Currently passes with 0 tests; starts enforcing as tests are added |
| `audit-deps` | `npm audit --audit-level=high` | CVEs in npm dependencies (backend and frontend) | Fails on any CVSS ≥ 7 vulnerability in the dependency tree |
| `trivy-fs` | Trivy | Secrets in source code, CVEs in package-lock.json, Dockerfile misconfigs | Covers what `npm audit` misses (OS-level deps, hardcoded credentials). SARIF is uploaded so findings appear as PR annotations in the Files tab |
| `build-images` | Docker Buildx | Backend and frontend Dockerfiles | Verifies the full multi-stage build succeeds. On PRs: builds but does not push. On main: pushes to ghcr.io. |
| `trivy-images` | Trivy | OS and library CVEs inside the built container layers | Runs only on main after images are pushed. Catches CVEs in base image packages that filesystem scan cannot see |
| `deploy` | SSH + `deploy.sh` | — | Runs only on main. Deploys to VPS. Fails the workflow if the service does not come up healthy within 100 s |

**Why Docker and not Podman in CI?** GitHub Actions runners do not have Podman installed. Docker builds OCI-compatible images; Podman on the VPS can pull and run them without any conversion.

**Why Trivy and not Snyk or Semgrep?** Trivy is free, open-source, and covers image CVEs + filesystem secrets + IaC misconfigs + npm CVEs in a single tool, with no account or token required. Its SARIF output integrates directly with GitHub's Security tab.

**Why `npm audit` and Trivy together?** `npm audit` knows the full resolved dependency tree from `package-lock.json`. Trivy adds OS-level CVE detection (glibc, openssl in the base image) that npm audit cannot see.

---

### `ai-review.yml`

Triggered on pull requests **from the same repository only** (not fork PRs).

Runs `claude-code-action`, which reviews the PR diff and posts inline comments for security vulnerabilities and correctness issues. It is configured with a focused prompt: authentication logic, input validation, secrets in config, dangerous patterns, infrastructure file changes.

**This job does not block merges.** It is a second-opinion complement to the deterministic checks, not a gate. Treat its findings the same way you would a code review comment.

**Why not fork PRs?** GitHub Actions passes secrets to `pull_request` events only from the same repo. The `if: github.event.pull_request.head.repo.full_name == github.repository` condition makes this explicit. A fork PR would simply not trigger this job.

---

### `security.yml`

Triggered weekly (Monday 08:00 UTC) and manually via `workflow_dispatch`.

Pulls `backend:latest` and `frontend:latest` from ghcr.io and runs Trivy. Finds CVEs that were disclosed after the last code push — i.e., your images can become vulnerable without you changing any code.

If any HIGH or CRITICAL CVEs are found, it opens a GitHub issue with the label `security`. The findings also appear in the Security tab (SARIF upload). It does **not** fail destructively — it reports without blocking anything.

---

### `.github/dependabot.yml`

Opens weekly PRs to:
- Keep GitHub Actions pinned SHAs up to date (security: an outdated pinned Action SHA may contain known vulnerabilities)
- Keep npm dependencies current for backend and frontend (patch and minor updates grouped into one PR each to reduce noise; security updates are always separate)

Dependabot PRs go through `ci.yml` before merging. Review them before approving — sometimes a minor version bump is a breaking change despite semver.

---

## 3. One-time setup

### 3a. Generate a deployment SSH key pair (on your local machine)

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy -N ""
```

This creates two files:
- `~/.ssh/github_actions_deploy` — private key (goes into GitHub secret `VPS_SSH_KEY`)
- `~/.ssh/github_actions_deploy.pub` — public key (goes onto the VPS)

### 3b. Add the public key to the VPS

SSH into the VPS as root and run:

```bash
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
echo "PASTE_CONTENTS_OF_github_actions_deploy.pub" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

### 3c. Get the VPS host key (prevents MITM on the SSH step)

Run on the VPS:
```bash
ssh-keyscan -t ed25519 localhost
```

The output looks like: `localhost ssh-ed25519 AAAA...`
Copy the entire line — it goes into GitHub secret `VPS_SSH_HOST_KEY`.

### 3d. Enable linger for the deploy user (if not already set)

```bash
loginctl enable-linger deploy
```

This ensures systemd user services stay running when the GitHub Actions SSH session closes.

### 3e. Configure GitHub Secrets

Go to: **GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|-------|
| `VPS_SSH_HOST` | VPS IP address or hostname |
| `VPS_SSH_USER` | `deploy` |
| `VPS_SSH_KEY` | Contents of `~/.ssh/github_actions_deploy` (the private key, including the `-----BEGIN` and `-----END` lines) |
| `VPS_SSH_HOST_KEY` | The full line from `ssh-keyscan` in step 3c |
| `VPS_APP_DIR` | Absolute path to the repo on the VPS, e.g. `/home/deploy/stealthdebug` |
| `ANTHROPIC_API_KEY` | Your Claude API key (see section 3f) |

`GHCR_TOKEN` is **not needed** because the repository is public — ghcr.io images are publicly readable without authentication.

### 3f. Claude API key vs subscription token

The `ai-review.yml` workflow supports two authentication modes for `claude-code-action`:

**Option A — API key (recommended for auditability):**
- Create a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- Set a monthly spend limit in the console (e.g. $5/month) to cap costs
- Store it in the `ANTHROPIC_API_KEY` secret
- Billed per token: typically $0.10–$0.50 per PR review depending on diff size

**Option B — Subscription token:**
- Replace `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` in `ai-review.yml` with `claude_access_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`
- Get the token by running `claude setup-token` locally and copying the output
- Counts against your Claude Pro/Max subscription minutes
- No separate billing, but no granular spend control

**Recommendation for a personal project:** subscription token is simpler. For a team or if you want isolated billing, use the API key.

### 3g. Configure branch protection

Go to: **GitHub → Repository → Settings → Branches → Add rule** for `main`:

- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Required checks: `typecheck`, `test`, `audit-deps`, `trivy-fs`, `build-images`
  - (Add `trivy-images` and `deploy` once you've run the first successful push to main)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

### 3h. Create a GitHub environment for production

Go to: **GitHub → Repository → Settings → Environments → New environment**, name it `production`.

Optionally add a required reviewer — this means every deploy to the VPS needs a manual approval click in GitHub Actions. Useful if you want a second check before anything reaches production.

The `deploy` job in `ci.yml` already references `environment: production`.

---

## 4. First deployment procedure

> **This is irreversible without a backup. Do the MongoDB backup first.**

### Step 1 — Back up MongoDB

SSH into the VPS as the deploy user and run:

```bash
cd ~/stealthdebug         # or wherever the repo is cloned
./scripts/backup-mongo.sh
```

The script outputs the archive path and size. Example:
```
Backup complete: /home/deploy/mongo-backups/backup-20260110-143022.tar.gz (1.2M)
```

### Step 2 — Verify the backup

```bash
tar -tzf ~/mongo-backups/backup-YYYYMMDD-HHMMSS.tar.gz | head -20
```

You should see `.bson` files for each collection (users, posts, comments). If the archive is empty or the command fails, do not proceed — investigate the backup first.

### Step 3 — Test restore to a temporary container (optional but strongly recommended)

```bash
# Start a temporary mongo container isolated from production
podman run --rm -d --name mongo-test docker.io/library/mongo:6
TEMP_DIR=$(mktemp -d)
tar -xzf ~/mongo-backups/backup-YYYYMMDD-HHMMSS.tar.gz -C "$TEMP_DIR"
podman cp "$TEMP_DIR" mongo-test:/tmp/restore
podman exec mongo-test mongorestore /tmp/restore --drop
# Verify the data looks right
podman exec -it mongo-test mongosh stealthdebug --eval "db.users.countDocuments()"
# Clean up
podman stop mongo-test
rm -rf "$TEMP_DIR"
```

### Step 4 — Push to main via a PR

Create a branch with any small change (e.g. a comment in RUNBOOK.md), open a PR, let CI pass, then merge. This triggers the full workflow including the first CI-managed deploy.

Watch the deploy in: **GitHub → Repository → Actions → CI → most recent run → deploy job**.

### Step 5 — Confirm data is intact after deploy

After the deploy job succeeds, SSH into the VPS and verify:

```bash
systemctl --user status webpage-pod.service --no-pager
podman exec mongo mongosh stealthdebug --eval "
  print('users:', db.users.countDocuments());
  print('posts:', db.posts.countDocuments());
  print('comments:', db.comments.countDocuments());
"
```

The counts must match what they were before the deploy. If they don't, see section 6 (rolling back) and section 10 (restore procedure).

---

## 5. Day-to-day deployments

**To deploy a change:**

1. Create a branch: `git checkout -b my-feature`
2. Make your changes, commit, push: `git push origin my-feature`
3. Open a pull request on GitHub
4. Wait for all required checks to pass (typically 5–8 minutes)
5. Review the Claude AI review comments if any
6. Merge the PR — the deploy job runs automatically on the resulting push to `main`
7. Watch the deploy in GitHub Actions — it completes in ~2 minutes

**To deploy without a PR** (not recommended — bypasses all checks):
Direct pushes to `main` are blocked by branch protection. If you need to bypass for an emergency, temporarily disable branch protection in repository settings, push, then re-enable it.

**To run the weekly scan manually:**
GitHub → Actions → Weekly security scan → Run workflow.

---

## 6. Rolling back

### Automatic rollback (deploy script failure)

If `deploy.sh` fails at any point, the `rollback()` function restores the previous `~/.config/containers/` directory and restarts the services. This happens automatically — no manual action needed.

### Manual rollback to a previous image

Find the commit SHA you want to roll back to:

```bash
git log --oneline
```

Then on the VPS:

```bash
PREV_SHA="abc1234"   # the commit SHA to roll back to
REPO="ghcr.io/mariogarcia79/stealthdebug"

podman pull "${REPO}/backend:${PREV_SHA}"
podman pull "${REPO}/frontend:${PREV_SHA}"

podman tag "${REPO}/backend:${PREV_SHA}"  localhost/backend:latest
podman tag "${REPO}/frontend:${PREV_SHA}" localhost/frontend:latest

systemctl --user restart webpage-pod.service
```

Images are retained in ghcr.io indefinitely unless you explicitly delete them.

### Rollback if the deploy job never ran (ci.yml failed before deploy)

The VPS was not touched — no rollback needed. Fix the issue, push a new commit.

---

## 7. What to do when something fails

### `typecheck` fails

A TypeScript compilation error was introduced. Read the error in the job log, fix it, push again. The error message includes the file and line number.

### `audit-deps` fails

A new CVE with CVSS ≥ 7 was found in a dependency. Options:
1. Update the dependency: `npm update <package>` or bump the version in package.json
2. If no fix is available yet, check if the vulnerable code path is actually reachable. If not, you can temporarily add an `npm audit` override in `package.json` (`"overrides"` field) with a comment explaining why. Remove the override as soon as a fix is released.

### `trivy-fs` fails

Trivy found a secret, CVE, or Dockerfile misconfiguration in the repository source. Click the job, expand the Trivy output, or go to **Security → Code scanning** to see the finding with file and line. Fix and push.

### `trivy-images` fails

A CVE was found in the built container image (usually in an OS package in the base image). Options:
1. Update the base image tag in the Dockerfile (e.g. from `node:20-trixie-slim` to `node:22-trixie-slim` if a newer LTS base fixes it)
2. Add a `RUN apt-get update && apt-get upgrade -y` layer in the Dockerfile to pull patched packages (use sparingly — it makes builds slower and less reproducible)

### `deploy` fails

1. Read the error in the job log — it will be either a network/SSH error or an error from `deploy.sh`
2. If it's an SSH error: check that the VPS is reachable and the secret `VPS_SSH_HOST` is correct
3. If `deploy.sh` failed: SSH into the VPS, check `journalctl --user -xe` and `systemctl --user status webpage-pod.service`
4. The rollback function should have already restored the previous state automatically
5. If the automatic rollback also failed: see section 6, manual rollback

### Health check times out

The service pod started but didn't become healthy within 100 s. SSH into the VPS:

```bash
systemctl --user status webpage-pod.service --no-pager
journalctl --user -u backend.service -n 50
journalctl --user -u mongo.service -n 50
```

Common causes: `ADMIN_PASSWORD` is weak (backend calls `process.exit(1)`), MongoDB volume not mounted, out of disk space.

---

## 8. Alerts and notifications

### GitHub Actions failures

GitHub sends an email to your account when a workflow fails (enabled by default). Configure at: **GitHub → Settings → Notifications → Actions**.

### Weekly CVE scan

If the weekly scan finds HIGH/CRITICAL issues, it opens a GitHub issue labelled `security`. You will receive a notification for new issues if issues notifications are enabled.

### Service downtime

The CI pipeline does not monitor uptime — it only validates deploys. For uptime monitoring:

**UptimeRobot (free):**
1. Create a free account at [uptimerobot.com](https://uptimerobot.com)
2. Add an HTTP monitor for your domain (checks every 5 minutes on the free tier)
3. Add an alert contact for email, Telegram, or Slack
4. You'll receive a notification within 5 minutes of any downtime

**Healthchecks.io (free):**
Useful for cron-style monitoring (e.g. confirming the weekly scan ran). Create a check, add the ping URL as a step in `security.yml` to confirm it ran.

### Failed deployment notification (Slack/email via GitHub)

GitHub can send webhook notifications to Slack or any webhook endpoint on workflow completion. Configure at: **Repository → Settings → Webhooks** or via the GitHub Slack integration.

---

## 9. AI review — cost control and false positives

### How to read the AI review

The Claude review posts inline comments directly on the PR diff. Each comment:
- Identifies the specific line or block it's referring to
- States the security concern or bug concisely
- Suggests a fix

If a comment has a "Suggestion" block, GitHub lets you apply it in one click.

### How to handle false positives

The AI review is not authoritative. If a comment is wrong:
1. Reply to the comment explaining why ("this input is already validated upstream in X")
2. Dismiss it — it won't block the merge
3. If the same false positive pattern appears repeatedly, refine the prompt in `ai-review.yml` to exclude that category

### Cost control

Each review call charges for the number of tokens in the diff + the prompt. Typical costs:
- Small PR (< 50 lines changed): ~$0.02–$0.05
- Medium PR (200–500 lines): ~$0.10–$0.30
- Large PR (1000+ lines): ~$0.50–$1.50

**To reduce cost:**
- Set a monthly spend limit in the Anthropic console (recommended: $5–$10/month)
- The review only runs on PRs, not on every commit to a branch
- It does not run on the merge commit to main (only PRs)
- If you have a flurry of small fix commits, squash them into one before opening the PR

**To disable the AI review temporarily:**
Comment out the job in `ai-review.yml` or delete the `ANTHROPIC_API_KEY` secret. The workflow will fail gracefully (it won't block anything since it has no required status check).

---

## 10. MongoDB backup and restore

> **The database volume lives at `~/.local/share/containers/storage/volumes/[name]/` on the VPS. It is NOT affected by `deploy.sh`, `git pull`, or image updates. The only operations that destroy it are `podman volume rm`, `podman system prune --volumes`, or manual deletion of that path.**

### Manual backup

Run on the VPS as the deploy user:

```bash
cd ~/stealthdebug
./scripts/backup-mongo.sh
```

Output: a `.tar.gz` archive at `~/mongo-backups/backup-YYYYMMDD-HHMMSS.tar.gz`

### Automated weekly backup (recommended)

Add to the deploy user's crontab (`crontab -e`):

```cron
# MongoDB backup — every Sunday at 03:00
0 3 * * 0 /home/deploy/stealthdebug/scripts/backup-mongo.sh >> /home/deploy/mongo-backups/cron.log 2>&1
```

Rotate or offload old backups to avoid filling the disk:

```cron
# Delete backups older than 30 days
0 4 * * 0 find /home/deploy/mongo-backups -name "*.tar.gz" -mtime +30 -delete
```

### Verify a backup

```bash
tar -tzf ~/mongo-backups/backup-YYYYMMDD-HHMMSS.tar.gz | head -20
```

You should see paths like `./mongodump-YYYYMMDD-HHMMSS/stealthdebug/users.bson`.

### Restore procedure

> **This overwrites the live database. Stop the backend first. MongoDB itself must stay running.**

```bash
# 1. Stop the backend (Mongo stays up — it's in the same pod but independent)
systemctl --user stop backend.service

# 2. Extract the archive
BACKUP_FILE=~/mongo-backups/backup-YYYYMMDD-HHMMSS.tar.gz
TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# 3. Copy the dump into the container
podman cp "$TEMP_DIR" mongo:/tmp/restore

# 4. Restore (--drop replaces existing data)
DUMP_DIR=$(podman exec mongo ls /tmp/restore/)
podman exec mongo mongorestore "/tmp/restore/${DUMP_DIR}/stealthdebug" \
  --db stealthdebug --drop

# 5. Verify counts
podman exec mongo mongosh stealthdebug --eval "
  print('users:', db.users.countDocuments());
  print('posts:', db.posts.countDocuments());
  print('comments:', db.comments.countDocuments());
"

# 6. Restart the backend
systemctl --user start backend.service

# 7. Clean up
podman exec mongo rm -rf /tmp/restore
rm -rf "$TEMP_DIR"
```

### Finding the actual Podman volume name

If you ever need to reference the volume directly (e.g. for `podman volume inspect`), run:

```bash
podman volume ls
```

It will appear as either `mongo-data` or `systemd-mongo-data` depending on your Podman version. Never run `podman volume rm` on it.
