using System;
using System.Runtime.InteropServices;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using System.Windows.Forms;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Watches SolidWorks events for real-time bidirectional sync
    /// Monitors document save, component add/remove, feature changes
    /// </summary>
    public class EventWatcher : IDisposable
    {
        private readonly ISldWorks _swApp;
        private bool _isWatching;

        public event Action<string> OnDocumentSaved;
        public event Action<string> OnComponentAdded;
        public event Action<string> OnComponentRemoved;
        public event Action<string, int> OnFeatureCreated;
        public event Action<string, int> OnFeatureModified;
        public event Action<string, int> OnFeatureDeleted;

        public EventWatcher(ISldWorks swApp)
        {
            _swApp = swApp;
        }

        public void StartWatching()
        {
            if (_isWatching) return;

            // Setup event handlers
            _swApp.ActiveDocChangeNotify += OnActiveDocChange;
            _swApp.FileSaveNotify += OnFileSave;
            _swApp.FileSavePostNotify += OnFileSavePost;
            _swApp.ComponentActiveStateChangeNotify += OnComponentActiveStateChange;
            _swApp.ComponentVisibilityChangeNotify += OnComponentVisibilityChange;

            _isWatching = true;
        }

        public void StopWatching()
        {
            if (!_isWatching) return;

            _swApp.ActiveDocChangeNotify -= OnActiveDocChange;
            _swApp.FileSaveNotify -= OnFileSave;
            _swApp.FileSavePostNotify -= OnFileSavePost;
            _swApp.ComponentActiveStateChangeNotify -= OnComponentActiveStateChange;
            _swApp.ComponentVisibilityChangeNotify -= OnComponentVisibilityChange;

            _isWatching = false;
        }

        #region Event Handlers

        private int OnActiveDocChange()
        {
            // Document changed
            return 0;
        }

        private int OnFileSave(string fileName)
        {
            OnDocumentSaved?.Invoke(fileName);
            return 0;
        }

        private int OnFileSavePost(string fileName)
        {
            // Post-save processing
            return 0;
        }

        private int OnComponentActiveStateChange(string compName, int oldState, int newState)
        {
            if (newState == 1) // Activated
            {
                OnComponentAdded?.Invoke(compName);
            }
            else if (newState == 0) // Deactivated
            {
                OnComponentRemoved?.Invoke(compName);
            }
            return 0;
        }

        private int OnComponentVisibilityChange(string compName, int newState)
        {
            // Component visibility changed
            return 0;
        }

        #endregion

        #region Assembly Event Monitoring

        /// <summary>
        /// Monitor assembly-level events (component add/remove)
        /// </summary>
        public void MonitorAssemblyEvents(IAssemblyDoc assembly)
        {
            if (assembly == null) return;

            // Subscribe to assembly events
            assembly.AssemblyCutListPropUpdate += OnCutListUpdate;
            assembly.ComponentAddNotify += OnComponentAdd;
            assembly.ComponentRemoveNotify += OnComponentRemove;
            assembly.ComponentSuppressNotify += OnComponentSuppress;
            assembly.ComponentUnsuppressNotify += OnComponentUnsuppress;
        }

        private int OnCutListUpdate()
        {
            // Cut list updated
            return 0;
        }

        private int OnComponentAdd(object component)
        {
            if (component is IComponent2 comp)
            {
                OnComponentAdded?.Invoke(comp.Name2);
            }
            return 0;
        }

        private int OnComponentRemove(object component)
        {
            if (component is IComponent2 comp)
            {
                OnComponentRemoved?.Invoke(comp.Name2);
            }
            return 0;
        }

        private int OnComponentSuppress(object component)
        {
            if (component is IComponent2 comp)
            {
                // Notify of suppression
                OnComponentRemoved?.Invoke(comp.Name2);
            }
            return 0;
        }

        private int OnComponentUnsuppress(object component)
        {
            if (component is IComponent2 comp)
            {
                // Notify of unsuppression
                OnComponentAdded?.Invoke(comp.Name2);
            }
            return 0;
        }

        #endregion

        #region Feature Event Monitoring

        /// <summary>
        /// Monitor feature-level events
        /// </summary>
        public void MonitorFeatureEvents(IModelDoc2 model)
        {
            if (model == null) return;

            // Feature creation
            model.FeatureManager.FeatureCreate += OnFeatureCreate;

            // Feature modification
            model.FeatureManager.FeatureModify += OnFeatureModify;

            // Feature deletion
            model.FeatureManager.FeatureDelete += OnFeatureDelete;

            // Sketch events
            model.SketchManager.PreParabola += OnSketchPreParabola;
        }

        private int OnFeatureCreate(object feature, int type, object obj)
        {
            if (feature is IFeature feat)
            {
                OnFeatureCreated?.Invoke(feat.Name, type);
            }
            return 0;
        }

        private int OnFeatureModify(object feature, int type, object obj)
        {
            if (feature is IFeature feat)
            {
                OnFeatureModified?.Invoke(feat.Name, type);
            }
            return 0;
        }

        private int OnFeatureDelete(object feature, int type, object obj)
        {
            if (feature is IFeature feat)
            {
                OnFeatureDeleted?.Invoke(feat.Name, type);
            }
            return 0;
        }

        private int OnSketchPreParabola(object sketchSegment)
        {
            // Sketch parabola event
            return 0;
        }

        #endregion

        #region Cleanup

        public void Dispose()
        {
            StopWatching();
        }

        #endregion
    }
}
