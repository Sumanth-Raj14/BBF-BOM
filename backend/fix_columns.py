import asyncio
import os

import asyncpg


async def run():
    password = os.environ.get("POSTGRES_PASSWORD", "bom_password")
    conn = await asyncpg.connect(
        host=os.environ.get("POSTGRES_SERVER", "localhost"),
        database=os.environ.get("POSTGRES_DB", "bom_db"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=password,
    )
    await conn.execute(
        "ALTER TABLE service_bom_headers ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'maintenance'"
    )
    await conn.execute(
        "ALTER TABLE routing_tables ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'"
    )
    await conn.execute(
        "ALTER TABLE process_plans ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10,2) DEFAULT 0"
    )
    print("Columns added successfully")
    await conn.close()


asyncio.run(run())
