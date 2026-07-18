using System;

namespace BlackboxBOM.SolidWorks
{
    /// <summary>
    /// Metadata describing a SolidWorks COM add-in. This is the standard attribute
    /// used by the SolidWorks Add-in project template — it is NOT part of the
    /// SolidWorks Interop assemblies, so it must be defined in-project (it was
    /// referenced via [SwAddin(...)] on <see cref="BlackboxBomAddin"/> but never
    /// declared, which is a hard compile error).
    ///
    /// SolidWorks itself does not read this attribute; registration happens via
    /// the COM registry keys written in <see cref="BlackboxBomAddin.RegisterFunction"/>.
    /// It is kept here (and read via reflection at registration time) so the
    /// title/description/load-at-startup behavior has a single source of truth
    /// instead of being duplicated as string literals.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
    public sealed class SwAddinAttribute : Attribute
    {
        /// <summary>Display name shown in SolidWorks' Tools &gt; Add-Ins dialog.</summary>
        public string Title { get; set; }

        /// <summary>Longer description shown alongside the title.</summary>
        public string Description { get; set; }

        /// <summary>Whether SolidWorks should load this add-in automatically on startup.</summary>
        public bool LoadAtStartup { get; set; }
    }
}
