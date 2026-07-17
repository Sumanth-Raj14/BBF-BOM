import random

from locust import HttpUser, between, task


class BrowsingUser(HttpUser):
    wait_time = between(1, 3)

    @task(10)
    def health_check(self):
        self.client.get("/api/v1/health")

    @task(8)
    def list_parts(self):
        self.client.get("/api/v1/parts/")

    @task(6)
    def list_po_orders(self):
        self.client.get("/api/v1/po-orders")

    @task(5)
    def po_stats(self):
        self.client.get("/api/v1/po-orders/stats")

    @task(4)
    def list_vendors(self):
        self.client.get("/api/v1/vendors/")

    @task(3)
    def analytics_dashboard(self):
        self.client.get("/api/v1/analytics/dashboard")

    @task(3)
    def analytics_categories(self):
        self.client.get("/api/v1/analytics/categories")

    @task(2)
    def analytics_vendor_scorecards(self):
        self.client.get("/api/v1/analytics/vendor-scorecards")

    @task(2)
    def metrics(self):
        self.client.get("/api/v1/metrics")

    @task(1)
    def list_bom_templates(self):
        self.client.get("/api/v1/bom-templates/")


class PowerUser(HttpUser):
    wait_time = between(0.5, 2)
    host = "http://localhost:8000"
    token = None

    def on_start(self):
        resp = self.client.post(
            "/api/v1/auth/login",
            data={"username": "admin@blackbox.com", "password": "admin123"},
        )
        if resp.status_code == 200:
            self.token = resp.json().get("access_token")

    def _auth_headers(self):
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(10)
    def list_parts(self):
        self.client.get("/api/v1/parts/", headers=self._auth_headers())

    @task(5)
    def create_part(self):
        self.client.post(
            "/api/v1/parts/",
            headers=self._auth_headers(),
            json={
                "pn": f"LOAD-{random.randint(10000, 99999)}",
                "name": f"Load Test Part {random.randint(1, 99999)}",
                "category": random.choice(["Electrical", "Mechanical", "Optical"]),
            },
        )

    @task(3)
    def update_part(self):
        resp = self.client.get("/api/v1/parts/", headers=self._auth_headers())
        if resp.status_code == 200:
            items = resp.json()
            if isinstance(items, list) and items:
                part_id = items[0].get("id")
                if part_id:
                    self.client.put(
                        f"/api/v1/parts/{part_id}",
                        headers=self._auth_headers(),
                        json={"name": f"Updated Part {random.randint(1, 99999)}"},
                    )

    @task(1)
    def delete_part(self):
        resp = self.client.post(
            "/api/v1/parts/",
            headers=self._auth_headers(),
            json={
                "pn": f"DEL-{random.randint(10000, 99999)}",
                "name": "Delete Me",
            },
        )
        if resp.status_code == 201:
            part_id = resp.json().get("id")
            if part_id:
                self.client.delete(f"/api/v1/parts/{part_id}", headers=self._auth_headers())

    @task(8)
    def list_po_orders(self):
        self.client.get("/api/v1/po-orders", headers=self._auth_headers())

    @task(5)
    def analytics_dashboard(self):
        self.client.get("/api/v1/analytics/dashboard", headers=self._auth_headers())


class AnalyticsUser(HttpUser):
    wait_time = between(1, 4)
    host = "http://localhost:8000"
    token = None

    def on_start(self):
        resp = self.client.post(
            "/api/v1/auth/login",
            data={"username": "admin@blackbox.com", "password": "admin123"},
        )
        if resp.status_code == 200:
            self.token = resp.json().get("access_token")

    def _auth_headers(self):
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(8)
    def analytics_dashboard(self):
        self.client.get("/api/v1/analytics/dashboard", headers=self._auth_headers())

    @task(6)
    def analytics_trends(self):
        self.client.get("/api/v1/analytics/trends", headers=self._auth_headers())

    @task(5)
    def analytics_categories(self):
        self.client.get("/api/v1/analytics/categories", headers=self._auth_headers())

    @task(4)
    def analytics_vendor_scorecards(self):
        self.client.get("/api/v1/analytics/vendor-scorecards", headers=self._auth_headers())

    @task(6)
    def po_stats(self):
        self.client.get("/api/v1/po-orders/stats", headers=self._auth_headers())

    @task(3)
    def metrics(self):
        self.client.get("/api/v1/metrics", headers=self._auth_headers())
