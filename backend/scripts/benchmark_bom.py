import asyncio
import time
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.models.tenant import Tenant
from app.models.user import User
from app.models.bom_template import BomTemplate
from app.models.part import Part
from app.models.bom_item import BomItem

async def run_benchmark():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with maker() as session:
        print("Starting Performance Benchmark for BOM API...")
        
        # 1. Setup Data
        result = await session.execute(select(Tenant).limit(1))
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(tenant_name="Benchmark Tenant", tenant_code="bench100k", plan="enterprise")
            session.add(tenant)
            await session.commit()
            await session.refresh(tenant)

        part = Part(tenantId=tenant.id, pn="BM-100K", name="Benchmark Root Part", category="Assembly", assembly=True)
        session.add(part)
        await session.commit()
        await session.refresh(part)

        user = User(tenantId=tenant.id, email="bench@test.com", username="bench100k", hashedPassword="pw", isActive=True)
        session.add(user)
        await session.commit()
        await session.refresh(user)

        template = BomTemplate(tenantId=tenant.id, name="Benchmark Template 100K", createdById=user.id)
        session.add(template)
        await session.commit()
        await session.refresh(template)

        print(f"Created Tenant {tenant.id}, Part {part.id}, BomTemplate {template.id}")

        # 2. Insert 100,000 rows
        print("Generating 100,000 BOM Items in memory...")
        batch_size = 10000
        items_to_insert = []
        for i in range(100000):
            items_to_insert.append(
                BomItem(
                    tenantId=tenant.id,
                    bomTemplateId=template.id,
                    partId=part.id,
                    quantity=1,
                    referenceDesignator=f"R{i}",
                    sortOrder=i
                )
            )

        print("Bulk inserting items into PostgreSQL...")
        start_time = time.time()
        for i in range(0, len(items_to_insert), batch_size):
            batch = items_to_insert[i:i + batch_size]
            session.add_all(batch)
            await session.commit()
            print(f"  Inserted {i + len(batch)} rows...")
            
        insert_time = time.time() - start_time
        print(f"Insert complete in {insert_time:.2f} seconds.")

        # 3. Read Benchmark
        print("Testing read performance...")
        start_time = time.time()
        
        result = await session.execute(
            select(BomItem).where(BomItem.bomTemplateId == template.id)
        )
        fetched_items = result.scalars().all()
        
        read_time = time.time() - start_time
        print(f"Read {len(fetched_items)} items in {read_time:.2f} seconds.")

        # 4. Cleanup
        print("Cleaning up benchmark data...")
        await session.delete(template)
        await session.delete(part)
        await session.delete(tenant)
        await session.commit()
        print("Cleanup complete.")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
