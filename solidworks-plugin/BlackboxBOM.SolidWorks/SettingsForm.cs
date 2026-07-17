using System;
using System.Drawing;
using System.Windows.Forms;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Settings form for Blackbox BOM plugin configuration
    /// Handles API connection, license, and sync settings
    /// </summary>
    public class SettingsForm : Form
    {
        private readonly ApiClient _apiClient;
        private TextBox txtApiUrl;
        private TextBox txtApiKey;
        private TextBox txtLicenseKey;
        private CheckBox chkAutoSync;
        private CheckBox chkAutoExtract;
        private NumericUpDown numSyncInterval;
        private Label lblStatus;
        private Button btnSave;
        private Button btnTest;
        private Button btnActivate;

        public SettingsForm(ApiClient apiClient)
        {
            _apiClient = apiClient;
            InitializeForm();
            LoadSettings();
        }

        private void InitializeForm()
        {
            this.Text = "Blackbox BOM Settings";
            this.Size = new Size(500, 450);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;

            var mainLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 10,
                Padding = new Padding(10)
            };

            // API URL
            mainLayout.Controls.Add(new Label { Text = "API URL:", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight }, 0, 0);
            txtApiUrl = new TextBox { Dock = DockStyle.Fill, Text = "http://localhost:8000" };
            mainLayout.Controls.Add(txtApiUrl, 1, 0);

            // API Key
            mainLayout.Controls.Add(new Label { Text = "API Key:", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight }, 0, 1);
            txtApiKey = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
            mainLayout.Controls.Add(txtApiKey, 1, 1);

            // Test Connection Button
            btnTest = new Button { Text = "Test Connection", Dock = DockStyle.Fill };
            btnTest.Click += BtnTest_Click;
            mainLayout.Controls.Add(btnTest, 1, 2);

            // License Key
            mainLayout.Controls.Add(new Label { Text = "License Key:", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight }, 0, 3);
            txtLicenseKey = new TextBox { Dock = DockStyle.Fill };
            mainLayout.Controls.Add(txtLicenseKey, 1, 3);

            // Activate Button
            btnActivate = new Button { Text = "Activate License", Dock = DockStyle.Fill };
            btnActivate.Click += BtnActivate_Click;
            mainLayout.Controls.Add(btnActivate, 1, 4);

            // Status Label
            lblStatus = new Label { Text = "Status: Not Connected", Dock = DockStyle.Fill, ForeColor = Color.Red };
            mainLayout.Controls.Add(lblStatus, 1, 5);

            // Auto Sync Checkbox
            chkAutoSync = new CheckBox { Text = "Enable Auto-Sync", Dock = DockStyle.Fill, Checked = true };
            mainLayout.Controls.Add(chkAutoSync, 1, 6);

            // Auto Extract Checkbox
            chkAutoExtract = new CheckBox { Text = "Auto-Extract BOM on Open", Dock = DockStyle.Fill, Checked = true };
            mainLayout.Controls.Add(chkAutoExtract, 1, 7);

            // Sync Interval
            mainLayout.Controls.Add(new Label { Text = "Sync Interval (sec):", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight }, 0, 8);
            numSyncInterval = new NumericUpDown { Dock = DockStyle.Fill, Minimum = 5, Maximum = 300, Value = 30 };
            mainLayout.Controls.Add(numSyncInterval, 1, 8);

            // Save Button
            btnSave = new Button { Text = "Save Settings", Dock = DockStyle.Fill, Height = 40 };
            btnSave.Click += BtnSave_Click;
            mainLayout.Controls.Add(btnSave, 1, 9);

            this.Controls.Add(mainLayout);
        }

        private void LoadSettings()
        {
            try
            {
                var settings = PluginSettings.Load();
                txtApiUrl.Text = settings.ApiUrl;
                txtApiKey.Text = settings.ApiKey;
                txtLicenseKey.Text = settings.LicenseKey;
                chkAutoSync.Checked = settings.AutoSync;
                chkAutoExtract.Checked = settings.AutoExtract;
                numSyncInterval.Value = settings.SyncInterval;
            }
            catch
            {
                // Use defaults
            }
        }

        private void BtnTest_Click(object sender, EventArgs e)
        {
            try
            {
                _apiClient.SaveSettings(txtApiUrl.Text, txtApiKey.Text);

                if (_apiClient.IsApiAvailable())
                {
                    lblStatus.Text = "Status: Connected";
                    lblStatus.ForeColor = Color.Green;
                }
                else
                {
                    lblStatus.Text = "Status: Connection Failed";
                    lblStatus.ForeColor = Color.Red;
                }
            }
            catch (Exception ex)
            {
                lblStatus.Text = $"Status: Error - {ex.Message}";
                lblStatus.ForeColor = Color.Red;
            }
        }

        private void BtnActivate_Click(object sender, EventArgs e)
        {
            try
            {
                string machineId = GetMachineId();
                bool activated = _apiClient.ActivateLicense(txtLicenseKey.Text, machineId);

                if (activated)
                {
                    MessageBox.Show("License activated successfully!", "Success",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    lblStatus.Text = "License: Activated";
                    lblStatus.ForeColor = Color.Green;
                }
                else
                {
                    MessageBox.Show("License activation failed. Check your license key.", "Error",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Activation error: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnSave_Click(object sender, EventArgs e)
        {
            var settings = new PluginSettings
            {
                ApiUrl = txtApiUrl.Text,
                ApiKey = txtApiKey.Text,
                LicenseKey = txtLicenseKey.Text,
                AutoSync = chkAutoSync.Checked,
                AutoExtract = chkAutoExtract.Checked,
                SyncInterval = (int)numSyncInterval.Value
            };

            settings.Save();
            this.DialogResult = DialogResult.OK;
            this.Close();
        }

        private string GetMachineId()
        {
            return Environment.MachineName + "_" + Environment.UserName;
        }
    }

    /// <summary>
    /// Plugin settings persistence
    /// </summary>
    public class PluginSettings
    {
        public string ApiUrl { get; set; } = "http://localhost:8000";
        public string ApiKey { get; set; } = "";
        public string LicenseKey { get; set; } = "";
        public bool AutoSync { get; set; } = true;
        public bool AutoExtract { get; set; } = true;
        public int SyncInterval { get; set; } = 30;

        private static string GetSettingsPath()
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return System.IO.Path.Combine(appData, "BlackboxBOM", "settings.json");
        }

        public void Save()
        {
            string path = GetSettingsPath();
            string dir = System.IO.Path.GetDirectoryName(path);

            if (!System.IO.Directory.Exists(dir))
                System.IO.Directory.CreateDirectory(dir);

            string json = Newtonsoft.Json.JsonConvert.SerializeObject(this, Newtonsoft.Json.Formatting.Indented);
            System.IO.File.WriteAllText(path, json);
        }

        public static PluginSettings Load()
        {
            string path = GetSettingsPath();

            if (System.IO.File.Exists(path))
            {
                string json = System.IO.File.ReadAllText(path);
                return Newtonsoft.Json.JsonConvert.DeserializeObject<PluginSettings>(json);
            }

            return new PluginSettings();
        }
    }
}
