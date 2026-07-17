#!/usr/bin/env python
"""Seed the database with initial data from data.js"""

import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import get_session_maker, init_engine
from app.models.part import Part
from app.models.project import Project
from app.models.tenant import Tenant
from app.models.user import User
from app.models.vendor import Vendor

# Sample data converted from data.js
SEED_PARTS = [
    {
        "pn": "EL-MCU-STM32H7",
        "name": "MCU Module, STM32H743",
        "description": "ARM Cortex-M7 microcontroller, 480MHz, 2MB Flash, LQFP-100",
        "rev": "B",
        "qty": 1,
        "uom": "EA",
        "category": "Electrical",
        "subCategory": "IC",
        "vendor": "Digi-Key",
        "manufacturer": "STMicroelectronics",
        "cost": 18.40,
        "lead": 42,
        "origin": "FR",
        "status": "Released",
        "assembly": False,
        "material": "Silicon/FR4",
        "weight": 5.0,
        "dimensions": "14 × 14 mm (LQFP-100)",
        "tags": "mcu,active,long-lead",
        "compliance": "RoHS,REACH",
        "freight": 1.20,
        "tax": 3.40,
        "landedCost": 23.00,
    },
    {
        "pn": "ME-SEN-DHT22",
        "name": "Temperature/Humidity Sensor",
        "description": "Digital temperature and humidity sensor, ±0.5°C accuracy",
        "rev": "A",
        "qty": 2,
        "uom": "EA",
        "category": "Electrical",
        "subCategory": "Sensor",
        "vendor": "Mouser",
        "manufacturer": "Aosong",
        "cost": 4.50,
        "lead": 14,
        "origin": "CN",
        "status": "Released",
        "assembly": False,
        "material": "Plastic",
        "weight": 2.5,
        "dimensions": "15 × 25 × 7 mm",
        "tags": "sensor,active",
        "compliance": "RoHS",
        "freight": 0.50,
        "tax": 0.80,
        "landedCost": 5.80,
    },
    {
        "pn": "EL-PSU-12V5A",
        "name": "Power Supply, 12V 5A",
        "description": "AC-DC power supply, 12V 5A, 60W, medical grade",
        "rev": "C",
        "qty": 1,
        "uom": "EA",
        "category": "Electrical",
        "subCategory": "Power Supply",
        "vendor": "Digi-Key",
        "manufacturer": "Mean Well",
        "cost": 24.00,
        "lead": 28,
        "origin": "TW",
        "status": "Released",
        "assembly": False,
        "material": "Aluminum",
        "weight": 350.0,
        "dimensions": "159 × 97 × 38 mm",
        "tags": "power,active",
        "compliance": "UL,CE,RoHS",
        "freight": 2.00,
        "tax": 4.20,
        "landedCost": 30.20,
    },
    {
        "pn": "ME-ENC-ALU6061",
        "name": "Enclosure, Aluminum 6061",
        "description": "CNC machined aluminum enclosure, anodized black",
        "rev": "A",
        "qty": 1,
        "uom": "EA",
        "category": "Mechanical",
        "subCategory": "Enclosure",
        "vendor": "Protolabs",
        "manufacturer": "Protolabs",
        "cost": 85.00,
        "lead": 10,
        "origin": "US",
        "status": "Released",
        "assembly": False,
        "material": "Aluminum 6061-T6",
        "weight": 450.0,
        "dimensions": "200 × 150 × 50 mm",
        "tags": "enclosure,cnc",
        "compliance": "",
        "freight": 5.00,
        "tax": 14.00,
        "landedCost": 104.00,
        "cadUrl": "cad/ATLAS/Enclosure/ME-ENC-ALU6061.step",
    },
    {
        "pn": "EL-LCD-IPS5",
        "name": 'LCD Display, 5" IPS',
        "description": "5-inch IPS LCD display, 800x480, capacitive touch",
        "rev": "B",
        "qty": 1,
        "uom": "EA",
        "category": "Electrical",
        "subCategory": "Display",
        "vendor": "Mouser",
        "manufacturer": "Winstar",
        "cost": 32.00,
        "lead": 35,
        "origin": "TW",
        "status": "Released",
        "assembly": False,
        "material": "Glass/Plastic",
        "weight": 120.0,
        "dimensions": "121 × 76 × 3.5 mm",
        "tags": "display,touch,active",
        "compliance": "RoHS",
        "freight": 1.50,
        "tax": 5.60,
        "landedCost": 39.10,
    },
]

SEED_VENDORS = [
    {
        "name": "Digi-Key",
        "country": "US",
        "leadTime": 3,
        "moq": 1,
        "terms": "Net 30",
        "reliabilityRating": 4.8,
    },
    {
        "name": "Mouser",
        "country": "US",
        "leadTime": 4,
        "moq": 1,
        "terms": "Net 30",
        "reliabilityRating": 4.7,
    },
    {
        "name": "Protolabs",
        "country": "US",
        "leadTime": 10,
        "moq": 1,
        "terms": "Net 45",
        "reliabilityRating": 4.5,
    },
    {
        "name": "Arrow",
        "country": "US",
        "leadTime": 5,
        "moq": 10,
        "terms": "Net 30",
        "reliabilityRating": 4.6,
    },
]

SEED_PROJECTS = [
    {
        "code": "ATLAS",
        "name": "ATLAS Rover",
        "description": "Autonomous rover for planetary exploration",
        "status": "active",
    },
    {
        "code": "HORIZON",
        "name": "HORIZON Drone",
        "description": "Long-endurance surveillance drone",
        "status": "active",
    },
]


async def seed_database():
    """Seed the database with initial data"""
    # Create tables
    engine = await init_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session
    async with (await get_session_maker())() as session:
        # Check if data already exists
        from sqlalchemy import func, select

        result = await session.execute(select(func.count()).select_from(Part))
        count = result.scalar()

        if count > 0:
            print(f"Database already has {count} parts. Skipping seed.")
            return

        # Every core table is multi-tenant (tenantId is NOT NULL). Reuse an
        # existing tenant if one is present, otherwise create a default one.
        tenant = await session.scalar(select(Tenant).limit(1))
        if tenant is None:
            tenant = Tenant(tenant_name="Blackbox Factories", tenant_code="BBF")
            session.add(tenant)
            await session.flush()  # assign tenant.id
        tenant_id = tenant.id

        def _row(model, data):
            """Keep only real columns for `model` and attach the tenant id.

            Makes seeding resilient to fields in the sample data that are not
            (or no longer) model columns.
            """
            cols = {c.key for c in model.__table__.columns}
            clean = {k: v for k, v in data.items() if k in cols}
            if "tenantId" in cols:
                clean["tenantId"] = tenant_id
            return clean

        # Seed parts
        for part_data in SEED_PARTS:
            session.add(Part(**_row(Part, part_data)))

        # Seed vendors
        for vendor_data in SEED_VENDORS:
            session.add(Vendor(**_row(Vendor, vendor_data)))

        # Seed projects
        for project_data in SEED_PROJECTS:
            session.add(Project(**_row(Project, project_data)))

        # Create admin user (only when explicitly configured, never in production)
        env = (os.getenv("ENVIRONMENT") or "").lower()
        is_production = (
            env in {"production", "prod"}
            or os.getenv("IS_PRODUCTION", "").lower() in {"1", "true", "yes"}
        )
        admin_password = os.getenv("SEED_ADMIN_PASSWORD")
        admin_created = False

        if is_production:
            print(
                "Refusing to seed a default admin user in a production environment. "
                "Create the admin account through the normal provisioning flow instead."
            )
        elif not admin_password:
            print(
                "SEED_ADMIN_PASSWORD is not set — skipping admin user creation. "
                "Set SEED_ADMIN_PASSWORD (and optionally SEED_ADMIN_EMAIL) to seed an admin."
            )
        else:
            admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@blackbox.com")
            existing_admin = await session.scalar(
                select(User).where(User.email == admin_email)
            )
            if existing_admin:
                print(f"User {admin_email} already exists — skipping admin creation.")
            else:
                admin_user = User(
                    email=admin_email,
                    username="admin",
                    fullName="System Admin",
                    hashedPassword=get_password_hash(admin_password),
                    isActive=True,
                    isSuperuser=True,
                    tenantId=tenant_id,
                    department="Engineering",
                    jobTitle="System Administrator",
                )
                session.add(admin_user)
                admin_created = True

        # Commit all changes
        await session.commit()

        print("Database seeded successfully!")
        print(f"  - {len(SEED_PARTS)} parts")
        print(f"  - {len(SEED_VENDORS)} vendors")
        print(f"  - {len(SEED_PROJECTS)} projects")
        if admin_created:
            print(f"  - 1 admin user ({admin_email}) with password from SEED_ADMIN_PASSWORD")
        else:
            print("  - 0 admin users (see message above)")


if __name__ == "__main__":
    asyncio.run(seed_database())
