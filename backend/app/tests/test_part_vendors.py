import pytest


@pytest.mark.asyncio
async def test_part_vendors_list(client, auth_headers):
    resp = await client.get("/api/v1/part-vendors/", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_part_vendors_create(client, auth_headers):
    resp = await client.post("/api/v1/part-vendors/", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (200, 201, 422)


@pytest.mark.asyncio
async def test_part_vendors_delete_not_found(client, auth_headers):
    # There is no GET-by-id endpoint (GET /{id} -> 405). DELETE /{link_id} is the
    # id-taking route; it raises 404 for a missing link.
    resp = await client.delete("/api/v1/part-vendors/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_part_vendors_without_auth(client):
    resp = await client.get("/api/v1/part-vendors/")
    assert resp.status_code in (401, 403)


# ── Approved Vendor List ────────────────────────────────────────────────────
# A buyer must be able to hold several sources against one part, each with the
# VENDOR's own part number, exactly one of them flagged preferred, and the rest
# ordered by avlRank.


async def _avl_fixture(client, auth_headers, tag):
    """One part + three linked vendors. Returns (partId, [linkId, ...])."""
    part = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": f"AVL-{tag}", "name": f"AVL Part {tag}"},
    )
    assert part.status_code == 201, part.text
    part_id = part.json()["id"]

    links = []
    # rank 1 is the preferred source; 2 and 3 are the ranked alternates.
    for i, (name, preferred, rank) in enumerate(
        [("Primary", True, 1), ("Second", False, 2), ("Third", False, 3)]
    ):
        vendor = await client.post(
            "/api/v1/vendors/",
            headers=auth_headers,
            json={"name": f"{name} {tag}", "country": "US"},
        )
        assert vendor.status_code == 201, vendor.text
        link = await client.post(
            "/api/v1/part-vendors/",
            headers=auth_headers,
            json={
                "partId": part_id,
                "vendorId": vendor.json()["id"],
                "isPreferred": preferred,
                "isAlternate": not preferred,
                "avlRank": rank,
                "vendorPn": f"MPN-{tag}-{i}",
                "vendorLead": 10 + i,
                "vendorMoq": 100 * (i + 1),
            },
        )
        assert link.status_code == 201, link.text
        links.append(link.json()["id"])
    return part_id, links


@pytest.mark.asyncio
async def test_avl_three_sources_one_preferred_ranked(client, auth_headers):
    part_id, links = await _avl_fixture(client, auth_headers, "A")

    resp = await client.get(f"/api/v1/part-vendors/?partId={part_id}", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 3

    # Exactly one preferred source.
    assert [i["isPreferred"] for i in items].count(True) == 1

    # Preferred first, then ascending avlRank.
    assert items[0]["isPreferred"] is True
    assert [i["avlRank"] for i in items] == [1, 2, 3]
    assert [i["id"] for i in items] == links

    # Each source carries the VENDOR's own part number plus its own terms.
    assert [i["vendorPn"] for i in items] == ["MPN-A-0", "MPN-A-1", "MPN-A-2"]
    assert [i["vendorLead"] for i in items] == [10, 11, 12]
    assert [i["vendorMoq"] for i in items] == [100, 200, 300]
    assert all(i["vendorName"] for i in items)


@pytest.mark.asyncio
async def test_avl_changing_preferred_moves_the_flag(client, auth_headers):
    part_id, links = await _avl_fixture(client, auth_headers, "B")

    # Promote the third source. The flag must MOVE, not duplicate.
    resp = await client.put(
        f"/api/v1/part-vendors/{links[2]}",
        headers=auth_headers,
        json={"isPreferred": True, "avlRank": 1},
    )
    assert resp.status_code == 200
    assert resp.json()["isPreferred"] is True

    items = (
        await client.get(f"/api/v1/part-vendors/?partId={part_id}", headers=auth_headers)
    ).json()["items"]
    preferred = [i for i in items if i["isPreferred"]]
    assert len(preferred) == 1, f"expected one preferred source, got {len(preferred)}"
    assert preferred[0]["id"] == links[2]
    # ...and the newly preferred source now sorts first.
    assert items[0]["id"] == links[2]


@pytest.mark.asyncio
async def test_avl_unranked_source_sorts_last(client, auth_headers):
    """avlRank is nullable; a NULL must sort after ranked peers on both
    Postgres and SQLite, which disagree on default NULL placement."""
    part_id, links = await _avl_fixture(client, auth_headers, "C")

    vendor = await client.post(
        "/api/v1/vendors/", headers=auth_headers, json={"name": "Unranked C"}
    )
    link = await client.post(
        "/api/v1/part-vendors/",
        headers=auth_headers,
        json={"partId": part_id, "vendorId": vendor.json()["id"]},
    )
    assert link.status_code == 201, link.text

    items = (
        await client.get(f"/api/v1/part-vendors/?partId={part_id}", headers=auth_headers)
    ).json()["items"]
    assert items[-1]["id"] == link.json()["id"]
    assert items[-1]["avlRank"] is None
