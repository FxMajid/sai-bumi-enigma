"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTENDANCE_ROSTER,
  ATTENDANCE_TARGET_LOCATION,
  calculateDistanceMeters,
  findMemberByBarcode,
  type AttendanceMember,
} from "@/domain/attendance";
import { Icon } from "./icon";

const ATTENDANCE_STORAGE_KEY = "sai_bumi_enigma_attendance_records";
const DEVICE_LOCK_KEY = "sai_bumi_enigma_device_attendance_lock";

interface DeviceLock {
  nik: string;
  nama: string;
  timestamp: string;
}

function getStoredRecords(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredRecords(records: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

function getStoredDeviceLock(): DeviceLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEVICE_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.nik === "string" && typeof parsed.nama === "string") {
      return parsed as DeviceLock;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredDeviceLock(lock: DeviceLock) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEVICE_LOCK_KEY, JSON.stringify(lock));
  } catch {
    // ignore
  }
}

function playScanBeep() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
    osc.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // ignore
  }
}

function playTypingClick() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(650 + Math.random() * 300, ctx.currentTime);
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  } catch {
    // ignore
  }
}

function playRadarSweepSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // ignore
  }
}

export function AttendanceApp() {
  // Attendance Records: NIK -> ISO timestamp
  const [, setRecords] = useState<Record<string, string>>(getStoredRecords);

  // Device Lock State (Silent 1 device = 1 user)
  const [deviceLock, setDeviceLock] = useState<DeviceLock | null>(getStoredDeviceLock);

  // Lazy initializer if device already locked
  const [initialLockedInfo] = useState(() => {
    const lock = getStoredDeviceLock();
    if (lock) {
      const member = findMemberByBarcode(lock.nik);
      if (member) {
        return { member, time: lock.timestamp };
      }
    }
    return null;
  });

  // Scanner state
  const [scanError, setScanError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Geolocation state (PT. Tunas Dwipa Matra - TDM)
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    distanceMeters: number;
    isWithinRange: boolean;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "checking" | "granted" | "denied" | "out_of_range"
  >("idle");
  const [locationError, setLocationError] = useState<string | null>(null);

  // Magnifying glass radar searching state
  const [isSearchingAgent, setIsSearchingAgent] = useState(false);
  const [searchPhaseText, setSearchPhaseText] = useState("");

  // Active scanned member & Typewriter animation state on Detective ID Card
  const [scannedMember, setScannedMember] = useState<AttendanceMember | null>(
    () => initialLockedInfo?.member ?? null
  );
  const [scannedTime, setScannedTime] = useState<string | null>(
    () => initialLockedInfo?.time ?? null
  );
  const [typedNameCount, setTypedNameCount] = useState<number>(
    () => initialLockedInfo?.member?.nama.length ?? 0
  );
  const [revealedFieldsCount, setRevealedFieldsCount] = useState<number>(
    () => (initialLockedInfo?.member ? 6 : 0)
  );
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Simulation Mode State (Khusus Pengujian / Testing)
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [simulationNik, setSimulationNik] = useState("");
  const [simulationBypassGps, setSimulationBypassGps] = useState(true);
  const [simulationBypassDeviceLock, setSimulationBypassDeviceLock] = useState(true);

  // Sync attendance records from server on mount
  useEffect(() => {
    async function syncRecords() {
      try {
        const res = await fetch("/api/attendance");
        if (res.ok) {
          const data = await res.json();
          if (data.records && typeof data.records === "object") {
            setRecords((prev) => {
              const merged = { ...prev, ...data.records };
              saveStoredRecords(merged);
              return merged;
            });
          }
        }
      } catch {
        // use local
      }
    }
    void syncRecords();
  }, []);

  // Check GPS Location
  const verifyLocation = useCallback(async (): Promise<boolean> => {
    // If on localhost or private dev environment, allow bypass for testing
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.endsWith(".local"))
    ) {
      return true;
    }

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return true;
    }

    setLocationStatus("checking");
    setLocationError(null);

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const distance = calculateDistanceMeters(
            latitude,
            longitude,
            ATTENDANCE_TARGET_LOCATION.latitude,
            ATTENDANCE_TARGET_LOCATION.longitude
          );
          const withinRange = distance <= ATTENDANCE_TARGET_LOCATION.maxRadiusMeters;

          setUserLocation({
            latitude,
            longitude,
            distanceMeters: distance,
            isWithinRange: withinRange,
          });

          if (withinRange) {
            setLocationStatus("granted");
            resolve(true);
          } else {
            setLocationStatus("out_of_range");
            setLocationError(
              `Lokasi Anda terdeteksi berjarak ${distance.toLocaleString(
                "id-ID"
              )} meter dari PT. Tunas Dwipa Matra (TDM). Absensi hanya dapat dilakukan di area acara (radius ${
                ATTENDANCE_TARGET_LOCATION.maxRadiusMeters
              }m).`
            );
            resolve(false);
          }
        },
        (err) => {
          let msg = "Akses lokasi diperlukan untuk memverifikasi kehadiran di area acara.";
          if (err.code === err.PERMISSION_DENIED) {
            msg = "Izin lokasi (GPS) ditolak. Silakan izinkan akses lokasi pada browser Anda.";
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            msg = "Sinyal lokasi tidak terdeteksi. Pastikan GPS perangkat Anda aktif.";
          } else if (err.code === err.TIMEOUT) {
            msg = "Waktu permintaan lokasi habis. Silakan coba kembali.";
          }
          setLocationStatus("denied");
          setLocationError(msg);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }, []);

  // Execute attendance check-in after radar search completes
  const executeAttendanceConfirmation = useCallback(
    (member: AttendanceMember) => {
      const now = new Date();
      const isoStr = now.toISOString();

      // Record attendance locally
      setRecords((prev) => {
        const updated = {
          ...prev,
          [member.nik]: prev[member.nik] || isoStr,
        };
        saveStoredRecords(updated);
        return updated;
      });

      // Sync attendance to server
      void fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik: member.nik, timestamp: isoStr }),
      }).catch(() => {});

      // Save silent device lock if not already set
      if (!deviceLock) {
        const newLock: DeviceLock = {
          nik: member.nik,
          nama: member.nama,
          timestamp: isoStr,
        };
        setDeviceLock(newLock);
        saveStoredDeviceLock(newLock);
      }

      // Set active scanned member and initiate typewriter animation on ID Card
      setScannedMember(member);
      setScannedTime(isoStr);
      setTypedNameCount(0);
      setRevealedFieldsCount(0);
      playScanBeep();
    },
    [deviceLock]
  );

  // Trigger searching radar animation with magnifying glass
  const triggerSearchAnimation = useCallback(
    (member: AttendanceMember) => {
      setIsSearchingAgent(true);
      setScannedMember(null);
      setSearchPhaseText("MENGAKTIFKAN RADAR ENIGMA...");
      playRadarSweepSound();

      // Phase 1 -> Phase 2 (600ms)
      setTimeout(() => {
        setSearchPhaseText(`MEMINDAI ARSIP KODE DETEKTIF: ${member.nik}...`);
      }, 600);

      // Phase 2 -> Phase 3 (1200ms)
      setTimeout(() => {
        setSearchPhaseText(`IDENTITAS AGEN DITEMUKAN: ${member.nama}`);
      }, 1200);

      // Phase 3 -> Reveal ID Card (1800ms)
      setTimeout(() => {
        setIsSearchingAgent(false);
        executeAttendanceConfirmation(member);
      }, 1800);
    },
    [executeAttendanceConfirmation]
  );

  // Main barcode scanning processing handler
  const handleProcessBarcode = useCallback(
    async (barcodeText: string) => {
      const trimmed = barcodeText.trim();
      if (!trimmed) return;

      const member = findMemberByBarcode(trimmed);
      if (!member) {
        setScanError(`Kode barcode "${trimmed}" tidak cocok dengan daftar barcode peserta resmi.`);
        return;
      }

      setScanError(null);

      // 1. Silent Device Lock Check: 1 Device = 1 User
      const currentLock = getStoredDeviceLock();
      if (currentLock && currentLock.nik !== member.nik) {
        setScanError(
          `Perangkat ini sudah digunakan untuk absensi agen lain (${currentLock.nama}). Sesuai ketentuan, 1 device hanya dapat digunakan untuk absensi 1 orang.`
        );
        return;
      }

      // 2. Geolocation Check (Target location PT. Tunas Dwipa Matra - TDM)
      const isLocationValid = await verifyLocation();
      if (!isLocationValid) {
        return;
      }

      // 3. Trigger magnifying glass radar search animation
      triggerSearchAnimation(member);
    },
    [verifyLocation, triggerSearchAnimation]
  );

  // Handle Simulation NIK Submission (Khusus Pengujian / Testing)
  const handleSimulateNikSubmit = useCallback(
    async (e?: React.FormEvent, explicitNik?: string) => {
      if (e) e.preventDefault();
      const targetNik = (explicitNik ?? simulationNik).trim();
      if (!targetNik) return;

      const member = findMemberByBarcode(targetNik);
      if (!member) {
        setScanError(`[SIMULASI] NIK / Nama "${targetNik}" tidak ditemukan dalam daftar peserta resmi.`);
        return;
      }

      setScanError(null);

      // Check device lock unless bypassed for simulation
      if (!simulationBypassDeviceLock) {
        const currentLock = getStoredDeviceLock();
        if (currentLock && currentLock.nik !== member.nik) {
          setScanError(
            `[SIMULASI] Perangkat ini sudah terkunci untuk agen lain (${currentLock.nama}). Centang "Bypass Kunci 1 Perangkat" untuk menguji agen lain.`
          );
          return;
        }
      }

      // Check GPS location unless bypassed for simulation
      if (!simulationBypassGps) {
        const isLocationValid = await verifyLocation();
        if (!isLocationValid) {
          return;
        }
      }

      // Trigger radar animation & check-in
      triggerSearchAnimation(member);
    },
    [simulationNik, simulationBypassDeviceLock, simulationBypassGps, verifyLocation, triggerSearchAnimation]
  );

  // Automatic Listener for physical USB / Bluetooth Barcode Scanners
  useEffect(() => {
    let keyBuffer = "";
    let lastKeyTime = Date.now();

    function handleKeyDown(e: KeyboardEvent) {
      // If user is focused on an input or textarea, don't capture
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const now = Date.now();
      // Hardware barcode scanners send keystrokes with < 50ms intervals
      if (now - lastKeyTime > 160) {
        keyBuffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (keyBuffer.trim().length >= 4) {
          void handleProcessBarcode(keyBuffer.trim());
        }
        keyBuffer = "";
      } else if (e.key.length === 1) {
        keyBuffer += e.key;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleProcessBarcode]);

  // Typewriter ticker effect directly on Detective ID Card
  useEffect(() => {
    if (!scannedMember) return;

    const targetName = scannedMember.nama;

    if (typedNameCount < targetName.length) {
      typingTimerRef.current = setTimeout(() => {
        setTypedNameCount((prev) => {
          const next = prev + 1;
          playTypingClick();
          return next;
        });
      }, 35);
    } else if (revealedFieldsCount < 6) {
      typingTimerRef.current = setTimeout(() => {
        setRevealedFieldsCount((prev) => prev + 1);
        playTypingClick();
      }, 80);
    }

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [scannedMember, typedNameCount, revealedFieldsCount]);

  // Fast forward typewriter animation
  const handleSkipTyping = () => {
    if (!scannedMember) return;
    setTypedNameCount(scannedMember.nama.length);
    setRevealedFieldsCount(6);
  };

  // Camera video barcode scanner
  useEffect(() => {
    if (!isCameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let active = true;
    let scanInterval: NodeJS.Timeout | null = null;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
          try {
            const BarcodeDetectorClass = (window as unknown as {
              BarcodeDetector: new (opts?: { formats: string[] }) => {
                detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
              };
            }).BarcodeDetector;
            const detector = new BarcodeDetectorClass({
              formats: ["code_128", "qr_code", "code_39", "ean_13"],
            });

            scanInterval = setInterval(async () => {
              if (
                videoRef.current &&
                videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
              ) {
                try {
                  const barcodes = await detector.detect(videoRef.current);
                  const firstBarcode = barcodes[0];
                  if (firstBarcode?.rawValue) {
                    void handleProcessBarcode(firstBarcode.rawValue);
                  }
                } catch {
                  // ignore
                }
              }
            }, 300);
          } catch {
            // fallback
          }
        }
      } catch {
        setScanError(
          "Tidak dapat membuka kamera perangkat. Pastikan izin kamera aktif untuk memindai barcode."
        );
        setIsCameraActive(false);
      }
    }

    void startCamera();

    return () => {
      active = false;
      if (scanInterval) clearInterval(scanInterval);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isCameraActive, handleProcessBarcode]);

  const isNameTypingComplete = Boolean(
    scannedMember && typedNameCount >= scannedMember.nama.length
  );
  const displayedName = scannedMember ? scannedMember.nama.slice(0, typedNameCount) : "";

  return (
    <div className="attendance-page-shell">
      {/* HEADER HERO (CLEAN & BALANCED) */}
      <header className="attendance-header-hero panel">
        <div className="header-meta-row">
          <span className="eyebrow">
            <Icon name="compass" size={15} /> SISTEM ABSENSI AGENT · RAKER 2026
          </span>
          <span className="header-tag-live">
            <span className="live-dot" /> VERIFIKASI LOKASI AKTIF
          </span>
        </div>

        <h1 className="attendance-hero-title">
          Absensi Agent <em>The Sai Bumi Enigma</em>
        </h1>
        <p className="attendance-hero-desc">
          Verifikasi kehadiran detektif resmi melalui pemindaian barcode fisik di lokasi acara PT.
          Tunas Dwipa Matra (TDM).
        </p>
      </header>

      {/* SCANNER & RESULT SECTION */}
      <section className="scanner-section">
        <div className="scanner-layout-grid">
          {/* SCANNER CONTROLLER CARD (BARCODE ONLY) */}
          <div className="scanner-controls-card panel">
            <div className="card-kicker">
              <Icon name="shield" size={14} />
              <span>PEMINDAI BARCODE RESMI</span>
            </div>
            <h2 className="controls-heading">Pindai Barcode Agen</h2>

            {/* LOCATION VERIFICATION BOX */}
            <div
              className={`location-verification-card ${
                locationStatus === "granted"
                  ? "is-verified"
                  : locationStatus === "out_of_range" || locationStatus === "denied"
                  ? "is-warning"
                  : ""
              }`}
            >
              <div className="loc-card-top">
                <span className="loc-icon-pill">
                  <Icon name="compass" size={16} />
                </span>
                <div>
                  <strong>Lokasi: PT. Tunas Dwipa Matra (TDM)</strong>
                  <span className="loc-coords">
                    Lat: {ATTENDANCE_TARGET_LOCATION.latitude.toFixed(5)}, Long:{" "}
                    {ATTENDANCE_TARGET_LOCATION.longitude.toFixed(5)}
                  </span>
                </div>
              </div>

              <div className="loc-status-detail">
                {locationStatus === "checking" ? (
                  <span className="loc-detecting">
                    <span className="spinner small" /> Memeriksa koordinat GPS...
                  </span>
                ) : locationStatus === "granted" ? (
                  <span className="loc-success">
                    <Icon name="check" size={14} /> Lokasi terverifikasi di area acara (Jarak:{" "}
                    {userLocation?.distanceMeters}m)
                  </span>
                ) : locationStatus === "out_of_range" ? (
                  <div className="loc-alert">
                    <p>
                      <Icon name="info" size={14} /> Jarak Anda saat ini:{" "}
                      <strong>{userLocation?.distanceMeters.toLocaleString("id-ID")}m</strong> dari
                      lokasi acara (radius maksimal {ATTENDANCE_TARGET_LOCATION.maxRadiusMeters}m).
                    </p>
                    <a
                      href={ATTENDANCE_TARGET_LOCATION.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-open-map"
                    >
                      <span>Buka Google Maps</span>
                      <Icon name="arrow" size={14} />
                    </a>
                  </div>
                ) : locationStatus === "denied" ? (
                  <div className="loc-alert">
                    <p>
                      <Icon name="info" size={14} /> {locationError}
                    </p>
                    <button
                      type="button"
                      className="btn-retry-loc"
                      onClick={() => void verifyLocation()}
                    >
                      Periksa Ulang Lokasi GPS
                    </button>
                  </div>
                ) : (
                  <span className="loc-standby">
                    Lokasi GPS diverifikasi secara otomatis saat pemindaian barcode.
                  </span>
                )}
              </div>
            </div>

            {/* CAMERA TOGGLE & PREVIEW */}
            <div className="camera-viewport-wrap">
              {isCameraActive ? (
                <div className="camera-active-box">
                  <video ref={videoRef} playsInline muted className="scanner-video" />
                  <div className="camera-crosshairs">
                    <div className="laser-scanner-line" />
                    <div className="scanner-corner tl" />
                    <div className="scanner-corner tr" />
                    <div className="scanner-corner bl" />
                    <div className="scanner-corner br" />
                    <span className="camera-hint">Arahkan Barcode ke Garis Pindai</span>
                  </div>
                </div>
              ) : (
                <div className="camera-idle-box">
                  <span className="camera-idle-icon">
                    <Icon name="search" size={40} />
                  </span>
                  <strong>Kamera Pemindai Barcode</strong>
                  <p>
                    Gunakan kamera perangkat atau scanner barcode fisik untuk membaca barcode tanda
                    pengenal peserta.
                  </p>
                </div>
              )}

              <button
                type="button"
                className={`btn-camera-toggle ${
                  isCameraActive ? "btn-camera-stop" : "btn-camera-start"
                }`}
                onClick={() => setIsCameraActive(!isCameraActive)}
              >
                <Icon name="refresh" size={16} />
                <span>
                  {isCameraActive ? "Matikan Kamera Pemindai" : "Buka Kamera Pemindai Barcode"}
                </span>
              </button>
            </div>

            {/* ERROR NOTICE */}
            {scanError && (
              <div className="notice error-notice" role="alert" style={{ marginTop: "16px" }}>
                <Icon name="close" size={16} />
                <span>{scanError}</span>
              </div>
            )}

            {/* SIMULATION MODE PANEL (KHUSUS PENGUJIAN / TESTING) */}
            <div className="attendance-simulation-box">
              <div className="simulation-header-toggle">
                <div className="sim-title-wrap">
                  <span className="sim-badge">MODE SIMULASI</span>
                  <span className="sim-caption">Pengujian Input NIK (Testing)</span>
                </div>
                <button
                  type="button"
                  className={`btn-toggle-sim ${isSimulationOpen ? "is-open" : ""}`}
                  onClick={() => setIsSimulationOpen(!isSimulationOpen)}
                  title="Buka / Tutup panel simulasi input NIK"
                >
                  <Icon name="search" size={14} />
                  <span>{isSimulationOpen ? "Tutup Simulasi" : "Simulasi Input NIK"}</span>
                </button>
              </div>

              {isSimulationOpen && (
                <div className="simulation-body-panel">
                  <p className="simulation-intro-text">
                    Gunakan panel ini untuk menguji animasi radar pencarian detektif dan cetak kartu identitas resmi tanpa menggunakan barcode fisik.
                  </p>

                  <form className="simulation-form" onSubmit={(e) => void handleSimulateNikSubmit(e)}>
                    <div className="sim-input-row">
                      <input
                        type="text"
                        className="quiz-input sim-text-input"
                        placeholder="Ketik NIK peserta (contoh: DMAD18021)..."
                        value={simulationNik}
                        onChange={(e) => setSimulationNik(e.target.value)}
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        className="button button-gold sim-btn-submit"
                        disabled={!simulationNik.trim()}
                      >
                        <Icon name="check" size={16} />
                        <span>Simulasi Absen</span>
                      </button>
                    </div>

                    {/* Quick selection dropdown from roster */}
                    <div className="sim-select-row">
                      <label className="sim-select-lbl" htmlFor="sim-quick-select">
                        Atau pilih langsung dari peserta resmi:
                      </label>
                      <select
                        id="sim-quick-select"
                        className="quiz-input sim-select-dropdown"
                        value={simulationNik}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSimulationNik(val);
                          if (val) {
                            void handleSimulateNikSubmit(undefined, val);
                          }
                        }}
                      >
                        <option value="">-- Pilih Peserta untuk Simulasi --</option>
                        {ATTENDANCE_ROSTER.map((m) => (
                          <option key={m.nik} value={m.nik}>
                            {m.nama} ({m.nik}) — {m.namaKelompok}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Simulation Options (Bypass GPS & Bypass Device Lock) */}
                    <div className="sim-options-grid">
                      <label className="sim-checkbox-label">
                        <input
                          type="checkbox"
                          checked={simulationBypassGps}
                          onChange={(e) => setSimulationBypassGps(e.target.checked)}
                        />
                        <span>Bypass Lokasi GPS (Khusus Simulasi)</span>
                      </label>

                      <label className="sim-checkbox-label">
                        <input
                          type="checkbox"
                          checked={simulationBypassDeviceLock}
                          onChange={(e) => setSimulationBypassDeviceLock(e.target.checked)}
                        />
                        <span>Bypass Kunci 1 Perangkat (Bisa Coba Peserta Lain)</span>
                      </label>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* RESULTS VIEWPORT: SEARCHING RADAR ANIMATION OR TYPEWRITER ID CARD */}
          <div className="scanner-result-area">
            {/* RADAR SEARCHING OVERLAY (KACA PEMBESAR MENCARI AGENT) */}
            {isSearchingAgent && (
              <div className="searching-agent-overlay panel" role="status" aria-live="polite">
                <div className="radar-screen">
                  <div className="radar-sweep" />
                  <div className="sonar-ring r1" />
                  <div className="sonar-ring r2" />
                  <div className="sonar-ring r3" />
                  <div className="magnifying-glass-center">
                    <span className="magnifying-icon">
                      <Icon name="search" size={54} />
                    </span>
                  </div>
                </div>

                <div className="search-text-content">
                  <span className="search-eyebrow">RADAR ENIGMA AKTIF</span>
                  <h3 className="search-phase-heading">{searchPhaseText}</h3>
                  <p className="search-subtext">Memverifikasi berkas identitas detektif resmi...</p>
                  <div className="searching-progress-line">
                    <div className="searching-progress-fill" />
                  </div>
                </div>
              </div>
            )}

            {/* STANDBY STATE (CLEAN USER-FRIENDLY TEXT) */}
            {!isSearchingAgent && !scannedMember && (
              <div className="scanner-standby-panel panel">
                <div className="standby-icon-ring">
                  <Icon name="compass" size={42} />
                </div>
                <h3>Pindai Barcode Identitas Anda</h3>
                <p>
                  Arahkan kamera ke barcode fisik tanda pengenal Anda untuk memverifikasi kehadiran
                  resmi The Sai Bumi Enigma di lokasi acara.
                </p>
                <div className="standby-hints">
                  <div className="hint-pill">
                    <Icon name="check" size={14} /> Pemindaian Barcode Fisik Resmi
                  </div>
                  <div className="hint-pill">
                    <Icon name="check" size={14} /> Lokasi Acara: PT. Tunas Dwipa Matra (TDM)
                  </div>
                  <div className="hint-pill">
                    <Icon name="check" size={14} /> Verifikasi Kartu Detektif Resmi
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVE RESULT: OFFICIAL DETECTIVE ID CARD (INTEGRATED TYPEWRITER, NO BARCODE) */}
            {!isSearchingAgent && scannedMember && (
              <div className="active-result-display">
                <div className="detective-id-card panel">
                  {/* CARD TOPBAR */}
                  <div className="id-card-header">
                    <div className="id-card-brand">
                      <span className="brand-badge-mini">
                        <Icon name="compass" size={18} />
                      </span>
                      <div>
                        <strong>THE SAI BUMI ENIGMA</strong>
                        <span className="id-kicker">KARTU IDENTITAS AGEN RESMI · RAKER 2026</span>
                      </div>
                    </div>
                    <div className="id-card-controls-right">
                      <span className="id-card-number">
                        NO. {String(scannedMember.no).padStart(2, "0")} / 35
                      </span>
                      {isSimulationOpen && (
                        <button
                          type="button"
                          className="btn-sim-reset-card"
                          onClick={() => {
                            setScannedMember(null);
                            setSimulationNik("");
                          }}
                          title="Kembali ke mode input / pilih peserta lain untuk simulasi"
                        >
                          <Icon name="refresh" size={13} />
                          <span>Coba Agen Lain (Simulasi)</span>
                        </button>
                      )}
                      {!isNameTypingComplete && (
                        <button
                          type="button"
                          className="btn-skip-typing-card"
                          onClick={handleSkipTyping}
                          title="Lewati animasi ketik"
                        >
                          Lewati Animasi ⏩
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CARD MAIN BODY */}
                  <div className="id-card-main-body-integrated">
                    {/* LEFT: AGENT AVATAR & BADGES */}
                    <div className="id-card-avatar-box">
                      <div className="agent-avatar-circle">
                        <Icon name="people" size={44} />
                        <span className="avatar-rank-star">
                          {scannedMember.statusRank.toLowerCase().includes("lead") ? "★★" : "★"}
                        </span>
                      </div>
                      <span className="agent-rank-pill">{scannedMember.statusRank}</span>
                      <span className="agent-gender-tag">{scannedMember.genderLabel}</span>
                      <div className="avatar-status-pill">
                        <Icon name="check" size={12} />
                        <span>TERVERIFIKASI</span>
                      </div>
                    </div>

                    {/* RIGHT: TYPEWRITER NAME & DECRYPTED DATA FIELDS */}
                    <div className="id-card-meta-details-integrated">
                      <span className="agent-title-label">NAMA RESMI AGEN</span>
                      <h2 className="agent-name-title-typewriter">
                        {displayedName}
                        {!isNameTypingComplete && (
                          <span className="typewriter-cursor-gold">█</span>
                        )}
                      </h2>

                      <p className="agent-position-subtitle">
                        <span className="pos-badge">{scannedMember.posisi}</span>
                        <span className="dept-sep">•</span>
                        <span className="dept-text">{scannedMember.dept}</span>
                      </p>

                      {/* INFO GRID WITH SEQUENTIAL FADE-IN DECRYPTION */}
                      <div className="agent-info-grid-integrated">
                        <div
                          className={`info-cell ${
                            revealedFieldsCount >= 1 ? "is-revealed" : "is-encrypted"
                          }`}
                        >
                          <span className="info-lbl">NIK DETEKTIF</span>
                          <strong className="info-val text-gold">{scannedMember.nik}</strong>
                        </div>

                        <div
                          className={`info-cell ${
                            revealedFieldsCount >= 2 ? "is-revealed" : "is-encrypted"
                          }`}
                        >
                          <span className="info-lbl">DEPARTEMEN</span>
                          <strong className="info-val">{scannedMember.dept}</strong>
                        </div>

                        <div
                          className={`info-cell ${
                            revealedFieldsCount >= 3 ? "is-revealed" : "is-encrypted"
                          }`}
                        >
                          <span className="info-lbl">KELOMPOK TIM</span>
                          <strong className="info-val text-gold">
                            {scannedMember.namaKelompok} (Tim {scannedMember.groupNumber})
                          </strong>
                        </div>

                        <div
                          className={`info-cell ${
                            revealedFieldsCount >= 4 ? "is-revealed" : "is-encrypted"
                          }`}
                        >
                          <span className="info-lbl">STATUS RANK</span>
                          <strong className="info-val text-gold">
                            {scannedMember.statusRank}
                          </strong>
                        </div>

                        <div
                          className={`info-cell ${
                            revealedFieldsCount >= 5 ? "is-revealed" : "is-encrypted"
                          }`}
                        >
                          <span className="info-lbl">JABATAN</span>
                          <strong className="info-val">{scannedMember.jabatan}</strong>
                        </div>

                        <div
                          className={`info-cell ${
                            revealedFieldsCount >= 6 ? "is-revealed" : "is-encrypted"
                          }`}
                        >
                          <span className="info-lbl">JENIS KELAMIN</span>
                          <strong className="info-val">
                            {scannedMember.genderLabel} ({scannedMember.gender})
                          </strong>
                        </div>
                      </div>

                      {/* ATTENDANCE CONFIRMED STAMP BANNER */}
                      <div className="id-card-attendance-stamp">
                        <div className="stamp-left">
                          <Icon name="award" size={22} />
                          <div>
                            <strong>STATUS KEHADIRAN: TERABSENSI RESMI</strong>
                            <span>
                              Waktu Scan:{" "}
                              {scannedTime
                                ? new Date(scannedTime).toLocaleString("id-ID", {
                                    dateStyle: "full",
                                    timeStyle: "medium",
                                    timeZone: "Asia/Jakarta",
                                  })
                                : "-"}{" "}
                              WIB
                            </span>
                            <span className="stamp-sub-loc">
                              Lokasi: PT. Tunas Dwipa Matra (TDM)
                            </span>
                          </div>
                        </div>
                        <div className="stamp-seal">CHECK-IN VALID</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
