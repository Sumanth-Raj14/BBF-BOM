using System;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Applies BOM changes from Blackbox back to SolidWorks models
    /// Supports parametric updates, custom property changes, and feature modifications
    /// </summary>
    public class ModelUpdater
    {
        private readonly ISldWorks _swApp;

        public ModelUpdater(ISldWorks swApp)
        {
            _swApp = swApp;
        }

        /// <summary>
        /// Apply a list of changes to the model
        /// </summary>
        public ApplyResult ApplyChanges(IModelDoc2 model, List<PendingChange> changes)
        {
            var result = new ApplyResult
            {
                Success = true,
                ChangesApplied = 0,
                Errors = new List<string>()
            };

            foreach (var change in changes)
            {
                try
                {
                    bool applied = ApplySingleChange(model, change);
                    if (applied)
                    {
                        result.ChangesApplied++;
                    }
                }
                catch (Exception ex)
                {
                    result.Errors.Add($"Failed to apply change {change.ChangeId}: {ex.Message}");
                    result.Success = false;
                }
            }

            // Rebuild model after all changes
            if (result.ChangesApplied > 0)
            {
                RebuildModel(model);
            }

            return result;
        }

        /// <summary>
        /// Apply a single change to the model
        /// </summary>
        private bool ApplySingleChange(IModelDoc2 model, PendingChange change)
        {
            switch (change.Type.ToLower())
            {
                case "custom_property":
                    return UpdateCustomProperty(model, change);

                case "dimension":
                    return UpdateDimension(model, change);

                case "material":
                    return UpdateMaterial(model, change);

                case "configuration":
                    return UpdateConfiguration(model, change);

                case "feature":
                    return UpdateFeature(model, change);

                case "appearance":
                    return UpdateAppearance(model, change);

                default:
                    throw new ArgumentException($"Unknown change type: {change.Type}");
            }
        }

        /// <summary>
        /// Update a custom property value
        /// </summary>
        private bool UpdateCustomProperty(IModelDoc2 model, PendingChange change)
        {
            ICustomPropertyManager propMgr = model.Extension.CustomPropertyManager[""];
            if (propMgr == null) return false;

            string propName = change.Property;
            string newValue = change.NewValue?.ToString() ?? "";

            // Delete existing property if it exists
            propMgr.Delete2(propName);

            // Add new property
            int errors = propMgr.Add3(propName,
                (int)swCustomInfoType_e.swCustomInfoText,
                newValue,
                (int)swCustomPropertyAddOption_e.swCustomPropertyDeleteAndAdd);

            return errors == 0;
        }

        /// <summary>
        /// Update a dimension value
        /// </summary>
        private bool UpdateDimension(IModelDoc2 model, PendingChange change)
        {
            string dimName = change.Property;
            double newValue = Convert.ToDouble(change.NewValue);

            // Find the dimension
            IDisplayDimension dispDim = FindDimension(model, dimName);
            if (dispDim == null) return false;

            IDimension dim = dispDim.GetDimension();
            if (dim == null) return false;

            // Set new value
            bool result = dim.SetSystemValue3(newValue, (int)swSetValueInConfiguration_e.swSetValue_InThisConfiguration, "");

            return result;
        }

        /// <summary>
        /// Find a dimension by name in the model
        /// </summary>
        private IDisplayDimension FindDimension(IModelDoc2 model, string dimName)
        {
            IFeatureManager featMgr = model.FeatureManager;
            if (featMgr == null) return null;

            object[] features = featMgr.GetFeatures(false);
            if (features == null) return null;

            foreach (IFeature feature in features)
            {
                if (feature.GetTypeName2() == "Sketch")
                {
                    ISketch sketch = feature.GetSpecificFeature2() as ISketch;
                    if (sketch != null)
                    {
                        object[] dimensions = sketch.GetDimensions();
                        if (dimensions != null)
                        {
                            foreach (IDisplayDimension dispDim in dimensions)
                            {
                                if (dispDim.GetDimension().Name == dimName)
                                {
                                    return dispDim;
                                }
                            }
                        }
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// Update material assignment
        /// </summary>
        private bool UpdateMaterial(IModelDoc2 model, PendingChange change)
        {
            if (model is IPartDoc partDoc)
            {
                string materialName = change.NewValue?.ToString() ?? "";

                // Get material database path
                string matDbPath = _swApp.GetUserPreferenceStringValue(
                    (int)swUserPreferenceStringValue_e.swDefaultMaterialDatabase);

                // Set material
                IMaterial material = _swApp.GetMaterialManager().GetMaterial(materialName, matDbPath);
                if (material != null)
                {
                    partDoc.SetMaterial(material);
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Update configuration
        /// </summary>
        private bool UpdateConfiguration(IModelDoc2 model, PendingChange change)
        {
            string configName = change.Property;
            string propName = change.Property;
            string propValue = change.NewValue?.ToString() ?? "";

            IConfiguration config = model.ConfigurationManager.GetConfigurationByName(configName);
            if (config == null) return false;

            // Update configuration-specific custom property
            ICustomPropertyManager propMgr = model.Extension.CustomPropertyManager[configName];
            if (propMgr != null)
            {
                propMgr.Delete2(propName);
                propMgr.Add3(propName,
                    (int)swCustomInfoType_e.swCustomInfoText,
                    propValue,
                    (int)swCustomPropertyAddOption_e.swCustomPropertyDeleteAndAdd);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Update feature parameters
        /// </summary>
        private bool UpdateFeature(IModelDoc2 model, PendingChange change)
        {
            string featureName = change.Property;
            string paramName = change.Property;
            object newValue = change.NewValue;

            // Find the feature
            IFeatureManager featMgr = model.FeatureManager;
            if (featMgr == null) return false;

            object[] features = featMgr.GetFeatures(false);
            if (features == null) return false;

            foreach (IFeature feature in features)
            {
                if (feature.Name == featureName)
                {
                    return UpdateFeatureParameter(feature, paramName, newValue);
                }
            }

            return false;
        }

        /// <summary>
        /// Update a specific feature parameter
        /// </summary>
        private bool UpdateFeatureParameter(IFeature feature, string paramName, object newValue)
        {
            IFeatureData featData = feature.GetFeatureData2();
            if (featData == null) return false;

            string typeName = feature.GetTypeName2();

            switch (typeName)
            {
                case "ExtrudeBoss":
                case "BaseFlange":
                    return UpdateExtrudeFeature(featData, paramName, newValue);

                case "Revolve":
                case "RevolveBoss":
                    return UpdateRevolveFeature(featData, paramName, newValue);

                case "Fillet":
                    return UpdateFilletFeature(featData, paramName, newValue);

                case "HoleWiz":
                    return UpdateHoleWizardFeature(featData, paramName, newValue);

                default:
                    return false;
            }
        }

        private bool UpdateExtrudeFeature(IFeatureData featData, string paramName, object newValue)
        {
            if (featData is IExtrudeFeatureData2 extrudeData)
            {
                switch (paramName.ToLower())
                {
                    case "depth":
                    case "distance":
                        extrudeData.SetDepth(true, Convert.ToDouble(newValue));
                        return true;

                    case "direction":
                        extrudeData.SetReverse(Convert.ToBoolean(newValue));
                        return true;
                }
            }
            return false;
        }

        private bool UpdateRevolveFeature(IFeatureData featData, string paramName, object newValue)
        {
            if (featData is IRevolveFeatureData2 revolveData)
            {
                switch (paramName.ToLower())
                {
                    case "angle":
                        revolveData.SetAngle(Convert.ToDouble(newValue));
                        return true;
                }
            }
            return false;
        }

        private bool UpdateFilletFeature(IFeatureData featData, string paramName, object newValue)
        {
            if (featData is IFilletFeatureData2 filletData)
            {
                switch (paramName.ToLower())
                {
                    case "radius":
                        filletData.SetRadius(Convert.ToDouble(newValue));
                        return true;
                }
            }
            return false;
        }

        private bool UpdateHoleWizardFeature(IFeatureData featData, string paramName, object newValue)
        {
            if (featData is IHoleWizardFeatureData2 hwData)
            {
                switch (paramName.ToLower())
                {
                    case "diameter":
                        hwData.SetHoleDiameterValue(Convert.ToDouble(newValue));
                        return true;

                    case "depth":
                        hwData.SetHoleDepthValue(Convert.ToDouble(newValue));
                        return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Update appearance (color)
        /// </summary>
        private bool UpdateAppearance(IModelDoc2 model, PendingChange change)
        {
            try
            {
                // Parse color from value
                string colorStr = change.NewValue?.ToString() ?? "0,0,0";
                string[] rgb = colorStr.Split(',');

                if (rgb.Length == 3)
                {
                    int r = Convert.ToInt32(rgb[0]);
                    int g = Convert.ToInt32(rgb[1]);
                    int b = Convert.ToInt32(rgb[2]);

                    // Set appearance
                    model.Extension.DisplayMaterial(
                        model.GetPathName(),
                        (int)swInConfiguration_e.swAllConfiguration,
                        "*Default",
                        r, g, b);

                    return true;
                }
            }
            catch
            {
                return false;
            }

            return false;
        }

        /// <summary>
        /// Rebuild model after changes
        /// </summary>
        private void RebuildModel(IModelDoc2 model)
        {
            try
            {
                // Force rebuild
                model.ForceRebuild3(true);

                // Update mass properties
                model.Extension.MassProperty.Recalculate();

                // Save model
                int errors = 0;
                int warnings = 0;
                model.Extension.SaveAs2(
                    model.GetPathName(),
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null, ref errors, ref warnings);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Rebuild error: {ex.Message}");
            }
        }

        /// <summary>
        /// Batch update multiple models
        /// </summary>
        public Dictionary<string, ApplyResult> ApplyChangesToMultipleModels(
            Dictionary<string, List<PendingChange>> modelChanges)
        {
            var results = new Dictionary<string, ApplyResult>();

            foreach (var kvp in modelChanges)
            {
                string modelPath = kvp.Key;
                List<PendingChange> changes = kvp.Value;

                // Open model
                int errors = 0;
                int warnings = 0;
                IModelDoc2 model = _swApp.OpenDoc6(
                    modelPath,
                    (int)swDocumentTypes_e.swDocPART,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                    "",
                    ref errors,
                    ref warnings);

                if (model != null)
                {
                    var result = ApplyChanges(model, changes);
                    results[modelPath] = result;

                    // Close model
                    _swApp.CloseDoc(model.GetTitle());
                }
                else
                {
                    results[modelPath] = new ApplyResult
                    {
                        Success = false,
                        Errors = new List<string> { "Failed to open model" }
                    };
                }
            }

            return results;
        }
    }
}
