# Secret Rotation — 2026-07-08

The workspace was handed over as a zip containing `backend/.env` with **real, non-placeholder secrets**. All values have been rotated locally. **Treat the old values as permanently compromised.**

## What was rotated in `backend/.env`

| Key | Action |
|-----|--------|
| `SECRET_KEY` | New high-entropy value generated. |
| `ENCRYPTION_KEY` | New value generated. **See caveats below — this is a breaking change.** |
| `S3_SECRET_KEY` | New value generated. |
| `POSTGRES_PASSWORD` | New value generated. |
| `REDIS_URL` password | New value generated. |
| `S3_ACCESS_KEY` | Left as `minioadmin` (username, not a secret). Change on the MinIO server if desired. |

## Required follow-up (must be done by an operator — cannot be automated from here)

1. **Rotate the live server-side credentials to match**, or the app will fail to connect:
   - **Postgres**: an existing data volume keeps its original password (set only on first init). Either `ALTER USER bom_user WITH PASSWORD '<new>';` on the running DB, or recreate the volume (`docker compose down -v` — **destroys dev data**) so it re-initializes with the new `.env` password.
   - **Redis**: update `requirepass` on the Redis server / recreate the container.
   - **MinIO / S3**: update the access/secret key on the MinIO server to match `S3_SECRET_KEY`.

2. **RSA JWT keys were deleted** (`backend/rsa_keys/private.pem`, `public.pem`). They were encrypted with the *old* `ENCRYPTION_KEY` and can no longer be decrypted. The app regenerates a fresh 4096-bit pair on next startup (`app/core/security.py:_ensure_rsa_keys`). **Consequence: all previously issued JWTs are invalid — every user must log in again.**

3. **Column-encrypted DB data is now unreadable.** `ENCRYPTION_KEY` is also the Fernet/pgcrypto key for encrypted columns (`app/core/encryption.py`). Any data encrypted under the old key cannot be decrypted under the new one. In dev this is acceptable (re-seed). **In a real environment you would instead decrypt-then-re-encrypt during rotation, not swap the key outright.**

4. If this tree is ever put under git, confirm `.env` and `rsa_keys/` are ignored (they are — `bom-tool/.gitignore:42,52`). `.env.example` is now explicitly un-ignored so the template stays shareable.
