#!/usr/bin/env python
"""Seed enterprise tables with sample data: Service BOM, Routings, Process Plans, Timesheets."""

import asyncio
import sys
from datetime import date

sys.path.insert(0, ".")

from sqlalchemy import text

from app.db.session import AsyncSessionLocal

SEED_SERVICE_BOMS = [
    {
        "bom_number": "SBOM-2024-0001",
        "name": "ATLAS Rover - Annual Maintenance Kit",
        "description": "Scheduled annual maintenance parts for ATLAS Rover",
        "parent_product_pn": "ATLAS-ROVER-MK3",
        "revision": 1,
        "status": "released",
        "items": [
            {
                "part_pn": "ME-SEN-DHT22",
                "part_name": "Temperature/Humidity Sensor",
                "quantity": 2,
                "unit": "EA",
                "service_type": "inspection",
                "interval_months": 12,
                "is_consumable": False,
                "is_wear_part": False,
            },
            {
                "part_pn": "EL-PSU-12V5A",
                "part_name": "Power Supply, 12V 5A",
                "quantity": 1,
                "unit": "EA",
                "service_type": "replace",
                "interval_months": 24,
                "is_consumable": False,
                "is_wear_part": False,
            },
        ],
    },
    {
        "bom_number": "SBOM-2024-0002",
        "name": "HORIZON Drone - Pre-Flight Check",
        "description": "Pre-flight inspection and service parts for HORIZON Drone",
        "parent_product_pn": "HZ-DRONE-V2",
        "revision": 2,
        "status": "released",
        "items": [
            {
                "part_pn": "EL-MCU-STM32H7",
                "part_name": "MCU Module, STM32H743",
                "quantity": 1,
                "unit": "EA",
                "service_type": "inspection",
                "interval_hours": 500,
                "is_consumable": False,
                "is_wear_part": False,
            },
        ],
    },
    {
        "bom_number": "SBOM-2024-0003",
        "name": "Field Repair Kit - Electronics",
        "description": "Common electronic components for field repairs",
        "parent_product_pn": "FIELD-KIT-ELEC",
        "revision": 1,
        "status": "draft",
        "items": [
            {
                "part_pn": "EL-LCD-IPS5",
                "part_name": 'LCD Display, 5" IPS',
                "quantity": 1,
                "unit": "EA",
                "service_type": "replace",
                "is_consumable": True,
                "is_wear_part": True,
            },
        ],
    },
]

SEED_ROUTINGS = [
    {
        "routing_number": "RT-0001",
        "name": "MCU Module Assembly",
        "description": "Surface-mount assembly process for STM32H7 MCU module",
        "part_id": 1,
        "revision": 2,
        "status": "active",
        "operations": [
            {
                "operation_number": 10,
                "operation_name": "Solder Paste Application",
                "work_center": "WC-ASSY",
                "setup_time_min": 15,
                "run_time_min": 5,
                "cycle_time_min": 3,
            },
            {
                "operation_number": 20,
                "operation_name": "Pick and Place",
                "work_center": "WC-ASSY",
                "setup_time_min": 30,
                "run_time_min": 10,
                "cycle_time_min": 8,
            },
            {
                "operation_number": 30,
                "operation_name": "Reflow Soldering",
                "work_center": "WC-ASSY",
                "setup_time_min": 20,
                "run_time_min": 8,
                "cycle_time_min": 6,
            },
            {
                "operation_number": 40,
                "operation_name": "AOI Inspection",
                "work_center": "WC-QC",
                "setup_time_min": 5,
                "run_time_min": 3,
                "cycle_time_min": 2,
                "estimated_cost": 2.50,
            },
            {
                "operation_number": 50,
                "operation_name": "Functional Test",
                "work_center": "WC-QC",
                "setup_time_min": 10,
                "run_time_min": 5,
                "cycle_time_min": 4,
                "estimated_cost": 5.00,
            },
        ],
    },
    {
        "routing_number": "RT-0002",
        "name": "Aluminum Enclosure Machining",
        "description": "CNC machining process for aluminum 6061 enclosure",
        "part_id": 4,
        "revision": 1,
        "status": "active",
        "operations": [
            {
                "operation_number": 10,
                "operation_name": "Stock Preparation",
                "work_center": "WC-MACH",
                "setup_time_min": 20,
                "run_time_min": 15,
                "cycle_time_min": 12,
            },
            {
                "operation_number": 20,
                "operation_name": "Rough Machining",
                "work_center": "WC-MACH",
                "setup_time_min": 30,
                "run_time_min": 45,
                "cycle_time_min": 40,
            },
            {
                "operation_number": 30,
                "operation_name": "Finish Machining",
                "work_center": "WC-MACH",
                "setup_time_min": 20,
                "run_time_min": 30,
                "cycle_time_min": 25,
            },
            {
                "operation_number": 40,
                "operation_name": "Deburring",
                "work_center": "WC-MACH",
                "setup_time_min": 5,
                "run_time_min": 10,
                "cycle_time_min": 8,
            },
            {
                "operation_number": 50,
                "operation_name": "Surface Treatment",
                "work_center": "WC-PAINT",
                "setup_time_min": 15,
                "run_time_min": 20,
                "cycle_time_min": 18,
                "estimated_cost": 12.00,
            },
            {
                "operation_number": 60,
                "operation_name": "Quality Inspection",
                "work_center": "WC-QC",
                "setup_time_min": 5,
                "run_time_min": 10,
                "cycle_time_min": 8,
                "estimated_cost": 8.00,
            },
        ],
    },
    {
        "routing_number": "RT-0003",
        "name": "Sensor Calibration",
        "description": "Calibration process for DHT22 temperature/humidity sensors",
        "part_id": 2,
        "revision": 1,
        "status": "draft",
        "operations": [
            {
                "operation_number": 10,
                "operation_name": "Pre-heat Stabilization",
                "work_center": "WC-QC",
                "setup_time_min": 10,
                "run_time_min": 30,
                "cycle_time_min": 30,
            },
            {
                "operation_number": 20,
                "operation_name": "Calibration Measurement",
                "work_center": "WC-QC",
                "setup_time_min": 5,
                "run_time_min": 15,
                "cycle_time_min": 12,
                "estimated_cost": 3.50,
            },
            {
                "operation_number": 30,
                "operation_name": "Data Logging & Cert",
                "work_center": "WC-QC",
                "setup_time_min": 5,
                "run_time_min": 5,
                "cycle_time_min": 3,
            },
        ],
    },
]

SEED_PROCESS_PLANS = [
    {
        "plan_number": "PP-0001",
        "name": "Electronics Assembly - Standard",
        "description": "Standard process plan for PCB assembly operations",
        "part_family": "PCB Assembly",
        "revision": 3,
        "status": "active",
        "is_template": True,
        "steps": [
            {
                "step_number": 10,
                "step_name": "Receiving Inspection",
                "work_center": "WC-QC",
                "setup_time_min": 10,
                "run_time_min": 20,
                "inspection_required": True,
            },
            {
                "step_number": 20,
                "step_name": "Solder Paste Printing",
                "work_center": "WC-ASSY",
                "setup_time_min": 15,
                "run_time_min": 5,
            },
            {
                "step_number": 30,
                "step_name": "Component Placement",
                "work_center": "WC-ASSY",
                "setup_time_min": 20,
                "run_time_min": 15,
            },
            {
                "step_number": 40,
                "step_name": "Reflow Soldering",
                "work_center": "WC-ASSY",
                "setup_time_min": 15,
                "run_time_min": 8,
            },
            {
                "step_number": 50,
                "step_name": "Visual Inspection",
                "work_center": "WC-QC",
                "setup_time_min": 5,
                "run_time_min": 10,
                "inspection_required": True,
            },
            {
                "step_number": 60,
                "step_name": "Functional Testing",
                "work_center": "WC-QC",
                "setup_time_min": 10,
                "run_time_min": 15,
                "inspection_required": True,
            },
        ],
    },
    {
        "plan_number": "PP-0002",
        "name": "Mechanical Fabrication - Standard",
        "description": "Standard process plan for mechanical part fabrication",
        "part_family": "Machined Parts",
        "revision": 2,
        "status": "active",
        "is_template": True,
        "steps": [
            {
                "step_number": 10,
                "step_name": "Material Verification",
                "work_center": "WC-MACH",
                "setup_time_min": 5,
                "run_time_min": 10,
                "inspection_required": True,
            },
            {
                "step_number": 20,
                "step_name": "CNC Setup",
                "work_center": "WC-MACH",
                "setup_time_min": 30,
                "run_time_min": 0,
            },
            {
                "step_number": 30,
                "step_name": "Rough Cutting",
                "work_center": "WC-MACH",
                "setup_time_min": 10,
                "run_time_min": 30,
            },
            {
                "step_number": 40,
                "step_name": "Finish Cutting",
                "work_center": "WC-MACH",
                "setup_time_min": 10,
                "run_time_min": 25,
            },
            {
                "step_number": 50,
                "step_name": "Deburr & Clean",
                "work_center": "WC-MACH",
                "setup_time_min": 5,
                "run_time_min": 10,
            },
            {
                "step_number": 60,
                "step_name": "Dimensional Inspection",
                "work_center": "WC-QC",
                "setup_time_min": 10,
                "run_time_min": 15,
                "inspection_required": True,
            },
        ],
    },
    {
        "plan_number": "PP-0003",
        "name": "Power Supply Assembly",
        "description": "Process plan for 12V 5A power supply assembly",
        "part_family": "Power Supplies",
        "revision": 1,
        "status": "draft",
        "is_template": False,
        "steps": [
            {
                "step_number": 10,
                "step_name": "Transformer Mounting",
                "work_center": "WC-ASSY",
                "setup_time_min": 10,
                "run_time_min": 5,
            },
            {
                "step_number": 20,
                "step_name": "PCB Soldering",
                "work_center": "WC-ASSY",
                "setup_time_min": 15,
                "run_time_min": 12,
            },
            {
                "step_number": 30,
                "step_name": "Wire Harness Assembly",
                "work_center": "WC-ASSY",
                "setup_time_min": 5,
                "run_time_min": 8,
            },
            {
                "step_number": 40,
                "step_name": "Enclosure Assembly",
                "work_center": "WC-ASSY",
                "setup_time_min": 10,
                "run_time_min": 10,
            },
            {
                "step_number": 50,
                "step_name": "Safety Testing",
                "work_center": "WC-QC",
                "setup_time_min": 15,
                "run_time_min": 30,
                "inspection_required": True,
            },
        ],
    },
]

SEED_TIMESHEETS = [
    {
        "employee_id": "EMP-001",
        "work_center_id": 2,
        "entry_date": date(2024, 6, 1),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Assembly",
    },
    {
        "employee_id": "EMP-001",
        "work_center_id": 2,
        "entry_date": date(2024, 6, 2),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Assembly",
    },
    {
        "employee_id": "EMP-001",
        "work_center_id": 2,
        "entry_date": date(2024, 6, 3),
        "hours_worked": 9.5,
        "is_overtime": True,
        "activity_type": "Assembly",
    },
    {
        "employee_id": "EMP-002",
        "work_center_id": 1,
        "entry_date": date(2024, 6, 1),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Machining",
    },
    {
        "employee_id": "EMP-002",
        "work_center_id": 1,
        "entry_date": date(2024, 6, 2),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Machining",
    },
    {
        "employee_id": "EMP-002",
        "work_center_id": 1,
        "entry_date": date(2024, 6, 3),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Machining",
    },
    {
        "employee_id": "EMP-003",
        "work_center_id": 3,
        "entry_date": date(2024, 6, 1),
        "hours_worked": 7.5,
        "is_overtime": False,
        "activity_type": "Inspection",
    },
    {
        "employee_id": "EMP-003",
        "work_center_id": 3,
        "entry_date": date(2024, 6, 2),
        "hours_worked": 10.0,
        "is_overtime": True,
        "activity_type": "Inspection",
    },
    {
        "employee_id": "EMP-004",
        "work_center_id": 4,
        "entry_date": date(2024, 6, 1),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Painting",
    },
    {
        "employee_id": "EMP-004",
        "work_center_id": 4,
        "entry_date": date(2024, 6, 2),
        "hours_worked": 8.0,
        "is_overtime": False,
        "activity_type": "Painting",
    },
    {
        "employee_id": "EMP-004",
        "work_center_id": 4,
        "entry_date": date(2024, 6, 3),
        "hours_worked": 6.0,
        "is_overtime": False,
        "activity_type": "Training",
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        count = (
            await db.execute(text("SELECT COUNT(*) FROM service_bom_headers"))
        ).scalar()
        if count and count > 0:
            print(
                f"Enterprise tables already have data (service_bom_headers: {count}). Skipping seed."
            )
            return

        # 1. Service BOMs + Items
        for sbom in SEED_SERVICE_BOMS:
            items = sbom.pop("items")
            await db.execute(
                text(
                    "INSERT INTO service_bom_headers (bom_number, name, description, parent_product_pn, revision, status, created_by) "
                    "VALUES (:bn, :n, :d, :ppn, :rev, :st, 1)"
                ),
                {
                    "bn": sbom["bom_number"],
                    "n": sbom["name"],
                    "d": sbom["description"],
                    "ppn": sbom["parent_product_pn"],
                    "rev": sbom["revision"],
                    "st": sbom["status"],
                },
            )
            hdr = (
                (
                    await db.execute(
                        text(
                            "SELECT id FROM service_bom_headers WHERE bom_number = :bn"
                        ),
                        {"bn": sbom["bom_number"]},
                    )
                )
                .mappings()
                .first()
            )
            for item in items:
                await db.execute(
                    text(
                        "INSERT INTO service_bom_items (service_bom_id, part_pn, part_name, quantity, unit, service_type, interval_hours, interval_months, is_wear_part, is_consumable) "
                        "VALUES (:sid, :ppn, :pn, :qty, :u, :st, :ih, :im, :wp, :ic)"
                    ),
                    {
                        "sid": hdr["id"],
                        "ppn": item["part_pn"],
                        "pn": item["part_name"],
                        "qty": item["quantity"],
                        "u": item["unit"],
                        "st": item.get("service_type"),
                        "ih": item.get("interval_hours"),
                        "im": item.get("interval_months"),
                        "wp": item.get("is_wear_part", False),
                        "ic": item.get("is_consumable", False),
                    },
                )
        print(f"  - {len(SEED_SERVICE_BOMS)} service BOMs with items")

        # 2. Routing Tables + Operations
        for rt in SEED_ROUTINGS:
            ops = rt.pop("operations")
            await db.execute(
                text(
                    "INSERT INTO routing_tables (routing_number, name, description, part_id, revision, status, created_by) "
                    "VALUES (:rn, :n, :d, :pid, :rev, :st, 1)"
                ),
                {
                    "rn": rt["routing_number"],
                    "n": rt["name"],
                    "d": rt["description"],
                    "pid": rt["part_id"],
                    "rev": rt["revision"],
                    "st": rt["status"],
                },
            )
            rt_row = (
                (
                    await db.execute(
                        text(
                            "SELECT id FROM routing_tables WHERE routing_number = :rn"
                        ),
                        {"rn": rt["routing_number"]},
                    )
                )
                .mappings()
                .first()
            )
            for op in ops:
                await db.execute(
                    text(
                        "INSERT INTO routing_operations (routing_id, operation_number, operation_name, work_center, setup_time_min, run_time_min, cycle_time_min, estimated_cost) "
                        "VALUES (:rid, :on, :name, :wc, :st, :rt, :ct, :ec)"
                    ),
                    {
                        "rid": rt_row["id"],
                        "on": op["operation_number"],
                        "name": op["operation_name"],
                        "wc": op["work_center"],
                        "st": op["setup_time_min"],
                        "rt": op["run_time_min"],
                        "ct": op["cycle_time_min"],
                        "ec": op.get("estimated_cost"),
                    },
                )
        print(f"  - {len(SEED_ROUTINGS)} routing tables with operations")

        # 3. Process Plans + Steps
        for pp in SEED_PROCESS_PLANS:
            steps = pp.pop("steps")
            await db.execute(
                text(
                    "INSERT INTO process_plans (plan_number, name, description, part_family, revision, status, is_template, created_by) "
                    "VALUES (:pn, :n, :d, :pf, :rev, :st, :it, 1)"
                ),
                {
                    "pn": pp["plan_number"],
                    "n": pp["name"],
                    "d": pp["description"],
                    "pf": pp["part_family"],
                    "rev": pp["revision"],
                    "st": pp["status"],
                    "it": pp["is_template"],
                },
            )
            pp_row = (
                (
                    await db.execute(
                        text("SELECT id FROM process_plans WHERE plan_number = :pn"),
                        {"pn": pp["plan_number"]},
                    )
                )
                .mappings()
                .first()
            )
            for step in steps:
                await db.execute(
                    text(
                        "INSERT INTO process_plan_steps (process_plan_id, step_number, step_name, work_center, setup_time_min, run_time_min, inspection_required) "
                        "VALUES (:pid, :sn, :name, :wc, :st, :rt, :ir)"
                    ),
                    {
                        "pid": pp_row["id"],
                        "sn": step["step_number"],
                        "name": step["step_name"],
                        "wc": step["work_center"],
                        "st": step["setup_time_min"],
                        "rt": step["run_time_min"],
                        "ir": step.get("inspection_required", False),
                    },
                )
        print(f"  - {len(SEED_PROCESS_PLANS)} process plans with steps")

        # 4. Timesheet Entries
        for ts in SEED_TIMESHEETS:
            await db.execute(
                text(
                    "INSERT INTO timesheet_entries (employee_id, work_center_id, date, hours_worked, is_overtime, activity_type) "
                    "VALUES (:eid, :wcid, :d, :hw, :ot, :at)"
                ),
                {
                    "eid": ts["employee_id"],
                    "wcid": ts["work_center_id"],
                    "d": ts["entry_date"],
                    "hw": ts["hours_worked"],
                    "ot": ts["is_overtime"],
                    "at": ts["activity_type"],
                },
            )
        print(f"  - {len(SEED_TIMESHEETS)} timesheet entries")

        await db.commit()
        print("\nEnterprise data seeded successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
