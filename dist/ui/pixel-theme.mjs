// Pixel theme (on by default): body.gd-pixel switches every screen to hard pixel edges, a readable sans-serif and
// a retro palette (ui/pixel.css), and the 3D stadium to a low-resolution render scaled up crisply.
// Players can switch back to the classic look in Settings → Interface; the choice is per device.
const KEY = "gridiron-pixel";

export function pixelThemeOn() {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

export function setPixelTheme(on) {
  document.body.classList.toggle("gd-pixel", on);
  try {
    localStorage.setItem(KEY, String(on));
  } catch {}
}

document.body.classList.toggle("gd-pixel", pixelThemeOn());
// Mosaic filter that ui/pixel.css applies to logos and portraits: keep one sample per 3×3 cell
// and grow it to fill the cell.
document.body.insertAdjacentHTML(
  "beforeend",
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="gd-pixelate" x="0" y="0" color-interpolation-filters="sRGB"><feFlood x="1" y="1" width="1" height="1"/><feComposite width="3" height="3"/><feTile result="grid"/><feComposite in="SourceGraphic" in2="grid" operator="in"/><feMorphology operator="dilate" radius="1"/></filter></svg>`,
);
window.PixelTheme = { on: pixelThemeOn, set: setPixelTheme };
