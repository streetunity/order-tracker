# Future Considerations

Items to revisit when time permits.

---

## S3 Bucket Backup / Versioning

**Bucket:** `stealth-customer-files`

AWS S3 does not automatically back up data. If a file is deleted it is gone. Options to address this:

- **S3 Versioning (recommended)** — Enable on the bucket via Properties → Bucket Versioning → Enable. Keeps every version of every file, allowing recovery from accidental deletes or overwrites. Minor storage cost increase.
- **S3 Cross-Region Replication** — Automatically replicates everything to a second bucket in a different region for disaster recovery. More complex, doubles storage cost.
- **S3 Lifecycle Rules** — Automatically moves older files to cheaper storage tiers (e.g. Glacier) after a set number of days.

Note: `order-tracker-backups-2025` already handles nightly database backups. This item covers S3 file protection only.

---
