import PropTypes from "prop-types";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";

import { __t } from "../../i18n";

// ============ REAL CAD 3D VIEWER ============
//
// Replaces the previous "faux 3D using SVG" preview, which drew a CSS-transform
// wireframe box that had nothing to do with the actual file.
//
// What genuinely renders, and why the list stops where it does:
//   * STL / OBJ / GLTF / GLB / PLY / 3MF -> mesh formats, loaded directly by
//     the loaders that ship with three (already a dependency).
//   * STEP / IGES -> tessellated in-browser by occt-import-js, a WASM build of
//     the OpenCascade kernel. Heavier, so it is imported lazily on first use.
//   * SLDPRT / SLDASM -> NOT possible. They are proprietary SolidWorks binaries
//     with no public format; only SolidWorks can open them. Export STEP or STL
//     from SolidWorks (or use the add-in) and those load fine. We say so
//     instead of showing a decorative box.
const MESH_EXT = {
  stl: "stl",
  obj: "obj",
  gltf: "gltf",
  glb: "gltf",
  ply: "ply",
  "3mf": "3mf",
};
const OCCT_EXT = { step: "step", stp: "step", iges: "iges", igs: "iges" };
const NATIVE_CAD_EXT = ["sldprt", "sldasm", "ipt", "iam", "prt", "catpart"];

export function extOf(name) {
  return String(name || "")
    .split(".")
    .pop()
    .toLowerCase();
}

export function isViewable(name) {
  const e = extOf(name);
  return Boolean(MESH_EXT[e] || OCCT_EXT[e]);
}

/** Build three.js geometry from whatever the file turns out to be. */
async function buildObject(arrayBuffer, ext) {
  if (OCCT_EXT[ext]) {
    // Lazy: the WASM kernel is multi-MB, so it must not sit in the main bundle.
    const occtimportjs = (await import("occt-import-js")).default;
    // The package ships a 7.6 MB .wasm next to its JS. Emscripten resolves that
    // relative to the script URL, which is wrong once Vite hashes and moves the
    // bundle -- it 404s and STEP/IGES silently fail. `?url` makes Vite emit the
    // binary as a build asset and hand us the correct hashed path, in dev and
    // in production alike.
    const wasmUrl = (await import("occt-import-js/dist/occt-import-js.wasm?url"))
      .default;
    const occt = await occtimportjs({ locateFile: () => wasmUrl });
    const bytes = new Uint8Array(arrayBuffer);
    const result =
      OCCT_EXT[ext] === "step"
        ? occt.ReadStepFile(bytes, null)
        : occt.ReadIgesFile(bytes, null);
    if (!result || !result.success || !result.meshes?.length) {
      throw new Error(
        __t("cadViewer.parseFailed") ||
          "Could not tessellate this file — it may be corrupt or empty.",
      );
    }
    const group = new THREE.Group();
    result.meshes.forEach((m) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(m.attributes.position.array, 3),
      );
      if (m.attributes.normal) {
        geom.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(m.attributes.normal.array, 3),
        );
      } else {
        geom.computeVertexNormals();
      }
      if (m.index) geom.setIndex(Array.from(m.index.array));
      const color = m.color
        ? new THREE.Color(m.color[0], m.color[1], m.color[2])
        : new THREE.Color(0x9aa4b2);
      group.add(
        new THREE.Mesh(
          geom,
          new THREE.MeshStandardMaterial({
            color,
            metalness: 0.15,
            roughness: 0.7,
          }),
        ),
      );
    });
    return group;
  }

  const kind = MESH_EXT[ext];
  const material = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2,
    metalness: 0.15,
    roughness: 0.7,
  });

  if (kind === "stl") {
    const geom = new STLLoader().parse(arrayBuffer);
    geom.computeVertexNormals();
    return new THREE.Mesh(geom, material);
  }
  if (kind === "ply") {
    const geom = new PLYLoader().parse(arrayBuffer);
    geom.computeVertexNormals();
    return new THREE.Mesh(geom, material);
  }
  if (kind === "obj") {
    return new OBJLoader().parse(new TextDecoder().decode(arrayBuffer));
  }
  if (kind === "3mf") {
    return new ThreeMFLoader().parse(arrayBuffer);
  }
  if (kind === "gltf") {
    const gltf = await new Promise((resolve, reject) =>
      new GLTFLoader().parse(arrayBuffer, "", resolve, reject),
    );
    return gltf.scene;
  }
  throw new Error(
    (__t("cadViewer.unsupported") || "Unsupported format") + ": ." + ext,
  );
}

/**
 * @param {ArrayBuffer|null} buffer  file bytes (null while unavailable)
 * @param {string} name              filename, used only to pick the loader
 */
export default function CadViewer({ buffer, name, height = 360 }) {
  const mountRef = React.useRef(null);
  const [status, setStatus] = React.useState("idle"); // idle|loading|ready|error
  const [message, setMessage] = React.useState("");
  const ext = extOf(name);

  React.useEffect(() => {
    if (!buffer || !mountRef.current) return undefined;

    if (NATIVE_CAD_EXT.includes(ext)) {
      setStatus("error");
      setMessage(
        __t("cadViewer.proprietary") ||
          "." +
            ext +
            " is a proprietary CAD format that only its own application can open. Export STEP or STL and it will render here.",
      );
      return undefined;
    }
    if (!isViewable(name)) {
      setStatus("error");
      setMessage(
        (__t("cadViewer.unsupported") || "Unsupported format") + ": ." + ext,
      );
      return undefined;
    }

    let disposed = false;
    const mount = mountRef.current;
    const width = mount.clientWidth || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161d);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 1, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1, -0.5, -1);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    let frame;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    setStatus("loading");
    buildObject(buffer, ext)
      .then((object) => {
        if (disposed) return;
        // Centre on the origin and frame the whole model, whatever its units:
        // CAD files arrive in mm, m or inches with arbitrary origins.
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        object.position.sub(centre);
        scene.add(object);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const dist = (maxDim / 2 / Math.tan((Math.PI * 45) / 360)) * 1.6;
        camera.position.set(dist, dist * 0.7, dist);
        camera.near = maxDim / 1000;
        camera.far = maxDim * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        setStatus("ready");
        animate();
      })
      .catch((e) => {
        if (disposed) return;
        setStatus("error");
        setMessage(e?.message || String(e));
      });

    const onResize = () => {
      const w = mount.clientWidth || width;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
      controls.dispose();
      // WebGL contexts are a finite browser resource — always release them.
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [buffer, name, ext, height]);

  return (
    <div className="cad-viewer">
      <div
        ref={mountRef}
        className="cad-viewer__canvas"
        style={{ height }}
        role="img"
        aria-label={
          (__t("cadViewer.aria") || "3D preview of") + " " + (name || "model")
        }
      />
      {status === "loading" && (
        <div className="cad-viewer__overlay" role="status">
          {__t("cadViewer.loading") || "Tessellating model…"}
        </div>
      )}
      {status === "error" && (
        <div className="cad-viewer__overlay cad-viewer__overlay--error" role="alert">
          {message}
        </div>
      )}
      {!buffer && status === "idle" && (
        <div className="cad-viewer__overlay" role="status">
          {__t("cadViewer.noData") || "No file data available to render."}
        </div>
      )}
      <style>{`
        .cad-viewer { position: relative; border-radius: var(--radius-sm); overflow: hidden; }
        .cad-viewer__canvas { width: 100%; background: #11161d; }
        .cad-viewer__overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: var(--sp-4);
          text-align: center;
          background: rgba(17,22,29,.92);
          color: var(--text-secondary, #c7ccd4);
          font-size: var(--fs-100);
          line-height: 1.5;
        }
        .cad-viewer__overlay--error { color: #f5a3a3; }
      `}</style>
    </div>
  );
}

CadViewer.propTypes = {
  buffer: PropTypes.object,
  name: PropTypes.string,
  height: PropTypes.number,
};
