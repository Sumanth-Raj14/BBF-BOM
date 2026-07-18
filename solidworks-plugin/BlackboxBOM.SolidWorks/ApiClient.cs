using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// API client for communicating with Blackbox BOM backend
    /// Handles bidirectional sync, authentication, and data transfer
    /// </summary>
    public class ApiClient : IDisposable
    {
        // The backend (FastAPI/Pydantic) uses snake_case JSON field names throughout
        // (session_id, items_added, part_number, ...). The response DTOs below are
        // plain PascalCase C# classes with no per-property [JsonProperty] attributes,
        // so without this the default (exact-name) matching would silently leave
        // every multi-word property at its default value (0/null) on deserialize.
        // Applying a snake_case naming strategy to both serialize and deserialize
        // fixes that globally. This is safe for the outgoing anonymous payloads too
        // (their properties are already hand-written in snake_case, e.g.
        // `component_name`) since converting snake_case to snake_case is a no-op.
        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver { NamingStrategy = new SnakeCaseNamingStrategy() },
            NullValueHandling = NullValueHandling.Ignore
        };

        private readonly HttpClient _httpClient;
        private string _baseUrl;
        private string _apiKey;
        private string _sessionId;
        private bool _isAuthenticated;

        public string BaseUrl => _baseUrl;

        // This is the constructor the add-in actually uses (BlackboxBomAddin.ConnectToSW ->
        // `new ApiClient()`). It never called Authenticate() (that only happened on the
        // 2-arg constructor below, which nothing in the add-in calls), so every request this
        // client made went out with no credentials at all: no `X-API-Key`, no `Authorization`
        // header. The backend's auth dependency (app.core.deps.get_current_user) rejected
        // every one of them with 401, and the (pre-existing) unconditional
        // JsonConvert.DeserializeObject on the response body turned that 401 JSON
        // (`{"detail": "..."}`, none of whose fields match the DTOs below) into a
        // default-valued "success" DTO — i.e. a silent no-op that reported "Sync complete!
        // 0 items added, 0 updated." LoadSettings() below now also attaches the saved API key
        // as an `X-API-Key` header (see ApplyAuthHeader) so this client is actually
        // authenticated from construction on, without an extra network round-trip.
        public ApiClient()
        {
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromMinutes(5);
            LoadSettings();
        }

        public ApiClient(string baseUrl, string apiKey)
        {
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromMinutes(5);
            _baseUrl = baseUrl;
            _apiKey = apiKey;
            ApplyAuthHeader();
            Authenticate();
        }

        #region Authentication

        /// <summary>
        /// Authenticate with Blackbox BOM API
        /// </summary>
        public bool Authenticate()
        {
            try
            {
                var authRequest = new
                {
                    api_key = _apiKey,
                    client_type = "solidworks_addin",
                    client_version = "1.0.0"
                };

                var response = PostAsync("/api/v1/auth/plugin-login", authRequest).Result;
                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    var result = JObject.Parse(content);

                    _sessionId = result["session_id"]?.ToString();
                    _isAuthenticated = true;

                    _httpClient.DefaultRequestHeaders.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _sessionId);

                    return true;
                }

                _isAuthenticated = false;
                return false;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Authentication failed: {ex.Message}");
                _isAuthenticated = false;
                return false;
            }
        }

        /// <summary>
        /// Check if API is available
        /// </summary>
        public bool IsApiAvailable()
        {
            try
            {
                var response = _httpClient.GetAsync($"{_baseUrl}/api/v1/health").Result;
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        #endregion

        #region BOM Operations

        /// <summary>
        /// Upload BOM to Blackbox
        /// </summary>
        public BomUploadResult UploadBom(BomData bom)
        {
            try
            {
                var payload = new
                {
                    source_file = bom.SourceFile,
                    model_type = bom.ModelType.ToString(),
                    extracted_at = bom.ExtractedAt,
                    total_components = bom.TotalComponents,
                    total_unique_parts = bom.TotalUniqueParts,
                    items = bom.Items.Select(i => new
                    {
                        component_name = i.ComponentName,
                        part_number = i.PartNumber,
                        description = i.Description,
                        quantity = i.Quantity,
                        level = i.Level,
                        is_assembly = i.IsAssembly,
                        material = i.Material,
                        weight = i.Weight,
                        vendor = i.Vendor,
                        cost = i.Cost,
                        configuration = i.ConfigurationName,
                        custom_properties = i.CustomProperties,
                        mass_properties = i.MassProperties != null ? new
                        {
                            mass = i.MassProperties.Mass,
                            volume = i.MassProperties.Volume,
                            surface_area = i.MassProperties.SurfaceArea
                        } : null,
                        bounding_box = i.BoundingBox != null ? new
                        {
                            width = i.BoundingBox.Width,
                            height = i.BoundingBox.Height,
                            depth = i.BoundingBox.Depth
                        } : null,
                        features = i.Features?.Select(f => new
                        {
                            name = f.Name,
                            type = f.Type,
                            parameters = f.Parameters,
                            dimensions = f.Dimensions?.Select(d => new
                            {
                                name = d.Name,
                                value = d.Value
                            })
                        })
                    })
                };

                var response = PostAsync("/api/v1/solidworks/sync", payload).Result;
                var content = response.Content.ReadAsStringAsync().Result;

                // Must check this BEFORE deserializing: a 401/403 body (`{"detail": "..."}`)
                // does not match BomUploadResult's fields, so deserializing it anyway used to
                // silently produce a default-valued (all-zero, Success=false-but-ignored) DTO
                // instead of a visible error.
                EnsureSuccess(response, content);

                return JsonConvert.DeserializeObject<BomUploadResult>(content, JsonSettings);
            }
            catch (Exception ex)
            {
                throw new Exception($"BOM upload failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Sync BOM with Blackbox (bidirectional)
        /// </summary>
        public BomSyncResult SyncBom(BomData bom)
        {
            try
            {
                var payload = new
                {
                    source_file = bom.SourceFile,
                    items = bom.Items.Select(i => new
                    {
                        // component_name is REQUIRED by the backend's BomItemRequest
                        // schema (POST /api/v1/solidworks/apply-sync) — omitting it
                        // (as this used to) makes every call 422.
                        component_name = i.ComponentName,
                        part_number = i.PartNumber,
                        quantity = i.Quantity,
                        description = i.Description
                    }).ToList()
                };

                var response = PostAsync("/api/v1/solidworks/apply-sync", payload).Result;
                var content = response.Content.ReadAsStringAsync().Result;

                // See the matching comment in UploadBom() above — this is the call behind
                // the "Sync to Blackbox" button, i.e. exactly the one that used to report a
                // fake "Sync complete! 0 items added, 0 updated" on an unauthenticated 401.
                EnsureSuccess(response, content);

                return JsonConvert.DeserializeObject<BomSyncResult>(content, JsonSettings);
            }
            catch (Exception ex)
            {
                throw new Exception($"BOM sync failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Get BOM from Blackbox for current model.
        ///
        /// NOTE (dead code, not fixed): nothing in this project calls GetBom() today. If it
        /// is ever wired up, deserializing the backend's response into <see cref="BomData"/>
        /// will throw — the backend's GET /api/v1/solidworks/bom returns `model_type` as a
        /// free-text string (Document.fileType, e.g. "Assembly"/"Part"/"cad"), while
        /// BomData.ModelType is typed as the SolidWorks `swDocumentTypes_e` enum, whose
        /// member names (swDocASSEMBLY, swDocPART, ...) don't match that string — Newtonsoft
        /// has no member to bind it to and throws a JsonSerializationException. Fixing this
        /// for real needs a decision on the wire format (e.g. change BomData.ModelType to a
        /// string, or have the backend emit the enum member name) that's out of scope for
        /// this pass; flagging it here so it isn't silently "fixed" on a guess.
        /// </summary>
        public BomData GetBom(string sourceFile)
        {
            try
            {
                var response = _httpClient.GetAsync($"{_baseUrl}/api/v1/solidworks/bom?file={Uri.EscapeDataString(sourceFile)}").Result;

                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    return JsonConvert.DeserializeObject<BomData>(content, JsonSettings);
                }

                return null;
            }
            catch (Exception ex)
            {
                throw new Exception($"Get BOM failed: {ex.Message}");
            }
        }

        #endregion

        #region Image Operations

        /// <summary>
        /// Upload every extracted component image. Unlike the old version of this method,
        /// a failure (including a 401/403 from missing/invalid auth) is no longer swallowed
        /// silently into a Debug.WriteLine — every failure is collected and surfaced to the
        /// caller as a real exception, so "Extract Images" can no longer report
        /// "Extracted N component images" when none of them actually made it to the server.
        /// </summary>
        public void UploadImages(List<ComponentImage> images)
        {
            var failures = new List<string>();

            foreach (var image in images)
            {
                try
                {
                    UploadSingleImage(image);
                }
                catch (Exception ex)
                {
                    failures.Add($"{image.PartNumber ?? "(unknown part)"}: {ex.Message}");
                }
            }

            if (failures.Count > 0)
            {
                throw new Exception(
                    $"{failures.Count} of {images.Count} image upload(s) failed: {string.Join("; ", failures)}");
            }
        }

        /// <summary>
        /// Upload single component image.
        ///
        /// NOTE: the backend's POST /api/v1/solidworks/images endpoint takes
        /// multipart/form-data (`part_number` as a form field, `file` as a single
        /// upload) — NOT a JSON body. It also only stores one image per part today,
        /// not the full set of thumbnail sizes/standard views the plugin extracts.
        /// We send the best available single image (isometric view, falling back to
        /// the largest thumbnail) so this call matches what the backend actually
        /// accepts. Uploading the full multi-size/multi-view set will need a backend
        /// change (out of scope for this pass — see BUILD_AND_TEST_CHECKLIST.md).
        /// </summary>
        private void UploadSingleImage(ComponentImage image)
        {
            byte[] fileBytes = image.IsometricView ?? image.Thumbnail256 ?? image.Thumbnail128 ?? image.FrontView;

            using (var form = new MultipartFormDataContent())
            {
                form.Add(new StringContent(image.PartNumber ?? ""), "part_number");

                if (fileBytes != null)
                {
                    var fileContent = new ByteArrayContent(fileBytes);
                    fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
                    form.Add(fileContent, "file", $"{image.PartNumber ?? "component"}.png");
                }

                var response = _httpClient.PostAsync($"{_baseUrl}/api/v1/solidworks/images", form).Result;
                string content;
                try
                {
                    content = response.Content.ReadAsStringAsync().Result;
                }
                catch
                {
                    content = "";
                }

                EnsureSuccess(response, content);
            }
        }

        /// <summary>
        /// Get image for component from Blackbox
        /// </summary>
        public ComponentImage GetComponentImage(string partNumber)
        {
            try
            {
                var response = _httpClient.GetAsync($"{_baseUrl}/api/v1/solidworks/images/{Uri.EscapeDataString(partNumber)}").Result;

                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    return JsonConvert.DeserializeObject<ComponentImage>(content, JsonSettings);
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        #endregion

        #region Real-time Sync Operations

        /// <summary>
        /// Register for real-time updates
        /// </summary>
        public void RegisterForUpdates(string sessionId)
        {
            _ = StartListeningForUpdates(sessionId);
        }

        /// <summary>
        /// Listen for updates via SignalR or polling
        /// </summary>
        private async Task StartListeningForUpdates(string sessionId)
        {
            while (_isAuthenticated)
            {
                try
                {
                    await Task.Delay(5000); // Poll every 5 seconds

                    var response = await _httpClient.GetAsync($"{_baseUrl}/api/v1/solidworks/updates?session={sessionId}");
                    if (response.IsSuccessStatusCode)
                    {
                        var content = await response.Content.ReadAsStringAsync();
                        var updates = JsonConvert.DeserializeObject<List<UpdateNotification>>(content, JsonSettings);

                        foreach (var update in updates)
                        {
                            OnUpdateReceived?.Invoke(this, new UpdateEventArgs(update));
                        }
                    }
                }
                catch
                {
                    // Retry on error
                    await Task.Delay(10000);
                }
            }
        }

        /// <summary>
        /// Send real-time notification to other clients
        /// </summary>
        public void SendUpdate(UpdateNotification update)
        {
            try
            {
                PostAsync("/api/v1/solidworks/notify", update).Wait();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error sending update: {ex.Message}");
            }
        }

        /// <summary>
        /// Event handler for received updates
        /// </summary>
        public event EventHandler<UpdateEventArgs> OnUpdateReceived;

        #endregion

        #region Changes and Apply Operations

        /// <summary>
        /// Get pending changes from Blackbox
        /// </summary>
        public List<PendingChange> GetPendingChanges(string modelName)
        {
            try
            {
                var response = _httpClient.GetAsync(
                    $"{_baseUrl}/api/v1/solidworks/changes?model={Uri.EscapeDataString(modelName)}").Result;

                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    return JsonConvert.DeserializeObject<List<PendingChange>>(content, JsonSettings);
                }

                return new List<PendingChange>();
            }
            catch
            {
                return new List<PendingChange>();
            }
        }

        /// <summary>
        /// Apply changes from Blackbox to model.
        ///
        /// NOTE: the backend route is `POST /api/v1/solidworks/apply-changes?model=...`
        /// with the *raw array* of changes as the request body (FastAPI treats the
        /// plain `model: str` parameter as a query param and the sole `list[...]`
        /// parameter as the entire body — there is no wrapping object). Sending
        /// `{ model_name, changes }` as this used to would 422.
        /// </summary>
        public ApplyResult ApplyChanges(string modelName, List<PendingChange> changes)
        {
            try
            {
                string endpoint = $"/api/v1/solidworks/apply-changes?model={Uri.EscapeDataString(modelName)}";
                var response = PostAsync(endpoint, changes).Result;
                var content = response.Content.ReadAsStringAsync().Result;

                EnsureSuccess(response, content);

                return JsonConvert.DeserializeObject<ApplyResult>(content, JsonSettings);
            }
            catch (Exception ex)
            {
                throw new Exception($"Apply changes failed: {ex.Message}");
            }
        }

        #endregion

        #region License Operations

        /// <summary>
        /// Verify license
        /// </summary>
        public LicenseInfo VerifyLicense(string machineId)
        {
            try
            {
                var response = _httpClient.GetAsync(
                    $"{_baseUrl}/api/v1/solidworks/license/verify?machine={Uri.EscapeDataString(machineId)}").Result;

                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    return JsonConvert.DeserializeObject<LicenseInfo>(content, JsonSettings);
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Activate license
        /// </summary>
        public bool ActivateLicense(string licenseKey, string machineId)
        {
            try
            {
                var payload = new
                {
                    license_key = licenseKey,
                    machine_id = machineId
                };

                var response = PostAsync("/api/v1/solidworks/license/activate", payload).Result;
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        #endregion

        #region Vault Operations

        /// <summary>
        /// Get vault stats
        /// </summary>
        public VaultStats GetVaultStats()
        {
            try
            {
                var response = _httpClient.GetAsync($"{_baseUrl}/api/v1/solidworks/vault/stats").Result;
                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    return JsonConvert.DeserializeObject<VaultStats>(content, JsonSettings);
                }
                return null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Get vault tree
        /// </summary>
        public List<VaultNode> GetVaultTree()
        {
            try
            {
                var response = _httpClient.GetAsync($"{_baseUrl}/api/v1/solidworks/vault/tree").Result;
                if (response.IsSuccessStatusCode)
                {
                    var content = response.Content.ReadAsStringAsync().Result;
                    return JsonConvert.DeserializeObject<List<VaultNode>>(content, JsonSettings);
                }
                return new List<VaultNode>();
            }
            catch
            {
                return new List<VaultNode>();
            }
        }

        #endregion

        #region Settings Management

        /// <summary>
        /// Load settings from the plugin's single settings file
        /// (%LOCALAPPDATA%\BlackboxBOM\settings.json via <see cref="PluginSettings"/>).
        ///
        /// This used to read/write a separate "config.json" here while
        /// <see cref="SettingsForm"/>'s Save button wrote "settings.json" via
        /// <see cref="PluginSettings"/> — two files, out of sync, so clicking "Save
        /// Settings" would not actually change what ApiClient used until restart.
        /// Both now go through the same file.
        /// </summary>
        private void LoadSettings()
        {
            try
            {
                var settings = PluginSettings.Load();
                _baseUrl = string.IsNullOrWhiteSpace(settings.ApiUrl) ? "http://localhost:8000" : settings.ApiUrl;
                _apiKey = settings.ApiKey ?? "";
            }
            catch
            {
                _baseUrl = "http://localhost:8000";
                _apiKey = "";
            }

            ApplyAuthHeader();
        }

        /// <summary>
        /// Save the API URL/key (in-memory and to disk) without disturbing the other
        /// persisted settings (license key, auto-sync, etc.).
        /// </summary>
        public void SaveSettings(string baseUrl, string apiKey)
        {
            _baseUrl = baseUrl;
            _apiKey = apiKey;
            ApplyAuthHeader();

            var settings = PluginSettings.Load();
            settings.ApiUrl = baseUrl;
            settings.ApiKey = apiKey;
            settings.Save();
        }

        #endregion

        #region Helper Methods

        /// <summary>
        /// Attach the saved API key as an `X-API-Key` header on every request this client
        /// makes from now on. This is the header the backend's auth dependency
        /// (app.core.deps._authenticate_by_api_key) checks FIRST, ahead of any Bearer
        /// token, so this alone authenticates every call the add-in actually makes (the
        /// default-constructor client — see the comment on the parameterless constructor
        /// above). Called from LoadSettings() (constructor/startup) and SaveSettings()
        /// (Settings dialog "Save"/"Test Connection") so the header always reflects the
        /// current key, never a stale or missing one.
        /// </summary>
        private void ApplyAuthHeader()
        {
            _httpClient.DefaultRequestHeaders.Remove("X-API-Key");
            if (!string.IsNullOrWhiteSpace(_apiKey))
            {
                _httpClient.DefaultRequestHeaders.Add("X-API-Key", _apiKey);
            }
        }

        /// <summary>
        /// Throw a real, descriptive exception for any non-2xx response instead of letting
        /// the caller deserialize an error body (e.g. FastAPI's `{"detail": "..."}`) into a
        /// success DTO, which used to silently produce default-valued (0 items / false)
        /// "success" results — most visibly "Sync complete! 0 items added, 0 updated" on an
        /// unauthenticated 401. Call this AFTER reading the response body (pass the already-
        /// read string) and BEFORE calling JsonConvert.DeserializeObject on it.
        /// </summary>
        private static void EnsureSuccess(HttpResponseMessage response, string content)
        {
            if (response.IsSuccessStatusCode) return;

            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized ||
                response.StatusCode == System.Net.HttpStatusCode.Forbidden)
            {
                throw new Exception(
                    $"Authentication failed - check API key/URL in Settings (HTTP {(int)response.StatusCode}).");
            }

            throw new Exception(
                $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}" +
                (string.IsNullOrWhiteSpace(content) ? "" : $": {content}"));
        }

        // NOTE (pre-existing bug, unrelated to auth, fixed here because it sits directly in
        // every method this pass touches): this used to return a plain HttpResponseMessage
        // (already resolved via an internal `.Result`), but every call site — Authenticate(),
        // UploadBom(), SyncBom(), SendUpdate(), ApplyChanges(), ActivateLicense() — calls
        // `.Result`/`.Wait()` on its return value as though it were a Task. That is
        // `HttpResponseMessage does not contain a definition for 'Result'/'Wait'` (CS1061) —
        // an assembly-independent C# error that has nothing to do with SolidWorks interop
        // and would block a real build the moment this file actually gets compiled (which
        // the "official" build path never reaches today, since it fails earlier at the
        // interop-assembly guard — see BUILD_AND_TEST_CHECKLIST.md). Confirmed present,
        // unchanged, at the pre-existing base commit via a real Roslyn compile (the NuGet
        // interop diagnostic build) before this pass touched this file. Returning
        // Task<HttpResponseMessage> instead makes every existing call site's `.Result`/
        // `.Wait()` usage correct, with no call-site changes needed.
        //
        // Deliberately NOT `async`/`await` here: every call site above blocks synchronously
        // on the returned Task via `.Result`/`.Wait()`, and several of them run on the
        // SolidWorks main STA thread, which BlackboxBomAddin.ConnectToSW leaves carrying a
        // WindowsFormsSynchronizationContext (installed when it forces creation of
        // BomPanel's TaskpaneView handle). An `async` method's `await _httpClient.PostAsync(...)`
        // would capture that context and try to resume the continuation on the same thread
        // that `.Result`/`.Wait()` is blocking — a classic sync-over-async deadlock. Returning
        // the HttpClient task directly (no async state machine, nothing to resume on a
        // captured context) avoids the deadlock entirely while keeping every call site's
        // synchronous usage safe.
        private Task<HttpResponseMessage> PostAsync(string endpoint, object payload)
        {
            string json = JsonConvert.SerializeObject(payload, JsonSettings);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            return _httpClient.PostAsync($"{_baseUrl}{endpoint}", content);
        }

        #endregion

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }

    #region Data Transfer Objects

    public class BomUploadResult
    {
        public string SessionId { get; set; }
        public int ItemsAdded { get; set; }
        public int ItemsUpdated { get; set; }
        public bool Success { get; set; }
        public string Message { get; set; }
    }

    public class BomSyncResult
    {
        public int ItemsAdded { get; set; }
        public int ItemsUpdated { get; set; }
        public int ItemsDeleted { get; set; }
        public List<string> Conflicts { get; set; }
        public bool Success { get; set; }
    }

    public class UpdateNotification
    {
        public string Type { get; set; }
        public string ModelName { get; set; }
        public string UserName { get; set; }
        public DateTime Timestamp { get; set; }
        public object Data { get; set; }
    }

    public class UpdateEventArgs : EventArgs
    {
        public UpdateNotification Update { get; }

        public UpdateEventArgs(UpdateNotification update)
        {
            Update = update;
        }
    }

    public class PendingChange
    {
        public string ChangeId { get; set; }
        public string Type { get; set; }
        public string PartNumber { get; set; }
        public string Property { get; set; }
        public object OldValue { get; set; }
        public object NewValue { get; set; }
        public string UserName { get; set; }
        public DateTime Timestamp { get; set; }
        public string Reason { get; set; }
    }

    public class ApplyResult
    {
        public bool Success { get; set; }
        public int ChangesApplied { get; set; }
        public List<string> Errors { get; set; }
    }

    public class LicenseInfo
    {
        public string LicenseKey { get; set; }
        public string LicenseType { get; set; }
        public bool IsValid { get; set; }
        public DateTime ExpiryDate { get; set; }
        public int MaxUsers { get; set; }
        public int CurrentUsers { get; set; }
        public List<string> Features { get; set; }
    }

    public class VaultStats
    {
        public int TotalFiles { get; set; }
        public int TotalParts { get; set; }
        public int TotalAssemblies { get; set; }
        public int TotalDrawings { get; set; }
        public double TotalSizeMB { get; set; }
        public DateTime LastSynced { get; set; }
    }

    public class VaultNode
    {
        public string Name { get; set; }
        public string Path { get; set; }
        public string Type { get; set; }
        public long Size { get; set; }
        public DateTime Modified { get; set; }
        public string ModifiedBy { get; set; }
        public List<VaultNode> Children { get; set; }
    }

    #endregion
}
