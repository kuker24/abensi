# ADR: Legacy timestamp interpretation

Status: Accepted

SchoolHub stores PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` values as UTC-naive instants. Jakarta business dates must therefore be derived with `((timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date`, not `timestamp AT TIME ZONE 'Asia/Jakarta'`.

Corrective migration: `0026_correct_jakarta_business_dates`.

Rollback: restore from backup or revert `businessDate` values using `BusinessDateBackfillReport` after human review.
