import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENDANCE_ROSTER,
  ATTENDANCE_TARGET_LOCATION,
  calculateDistanceMeters,
  findMemberByBarcode,
  mapGroupToNumber,
} from "../src/domain/attendance";
import { generateCode128Svg } from "../src/domain/barcode-svg";
import { generateQrSvg, generateQrMatrix } from "../src/domain/qrcode-svg";
import { generateAttendanceExcel, generateBarcodesZip } from "../src/domain/excel-export";

test("attendance roster has exactly 35 participants with valid data", () => {
  assert.equal(ATTENDANCE_ROSTER.length, 35);

  const niks = new Set<string>();
  for (const m of ATTENDANCE_ROSTER) {
    assert.ok(m.nik.length >= 5, `NIK ${m.nik} too short`);
    assert.ok(m.nama.length > 2, `Nama ${m.nama} too short`);
    assert.ok(m.posisi.length > 2, `Posisi empty`);
    assert.ok(m.dept.length > 1, `Dept empty`);
    assert.ok(["L", "P"].includes(m.gender));
    assert.ok(m.groupNumber >= 1 && m.groupNumber <= 4);
    assert.ok(m.statusRank.length > 0);
    assert.ok(m.barcode === m.nik);
    niks.add(m.nik);
  }
  // Ensure all NIKs are unique
  assert.equal(niks.size, 35);
});

test("mapGroupToNumber correctly categorizes all 4 teams", () => {
  assert.equal(mapGroupToNumber("Team Lupin"), 1);
  assert.equal(mapGroupToNumber("Detective Lupin"), 2);
  assert.equal(mapGroupToNumber("CONAN"), 3);
  assert.equal(mapGroupToNumber("HOLMES"), 4);
});

test("findMemberByBarcode finds members by exact NIK, barcode, or name", () => {
  const member1 = findMemberByBarcode("DMAD18021");
  assert.ok(member1);
  assert.equal(member1.nama, "REZA AGNESTASIA");
  assert.equal(member1.dept, "ARFCT");
  assert.equal(member1.statusRank, "Agent");
  assert.equal(member1.namaKelompok, "HOLMES");

  const memberSonny = findMemberByBarcode("SONNY KURNIAWAN");
  assert.ok(memberSonny);
  assert.equal(memberSonny.nik, "DMMK22010");
  assert.equal(memberSonny.namaKelompok, "Team Lupin");

  const unknown = findMemberByBarcode("UNKNOWN999");
  assert.equal(unknown, null);
});

test("generateCode128Svg creates valid SVG with bars and text", () => {
  const svg = generateCode128Svg("DMAD18021");
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("rect"));
  assert.ok(svg.includes("DMAD18021"));
  assert.ok(svg.endsWith("</svg>"));
});

test("generateQrMatrix and generateQrSvg generate valid QR matrix and SVG", () => {
  const matrix = generateQrMatrix("DMAD18021");
  assert.ok(matrix.length >= 21);
  assert.equal(matrix.length, matrix[0]?.length);

  const svg = generateQrSvg("DMAD18021");
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<path d="));
  assert.ok(svg.endsWith("</svg>"));
});

test("generateAttendanceExcel creates valid xlsx workbook buffer", () => {
  const records = {
    DMAD18021: "2026-11-24T08:15:00.000Z",
    DMMK22010: "2026-11-24T08:17:30.000Z",
  };
  const bytes = generateAttendanceExcel(ATTENDANCE_ROSTER, records);
  assert.ok(bytes.length > 500);
  // Zip header: PK (0x50 0x4B 0x03 0x04)
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});

test("calculateDistanceMeters accurately calculates distance to target location", () => {
  // Same coordinates should have 0 distance
  const target = ATTENDANCE_TARGET_LOCATION;
  const distZero = calculateDistanceMeters(target.latitude, target.longitude, target.latitude, target.longitude);
  assert.equal(distZero, 0);

  // Close point ~50m away
  const distClose = calculateDistanceMeters(
    target.latitude,
    target.longitude,
    target.latitude + 0.0003,
    target.longitude + 0.0003
  );
  assert.ok(distClose > 0 && distClose < 100);

  // Far point (e.g. Jakarta ~-6.2088, 106.8456) should be > 100km (100,000m)
  const distJakarta = calculateDistanceMeters(target.latitude, target.longitude, -6.2088, 106.8456);
  assert.ok(distJakarta > 150000);
});

test("generateBarcodesZip creates valid zip containing all 35 participant SVGs named [Nama] - [NIK].svg", () => {
  const zipBytes = generateBarcodesZip(ATTENDANCE_ROSTER);
  assert.ok(zipBytes.length > 5000);
  // Zip header: PK (0x50 0x4B 0x03 0x04)
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);

  const decoder = new TextDecoder();
  const zipText = decoder.decode(zipBytes);
  // Check that files are named with Name and NIK
  assert.ok(zipText.includes("REZA AGNESTASIA - DMAD18021.svg"));
  assert.ok(zipText.includes("SONNY KURNIAWAN - DMMK22010.svg"));
  assert.ok(zipText.includes("<svg"));
});
