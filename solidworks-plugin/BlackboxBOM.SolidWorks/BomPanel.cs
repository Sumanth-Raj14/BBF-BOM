using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Embedded BOM viewer panel for SolidWorks task pane
    /// Shows BOM data, allows editing, and provides real-time updates
    /// </summary>
    public class BomPanel : UserControl
    {
        private readonly ISldWorks _swApp;
        private readonly ApiClient _apiClient;
        private BomData _currentBom;
        private ListView _bomListView;
        private ToolStrip _toolStrip;
        private StatusStrip _statusStrip;
        private TextBox _searchBox;
        private TreeView _featureTreeView;
        private Panel _detailPanel;
        private PictureBox _previewBox;

        public BomPanel(ISldWorks swApp, ApiClient apiClient)
        {
            _swApp = swApp;
            _apiClient = apiClient;

            InitializeUI();
        }

        #region UI Initialization

        private void InitializeUI()
        {
            this.Dock = DockStyle.Fill;
            this.BackColor = Color.FromArgb(240, 240, 240);

            // Main layout
            var mainLayout = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 300
            };

            // Top panel - BOM list
            var topPanel = new Panel { Dock = DockStyle.Fill };
            topPanel.Controls.Add(CreateBomListView());
            topPanel.Controls.Add(CreateToolStrip());
            topPanel.Controls.Add(CreateSearchBox());
            mainLayout.Panel1.Controls.Add(topPanel);

            // Bottom panel - Details and preview
            var bottomPanel = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Vertical,
                SplitterDistance = 400
            };

            // Left - Feature tree
            bottomPanel.Panel1.Controls.Add(CreateFeatureTreeView());

            // Right - Preview and details
            var rightPanel = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 200
            };

            rightPanel.Panel1.Controls.Add(CreatePreviewBox());
            rightPanel.Panel2.Controls.Add(CreateDetailPanel());

            bottomPanel.Panel2.Controls.Add(rightPanel);

            mainLayout.Panel2.Controls.Add(bottomPanel);

            this.Controls.Add(mainLayout);
            this.Controls.Add(CreateStatusStrip());
        }

        private ToolStrip CreateToolStrip()
        {
            var toolStrip = new ToolStrip { Dock = DockStyle.Top };

            toolStrip.Items.Add(new ToolStripButton("Extract BOM", null, OnExtractBomClick)
            {
                ToolTipText = "Extract BOM from current assembly"
            });

            toolStrip.Items.Add(new ToolStripButton("Sync", null, OnSyncClick)
            {
                ToolTipText = "Sync with Blackbox BOM"
            });

            toolStrip.Items.Add(new ToolStripSeparator());

            toolStrip.Items.Add(new ToolStripButton("Refresh", null, OnRefreshClick)
            {
                ToolTipText = "Refresh BOM data"
            });

            toolStrip.Items.Add(new ToolStripButton("Export", null, OnExportClick)
            {
                ToolTipText = "Export BOM to file"
            });

            toolStrip.Items.Add(new ToolStripSeparator());

            toolStrip.Items.Add(new ToolStripButton("Settings", null, OnSettingsClick)
            {
                ToolTipText = "Plugin settings"
            });

            return toolStrip;
        }

        private TextBox CreateSearchBox()
        {
            _searchBox = new TextBox
            {
                Dock = DockStyle.Top,
                PlaceholderText = "Search components...",
                Font = new Font("Segoe UI", 10)
            };

            _searchBox.TextChanged += (s, e) => FilterBomList();
            return _searchBox;
        }

        private ListView CreateBomListView()
        {
            _bomListView = new ListView
            {
                Dock = DockStyle.Fill,
                // Must be fully qualified: `SolidWorks.Interop.sldworks` (used elsewhere in
                // this file for `ISldWorks`) also declares a type named `View` (a graphics
                // viewport interface), so the bare `View.Details` is ambiguous between it and
                // `System.Windows.Forms.View` (the ListView display-mode enum actually wanted
                // here) — confirmed via a real compile against a real SolidWorks interop
                // assembly (CS0104), not a guess.
                View = System.Windows.Forms.View.Details,
                FullRowSelect = true,
                GridLines = true,
                Font = new Font("Segoe UI", 9)
            };

            // Add columns
            _bomListView.Columns.Add("Part Number", 120);
            _bomListView.Columns.Add("Description", 200);
            _bomListView.Columns.Add("Qty", 50);
            _bomListView.Columns.Add("Material", 100);
            _bomListView.Columns.Add("Weight", 80);
            _bomListView.Columns.Add("Vendor", 100);
            _bomListView.Columns.Add("Cost", 80);

            // Context menu
            var contextMenu = new ContextMenuStrip();
            contextMenu.Items.Add("View in 3D Viewer", null, OnView3DClick);
            contextMenu.Items.Add("Export Image", null, OnExportImageClick);
            contextMenu.Items.Add("Edit Properties", null, OnEditPropertiesClick);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add("Remove", null, OnRemoveClick);

            _bomListView.ContextMenuStrip = contextMenu;
            _bomListView.DoubleClick += OnBomItemDoubleClick;

            return _bomListView;
        }

        private TreeView CreateFeatureTreeView()
        {
            _featureTreeView = new TreeView
            {
                Dock = DockStyle.Fill,
                Font = new Font("Segoe UI", 9),
                ShowLines = true,
                ShowPlusMinus = true,
                ShowRootLines = true
            };

            _featureTreeView.AfterSelect += OnFeatureSelected;
            return _featureTreeView;
        }

        private PictureBox CreatePreviewBox()
        {
            _previewBox = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };

            return _previewBox;
        }

        private Panel CreateDetailPanel()
        {
            _detailPanel = new Panel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                Padding = new Padding(10)
            };

            return _detailPanel;
        }

        private StatusStrip CreateStatusStrip()
        {
            _statusStrip = new StatusStrip();
            _statusStrip.Items.Add("Ready");
            return _statusStrip;
        }

        #endregion

        #region Public Methods

        /// <summary>
        /// Display BOM data in the panel
        /// </summary>
        public void DisplayBom(BomData bom)
        {
            _currentBom = bom;
            _bomListView.Items.Clear();

            if (bom == null || bom.Items == null) return;

            foreach (var item in bom.Items)
            {
                var listItem = new ListViewItem(item.PartNumber);
                listItem.SubItems.Add(item.Description);
                listItem.SubItems.Add(item.Quantity.ToString());
                listItem.SubItems.Add(item.Material);
                listItem.SubItems.Add(item.Weight);
                listItem.SubItems.Add(item.Vendor);
                listItem.SubItems.Add(item.Cost);
                listItem.Tag = item;

                _bomListView.Items.Add(listItem);
            }

            // Update status
            _statusStrip.Items[0].Text = $"BOM: {bom.Items.Count} components | {bom.TotalUniqueParts} unique parts";

            // Build feature tree
            BuildFeatureTree(bom);
        }

        /// <summary>
        /// Notify when component is added
        /// </summary>
        public void NotifyComponentAdded(string componentName)
        {
            _statusStrip.Items[0].Text = $"Component added: {componentName}";
        }

        /// <summary>
        /// Notify when component is removed
        /// </summary>
        public void NotifyComponentRemoved(string componentName)
        {
            _statusStrip.Items[0].Text = $"Component removed: {componentName}";
        }

        /// <summary>
        /// Notify when feature is created
        /// </summary>
        public void NotifyFeatureCreated(string featureName, int featureType)
        {
            _statusStrip.Items[0].Text = $"Feature created: {featureName}";
        }

        #endregion

        #region Event Handlers

        private void OnExtractBomClick(object sender, EventArgs e)
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null)
                {
                    MessageBox.Show("No document open.", "Blackbox BOM",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                var extractor = new BomExtractor(_swApp);
                var bom = extractor.ExtractFromModel(model);
                DisplayBom(bom);

                _statusStrip.Items[0].Text = $"BOM extracted: {bom.Items.Count} components";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnSyncClick(object sender, EventArgs e)
        {
            try
            {
                if (_currentBom == null)
                {
                    MessageBox.Show("No BOM to sync. Extract BOM first.", "Blackbox BOM",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                var result = _apiClient.SyncBom(_currentBom);
                _statusStrip.Items[0].Text = $"Synced: {result.ItemsAdded} added, {result.ItemsUpdated} updated";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Sync error: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnRefreshClick(object sender, EventArgs e)
        {
            OnExtractBomClick(sender, e);
        }

        private void OnExportClick(object sender, EventArgs e)
        {
            using (var dialog = new SaveFileDialog())
            {
                dialog.Filter = "CSV files (*.csv)|*.csv|Excel files (*.xlsx)|*.xlsx";
                dialog.FileName = $"BOM_{DateTime.Now:yyyyMMdd}.csv";

                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    ExportBomToFile(dialog.FileName);
                }
            }
        }

        private void OnSettingsClick(object sender, EventArgs e)
        {
            using (var form = new SettingsForm(_apiClient))
            {
                form.ShowDialog();
            }
        }

        private void OnBomItemDoubleClick(object sender, EventArgs e)
        {
            if (_bomListView.SelectedItems.Count == 0) return;

            var item = _bomListView.SelectedItems[0].Tag as BomItem;
            if (item != null)
            {
                ShowItemDetails(item);
            }
        }

        private void OnView3DClick(object sender, EventArgs e)
        {
            if (_bomListView.SelectedItems.Count == 0) return;

            var item = _bomListView.SelectedItems[0].Tag as BomItem;
            if (item != null)
            {
                Open3DViewerForComponent(item);
            }
        }

        private void OnExportImageClick(object sender, EventArgs e)
        {
            if (_bomListView.SelectedItems.Count == 0) return;

            var item = _bomListView.SelectedItems[0].Tag as BomItem;
            if (item != null)
            {
                ExportComponentImage(item);
            }
        }

        private void OnEditPropertiesClick(object sender, EventArgs e)
        {
            if (_bomListView.SelectedItems.Count == 0) return;

            var item = _bomListView.SelectedItems[0].Tag as BomItem;
            if (item != null)
            {
                EditComponentProperties(item);
            }
        }

        private void OnRemoveClick(object sender, EventArgs e)
        {
            if (_bomListView.SelectedItems.Count == 0) return;

            var result = MessageBox.Show("Remove selected component from BOM?", "Confirm",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (result == DialogResult.Yes)
            {
                var item = _bomListView.SelectedItems[0].Tag as BomItem;
                _currentBom.Items.Remove(item);
                DisplayBom(_currentBom);
            }
        }

        private void OnFeatureSelected(object sender, TreeViewEventArgs e)
        {
            if (e.Node?.Tag is FeatureInfo feature)
            {
                ShowFeatureDetails(feature);
            }
        }

        #endregion

        #region Helper Methods

        private void FilterBomList()
        {
            string filter = _searchBox.Text.ToLower();

            foreach (ListViewItem item in _bomListView.Items)
            {
                var bomItem = item.Tag as BomItem;
                if (bomItem != null)
                {
                    bool matches = string.IsNullOrEmpty(filter) ||
                        bomItem.PartNumber.ToLower().Contains(filter) ||
                        bomItem.Description.ToLower().Contains(filter) ||
                        bomItem.Material.ToLower().Contains(filter);

                    item.Visible = matches;
                }
            }
        }

        private void BuildFeatureTree(BomData bom)
        {
            _featureTreeView.Nodes.Clear();

            var rootNode = new TreeNode(bom.SourceFile);
            rootNode.Tag = bom;

            foreach (var item in bom.Items)
            {
                var itemNode = new TreeNode($"{item.PartNumber} - {item.Description}");
                itemNode.Tag = item;

                if (item.Features != null)
                {
                    foreach (var feature in item.Features)
                    {
                        var featNode = new TreeNode($"{feature.Name} ({feature.Type})");
                        featNode.Tag = feature;
                        itemNode.Nodes.Add(featNode);
                    }
                }

                rootNode.Nodes.Add(itemNode);
            }

            _featureTreeView.Nodes.Add(rootNode);
            rootNode.Expand();
        }

        private void ShowItemDetails(BomItem item)
        {
            _detailPanel.Controls.Clear();

            int y = 10;

            y = AddDetailLabel("Part Number:", item.PartNumber, y);
            y = AddDetailLabel("Description:", item.Description, y);
            y = AddDetailLabel("Quantity:", item.Quantity.ToString(), y);
            y = AddDetailLabel("Material:", item.Material, y);
            y = AddDetailLabel("Weight:", item.Weight, y);
            y = AddDetailLabel("Vendor:", item.Vendor, y);
            y = AddDetailLabel("Cost:", item.Cost, y);
            y = AddDetailLabel("Configuration:", item.ConfigurationName, y);

            if (item.MassProperties != null)
            {
                y = AddDetailLabel("Mass:", $"{item.MassProperties.Mass:F3} kg", y);
                y = AddDetailLabel("Volume:", $"{item.MassProperties.Volume:F3} mm³", y);
            }

            if (item.BoundingBox != null)
            {
                y = AddDetailLabel("Dimensions:", $"{item.BoundingBox.Width:F2} x {item.BoundingBox.Height:F2} x {item.BoundingBox.Depth:F2} mm", y);
            }

            // Custom properties
            if (item.CustomProperties != null && item.CustomProperties.Count > 0)
            {
                y += 10;
                y = AddDetailLabel("Custom Properties:", "", y);

                foreach (var prop in item.CustomProperties)
                {
                    y = AddDetailLabel($"  {prop.Key}:", prop.Value, y);
                }
            }

            // Load preview image
            LoadComponentPreview(item);
        }

        private void ShowFeatureDetails(FeatureInfo feature)
        {
            _detailPanel.Controls.Clear();

            int y = 10;

            y = AddDetailLabel("Feature:", feature.Name, y);
            y = AddDetailLabel("Type:", feature.Type, y);
            y = AddDetailLabel("Suppressed:", feature.IsSuppressed.ToString(), y);
            y = AddDetailLabel("Visible:", feature.IsVisible.ToString(), y);

            if (feature.Parameters != null && feature.Parameters.Count > 0)
            {
                y += 10;
                y = AddDetailLabel("Parameters:", "", y);

                foreach (var param in feature.Parameters)
                {
                    y = AddDetailLabel($"  {param.Key}:", param.Value?.ToString() ?? "", y);
                }
            }

            if (feature.Dimensions != null && feature.Dimensions.Count > 0)
            {
                y += 10;
                y = AddDetailLabel("Dimensions:", "", y);

                foreach (var dim in feature.Dimensions)
                {
                    y = AddDetailLabel($"  {dim.Name}:", $"{dim.Value:F3} mm", y);
                }
            }
        }

        private int AddDetailLabel(string label, string value, int y)
        {
            var lbl = new Label
            {
                Text = $"{label} {value}",
                Location = new System.Drawing.Point(10, y),
                AutoSize = true,
                Font = new Font("Segoe UI", 9)
            };

            _detailPanel.Controls.Add(lbl);
            return y + 20;
        }

        private void LoadComponentPreview(BomItem item)
        {
            try
            {
                // Try to get preview from API
                var image = _apiClient.GetComponentImage(item.PartNumber);
                if (image?.IsometricView != null)
                {
                    using (var ms = new System.IO.MemoryStream(image.IsometricView))
                    {
                        _previewBox.Image = Image.FromStream(ms);
                    }
                }
            }
            catch
            {
                // Preview not available
                _previewBox.Image = null;
            }
        }

        private void Open3DViewerForComponent(BomItem item)
        {
            try
            {
                string viewerUrl = $"{_apiClient.BaseUrl}/viewer?part={Uri.EscapeDataString(item.PartNumber)}";
                System.Diagnostics.Process.Start(viewerUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error opening 3D viewer: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ExportComponentImage(BomItem item)
        {
            using (var dialog = new SaveFileDialog())
            {
                dialog.Filter = "PNG files (*.png)|*.png|JPEG files (*.jpg)|*.jpg";
                dialog.FileName = $"{item.PartNumber}.png";

                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    try
                    {
                        var image = _apiClient.GetComponentImage(item.PartNumber);
                        if (image?.IsometricView != null)
                        {
                            System.IO.File.WriteAllBytes(dialog.FileName, image.IsometricView);
                            _statusStrip.Items[0].Text = $"Image exported: {dialog.FileName}";
                        }
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Export error: {ex.Message}", "Error",
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void EditComponentProperties(BomItem item)
        {
            using (var form = new PropertyEditForm(item))
            {
                if (form.ShowDialog() == DialogResult.OK)
                {
                    // Refresh display
                    DisplayBom(_currentBom);
                }
            }
        }

        private void ExportBomToFile(string filePath)
        {
            try
            {
                var sb = new System.Text.StringBuilder();
                sb.AppendLine("Part Number,Description,Quantity,Material,Weight,Vendor,Cost");

                foreach (var item in _currentBom.Items)
                {
                    sb.AppendLine($"{item.PartNumber},{item.Description},{item.Quantity},{item.Material},{item.Weight},{item.Vendor},{item.Cost}");
                }

                System.IO.File.WriteAllText(filePath, sb.ToString());
                _statusStrip.Items[0].Text = $"BOM exported to: {filePath}";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Export error: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        #endregion
    }

    #region Supporting Forms

    public class PropertyEditForm : Form
    {
        private BomItem _item;
        private TextBox _txtDescription;
        private TextBox _txtMaterial;
        private TextBox _txtVendor;
        private TextBox _txtCost;

        public PropertyEditForm(BomItem item)
        {
            _item = item;
            InitializeForm();
        }

        private void InitializeForm()
        {
            this.Text = $"Edit Properties - {_item.PartNumber}";
            this.Size = new Size(400, 300);
            this.StartPosition = FormStartPosition.CenterParent;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 6
            };

            layout.Controls.Add(new Label { Text = "Description:", Dock = DockStyle.Fill }, 0, 0);
            _txtDescription = new TextBox { Text = _item.Description, Dock = DockStyle.Fill };
            layout.Controls.Add(_txtDescription, 1, 0);

            layout.Controls.Add(new Label { Text = "Material:", Dock = DockStyle.Fill }, 0, 1);
            _txtMaterial = new TextBox { Text = _item.Material, Dock = DockStyle.Fill };
            layout.Controls.Add(_txtMaterial, 1, 1);

            layout.Controls.Add(new Label { Text = "Vendor:", Dock = DockStyle.Fill }, 0, 2);
            _txtVendor = new TextBox { Text = _item.Vendor, Dock = DockStyle.Fill };
            layout.Controls.Add(_txtVendor, 1, 2);

            layout.Controls.Add(new Label { Text = "Cost:", Dock = DockStyle.Fill }, 0, 3);
            _txtCost = new TextBox { Text = _item.Cost, Dock = DockStyle.Fill };
            layout.Controls.Add(_txtCost, 1, 3);

            var btnPanel = new FlowLayoutPanel { Dock = DockStyle.Fill };
            var btnSave = new Button { Text = "Save", DialogResult = DialogResult.OK };
            var btnCancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel };
            btnPanel.Controls.Add(btnSave);
            btnPanel.Controls.Add(btnCancel);
            layout.Controls.Add(btnPanel, 1, 4);

            this.Controls.Add(layout);
        }
    }

    #endregion
}
