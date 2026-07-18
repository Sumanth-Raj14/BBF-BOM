using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Extracts complete BOM data from SolidWorks assemblies
    /// Includes part details, quantities, images, and parametric data
    /// </summary>
    public class BomExtractor
    {
        private readonly ISldWorks _swApp;

        public BomExtractor(ISldWorks swApp)
        {
            _swApp = swApp;
        }

        /// <summary>
        /// Extract complete BOM from model (assembly or part)
        /// </summary>
        public BomData ExtractFromModel(IModelDoc2 model)
        {
            var bom = new BomData
            {
                SourceFile = model.GetTitle(),
                ExtractedAt = DateTime.UtcNow,
                ModelType = (swDocumentTypes_e)model.GetType()
            };

            if (model.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                ExtractFromAssembly(model as IAssemblyDoc, bom, 0);
            }
            else if (model.GetType() == (int)swDocumentTypes_e.swDocPART)
            {
                ExtractFromPart(model as IPartDoc, bom);
            }

            // Calculate totals
            bom.TotalComponents = bom.Items.Count;
            bom.TotalUniqueParts = bom.Items.Select(i => i.PartNumber).Distinct().Count();

            return bom;
        }

        /// <summary>
        /// Extract a single top-level part document (no assembly, nothing to recurse into).
        /// </summary>
        private void ExtractFromPart(IPartDoc part, BomData bom)
        {
            if (part == null) return;

            IModelDoc2 model = part as IModelDoc2;
            if (model == null) return;

            var item = new BomItem
            {
                ComponentName = model.GetTitle(),
                ComponentPath = model.GetPathName(),
                Quantity = 1,
                Level = 0,
                IsAssembly = false
            };

            ExtractPartDetails(model, item);
            ExtractCustomProperties(model, item);
            ExtractParametricData(model, item);
            ExtractMaterials(model, item);

            IConfiguration config = model.ConfigurationManager?.ActiveConfiguration;
            if (config != null)
            {
                item.ConfigurationName = config.Name;
                if (string.IsNullOrEmpty(item.Description))
                    item.Description = config.Description;
            }

            bom.Items.Add(item);
        }

        /// <summary>
        /// Recursively extract components from assembly, tracking depth (Level) so the
        /// backend can rebuild the real parent/child tree.
        ///
        /// IMPORTANT: IAssemblyDoc.GetComponents2(false) already returns EVERY component
        /// in the assembly, flattened, including everything nested inside sub-assemblies.
        /// Calling it again inside the recursion (as this used to) would re-visit and
        /// duplicate every descendant component once per level of nesting. We instead
        /// call GetComponents2(true) (top-level/direct children only) at each level and
        /// recurse manually — that is the only way to get correct per-level counts.
        /// </summary>
        private void ExtractFromAssembly(IAssemblyDoc assembly, BomData bom, int level)
        {
            object[] components = assembly.GetComponents2(true);

            if (components == null) return;

            foreach (IComponent2 component in components)
            {
                // Skip suppressed components
                if (component.GetSuppression2() == (int)swComponentSuppressionState_e.swComponentSuppressed)
                    continue;

                IModelDoc2 childDoc = component.GetModelDoc2();
                bool isAssembly = childDoc != null && childDoc.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY;

                var item = ExtractComponentData(component, bom.SourceFile);
                item.Level = level;
                item.IsAssembly = isAssembly;
                bom.Items.Add(item);

                // Recurse into sub-assemblies (direct children only, next level down)
                if (isAssembly)
                {
                    ExtractFromAssembly(childDoc as IAssemblyDoc, bom, level + 1);
                }
            }
        }

        /// <summary>
        /// Extract detailed data from a single component
        /// </summary>
        private BomItem ExtractComponentData(IComponent2 component, string assemblyPath)
        {
            var item = new BomItem
            {
                ComponentName = component.Name2,
                ComponentPath = component.GetPathName(),
                Quantity = CalculateQuantity(component),
                IsSuppressed = component.GetSuppression2() == (int)swComponentSuppressionState_e.swComponentSuppressed,
                IsVirtual = component.IsVirtualComponent(),
                MatedInstanceCount = GetMatedInstanceCount(component)
            };

            // Get model data
            IModelDoc2 modelDoc = component.GetModelDoc2();
            if (modelDoc != null)
            {
                ExtractPartDetails(modelDoc, item);
                ExtractCustomProperties(modelDoc, item);
                ExtractParametricData(modelDoc, item);
                ExtractMaterials(modelDoc, item);
            }

            // Get configuration specific data
            IConfiguration config = component.GetConfiguration();
            if (config != null)
            {
                item.ConfigurationName = config.Name;
                item.Description = config.Description;
            }

            // Extract feature tree
            item.Features = ExtractFeatureTree(component);

            return item;
        }

        /// <summary>
        /// Extract part details (name, number, description, etc.)
        /// </summary>
        private void ExtractPartDetails(IModelDoc2 model, BomItem item)
        {
            item.PartName = model.GetTitle();
            item.FilePath = model.GetPathName();

            // Get summary info
            SummaryInfoData sumInfo = model.SummaryInformation;

            if (sumInfo != null)
            {
                item.Author = sumInfo.Author;
                item.CreatedDate = sumInfo.CreatedDate;
                item.ModifiedDate = sumInfo.ModifiedDate;
                item.Creator = sumInfo.Creator;
            }

            // Get custom properties
            ICustomPropertyManager propMgr = model.Extension.CustomPropertyManager[""];
            if (propMgr != null)
            {
                item.PartNumber = GetCustomProperty(propMgr, "PartNumber", "PARTNUMBER");
                item.Description = GetCustomProperty(propMgr, "Description", "DESCRIPTION");
                item.Material = GetCustomProperty(propMgr, "Material", "MATERIAL");
                item.Weight = GetCustomProperty(propMgr, "Weight", "WEIGHT");
                item.Finish = GetCustomProperty(propMgr, "Finish", "FINISH");
                item.Vendor = GetCustomProperty(propMgr, "Vendor", "VENDOR");
                item.Cost = GetCustomProperty(propMgr, "Cost", "COST");
            }
        }

        /// <summary>
        /// Extract custom properties from model
        /// </summary>
        private void ExtractCustomProperties(IModelDoc2 model, BomItem item)
        {
            ICustomPropertyManager propMgr = model.Extension.CustomPropertyManager[""];
            if (propMgr == null) return;

            string[] propertyNames = propMgr.GetNames();
            if (propertyNames == null) return;

            foreach (string propName in propertyNames)
            {
                string value = "";
                string resolvedValue = "";
                propMgr.Get4(propName, false, out value, out resolvedValue);

                item.CustomProperties[propName] = resolvedValue ?? value;
            }
        }

        /// <summary>
        /// Extract parametric data (dimensions, mass properties, etc.)
        /// </summary>
        private void ExtractParametricData(IModelDoc2 model, BomItem item)
        {
            // Mass properties
            IMassProperty massProp = model.Extension.MassProperty;
            if (massProp != null)
            {
                item.MassProperties = new MassProperties
                {
                    Volume = massProp.Volume,
                    SurfaceArea = massProp.SurfaceArea,
                    Mass = massProp.Mass,
                    CenterOfMassX = massProp.CenterOfMass[0],
                    CenterOfMassY = massProp.CenterOfMass[1],
                    CenterOfMassZ = massProp.CenterOfMass[2],
                    MomentOfInertiaXX = massProp.Ixx,
                    MomentOfInertiaYY = massProp.Iyy,
                    MomentOfInertiaZZ = massProp.Izz
                };
            }

            // Bounding box
            object minPoint = null;
            object maxPoint = null;
            model.GetBoundingBox(out minPoint, out maxPoint);

            if (minPoint != null && maxPoint != null)
            {
                double[] min = (double[])minPoint;
                double[] max = (double[])maxPoint;

                item.BoundingBox = new BoundingBox
                {
                    MinX = min[0], MinY = min[1], MinZ = min[2],
                    MaxX = max[0], MaxY = max[1], MaxZ = max[2],
                    Width = max[0] - min[0],
                    Height = max[1] - min[1],
                    Depth = max[2] - min[2]
                };
            }

            // Get all dimensions from feature tree
            item.Dimensions = ExtractDimensions(model);
        }

        /// <summary>
        /// Extract materials and appearance
        /// </summary>
        private void ExtractMaterials(IModelDoc2 model, BomItem item)
        {
            if (model is IPartDoc partDoc)
            {
                // Get material
                IMaterial material = partDoc.GetMaterial();
                if (material != null)
                {
                    item.MaterialName = material.Name;
                    item.MaterialDensity = material.Density;
                }

                // Get appearance
                int colorR = 0, colorG = 0, colorB = 0;
                partDoc.GetMaterialPropertyValues(ref colorR, ref colorG, ref colorB);
                item.Appearance = new Appearance
                {
                    ColorR = colorR,
                    ColorG = colorG,
                    ColorB = colorB
                };
            }
        }

        /// <summary>
        /// Extract feature tree structure
        /// </summary>
        private List<FeatureInfo> ExtractFeatureTree(IComponent2 component)
        {
            var features = new List<FeatureInfo>();

            IModelDoc2 modelDoc = component.GetModelDoc2();
            if (modelDoc == null) return features;

            IFeatureManager featMgr = modelDoc.FeatureManager;
            if (featMgr == null) return features;

            object[] featureArray = featMgr.GetFeatures(false);
            if (featureArray == null) return features;

            foreach (IFeature feature in featureArray)
            {
                var featInfo = new FeatureInfo
                {
                    Name = feature.Name,
                    Type = feature.GetTypeName2(),
                    IsSuppressed = feature.IsSuppressed(),
                    IsVisible = feature.Visible
                };

                // Get feature-specific data
                ExtractFeatureSpecificData(feature, featInfo);

                features.Add(featInfo);
            }

            return features;
        }

        /// <summary>
        /// Extract feature-specific data (sketches, parameters, etc.)
        /// </summary>
        private void ExtractFeatureSpecificData(IFeature feature, FeatureInfo featInfo)
        {
            string typeName = feature.GetTypeName2();

            switch (typeName)
            {
                case "BaseFlange": // Extrude
                case "ExtrudeBoss":
                    ExtractExtrudeData(feature, featInfo);
                    break;

                case "Revolve": // Revolve
                case "RevolveBoss":
                    ExtractRevolveData(feature, featInfo);
                    break;

                case "Fillet": // Fillet
                    ExtractFilletData(feature, featInfo);
                    break;

                case "HoleWiz": // Hole Wizard
                    ExtractHoleWizardData(feature, featInfo);
                    break;

                case "PatternFeature": // Pattern
                    ExtractPatternData(feature, featInfo);
                    break;

                case "Sketch": // Sketch
                    ExtractSketchData(feature, featInfo);
                    break;
            }
        }

        private void ExtractExtrudeData(IFeature feature, FeatureInfo featInfo)
        {
            IFeatureData featData = feature.GetFeatureData2();
            if (featData is IExtrudeFeatureData2 extrudeData)
            {
                featInfo.Parameters["Direction"] = extrudeData.GetReverse ? "Reverse" : "Forward";

                // Get depth
                object depthObj = extrudeData.GetDepth(false, false);
                if (depthObj is double depth)
                {
                    featInfo.Parameters["Depth"] = depth;
                }

                // Get sketch dimensions
                IFeature sketchFeature = feature.GetFirstSubFeature();
                if (sketchFeature != null)
                {
                    ExtractSketchDimensions(sketchFeature, featInfo);
                }
            }
        }

        private void ExtractRevolveData(IFeature feature, FeatureInfo featInfo)
        {
            IFeatureData featData = feature.GetFeatureData2();
            if (featData is IRevolveFeatureData2 revolveData)
            {
                featInfo.Parameters["Angle"] = revolveData.GetAngle(false);
                featInfo.Parameters["IsThin"] = revolveData.IsThinFeature();
            }
        }

        private void ExtractFilletData(IFeature feature, FeatureInfo featInfo)
        {
            IFeatureData featData = feature.GetFeatureData2();
            if (featData is IFilletFeatureData2 filletData)
            {
                featInfo.Parameters["Radius"] = filletData.GetRadius();
                featInfo.Parameters["Type"] = filletData.GetFilletType().ToString();
            }
        }

        private void ExtractHoleWizardData(IFeature feature, FeatureInfo featInfo)
        {
            IFeatureData featData = feature.GetFeatureData2();
            if (featData is IHoleWizardFeatureData2 hwData)
            {
                featInfo.Parameters["HoleType"] = hwData.HoleType.ToString();
                featInfo.Parameters["Diameter"] = hwData.HoleDiameter;
                featInfo.Parameters["Depth"] = hwData.HoleDepth;
                featInfo.Parameters["FastenerType"] = hwData.FastenerType;
            }
        }

        private void ExtractPatternData(IFeature feature, FeatureInfo featInfo)
        {
            IFeatureData featData = feature.GetFeatureData2();
            if (featData is IPatternFeatureData patternData)
            {
                featInfo.Parameters["InstanceCount"] = patternData.InstanceCount;
                featInfo.Parameters["Spacing"] = patternData.Spacing;
                featInfo.Parameters["PatternType"] = patternData.PatternType.ToString();
            }
        }

        private void ExtractSketchData(IFeature feature, FeatureInfo featInfo)
        {
            ISketch sketch = feature.GetSpecificFeature2() as ISketch;
            if (sketch != null)
            {
                featInfo.Parameters["SketchPlane"] = "Unknown"; // TODO: resolve the sketch's reference plane/face name via ISketch's containing feature once needed
                featInfo.Parameters["IsClosed"] = sketch.IsClosed();
                featInfo.Parameters["EntityCount"] = sketch.GetSketchSegmentCount();
            }
        }

        private void ExtractSketchDimensions(IFeature sketchFeature, FeatureInfo featInfo)
        {
            ISketch sketch = sketchFeature.GetSpecificFeature2() as ISketch;
            if (sketch == null) return;

            object[] dimensions = sketch.GetDimensions();
            if (dimensions == null) return;

            foreach (IDisplayDimension dim in dimensions)
            {
                string dimName = dim.GetDimension().Name;
                double dimValue = dim.GetDimension().Value;
                featInfo.Dimensions.Add(new DimensionInfo
                {
                    Name = dimName,
                    Value = dimValue,
                    Type = dim.GetDimensionType().ToString()
                });
            }
        }

        /// <summary>
        /// Extract all dimensions from model
        /// </summary>
        private List<DimensionInfo> ExtractDimensions(IModelDoc2 model)
        {
            var dimensions = new List<DimensionInfo>();

            IFeatureManager featMgr = model.FeatureManager;
            if (featMgr == null) return dimensions;

            object[] features = featMgr.GetFeatures(false);
            if (features == null) return dimensions;

            foreach (IFeature feature in features)
            {
                if (feature.GetTypeName2() == "Sketch")
                {
                    ISketch sketch = feature.GetSpecificFeature2() as ISketch;
                    if (sketch != null)
                    {
                        object[] sketchDims = sketch.GetDimensions();
                        if (sketchDims != null)
                        {
                            foreach (IDisplayDimension dim in sketchDims)
                            {
                                dimensions.Add(new DimensionInfo
                                {
                                    Name = dim.GetDimension().Name,
                                    Value = dim.GetDimension().Value,
                                    FeatureName = feature.Name
                                });
                            }
                        }
                    }
                }
            }

            return dimensions;
        }

        /// <summary>
        /// Calculate quantity for component (handles patterns, mirrors, etc.)
        /// </summary>
        private int CalculateQuantity(IComponent2 component)
        {
            int quantity = 1;

            // Check if component is part of a pattern
            IComponent2 parent = component.GetParent();
            if (parent != null)
            {
                IModelDoc2 parentDoc = parent.GetModelDoc2();
                if (parentDoc != null && parentDoc.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY)
                {
                    IAssemblyDoc parentAssy = parentDoc as IAssemblyDoc;
                    object[] children = parentAssy.GetComponents(false);

                    if (children != null)
                    {
                        int count = 0;
                        foreach (IComponent2 child in children)
                        {
                            if (child.GetPathName() == component.GetPathName())
                                count++;
                        }
                        quantity = count;
                    }
                }
            }

            // Check for pattern instances
            object patternFeature = component.GetPatternFeature();
            if (patternFeature != null)
            {
                // Quantity is handled by pattern
                quantity = 1; // Will be multiplied by pattern count
            }

            return Math.Max(1, quantity);
        }

        /// <summary>
        /// Get number of mated instances
        /// </summary>
        private int GetMatedInstanceCount(IComponent2 component)
        {
            try
            {
                IModelDoc2 model = _swApp.IActiveDoc2;
                if (model == null) return 0;

                ISelectionMgr selMgr = model.SelectionManager;
                IComponent2 comp = component;

                // Count mates involving this component
                int mateCount = 0;
                object[] mates = comp.GetMates();

                if (mates != null)
                {
                    mateCount = mates.Length;
                }

                return mateCount;
            }
            catch
            {
                return 0;
            }
        }

        /// <summary>
        /// Helper to get custom property value
        /// </summary>
        private string GetCustomProperty(ICustomPropertyManager propMgr, string longName, string shortName)
        {
            string value = "";
            string resolvedValue = "";

            // Try long name first
            propMgr.Get4(longName, false, out value, out resolvedValue);
            if (!string.IsNullOrEmpty(resolvedValue))
                return resolvedValue;

            // Try short name
            propMgr.Get4(shortName, false, out value, out resolvedValue);
            return resolvedValue ?? value ?? "";
        }
    }
}
