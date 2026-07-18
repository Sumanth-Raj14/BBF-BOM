using System;
using System.Collections.Generic;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Complete BOM data model extracted from SolidWorks
    /// </summary>
    public class BomData
    {
        public string SourceFile { get; set; }
        public DateTime ExtractedAt { get; set; }
        // NOTE: must be `global::SolidWorks...` (not a bare qualified name) — this file lives
        // in the `BlackboxBOM.SolidWorks` namespace, and from inside a namespace literally
        // named `...SolidWorks`, an unqualified `SolidWorks.Interop...` reference resolves
        // "SolidWorks" against the enclosing `BlackboxBOM` namespace first (which *does* have
        // a nested namespace called `SolidWorks` — this one), not the global `SolidWorks`
        // interop assembly — causing CS0234 ("'Interop' does not exist in the namespace
        // 'BlackboxBOM.SolidWorks'"). This is a real, assembly-independent C# language rule,
        // not a version/interop-source issue — confirmed by an actual Roslyn compile.
        public global::SolidWorks.Interop.swconst.swDocumentTypes_e ModelType { get; set; }
        public int TotalComponents { get; set; }
        public int TotalUniqueParts { get; set; }
        public List<BomItem> Items { get; set; } = new List<BomItem>();
    }

    /// <summary>
    /// Individual BOM item (component)
    /// </summary>
    public class BomItem
    {
        public string ComponentName { get; set; }
        public string ComponentPath { get; set; }
        public string PartNumber { get; set; }
        public string PartName { get; set; }
        public string Description { get; set; }
        public int Quantity { get; set; }
        public int Level { get; set; }          // depth in the assembly tree (0 = top level)
        public bool IsAssembly { get; set; }    // this component is a sub-assembly (has children)
        public string Material { get; set; }
        public string MaterialName { get; set; }
        public double MaterialDensity { get; set; }
        public string Weight { get; set; }
        public string Finish { get; set; }
        public string Vendor { get; set; }
        public string Cost { get; set; }
        public string ConfigurationName { get; set; }
        public string FilePath { get; set; }
        public string Author { get; set; }
        public DateTime? CreatedDate { get; set; }
        public DateTime? ModifiedDate { get; set; }
        public string Creator { get; set; }
        public bool IsSuppressed { get; set; }
        public bool IsVirtual { get; set; }
        public int MatedInstanceCount { get; set; }
        public Dictionary<string, string> CustomProperties { get; set; } = new Dictionary<string, string>();
        public MassProperties MassProperties { get; set; }
        public BoundingBox BoundingBox { get; set; }
        public List<FeatureInfo> Features { get; set; } = new List<FeatureInfo>();
        public List<DimensionInfo> Dimensions { get; set; } = new List<DimensionInfo>();
        public Appearance Appearance { get; set; }
    }

    /// <summary>
    /// Mass properties of a component
    /// </summary>
    public class MassProperties
    {
        public double Volume { get; set; }
        public double SurfaceArea { get; set; }
        public double Mass { get; set; }
        public double CenterOfMassX { get; set; }
        public double CenterOfMassY { get; set; }
        public double CenterOfMassZ { get; set; }
        public double MomentOfInertiaXX { get; set; }
        public double MomentOfInertiaYY { get; set; }
        public double MomentOfInertiaZZ { get; set; }
    }

    /// <summary>
    /// Bounding box of a component
    /// </summary>
    public class BoundingBox
    {
        public double MinX { get; set; }
        public double MinY { get; set; }
        public double MinZ { get; set; }
        public double MaxX { get; set; }
        public double MaxY { get; set; }
        public double MaxZ { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public double Depth { get; set; }
    }

    /// <summary>
    /// Feature information
    /// </summary>
    public class FeatureInfo
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public bool IsSuppressed { get; set; }
        public bool IsVisible { get; set; }
        public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();
        public List<DimensionInfo> Dimensions { get; set; } = new List<DimensionInfo>();
    }

    /// <summary>
    /// Dimension information
    /// </summary>
    public class DimensionInfo
    {
        public string Name { get; set; }
        public double Value { get; set; }
        public string Type { get; set; }
        public string FeatureName { get; set; }
    }

    /// <summary>
    /// Appearance/color information
    /// </summary>
    public class Appearance
    {
        public int ColorR { get; set; }
        public int ColorG { get; set; }
        public int ColorB { get; set; }
    }
}
