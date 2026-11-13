/**
 * Standards-compliant QR Code Matrix and SVG generator using ZXing QRCodeEncoder.
 * Generates ISO/IEC 18004 compliant QR Codes readable by all smartphone cameras and barcode readers.
 */

import * as zxingNamespace from "html5-qrcode/third_party/zxing-js.umd.js";

interface ZXingEncoderModule {
  QRCodeEncoder: {
    encode: (
      content: string,
      ecLevel: unknown,
      hints: Map<unknown, unknown> | null
    ) => {
      getMatrix: () => {
        getWidth: () => number;
        getHeight: () => number;
        get: (x: number, y: number) => number;
      };
    };
  };
  QRCodeDecoderErrorCorrectionLevel: {
    M: unknown;
    L: unknown;
    Q: unknown;
    H: unknown;
  };
}

const raw = zxingNamespace as Record<string, unknown>;
const zxing = ((raw.QRCodeEncoder ? raw : (raw.default as Record<string, unknown> | undefined)) ?? raw) as unknown as ZXingEncoderModule;

const { QRCodeEncoder, QRCodeDecoderErrorCorrectionLevel } = zxing;

/**
 * Generates a 2D boolean matrix representing the QR Code modules (true = dark, false = light).
 */
export function generateQrMatrix(text: string): boolean[][] {
  const qr = QRCodeEncoder.encode(text, QRCodeDecoderErrorCorrectionLevel.M, null);
  const byteMatrix = qr.getMatrix();
  const width = byteMatrix.getWidth();
  const height = byteMatrix.getHeight();

  const matrix: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(byteMatrix.get(x, y) === 1);
    }
    matrix.push(row);
  }
  return matrix;
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
