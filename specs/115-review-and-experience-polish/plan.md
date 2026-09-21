## Architecture
Follow Clean Architecture; keep discovery in the presentation layer using existing domain status. RED-GREEN-REFACTOR is required for every behavior change. Preserve query caching, polling, stale-data recovery and imports. Test before changing implementation. Roll back only changes owned by this review.
