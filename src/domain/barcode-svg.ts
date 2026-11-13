/**
 * Code 128 (Subset B) Barcode SVG Generator
 * Generates clean, crisp SVG barcodes for alphanumeric codes like NIK / Participant ID.
 */

// Code 128 patterns (index corresponds to code value 0 - 106)
// Each number string represents bar and space widths (e.g. "212222" means 2 bar, 1 space, 2 bar, 2 space, 2 bar, 2 space)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const START_B = 104;
const STOP = 106;

export function generateCode128Svg(
  text: string,
  options: {
    height?: number;
    barWidth?: number;
    color?: string;
    bgColor?: string;
    showText?: boolean;
  } = {}
): string {
  const height = options.height ?? 60;
  const barWidth = options.barWidth ?? 2;
  const color = options.color ?? "#000000";
  const bgColor = options.bgColor ?? "transparent";
  const showText = options.showText ?? true;

  const codes: number[] = [START_B];
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // ASCII 32 - 126
    const codeVal = charCode - 32;
    if (codeVal >= 0 && codeVal <= 94) {
      codes.push(codeVal);
    }
  }

  // Calculate checksum
  let checksum = START_B;
  for (let i = 1; i < codes.length; i++) {
    checksum += (codes[i] ?? 0) * i;
  }
  codes.push(checksum % 103);
  codes.push(STOP);

  // Build pattern
  let pattern = "";
  for (const c of codes) {
    const pat = CODE128_PATTERNS[c];
    if (pat) pattern += pat;
  }

  // Calculate width
  let totalUnits = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char) totalUnits += parseInt(char, 10);
  }

  const quietZone = 10 * barWidth;
  const totalSvgWidth = totalUnits * barWidth + quietZone * 2;
  const textHeight = showText ? 18 : 0;
  const totalSvgHeight = height + textHeight + 10;

  // Draw bars
  let currentX = quietZone;
  let isBar = true;
  const rects: string[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (!char) continue;
    const widthUnits = parseInt(char, 10);
    const w = widthUnits * barWidth;
    if (isBar) {
      rects.push(`<rect x="${currentX}" y="5" width="${w}" height="${height}" fill="${color}" />`);
    }
    currentX += w;
    isBar = !isBar;
  }

  let textSvg = "";
  if (showText) {
    const textY = height + 18;
    textSvg = `<text x="${totalSvgWidth / 2}" y="${textY}" font-family="monospace" font-size="13" font-weight="bold" fill="${color}" text-anchor="middle" letter-spacing="2">${text}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" width="${totalSvgWidth}" height="${totalSvgHeight}" data-barcode="${text}" style="background:${bgColor};">
    <desc>${text}</desc>
    ${rects.join("")}
    ${textSvg}
  </svg>`;
}
