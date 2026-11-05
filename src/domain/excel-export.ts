import { formatRegistrationTime } from "@/config/event";
import type { RegistrationSnapshot } from "@/domain/registration";

const encoder = new TextEncoder();

function crc32(buf: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (~crc) >>> 0;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    result.set(a, pos);
    pos += a.length;
  }
  return result;
}

interface ZipFileEntry {
  name: string;
  content: string | Uint8Array;
}

function createZipStore(files: ZipFileEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const nameBuf = encoder.encode(file.name);

    const localHeader = new Uint8Array(30 + nameBuf.length);
    const lv = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // method 0 (store, uncompressed)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBuf.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBuf, 30);

    localHeaders.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBuf.length);
    const cv = new DataView(centralHeader.buffer, centralHeader.byteOffset, centralHeader.byteLength);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // method 0 (store)
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBuf.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBuf, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  return concatUint8Arrays([...localHeaders, ...centralHeaders, eocd]);
}

function colToLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function escapeXml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type CellValue = string | number | null | undefined;
interface CellObject {
  value: CellValue;
  style?: number;
}
type RowInput = (CellValue | CellObject)[] | { style?: number; cells: (CellValue | CellObject)[] };

interface SheetDefinition {
  name: string;
  cols?: number[];
  rows: RowInput[];
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><name val="Calibri"/><sz val="11"/></font>
    <font><b/><name val="Calibri"/><sz val="11"/><color rgb="FFFFFFFF"/></font>
    <font><b/><name val="Calibri"/><sz val="14"/><color rgb="FF8B6B23"/></font>
    <font><b/><name val="Calibri"/><sz val="11"/><color rgb="FF302319"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF382518"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

function createSheetXml(sheet: SheetDefinition): string {
  const { cols, rows } = sheet;
  let colsXml = "";
  if (cols && cols.length) {
    colsXml = "<cols>" + cols.map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>";
  }

  let rowXml = "";
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    let cellsXml = "";
    const isRowObj = typeof row === "object" && row !== null && "cells" in row;
    const cells = isRowObj ? row.cells : row;
    const rowStyle = isRowObj ? row.style : undefined;

    cells.forEach((cell, cIdx) => {
      const cellRef = `${colToLetter(cIdx)}${rowNum}`;
      const isCellObj = typeof cell === "object" && cell !== null && "value" in cell;
      const val = isCellObj ? cell.value : cell;
      const s = isCellObj && cell.style !== undefined ? cell.style : rowStyle;
      const sAttr = s !== undefined ? ` s="${s}"` : "";

      if (typeof val === "number") {
        cellsXml += `<c r="${cellRef}"${sAttr}><v>${val}</v></c>`;
      } else {
        cellsXml += `<c r="${cellRef}"${sAttr} t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
      }
    });
    rowXml += `<row r="${rowNum}">${cellsXml}</row>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function buildXlsxUint8Array(sheets: SheetDefinition[]): Uint8Array {
  const files: ZipFileEntry[] = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, idx) => `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((s, idx) => `<sheet name="${s.name}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`).join("")}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, idx) => `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`).join("")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "xl/styles.xml",
      content: stylesXml,
    },
  ];

  sheets.forEach((sheet, idx) => {
    files.push({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      content: createSheetXml(sheet),
    });
  });

  return createZipStore(files);
}

export function generateRegistrationExcel(snapshot: RegistrationSnapshot): Uint8Array {
  const exportTime = formatRegistrationTime(new Date().toISOString());
  const sortedGroups = [...snapshot.groups].sort((a, b) => a.groupNumber - b.groupNumber);

  // Group member lookup map
  const memberGroupMap = new Map<string, { groupNumber: number; registeredAt: string }>();
  snapshot.groups.forEach((g) => {
    g.members.forEach((m) => {
      memberGroupMap.set(m.id, { groupNumber: g.groupNumber, registeredAt: g.registeredAt });
    });
  });

  // Sheet 1: Rekap Kelompok
  const summarySheet: SheetDefinition = {
    name: "Rekap Kelompok",
    cols: [6, 18, 16, 55, 28],
    rows: [
      { style: 2, cells: ["THE SAI BUMI ENIGMA — REKAPITULASI PENDAFTARAN"] },
      { style: 3, cells: [`Waktu Ekspor: ${exportTime}`] },
      { cells: [`Total Peserta: ${snapshot.statistics.total} orang | Terdaftar: ${snapshot.statistics.registered} orang | Belum Terdaftar: ${snapshot.statistics.unregistered} orang | Kelompok Terdaftar: ${snapshot.groups.length}/4`] },
      { cells: [] },
      {
        style: 1,
        cells: ["No", "Nomor Kelompok", "Jumlah Anggota", "Daftar Anggota Tim", "Waktu Pendaftaran"],
      },
      ...sortedGroups.map((g, idx) => [
        idx + 1,
        `Kelompok ${String(g.groupNumber).padStart(2, "0")}`,
        `${g.members.length} orang`,
        g.members.map((m) => `${m.name} (${m.code})`).join(", "),
        formatRegistrationTime(g.registeredAt),
      ]),
    ],
  };

  // Sheet 2: Anggota Per Kelompok (Tabular detail)
  const detailRows: RowInput[] = [
    {
      style: 1,
      cells: ["No", "Kelompok", "No. Urut", "Kode Peserta", "Nama Lengkap Peserta", "Waktu Pendaftaran"],
    },
  ];
  let detailCount = 1;
  sortedGroups.forEach((g) => {
    g.members.forEach((m, mIdx) => {
      detailRows.push([
        detailCount++,
        `Kelompok ${String(g.groupNumber).padStart(2, "0")}`,
        mIdx + 1,
        m.code,
        m.name,
        formatRegistrationTime(g.registeredAt),
      ]);
    });
  });
  const detailSheet: SheetDefinition = {
    name: "Anggota Kelompok",
    cols: [6, 16, 10, 16, 32, 28],
    rows: detailRows,
  };

  // Sheet 3: Peserta Belum Terdaftar
  const remainingRows: RowInput[] = [
    {
      style: 1,
      cells: ["No", "Kode Peserta", "Nama Lengkap", "Status"],
    },
    ...snapshot.availableParticipants.map((p, idx) => [
      idx + 1,
      p.code,
      p.name,
      "Belum Terdaftar",
    ]),
  ];
  const remainingSheet: SheetDefinition = {
    name: "Belum Terdaftar",
    cols: [6, 16, 32, 18],
    rows: remainingRows,
  };

  // Sheet 4: Master Semua Peserta
  const allRows: RowInput[] = [
    {
      style: 1,
      cells: ["No", "Kode Peserta", "Nama Lengkap", "Kelompok", "Status Keanggotaan"],
    },
    ...snapshot.participants.map((p, idx) => {
      const g = memberGroupMap.get(p.id);
      return [
        idx + 1,
        p.code,
        p.name,
        g ? `Kelompok ${String(g.groupNumber).padStart(2, "0")}` : "-",
        g ? "Terdaftar" : "Belum Terdaftar",
      ];
    }),
  ];
  const allSheet: SheetDefinition = {
    name: "Semua Peserta",
    cols: [6, 16, 32, 18, 20],
    rows: allRows,
  };

  return buildXlsxUint8Array([summarySheet, detailSheet, remainingSheet, allSheet]);
}

