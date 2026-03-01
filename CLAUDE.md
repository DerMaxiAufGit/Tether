# Tether — Project Instructions

## Docker Workflow

After finishing a task and before reporting what changed, rebuild and restart Docker containers so the user can test immediately:

```bash
docker compose down && docker compose up --build -d
```
