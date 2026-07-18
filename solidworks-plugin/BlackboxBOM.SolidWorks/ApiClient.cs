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

                return JsonConvert.DeserializeObject<BomSyncResult>(content, JsonSettings);
            }
            catch (Exception ex)
            {
                throw new Exception($"BOM sync failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Get BOM from Blackbox for current model
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
        /// Upload component images to Blackbox
        /// </summary>
        public void UploadImages(List<ComponentImage> images)
        {
            foreach (var image in images)
            {
                UploadSingleImage(image);
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
            try
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

                    if (!response.IsSuccessStatusCode)
                    {
                        throw new Exception($"Image upload failed for {image.PartNumber}");
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error uploading image: {ex.Message}");
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
        }

        /// <summary>
        /// Save the API URL/key (in-memory and to disk) without disturbing the other
        /// persisted settings (license key, auto-sync, etc.).
        /// </summary>
        public void SaveSettings(string baseUrl, string apiKey)
        {
            _baseUrl = baseUrl;
            _apiKey = apiKey;

            var settings = PluginSettings.Load();
            settings.ApiUrl = baseUrl;
            settings.ApiKey = apiKey;
            settings.Save();
        }

        #endregion

        #region Helper Methods

        private HttpResponseMessage PostAsync(string endpoint, object payload)
        {
            string json = JsonConvert.SerializeObject(payload, JsonSettings);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            return _httpClient.PostAsync($"{_baseUrl}{endpoint}", content).Result;
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
