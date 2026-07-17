"""Locust load testing for Blackbox BOM API.

Usage:
    locust -f tests/load/locustfile.py --host=http://localhost:8000
"""

import random

from locust import HttpUser, between, task


class BOMUser(HttpUser):
    wait_time = between(1, 5)

    def on_start(self):
        resp = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": "admin@blackbox-bom.com",
                "password": "admin123",
            },
        )
        if resp.status_code == 200:
            data = resp.json()
            self.token = data.get("access_token", "")
            self.client.cookies.update(resp.cookies)

    @task(3)
    def list_parts(self):
        self.client.get("/api/v1/parts?page=1&per_page=50")

    @task(2)
    def search_parts(self):
        q = random.choice(["resistor", "capacitor", "IC", "connector", "PCB"])
        self.client.get(f"/api/v1/parts/search?q={q}")

    @task(1)
    def get_part_detail(self):
        self.client.get("/api/v1/parts/1")

    @task(1)
    def get_bom_explosion(self):
        self.client.get("/api/v1/boms/1/explode")

    @task(1)
    def get_cost_rollup(self):
        self.client.get("/api/v1/boms/1/cost-rollup")

    @task(1)
    def health_check(self):
        self.client.get("/api/v1/health")

    @task(1)
    def list_projects(self):
        self.client.get("/api/v1/projects?page=1&per_page=20")

    @task(1)
    def list_vendors(self):
        self.client.get("/api/v1/vendors?page=1&per_page=20")
