using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Extracts images and thumbnails from SolidWorks components
    /// Supports high-resolution renders and thumbnail extraction
    /// </summary>
    public class ImageExtractor
    {
        private readonly ISldWorks _swApp;
        private readonly string _exportPath;

        public ImageExtractor(ISldWorks swApp)
        {
            _swApp = swApp;
            _exportPath = Path.Combine(Path.GetTempPath(), "BlackboxBOM_Images");
            Directory.CreateDirectory(_exportPath);
        }

        /// <summary>
        /// Extract images for all components in assembly
        /// </summary>
        public List<ComponentImage> ExtractAllImages(IModelDoc2 model)
        {
            var images = new List<ComponentImage>();

            if (model.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                IAssemblyDoc assembly = model as IAssemblyDoc;
                object[] components = assembly.GetComponents2(false);

                if (components != null)
                {
                    foreach (IComponent2 component in components)
                    {
                        if (component.GetSuppression2() != (int)swComponentSuppressionState_e.swComponentSuppressed)
                        {
                            var img = ExtractComponentImage(component);
                            if (img != null)
                                images.Add(img);
                        }
                    }
                }
            }
            else if (model.GetType() == (int)swDocumentTypes_e.swDocPART)
            {
                var img = ExtractPartImage(model as IPartDoc, null);
                if (img != null)
                    images.Add(img);
            }

            return images;
        }

        /// <summary>
        /// Extract image for a single component
        /// </summary>
        public ComponentImage ExtractComponentImage(IComponent2 component)
        {
            try
            {
                IModelDoc2 modelDoc = component.GetModelDoc2();
                if (modelDoc == null) return null;

                return ExtractPartImage(modelDoc as IPartDoc, component);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error extracting image for {component.Name2}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Extract image for a part
        /// </summary>
        private ComponentImage ExtractPartImage(IPartDoc part, IComponent2 component)
        {
            if (part == null) return null;

            IModelDoc2 model = part as IModelDoc2;
            string partName = model.GetTitle();
            string partNumber = GetPartNumber(model);

            var image = new ComponentImage
            {
                PartName = partName,
                PartNumber = partNumber,
                FilePath = model.GetPathName(),
                ExtractedAt = DateTime.UtcNow
            };

            // Save model temporarily to render
            string tempPath = Path.Combine(_exportPath, $"{partNumber}_{Guid.NewGuid()}.sldprt");
            int errors = 0;
            int warnings = 0;
            model.Extension.SaveAs2(tempPath,
                (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                null, ref errors, ref warnings);

            // Extract thumbnail (32x32, 64x64, 128x128, 256x256)
            image.Thumbnail32 = ExtractThumbnail(model, 32, 32);
            image.Thumbnail64 = ExtractThumbnail(model, 64, 64);
            image.Thumbnail128 = ExtractThumbnail(model, 128, 128);
            image.Thumbnail256 = ExtractThumbnail(model, 256, 256);

            // Extract isometric view
            image.IsometricView = ExtractIsometricView(model);

            // Extract front view
            image.FrontView = ExtractView(model, swStandardViews_e.swFrontView);

            // Extract top view
            image.TopView = ExtractView(model, swStandardViews_e.swTopView);

            // Extract right view
            image.RightView = ExtractView(model, swStandardViews_e.swRightView);

            // Get dimensions info
            image.Dimensions = GetImageDimensions(model);

            // Cleanup temp file
            try { File.Delete(tempPath); } catch { }

            return image;
        }

        /// <summary>
        /// Extract thumbnail at specified size
        /// </summary>
        private byte[] ExtractThumbnail(IModelDoc2 model, int width, int height)
        {
            try
            {
                // Method 1: Use built-in thumbnail extraction
                object thumbnail = model.GetThumbnail(out width, out height);
                if (thumbnail is byte[] thumbnailBytes)
                    return thumbnailBytes;

                // Method 2: Render to bitmap
                return RenderToBytes(model, width, height);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Render model to bitmap bytes
        /// </summary>
        private byte[] RenderToBytes(IModelDoc2 model, int width, int height)
        {
            try
            {
                // Set view to isometric
                model.ShowNamedView2("*Isometric", (int)swStandardViews_e.swIsometricView);
                model.ViewZoomtofit2();

                // Create bitmap
                using (Bitmap bmp = new Bitmap(width, height))
                {
                    // Get window handle
                    IntPtr hwnd = (IntPtr)model.IActiveView.GetViewHWnd();

                    // Capture the view
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        RECT rect;
                        GetWindowRect(hwnd, out rect);

                        g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
                    }

                    // Convert to bytes
                    using (MemoryStream ms = new MemoryStream())
                    {
                        bmp.Save(ms, ImageFormat.Png);
                        return ms.ToArray();
                    }
                }
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Extract isometric view
        /// </summary>
        private byte[] ExtractIsometricView(IModelDoc2 model)
        {
            try
            {
                model.ShowNamedView2("*Isometric", (int)swStandardViews_e.swIsometricView);
                model.ViewZoomtofit2();
                model.GraphicsRedraw2(0);

                return CaptureView(model);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Extract specific standard view
        /// </summary>
        private byte[] ExtractView(IModelDoc2 model, swStandardViews_e viewType)
        {
            try
            {
                model.ShowNamedView2("*" + viewType.ToString(), (int)viewType);
                model.ViewZoomtofit2();
                model.GraphicsRedraw2(0);

                return CaptureView(model);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Capture current view as image bytes
        /// </summary>
        private byte[] CaptureView(IModelDoc2 model)
        {
            try
            {
                // Get viewport dimensions
                IView activeView = model.IActiveView;
                int viewWidth = activeView.ViewportWidth;
                int viewHeight = activeView.ViewportHeight;

                // Create bitmap
                using (Bitmap bmp = new Bitmap(viewWidth, viewHeight))
                {
                    // Get window handle
                    IntPtr hwnd = (IntPtr)activeView.GetViewHWnd();

                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        RECT rect;
                        GetWindowRect(hwnd, out rect);

                        g.CopyFromScreen(rect.Left, rect.Top, 0, 0,
                            new Size(viewWidth, viewHeight));
                    }

                    using (MemoryStream ms = new MemoryStream())
                    {
                        bmp.Save(ms, ImageFormat.Png);
                        return ms.ToArray();
                    }
                }
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Get image dimensions for the part
        /// </summary>
        private ImageDimensions GetImageDimensions(IModelDoc2 model)
        {
            try
            {
                IMassProperty massProp = model.Extension.MassProperty;
                if (massProp == null) return null;

                object minPoint, maxPoint;
                model.GetBoundingBox(out minPoint, out maxPoint);

                if (minPoint == null || maxPoint == null) return null;

                double[] min = (double[])minPoint;
                double[] max = (double[])maxPoint;

                return new ImageDimensions
                {
                    Width = max[0] - min[0],
                    Height = max[1] - min[1],
                    Depth = max[2] - min[2],
                    Units = model.Extension.GetUserUnit((int)swUserUnits_e.swLengthUnit)
                };
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Get part number from model
        /// </summary>
        private string GetPartNumber(IModelDoc2 model)
        {
            ICustomPropertyManager propMgr = model.Extension.CustomPropertyManager[""];
            if (propMgr == null)
                return Path.GetFileNameWithoutExtension(model.GetPathName());

            string value = "", resolvedValue = "";
            propMgr.Get4("PartNumber", false, out value, out resolvedValue);

            return resolvedValue ?? value ?? Path.GetFileNameWithoutExtension(model.GetPathName());
        }

        /// <summary>
        /// Extract assembly exploded view images
        /// </summary>
        public List<ComponentImage> ExtractExplodedViewImages(IModelDoc2 model)
        {
            var images = new List<ComponentImage>();

            if (model.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
                return images;

            IAssemblyDoc assembly = model as IAssemblyDoc;

            // Check for exploded views
            object[] explodeStates = assembly.GetExplodedViews();
            if (explodeStates == null) return images;

            foreach (object state in explodeStates)
            {
                // Temporarily show exploded view
                assembly.ShowExplodedView2((int)state, 0);

                // Extract image
                var img = new ComponentImage
                {
                    PartName = model.GetTitle(),
                    ViewType = $"Exploded_{state}",
                    ExtractedAt = DateTime.UtcNow
                };

                img.IsometricView = ExtractIsometricView(model);
                images.Add(img);

                // Restore normal view
                assembly.ShowExplodedView2((int)state, 1); // 1 = collapse
            }

            return images;
        }

        /// <summary>
        /// Extract component with appearance/color
        /// </summary>
        public ComponentImage ExtractComponentWithAppearance(IComponent2 component)
        {
            var image = ExtractComponentImage(component);
            if (image == null) return null;

            IModelDoc2 modelDoc = component.GetModelDoc2();
            if (modelDoc is IPartDoc partDoc)
            {
                int r = 0, g = 0, b = 0;
                partDoc.GetMaterialPropertyValues(ref r, ref g, ref b);

                image.Appearance = new AppearanceInfo
                {
                    ColorR = r,
                    ColorG = g,
                    ColorB = b,
                    HasAppearance = (r != 0 || g != 0 || b != 0)
                };
            }

            return image;
        }

        /// <summary>
        /// Export component to various image formats
        /// </summary>
        public void ExportToFormat(IModelDoc2 model, string outputDir, string format)
        {
            Directory.CreateDirectory(outputDir);

            string baseName = Path.GetFileNameWithoutExtension(model.GetPathName());

            // Export different views
            var views = new Dictionary<string, swStandardViews_e>
            {
                { "Front", swStandardViews_e.swFrontView },
                { "Back", swStandardViews_e.swBackView },
                { "Top", swStandardViews_e.swTopView },
                { "Bottom", swStandardViews_e.swBottomView },
                { "Left", swStandardViews_e.swLeftView },
                { "Right", swStandardViews_e.swRightView },
                { "Isometric", swStandardViews_e.swIsometricView },
                { "Dimetric", swStandardViews_e.swDimetricView },
                { "Trimetric", swStandardViews_e.swTrimetricView }
            };

            foreach (var view in views)
            {
                model.ShowNamedView2("*" + view.Key, (int)view.Value);
                model.ViewZoomtofit2();

                string outputPath = Path.Combine(outputDir, $"{baseName}_{view.Key}.{format.ToLower()}");

                int errors = 0;
                int warnings = 0;

                // Save as image
                if (format.ToLower() == "png")
                    model.Extension.SaveAs(outputPath, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref errors, ref warnings);
                else if (format.ToLower() == "jpg")
                    model.Extension.SaveAs(outputPath, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref errors, ref warnings);
            }
        }

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left, Top, Right, Bottom;
        }
    }

    #region Data Classes

    public class ComponentImage
    {
        public string PartName { get; set; }
        public string PartNumber { get; set; }
        public string FilePath { get; set; }
        public string ViewType { get; set; }
        public DateTime ExtractedAt { get; set; }
        public byte[] Thumbnail32 { get; set; }
        public byte[] Thumbnail64 { get; set; }
        public byte[] Thumbnail128 { get; set; }
        public byte[] Thumbnail256 { get; set; }
        public byte[] IsometricView { get; set; }
        public byte[] FrontView { get; set; }
        public byte[] TopView { get; set; }
        public byte[] RightView { get; set; }
        public ImageDimensions Dimensions { get; set; }
        public AppearanceInfo Appearance { get; set; }
    }

    public class ImageDimensions
    {
        public double Width { get; set; }
        public double Height { get; set; }
        public double Depth { get; set; }
        public string Units { get; set; }
    }

    public class AppearanceInfo
    {
        public int ColorR { get; set; }
        public int ColorG { get; set; }
        public int ColorB { get; set; }
        public bool HasAppearance { get; set; }
    }

    #endregion
}
