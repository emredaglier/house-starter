# 9. Media soft delete and nightly backup

Date: 2026-11-09 · Status: accepted

## Context
R2 has no versioning, so deleting an image in the admin would destroy the file permanently.

## Decision
- Deleting media in `cms` removes the record and moves the R2 object to a `trash/` prefix, which a
  30-day lifecycle rule expires.
- A nightly job copies new objects into a separate backup bucket and never deletes anything there.
- A removal required by a privacy request is the one exception: the owner deletes the backup copy
  by hand, and the job itself still never deletes.

## Consequences
The library stays far under the free tier. The media collection and the jobs arrive with the infra
ticket and the first project with uploads.
