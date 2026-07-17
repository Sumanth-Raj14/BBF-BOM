import '@testing-library/jest-dom'

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  });
}
