/**
 * Standards-compliant QR Code Matrix and SVG generator using ZXing QRCodeWriter.
 * Generates ISO/IEC 18004 compliant QR Codes readable by all smartphone cameras and barcode readers.
 */

import * as zxingNamespace from "html5-qrcode/third_party/zxing-js.umd.js";

interface ZXingModule {
  QRCodeWriter: new () => {
    encode: (
      contents: string,
      format: unknown,
      width: number,
      height: number,
      hints: Map<unknown, unknown>
    ) => {
      getWidth: () => number;
      getHeight: () => number;
      get: (x: number, y: number) => boolean;
    };
  };
  BarcodeFormat: {
    QR_CODE: unknown;
  };
  EncodeHintType: {
    ERROR_CORRECTION: unknown;
    MARGIN: unknown;
  };
  QRCodeDecoderErrorCorrectionLevel: {
    M: unknown;
    L: unknown;
    Q: unknown;
    H: unknown;
  };
}

const raw = zxingNamespace as Record<string, unknown>;
const zxing = ((raw.QRCodeWriter ? raw : (raw.default as Record<string, unknown> | undefined)) ?? raw) as unknown as ZXingModule;

const { QRCodeWriter, BarcodeFormat, EncodeHintType, QRCodeDecoderErrorCorrectionLevel } = zxing;

/**
 * Generates a 2D boolean matrix representing the QR Code modules (true = dark, false = light).
 */
export function generateQrMatrix(text: string, quietZone = 4): boolean[][] {
  const hints = new Map();
  hints.set(EncodeHintType.ERROR_CORRECTION, QRCodeDecoderErrorCorrectionLevel.M);
  hints.set(EncodeHintType.MARGIN, quietZone);

  const writer = new QRCodeWriter();
  const bitMatrix = writer.encode(text, BarcodeFormat.QR_CODE, 21, 21, hints);
  const width = bitMatrix.getWidth();
  const height = bitMatrix.getHeight();

  const matrix: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(bitMatrix.get(x, y));
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
  const quietZone = options.quietZone ?? 4;
  const pixelSize = options.size ?? 240;
  const color = options.color ?? "#000000";
  const bgColor = options.bgColor ?? "#ffffff";

  const hints = new Map();
  hints.set(EncodeHintType.ERROR_CORRECTION, QRCodeDecoderErrorCorrectionLevel.M);
  hints.set(EncodeHintType.MARGIN, quietZone);

  const writer = new QRCodeWriter();
  const bitMatrix = writer.encode(text, BarcodeFormat.QR_CODE, pixelSize, pixelSize, hints);
  const width = bitMatrix.getWidth();
  const height = bitMatrix.getHeight();

  const rects: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitMatrix.get(x, y)) {
        rects.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${pixelSize}" height="${pixelSize}" data-barcode="${text}" shape-rendering="crispEdges">
    <desc>${text}</desc>
    <rect width="${width}" height="${height}" fill="${bgColor}" />
    <path d="${rects.join("")}" fill="${color}" />
  </svg>`;
}

export function generateQrDataUrl(
  text: string,
  options: { size?: number; color?: string; bgColor?: string; quietZone?: number } = {}
): string {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
