import PropTypes from "prop-types";
// Minimal stroke SVG icons. 1.5px stroke, 16x16 default viewbox.
const ICO = ({ d, size = 14, fill = "none" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill={fill}
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
);
ICO.propTypes = {
  d: PropTypes.any,
  size: PropTypes.number,
  fill: PropTypes.string,
};

export const Icon = {
  Bom: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M3 3h7l3 3v7H3z" />
          <path d="M10 3v3h3" />
          <path d="M5 8h6M5 11h4" />
        </>
      }
    />
  ),
  Parts: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2.5 4.5L8 2l5.5 2.5L8 7zM2.5 4.5V11L8 13.5M13.5 4.5V11L8 13.5M8 7v6.5" />
        </>
      }
    />
  ),
  Vendor: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 6h12v8H2zM4 6V3h8v3" />
          <circle cx="6" cy="10" r="1" />
          <circle cx="10" cy="10" r="1" />
        </>
      }
    />
  ),
  Cart: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 3h2l1.5 8h7L14 5H4.5" />
          <circle cx="6" cy="13.5" r="0.8" />
          <circle cx="12" cy="13.5" r="0.8" />
        </>
      }
    />
  ),
  Doc: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M4 2h6l3 3v9H4z" />
          <path d="M10 2v3h3" />
          <path d="M6 8h5M6 11h3" />
        </>
      }
    />
  ),
  Scan: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M3 3h3M3 3v3M13 3h-3M13 3v3M3 13h3M3 13v-3M13 13h-3M13 13v-3" />
          <path d="M6 8h4" />
        </>
      }
    />
  ),
  Chart: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M3 3v10h10" />
          <path d="M5 11l2-3 2 2 3-5" />
        </>
      }
    />
  ),
  Activity: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 8h3l2-5 2 10 2-5h3" />
        </>
      }
    />
  ),
  Diff: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="4" cy="4" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <path d="M4 5.5v5a2 2 0 002 2h4.5" />
        </>
      }
    />
  ),
  Settings: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.95 3.05l-1.41 1.41M4.46 11.54l-1.41 1.41M12.95 12.95l-1.41-1.41M4.46 4.46L3.05 3.05" />
        </>
      }
    />
  ),
  Search: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </>
      }
    />
  ),
  Chevron: (p) => <ICO {...p} d={<path d="M6 4l4 4-4 4" />} />,
  ChevronDown: (p) => <ICO {...p} d={<path d="M4 6l4 4 4-4" />} />,
  Plus: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M8 3v10M3 8h10" />
        </>
      }
    />
  ),
  X: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M4 4l8 8M12 4l-8 8" />
        </>
      }
    />
  ),
  Filter: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 3h12l-4 5v5l-4-2V8z" />
        </>
      }
    />
  ),
  Dots: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="4" cy="8" r="0.8" />
          <circle cx="8" cy="8" r="0.8" />
          <circle cx="12" cy="8" r="0.8" />
        </>
      }
      fill="currentColor"
    />
  ),
  Drag: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="6" cy="4" r="0.8" />
          <circle cx="10" cy="4" r="0.8" />
          <circle cx="6" cy="8" r="0.8" />
          <circle cx="10" cy="8" r="0.8" />
          <circle cx="6" cy="12" r="0.8" />
          <circle cx="10" cy="12" r="0.8" />
        </>
      }
      fill="currentColor"
    />
  ),
  Trash: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" />
        </>
      }
    />
  ),
  Edit: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M3 13h3l7-7-3-3-7 7v3z" />
          <path d="M9 4l3 3" />
        </>
      }
    />
  ),
  Export: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M8 2v8M5 5l3-3 3 3" />
          <path d="M3 11v3h10v-3" />
        </>
      }
    />
  ),
  Import: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M8 11V3M5 8l3 3 3-3" />
          <path d="M3 11v3h10v-3" />
        </>
      }
    />
  ),
  Sun: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.95 3.05l-1.41 1.41M4.46 11.54l-1.41 1.41M12.95 12.95l-1.41-1.41M4.46 4.46L3.05 3.05" />
        </>
      }
    />
  ),
  Moon: (p) => (
    <ICO {...p} d={<path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 109 6.5z" />} />
  ),
  Check: (p) => <ICO {...p} d={<path d="M3 8l3 3 7-7" />} />,
  Up: (p) => <ICO {...p} d={<path d="M4 10l4-4 4 4" />} />,
  Down: (p) => <ICO {...p} d={<path d="M4 6l4 4 4-4" />} />,
  Bell: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M4 11V7a4 4 0 018 0v4l1 1H3z" />
          <path d="M7 13.5a1 1 0 002 0" />
        </>
      }
    />
  ),
  Link: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M6 10l4-4M6.5 4l1-1a3 3 0 014 4l-1 1M9.5 12l-1 1a3 3 0 01-4-4l1-1" />
        </>
      }
    />
  ),
  Sparkles: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M4 12l2-2M10 6l2-2" />
        </>
      }
    />
  ),
  Flag: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M3 14V2M3 2h9l-2 3 2 3H3" />
        </>
      }
    />
  ),
  Folder: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M1 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1z" />
        </>
      }
    />
  ),
  Tools: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M6.5 3.5a3 3 0 00-3 3c0 1.08.42 1.86 1 2.5L3 13.5 4.5 15l4.5-4.5c.64.58 1.42 1 2.5 1a3 3 0 003-3" />
          <circle cx="11" cy="5" r="1.5" />
        </>
      }
    />
  ),
  History: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.5 1.5" />
        </>
      }
    />
  ),
  User: (p) => (
    <ICO
      {...p}
      d={
        <>
          <circle cx="8" cy="5.5" r="3" />
          <path d="M3 14c0-3 2.2-5 5-5s5 2 5 5" />
        </>
      }
    />
  ),
  Pause: (p) => (
    <ICO
      {...p}
      d={
        <>
          <rect
            x="5"
            y="3"
            width="2.5"
            height="10"
            rx="0.5"
            fill="currentColor"
          />
          <rect
            x="8.5"
            y="3"
            width="2.5"
            height="10"
            rx="0.5"
            fill="currentColor"
          />
        </>
      }
    />
  ),
  Play: (p) => (
    <ICO {...p} d={<path d="M5 3l8 5-8 5z" fill="currentColor" />} />
  ),
  Upload: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M8 11V3M5 6l3-3 3 3" />
          <path d="M3 11v3h10v-3" />
        </>
      }
    />
  ),
  ChevronLeft: (p) => <ICO {...p} d={<path d="M10 4l-4 4 4 4" />} />,
  ChevronRight: (p) => <ICO {...p} d={<path d="M6 4l4 4-4 4" />} />,
  Refresh: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 8a6 6 0 0110.5-4" />
          <path d="M14 2v4h-4" />
          <path d="M14 14a6 6 0 01-10.5 4" />
          <path d="M2 14v-4h4" />
        </>
      }
    />
  ),
  Send: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 12l14-8-4 8-4-2z" />
          <path d="M12 4l2 8" />
        </>
      }
    />
  ),
  Key: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M10 6a4 4 0 01-4 4l-1 3H3v2H1v-2l4-4a4 4 0 116-3z" />
          <circle cx="11" cy="5" r="1" fill="currentColor" />
        </>
      }
    />
  ),
  Sliders: (p) => (
    <ICO
      {...p}
      d={
        <>
          <path d="M2 4h12" />
          <path d="M2 8h8" />
          <path d="M2 12h10" />
          <circle cx="14" cy="4" r="1.5" fill="currentColor" />
          <circle cx="12" cy="8" r="1.5" fill="currentColor" />
          <circle cx="14" cy="12" r="1.5" fill="currentColor" />
        </>
      }
    />
  ),
  Calendar: (p) => (
    <ICO
      {...p}
      d={
        <>
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 7h12" />
          <path d="M5 2v3M11 2v3" />
        </>
      }
    />
  ),
};
window.Icon = Icon;
