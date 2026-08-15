import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../../api.js";

/**
 * Pins api.js's export/import wrappers to the shared contract (see CLUSTER
 * export-import-frontend). These previously didn't exist at all — the BOM
 * Editor's export menu was 100% client-side and BulkImportModal never
 * called a backend. This locks the request shapes so a slip (wrong method,
 * wrong body key, wrong path) fails loudly instead of silently 404ing.
 */
function res(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k] ?? null },
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)], { type: "application/octet-stream" }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api.export", () => {
  it("columns() hits GET /export/columns?entity=<entity>", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      res(200, { columns: [{ key: "pn", label: "Part Number", default: true }] }),
    );
    global.fetch = fetchMock;

    const result = await api.export.columns("bom");

    expect(result.columns).toEqual([{ key: "pn", label: "Part Number", default: true }]);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/export/columns?entity=bom");
  });

  it("templates.list/create/delete hit the contract's CRUD routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(200, [{ id: 1, name: "Default", entity: "bom", config: {} }]))
      .mockResolvedValueOnce(res(200, { id: 2, name: "New", entity: "bom", config: { format: "csv" } }))
      .mockResolvedValueOnce(res(204, null));
    global.fetch = fetchMock;

    const list = await api.export.templates.list("bom");
    expect(list).toEqual([{ id: 1, name: "Default", entity: "bom", config: {} }]);

    const created = await api.export.templates.create({ name: "New", entity: "bom", config: { format: "csv" } });
    expect(created.id).toBe(2);
    const [, createOpts] = fetchMock.mock.calls[1];
    expect(createOpts.method).toBe("POST");
    expect(JSON.parse(createOpts.body)).toEqual({ name: "New", entity: "bom", config: { format: "csv" } });

    await api.export.templates.delete(2);
    const [deleteUrl, deleteOpts] = fetchMock.mock.calls[2];
    expect(String(deleteUrl)).toContain("/export/templates/2");
    expect(deleteOpts.method).toBe("DELETE");
  });

  it("run() POSTs the full export body and returns {blob, filename} from Content-Disposition", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      res(200, "csv,data", { "Content-Disposition": 'attachment; filename="bom-42-20260809.csv"' }),
    );
    global.fetch = fetchMock;

    const body = {
      entity: "bom",
      format: "csv",
      bom_id: 42,
      columns: ["pn", "name"],
      indented: true,
      include_sub_assemblies: true,
      filters: null,
      currency: null,
      template_id: null,
    };
    const { blob, filename } = await api.export.run(body);

    expect(filename).toBe("bom-42-20260809.csv");
    expect(blob).toBeInstanceOf(Blob);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/export");
    expect(String(url)).not.toContain("/export/"); // exact /export, not a sub-path
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual(body);
  });

  it("run() throws with the server's error detail instead of returning a fake file", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(400, { detail: "unknown column: foo" }));
    global.fetch = fetchMock;

    await expect(
      api.export.run({ entity: "bom", format: "csv", bom_id: 1 }),
    ).rejects.toThrow(/unknown column/);
  });
});

describe("api.import", () => {
  it("upload() posts multipart file+entity to POST /import/upload", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      res(200, {
        job_id: "job-1",
        detected_columns: ["Part Number", "Qty"],
        sample_rows: [{ "Part Number": "R1", Qty: "10" }],
        row_count: 1,
      }),
    );
    global.fetch = fetchMock;

    const file = new File(["pn,qty\nR1,10"], "parts.csv", { type: "text/csv" });
    const result = await api.import.upload(file, "parts");

    expect(result.job_id).toBe("job-1");
    expect(result.detected_columns).toEqual(["Part Number", "Qty"]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/import/upload");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get("entity")).toBe("parts");
    expect(opts.body.get("file")).toBe(file);
  });

  it("mapping() validates without writing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      res(200, { valid: true, errors: [], will_create: 3, will_update: 1 }),
    );
    global.fetch = fetchMock;

    const result = await api.import.mapping("job-1", { "Part Number": "pn", Qty: "qty" });

    expect(result).toEqual({ valid: true, errors: [], will_create: 3, will_update: 1 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/import/job-1/mapping");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ mapping: { "Part Number": "pn", Qty: "qty" } });
  });

  it("commit() actually writes and reports created/updated/failed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      res(200, { created: 3, updated: 1, failed: 0, errors: [] }),
    );
    global.fetch = fetchMock;

    const result = await api.import.commit("job-1");

    expect(result).toEqual({ created: 3, updated: 1, failed: 0, errors: [] });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/import/job-1/commit");
    expect(opts.method).toBe("POST");
  });

  it("upload() surfaces a server error instead of a silent fake job id", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(500, { detail: "storage unavailable" }));
    global.fetch = fetchMock;

    const file = new File(["x"], "x.csv", { type: "text/csv" });
    await expect(api.import.upload(file, "parts")).rejects.toThrow(/storage unavailable/);
  });
});
