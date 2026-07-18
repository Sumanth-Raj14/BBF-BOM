using System;
using System.Runtime.InteropServices;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swpublished;
using System.Windows.Forms;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Blackbox BOM SolidWorks COM Add-in
    /// Extracts parts, details, images, and quantities from SolidWorks assemblies
    /// </summary>
    [Guid("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")]
    [ComVisible(true)]
    [SwAddin(
        Description = "Blackbox BOM Management Integration for SolidWorks",
        Title = "Blackbox BOM",
        LoadAtStartup = true
    )]
    public class BlackboxBomAddin : ISwAddin
    {
        private ISldWorks _swApp;
        private int _addinId;
        private ITaskpaneView _taskpaneView;
        private BomPanel _bomPanel;
        private ApiClient _apiClient;
        private EventWatcher _eventWatcher;

        public ISldWorks SwApp => _swApp;

        #region ISwAddin Implementation

        public bool ConnectToSW(object thisSW, int cookie)
        {
            _swApp = (ISldWorks)thisSW;
            _addinId = cookie;

            // Register with SolidWorks
            _swApp.SetAddinCallbackInfo(0, this, _addinId);

            // Initialize API client
            _apiClient = new ApiClient();

            // Create task pane UI
            CreateTaskPane();

            // Setup event watchers for real-time sync
            SetupEventWatchers();

            // Register menu items
            RegisterMenuItems();

            return true;
        }

        public bool DisconnectFromSW()
        {
            RemoveTaskPane();
            UnregisterMenuItems();
            CleanupEventWatchers();

            _swApp = null;
            GC.Collect();
            GC.WaitForPendingFinalizers();
            return true;
        }

        #endregion

        #region Task Pane (Embedded Viewer)

        private void CreateTaskPane()
        {
            try
            {
                _taskpaneView = _swApp.CreateTaskpaneView3("", "Blackbox BOM");
                _bomPanel = new BomPanel(_swApp, _apiClient);
                _taskpaneView.DisplayWindowFromHandlex64(_bomPanel.Handle.ToInt64());
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to create task pane: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RemoveTaskPane()
        {
            _bomPanel?.Dispose();
            _taskpaneView?.DeleteView();
            Marshal.ReleaseComObject(_taskpaneView);
        }

        #endregion

        #region Menu Items

        private void RegisterMenuItems()
        {
            ICommandManager cmdMgr = _swApp.GetCommandManager(_addinId);
            int cmdErr = 0;

            // Main menu group
            ICommandGroup cmdGroup = cmdMgr.CreateCommandGroup2(1, "Blackbox BOM", "Blackbox BOM Integration", "", -1, true, ref cmdErr);
            cmdGroup.LargeIconList = "";
            cmdGroup.SmallIconList = "";
            cmdGroup.LargeMainIcon = "";
            cmdGroup.SmallMainIcon = "";

            // Extract BOM command
            int extractBomIdx = cmdGroup.AddCommandItem2("Extract BOM", -1, "Extract BOM from current assembly", "Extract BOM", 0,
                "ExtractBom", "ExtractBomEnable", 0, (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem);

            // Sync with Blackbox command
            int syncIdx = cmdGroup.AddCommandItem2("Sync to Blackbox", -1, "Sync BOM with Blackbox BOM system", "Sync", 0,
                "SyncToBlackbox", "SyncToBlackboxEnable", 0, (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem);

            // View in 3D Viewer command
            int view3dIdx = cmdGroup.AddCommandItem2("3D Viewer", -1, "View model in browser 3D viewer", "3D Viewer", 0,
                "Open3DViewer", "Open3DViewerEnable", 0, (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem);

            // Extract Images command
            int extractImagesIdx = cmdGroup.AddCommandItem2("Extract Images", -1, "Extract component images/thumbnails", "Images", 0,
                "ExtractImages", "ExtractImagesEnable", 0, (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem);

            // Apply Changes from Blackbox
            int applyIdx = cmdGroup.AddCommandItem2("Apply Blackbox Changes", -1, "Apply BOM changes from Blackbox to model", "Apply", 0,
                "ApplyBlackboxChanges", "ApplyBlackboxChangesEnable", 0, (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem);

            // License Settings
            int settingsIdx = cmdGroup.AddCommandItem2("Settings", -1, "Configure Blackbox BOM connection and license", "Settings", 0,
                "OpenSettings", "OpenSettingsEnable", 0, (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem);

            cmdGroup.HasToolbar = true;
            cmdGroup.HasMenu = true;
            cmdGroup.Activate();
        }

        private void UnregisterMenuItems()
        {
            ICommandManager cmdMgr = _swApp.GetCommandManager(_addinId);
            cmdMgr?.RemoveCommandGroup2(1, false);
        }

        #endregion

        #region Command Handlers

        /// <summary>
        /// Extract complete BOM from active assembly
        /// </summary>
        public void ExtractBom()
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null)
                {
                    MessageBox.Show("No document open.", "Blackbox BOM", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                BomExtractor extractor = new BomExtractor(_swApp);
                BomData bom = extractor.ExtractFromModel(model);

                // Display in task pane
                _bomPanel?.DisplayBom(bom);

                // Send to Blackbox API
                _apiClient?.UploadBom(bom);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error extracting BOM: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public int ExtractBomEnable()
        {
            return _swApp.IActiveDoc2 != null ? 1 : 0;
        }

        /// <summary>
        /// Sync extracted BOM with Blackbox BOM system
        /// </summary>
        public void SyncToBlackbox()
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null) return;

                BomExtractor extractor = new BomExtractor(_swApp);
                BomData bom = extractor.ExtractFromModel(model);

                // Upload to Blackbox
                var result = _apiClient.SyncBom(bom);

                MessageBox.Show($"Sync complete! {result.ItemsAdded} items added, {result.ItemsUpdated} items updated.",
                    "Blackbox BOM", MessageBoxButtons.OK, MessageBoxIcon.Information);

                // Refresh task pane
                _bomPanel?.DisplayBom(bom);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Sync failed: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public int SyncToBlackboxEnable()
        {
            return _swApp.IActiveDoc2 != null ? 1 : 0;
        }

        /// <summary>
        /// Open 3D viewer in browser for current model
        /// </summary>
        public void Open3DViewer()
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null) return;

                // Export model to STL for browser viewing
                string stlPath = ExportToStl(model);

                // Open browser with 3D viewer
                string viewerUrl = $"{_apiClient.BaseUrl}/viewer?file={Uri.EscapeDataString(stlPath)}";
                System.Diagnostics.Process.Start(viewerUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error opening 3D viewer: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public int Open3DViewerEnable()
        {
            return _swApp.IActiveDoc2 != null ? 1 : 0;
        }

        /// <summary>
        /// Extract images/thumbnails for all components
        /// </summary>
        public void ExtractImages()
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null) return;

                ImageExtractor imgExtractor = new ImageExtractor(_swApp);
                var images = imgExtractor.ExtractAllImages(model);

                // Upload to Blackbox
                _apiClient.UploadImages(images);

                MessageBox.Show($"Extracted {images.Count} component images.", "Blackbox BOM",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error extracting images: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public int ExtractImagesEnable()
        {
            return _swApp.IActiveDoc2 != null ? 1 : 0;
        }

        /// <summary>
        /// Apply BOM changes from Blackbox back to SolidWorks model
        /// </summary>
        public void ApplyBlackboxChanges()
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null) return;

                // Get changes from Blackbox
                var changes = _apiClient.GetPendingChanges(model.GetTitle());

                if (changes.Count == 0)
                {
                    MessageBox.Show("No pending changes from Blackbox.", "Blackbox BOM",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // Apply changes
                ModelUpdater updater = new ModelUpdater(_swApp);
                updater.ApplyChanges(model, changes);

                MessageBox.Show($"Applied {changes.Count} changes from Blackbox.", "Blackbox BOM",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error applying changes: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public int ApplyBlackboxChangesEnable()
        {
            return _swApp.IActiveDoc2 != null ? 1 : 0;
        }

        /// <summary>
        /// Open settings dialog
        /// </summary>
        public void OpenSettings()
        {
            using (var settingsForm = new SettingsForm(_apiClient))
            {
                settingsForm.ShowDialog();
            }
        }

        public int OpenSettingsEnable()
        {
            return 1;
        }

        #endregion

        #region Event Watchers (Real-time Sync)

        private void SetupEventWatchers()
        {
            _eventWatcher = new EventWatcher(_swApp);
            _eventWatcher.OnDocumentSaved += EventWatcher_OnDocumentSaved;
            _eventWatcher.OnComponentAdded += EventWatcher_OnComponentAdded;
            _eventWatcher.OnComponentRemoved += EventWatcher_OnComponentRemoved;
            _eventWatcher.OnFeatureCreated += EventWatcher_OnFeatureCreated;
            _eventWatcher.StartWatching();
        }

        private void CleanupEventWatchers()
        {
            _eventWatcher?.StopWatching();
            _eventWatcher?.Dispose();
        }

        private void EventWatcher_OnDocumentSaved(string documentPath)
        {
            // Auto-sync on save
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model != null)
                {
                    BomExtractor extractor = new BomExtractor(_swApp);
                    BomData bom = extractor.ExtractFromModel(model);
                    _apiClient?.SyncBom(bom);
                }
            }
            catch { /* Log error */ }
        }

        private void EventWatcher_OnComponentAdded(string componentName)
        {
            _bomPanel?.NotifyComponentAdded(componentName);
        }

        private void EventWatcher_OnComponentRemoved(string componentName)
        {
            _bomPanel?.NotifyComponentRemoved(componentName);
        }

        private void EventWatcher_OnFeatureCreated(string featureName, int featureType)
        {
            _bomPanel?.NotifyFeatureCreated(featureName, featureType);
        }

        #endregion

        #region Helper Methods

        private string ExportToStl(IModelDoc2 model)
        {
            string exportPath = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"{model.GetTitle()}.stl");

            int errors = 0;
            int warnings = 0;

            // Save as STL
            bool result = model.Extension.SaveAs2(
                exportPath,
                (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                null, ref errors, ref warnings);

            if (!result)
            {
                throw new Exception($"Failed to export STL. Errors: {errors}");
            }

            return exportPath;
        }

        #endregion

        #region COM Registration

        [ComRegisterFunction]
        public static void RegisterFunction(Type t)
        {
            // Single source of truth for title/description/load-at-startup: the
            // [SwAddin(...)] attribute on this class, rather than duplicated literals.
            var meta = (SwAddinAttribute)Attribute.GetCustomAttribute(t, typeof(SwAddinAttribute))
                       ?? new SwAddinAttribute { Title = "Blackbox BOM", Description = "Blackbox BOM Management Integration", LoadAtStartup = true };

            Microsoft.Win32.RegistryKey hklm = Microsoft.Win32.Registry.LocalMachine;
            Microsoft.Win32.RegistryKey hkcu = Microsoft.Win32.Registry.CurrentUser;

            string keyName = $"SOFTWARE\\SolidWorks\\Addins\\{{{t.GUID}}}";

            Microsoft.Win32.RegistryKey addinKey = hklm.CreateSubKey(keyName);
            if (addinKey != null)
            {
                addinKey.SetValue(null, 0);
                addinKey.SetValue("Description", meta.Description);
                addinKey.SetValue("Title", meta.Title);
            }

            keyName = $"Software\\SolidWorks\\AddInsStartup\\{{{t.GUID}}}";
            addinKey = hkcu.CreateSubKey(keyName);
            if (addinKey != null)
            {
                addinKey.SetValue(null, meta.LoadAtStartup ? 1 : 0);
            }
        }

        [ComUnregisterFunction]
        public static void UnregisterFunction(Type t)
        {
            Microsoft.Win32.RegistryKey hklm = Microsoft.Win32.Registry.LocalMachine;
            Microsoft.Win32.RegistryKey hkcu = Microsoft.Win32.Registry.CurrentUser;

            string keyName = $"SOFTWARE\\SolidWorks\\Addins\\{{{t.GUID}}}";
            hklm.DeleteSubKeyTree(keyName, false);

            keyName = $"Software\\SolidWorks\\AddInsStartup\\{{{t.GUID}}}";
            hkcu.DeleteSubKeyTree(keyName, false);
        }

        #endregion
    }
}
