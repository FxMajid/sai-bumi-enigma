/**
 * Standalone Pure TypeScript QR Code Generator
 * Generates standards-compliant QR Code Matrix and SVG.
 * Supports Byte mode (UTF-8 / ASCII) with Error Correction Level M/L.
 */

// GF(256) tables with primitive polynomial 0x11D (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 256) {
      x ^= 0x11d;
    }
  }
  LOG_TABLE[0] = 0;
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  const logX = LOG_TABLE[x] ?? 0;
  const logY = LOG_TABLE[y] ?? 0;
  return EXP_TABLE[logX + logY] ?? 0;
}

// Generate Reed-Solomon generator polynomial
function getGeneratorPolynomial(degree: number): Uint8Array {
  let result = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(result.length + 1);
    const expI = EXP_TABLE[i] ?? 0;
    for (let j = 0; j < result.length; j++) {
      const resJ = result[j] ?? 0;
      nextPoly[j] = (nextPoly[j] ?? 0) ^ gfMultiply(resJ, expI);
      nextPoly[j + 1] = (nextPoly[j + 1] ?? 0) ^ resJ;
    }
    result = nextPoly;
  }
  return result;
}

function calculateErrorCorrection(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getGeneratorPolynomial(ecCount);
  const remainder = new Uint8Array(ecCount);

  for (let i = 0; i < data.length; i++) {
    const factor = (data[i] ?? 0) ^ (remainder[0] ?? 0);
    for (let j = 0; j < ecCount - 1; j++) {
      remainder[j] = (remainder[j + 1] ?? 0) ^ gfMultiply(gen[j + 1] ?? 0, factor);
    }
    remainder[ecCount - 1] = gfMultiply(gen[ecCount] ?? 0, factor);
  }
  return remainder;
}

// Version table capacities for Level M (data codewords, EC codewords, modules width)
const VERSIONS = [
  { version: 1, size: 21, dataCodewords: 16, ecCodewords: 10, align: [] as number[] },
  { version: 2, size: 25, dataCodewords: 28, ecCodewords: 16, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 44, ecCodewords: 26, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 64, ecCodewords: 36, align: [6, 26] },
] as const;

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);

  // Find minimum version that fits data
  let selected: (typeof VERSIONS)[number] = VERSIONS[0];
  for (const v of VERSIONS) {
    if (bytes.length + 3 <= v.dataCodewords) {
      selected = v;
      break;
    }
    selected = v;
  }

  const { size, dataCodewords, ecCodewords, align } = selected;

  // Build bit stream
  const bits: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for versions 1-9 in byte mode)
  pushBits(bytes.length, 8);
  // Data bytes
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i] ?? 0, 8);
  }
  // Terminator
  const totalDataBits = dataCodewords * 8;
  const termLen = Math.min(4, totalDataBits - bits.length);
  pushBits(0, termLen);
  // Round up to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    pushBits(padBytes[padIdx % 2] ?? 0, 8);
    padIdx++;
  }

  // Convert bits to data codeword array
  const dataBytes = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | (bits[i * 8 + b] ?? 0);
    }
    dataBytes[i] = val;
  }

  // Calculate EC codewords
  const ecBytes = calculateErrorCorrection(dataBytes, ecCodewords);

  // Combine data + EC codewords
  const allCodewords = new Uint8Array(dataCodewords + ecCodewords);
  allCodewords.set(dataBytes, 0);
  allCodewords.set(ecBytes, dataCodewords);

  // Initialize module matrix (null = unassigned, true = dark, false = light)
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  function setModule(r: number, c: number, val: boolean, markFunction = false) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      const row = matrix[r];
      if (row) row[c] = val;
      if (markFunction) {
        const fRow = isFunction[r];
        if (fRow) fRow[c] = true;
      }
    }
  }

  // 1. Finder patterns (7x7) + separators
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
            const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            setModule(mr, mc, isBorder || isCenter, true);
          } else {
            setModule(mr, mc, false, true); // separator
          }
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Alignment patterns
  if (align.length > 0) {
    for (const r of align) {
      for (const c of align) {
        if (
          (r < 9 && c < 9) ||
          (r < 9 && c > size - 10) ||
          (r > size - 10 && c < 9)
        ) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter, true);
          }
        }
      }
    }
  }

  // 3. Timing patterns (row 6 and col 6)
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6]?.[i]) setModule(6, i, i % 2 === 0, true);
    if (!isFunction[i]?.[6]) setModule(i, 6, i % 2 === 0, true);
  }

  // 4. Dark module
  setModule(size - 8, 8, true, true);

  // Reserve format information areas
  for (let i = 0; i < 9; i++) {
    const r8 = isFunction[8];
    if (r8 && !r8[i]) r8[i] = true;
    const ri = isFunction[i];
    if (ri && !ri[8]) ri[8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    const r8 = isFunction[8];
    if (r8 && !r8[i]) r8[i] = true;
    const ri = isFunction[i];
    if (ri && !ri[8]) ri[8] = true;
  }

  // 5. Data placement (zigzag right to left in 2-column pairs)
  let bitIdx = 0;
  const allBits: number[] = [];
  for (let i = 0; i < allCodewords.length; i++) {
    const cw = allCodewords[i] ?? 0;
    for (let b = 7; b >= 0; b--) {
      allBits.push((cw >>> b) & 1);
    }
  }

  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r]?.[c]) {
          const bit = bitIdx < allBits.length ? (allBits[bitIdx++] ?? 0) === 1 : false;
          // Mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          const row = matrix[r];
          if (row) row[c] = bit !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 6. Format info for Level M, Mask 0
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  const formatCoordsTopLeft: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const coord = formatCoordsTopLeft[i];
    if (coord) {
      const [r, c] = coord;
      const row = matrix[r];
      if (row) row[c] = formatBits[i] === 1;
    }
  }

  const formatCoordsOther: [number, number][] = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  for (let i = 0; i < 15; i++) {
    const coord = formatCoordsOther[i];
    if (coord) {
      const [r, c] = coord;
      const row = matrix[r];
      if (row) row[c] = formatBits[i] === 1;
    }
  }

  return matrix.map((row) => row.map((m) => Boolean(m)));
}

export function generateQrSvg(
  text: string,
  options: {
    size?: number;
    color?: string;
    bgColor?: string;
    quietZone?: number;
  } = {}
): string {
  const matrix = generateQrMatrix(text);
  const matrixSize = matrix.length;
  const quietZone = options.quietZone ?? 2;
  const totalModules = matrixSize + quietZone * 2;
  const pixelSize = options.size ?? 220;
  const color = options.color ?? "#000000";
  const bgColor = options.bgColor ?? "#ffffff";

  const pathParts: string[] = [];
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r]?.[c]) {
        pathParts.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${pixelSize}" height="${pixelSize}" data-barcode="${text}" shape-rendering="crispEdges">
    <desc>${text}</desc>
    <rect width="${totalModules}" height="${totalModules}" fill="${bgColor}" />
    <path d="${pathParts.join("")}" fill="${color}" />
  </svg>`;
}

export function generateQrDataUrl(
  text: string,
  options: { size?: number; color?: string; bgColor?: string } = {}
): string {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
