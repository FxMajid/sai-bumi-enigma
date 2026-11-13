"use client";

import { useEffect, useState } from "react";
import { officialGroups } from "@/config/event";
import type { QuizSubmissionRecord } from "@/domain/quiz";
import {
  generateQuizScoresExcel,
  generateAttendanceExcel,
  generateBarcodesZip,
} from "@/domain/excel-export";
import { ATTENDANCE_ROSTER, type AttendanceMember } from "@/domain/attendance";
import { generateCode128Svg } from "@/domain/barcode-svg";
import { generateQrSvg } from "@/domain/qrcode-svg";
import { Icon } from "@/components/icon";

const DEVICE_LOCK_KEY = "sai_bumi_enigma_device_attendance_lock";

function getAdminHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin_enigma_token") || "P@ssw0rd#adminEnigma2026"
      : "P@ssw0rd#adminEnigma2026";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Active Admin Tab: "quiz" | "attendance" | "catalog"
  const [activeAdminTab, setActiveAdminTab] = useState<"quiz" | "attendance" | "catalog">("quiz");

  // Quiz Submissions State
  const [submissions, setSubmissions] = useState<QuizSubmissionRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  // Master quiz status control (Open vs Closed)
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [togglingQuiz, setTogglingQuiz] = useState(false);

  // Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, string>>({});
  const [attendanceNotice, setAttendanceNotice] = useState<string | null>(null);
  const [attendanceSearch, setAttendanceSearch] = useState("");

  // Catalog State
  const [catalogGroup, setCatalogGroup] = useState<string>("ALL");
  const [catalogSearch, setCatalogSearch] = useState("");

  // Check login status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/admin/results", {
          headers: getAdminHeaders(),
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setSubmissions(data.submissions || []);
          if (data.quizStatus) {
            setIsQuizOpen(Boolean(data.quizStatus.isOpen));
          }
          setIsAuthenticated(true);
          void fetchAttendance();
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      }
    }
    void checkAuth();
  }, []);

  // Fetch submissions data
  async function refreshData() {
    setLoadingData(true);
    try {
      const res = await fetch("/api/admin/results", {
        headers: getAdminHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
        if (data.quizStatus) {
          setIsQuizOpen(Boolean(data.quizStatus.isOpen));
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingData(false);
    }
  }

  // Fetch Attendance Records
  async function fetchAttendance() {
    try {
      const res = await fetch("/api/admin/attendance", {
        headers: getAdminHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.records) {
          setAttendanceRecords(data.records);
        }
      }
    } catch {
      // fallback
    }
  }

  // Toggle quiz status (Buka / Tutup Kuis)
  async function handleToggleQuizStatus() {
    const nextStatus = !isQuizOpen;
    setTogglingQuiz(true);
    try {
      const res = await fetch("/api/admin/quiz-status", {
        method: "POST",
        headers: getAdminHeaders(),
        credentials: "include",
        body: JSON.stringify({ isOpen: nextStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsQuizOpen(Boolean(data.status?.isOpen));
      } else {
        alert("Gagal memperbarui status kuis. Silakan coba lagi.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setTogglingQuiz(false);
    }
  }

  // Delete quiz submission of a specific participant
  async function handleDeleteSingleSubmission(id: string, name: string) {
    if (!confirm(`Hapus data hasil kuis untuk ${name}? Peserta ini dapat mengikuti kuis kembali.`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/results", {
        method: "DELETE",
        headers: getAdminHeaders(),
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        alert("Gagal menghapus data kuis.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    }
  }

  // Reset ALL quiz submissions
  async function handleResetAllQuizSubmissions() {
    if (
      !confirm(
        "PERINGATAN: Apakah Anda yakin ingin mengosongkan / menghapus SELURUH data hasil kuis peserta? Tindakan ini tidak dapat dibatalkan."
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/admin/results", {
        method: "DELETE",
        headers: getAdminHeaders(),
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setSubmissions([]);
      } else {
        alert("Gagal mengosongkan data kuis.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    }
  }

  // Reset Device Lock on this browser without deleting historical attendance
  function handleResetDeviceLockOnBrowser() {
    try {
      localStorage.removeItem(DEVICE_LOCK_KEY);
      setAttendanceNotice(
        "Kunci sesi perangkat pada browser ini berhasil dibuka. Perangkat ini kini dapat digunakan untuk absensi ulang tanpa menghapus data absensi peserta yang sudah tersimpan."
      );
      setTimeout(() => setAttendanceNotice(null), 8000);
    } catch {
      alert("Gagal mereset kunci perangkat.");
    }
  }

  // Delete attendance of a specific participant
  async function handleDeleteSingleAttendance(nik: string, name: string) {
    if (!confirm(`Hapus status kehadiran untuk ${name} (${nik})? Kunci perangkat peserta ini akan otomatis ter-reset sehingga dia dapat melakukan absensi ulang.`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/attendance", {
        method: "DELETE",
        headers: getAdminHeaders(),
        credentials: "include",
        body: JSON.stringify({ nik }),
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceRecords(data.records || {});
        setAttendanceNotice(
          `Kehadiran ${name} (${nik}) berhasil dihapus. Kunci perangkat peserta telah dibuka kembali (unlocked) sehingga dia dapat melakukan absensi ulang.`
        );
        setTimeout(() => setAttendanceNotice(null), 7000);
      } else {
        alert("Gagal menghapus status absensi.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan saat menghapus absensi.");
    }
  }

  // Reset ALL attendance records
  async function handleResetAllAttendance() {
    if (
      !confirm(
        "PERINGATAN: Apakah Anda yakin ingin mengosongkan / menghapus SELURUH data kehadiran 35 peserta? Kunci semua perangkat peserta akan otomatis di-reset sehingga semua peserta dapat melakukan absensi ulang."
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/admin/attendance", {
        method: "DELETE",
        headers: getAdminHeaders(),
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setAttendanceRecords({});
        setAttendanceNotice(
          "Seluruh data absensi peserta berhasil dikosongkan. Kunci di semua perangkat peserta otomatis ter-reset sehingga semua peserta dapat melakukan absensi ulang."
        );
        setTimeout(() => setAttendanceNotice(null), 7000);
      } else {
        alert("Gagal mengosongkan data absensi.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan saat mengosongkan data absensi.");
    }
  }

  // Handle Login
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: passwordInput.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof window !== "undefined" && data.token) {
          sessionStorage.setItem("admin_enigma_token", data.token);
        }
        setIsAuthenticated(true);
        void refreshData();
        void fetchAttendance();
      } else {
        const data = await res.json();
        setLoginError(data.error || "Password admin tidak sesuai.");
      }
    } catch {
      setLoginError("Gagal menghubungi server untuk autentikasi.");
    } finally {
      setLoggingIn(false);
    }
  }

  // Handle Logout
  function handleLogout() {
    document.cookie = "admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_enigma_token");
    }
    setIsAuthenticated(false);
    setPasswordInput("");
  }

  // Handle Excel Export (Quiz)
  function handleExportQuizExcel() {
    setExporting(true);
    try {
      const bytes = generateQuizScoresExcel(submissions);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rekap-nilai-enigma-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Gagal mengekspor file Excel: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setExporting(false);
    }
  }

  // Handle Attendance Excel Export
  function handleExportAttendanceExcel() {
    try {
      const bytes = generateAttendanceExcel(ATTENDANCE_ROSTER, attendanceRecords);
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rekap-absensi-enigma-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Gagal mengekspor file Excel absensi: " + (e instanceof Error ? e.message : "Error"));
    }
  }

  // Download All Barcodes ZIP archive (Semua 35 Barcode Peserta)
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleDownloadAllBarcodesZip = () => {
    setDownloadingZip(true);
    try {
      const bytes = generateBarcodesZip(ATTENDANCE_ROSTER);
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Semua-Barcode-Peserta-Enigma.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Gagal mengunduh file ZIP barcode: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setDownloadingZip(false);
    }
  };

  // Download Single Barcode SVG (Nama file: [Nama] - [NIK].svg)
  const handleDownloadSingleBarcode = (member: AttendanceMember) => {
    const svgString = generateCode128Svg(member.barcode, {
      height: 70,
      barWidth: 2,
      color: "#111111",
      bgColor: "#ffffff",
      showText: true,
    });
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = member.nama.replace(/[/\\?%*:|"<>]/g, "").trim();
    const safeNik = member.nik.replace(/[/\\?%*:|"<>]/g, "").trim();
    a.download = `${safeName} - ${safeNik}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download QR Code SVG (Nama file: [Nama] - [NIK] - QR.svg)
  const handleDownloadQr = (member: AttendanceMember) => {
    const svgString = generateQrSvg(member.nik, {
      size: 360,
      color: "#161314",
      bgColor: "#ffffff",
      quietZone: 4,
    });
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = member.nama.replace(/[/\\?%*:|"<>]/g, "").trim();
    const safeNik = member.nik.replace(/[/\\?%*:|"<>]/g, "").trim();
    a.download = `${safeName} - ${safeNik} - QR.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered submissions
  const filteredSubmissions = submissions.filter((s) => {
    const matchesGroup =
      selectedGroupFilter === "all" || s.groupNumber === selectedGroupFilter;
    const matchesQuery =
      searchQuery.trim() === "" ||
      `${s.participantName} ${s.participantCode}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    return matchesGroup && matchesQuery;
  });

  // Calculate quiz statistics
  const totalSubmissions = submissions.length;
  const avgScore =
    totalSubmissions > 0
      ? (submissions.reduce((acc, s) => acc + s.score, 0) / totalSubmissions).toFixed(1)
      : "0";
  const highestScore =
    totalSubmissions > 0 ? Math.max(...submissions.map((s) => s.score)) : 0;
  const totalCorrectAll = submissions.reduce((acc, s) => acc + s.correctCount, 0);

  // Attendance stats
  const totalRoster = ATTENDANCE_ROSTER.length;
  const attendedCount = Object.keys(attendanceRecords).length;
  const attendancePercentage = Math.round((attendedCount / totalRoster) * 100);

  // Filtered attendance roster
  const filteredAttendance = ATTENDANCE_ROSTER.filter((m) => {
    if (!attendanceSearch.trim()) return true;
    const q = attendanceSearch.toLowerCase();
    return (
      m.nama.toLowerCase().includes(q) ||
      m.nik.toLowerCase().includes(q) ||
      m.dept.toLowerCase().includes(q) ||
      m.posisi.toLowerCase().includes(q) ||
      m.namaKelompok.toLowerCase().includes(q)
    );
  });

  // Filtered QR Catalog
  const filteredCatalog = ATTENDANCE_ROSTER.filter((m) => {
    if (catalogGroup !== "ALL") {
      if (catalogGroup === "1" && m.groupNumber !== 1) return false;
      if (catalogGroup === "2" && m.groupNumber !== 2) return false;
      if (catalogGroup === "3" && m.groupNumber !== 3) return false;
      if (catalogGroup === "4" && m.groupNumber !== 4) return false;
    }
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase();
      return (
        m.nama.toLowerCase().includes(q) ||
        m.nik.toLowerCase().includes(q) ||
        m.dept.toLowerCase().includes(q) ||
        m.posisi.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // =========================================================================
  // VIEW: LOADING CHECK
  // =========================================================================
  if (isAuthenticated === null) {
    return (
      <div className="admin-loading-screen">
        <Icon name="compass" size={36} />
        <p>Memeriksa otentikasi admin...</p>
      </div>
    );
  }

  // =========================================================================
  // VIEW: ADMIN LOGIN FORM
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="admin-login-wrapper">
        <div className="admin-login-card panel">
          <div className="admin-brand-header">
            <span className="brand-mark">
              <Icon name="compass" size={24} />
            </span>
            <div>
              <span className="eyebrow">PORTAL PENGAWAS INTERNAL</span>
              <h2>Login Admin Enigma</h2>
            </div>
          </div>

          <p className="admin-login-desc">
            Halaman ini khusus untuk panitia pengawas The Sai Bumi Enigma untuk memonitor kuis dan
            mengelola absensi resmi peserta.
          </p>

          <form onSubmit={handleLogin} className="admin-form">
            <div className="form-field-group">
              <label htmlFor="admin-pass" className="field-label">
                Password Akses Pengawas
              </label>
              <input
                id="admin-pass"
                type="password"
                className="quiz-input"
                placeholder="Masukkan password admin..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                autoFocus
              />
            </div>

            {loginError && (
              <div className="notice error-notice" role="alert">
                <Icon name="close" size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary-link btn-submit-admin"
              disabled={loggingIn || !passwordInput.trim()}
            >
              <span>{loggingIn ? "Memverifikasi..." : "Masuk Dashboard Admin"}</span>
              <Icon name="arrow" size={18} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: ADMIN DASHBOARD (QUIZ + ATTENDANCE + QR CATALOG)
  // =========================================================================
  return (
    <main className="admin-dashboard-shell">
      {/* HEADER */}
      <header className="admin-header">
        <div className="admin-header-title">
          <div className="admin-badge">
            <Icon name="shield" size={16} />
            <span>PANEL PENGAWAS RESMI THE SAI BUMI ENIGMA</span>
          </div>
          <h1>Dashboard Pengawas Acara</h1>
          <p>The Sai Bumi Enigma · Pra-Raker & Raker 2026</p>
        </div>

        <div className="admin-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void refreshData();
              void fetchAttendance();
            }}
            disabled={loadingData}
          >
            <Icon name="refresh" size={16} />
            <span>{loadingData ? "Memperbarui..." : "Refresh Data"}</span>
          </button>

          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            title="Keluar dari sesi admin"
          >
            <Icon name="close" size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* TOP NAVIGATION TABS FOR ADMIN */}
      <nav className="admin-nav-tabs" aria-label="Menu Pengawas">
        <button
          type="button"
          className={`admin-tab-btn ${activeAdminTab === "quiz" ? "is-active" : ""}`}
          onClick={() => setActiveAdminTab("quiz")}
        >
          <Icon name="compass" size={16} />
          <span>Monitoring Kuis Investigasi</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeAdminTab === "attendance" ? "is-active" : ""}`}
          onClick={() => setActiveAdminTab("attendance")}
        >
          <Icon name="award" size={16} />
          <span>
            Rekap Kehadiran Agent ({attendedCount}/{totalRoster})
          </span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeAdminTab === "catalog" ? "is-active" : ""}`}
          onClick={() => setActiveAdminTab("catalog")}
        >
          <Icon name="people" size={16} />
          <span>Katalog QR Code Peserta ({totalRoster})</span>
        </button>
      </nav>

      {/* =====================================================================
          TAB 1: MONITORING KUIS INVESTIGASI
          ===================================================================== */}
      {activeAdminTab === "quiz" && (
        <section className="admin-quiz-section">
          {/* MASTER QUIZ CONTROLLER (BUKA / TUTUP KUIS DARI SISI ADMIN) */}
          <section
            className={`admin-quiz-controller-card panel ${isQuizOpen ? "is-open" : "is-closed"}`}
          >
            <div className="controller-status-info">
              <div className="controller-kicker">
                <span className={`live-pulse-dot ${isQuizOpen ? "dot-open" : "dot-closed"}`} />
                <strong className="status-title-text">
                  {isQuizOpen
                    ? "SESI KUIS SEDANG DIBUKA (AKTIF)"
                    : "SESI KUIS SEDANG DITUTUP (TERKUNCI)"}
                </strong>
              </div>
              <p className="controller-desc">
                {isQuizOpen
                  ? "Akses peserta saat ini TERBUKA. Seluruh peserta dapat memilih nama dan mulai mengerjakan kuis investigasi 5 menit."
                  : "Akses peserta saat ini DITUTUP. Tombol mulai di halaman peserta terkunci dan menunggu pengawas membuka kuis."}
              </p>
            </div>

            <button
              type="button"
              className={`btn-toggle-quiz-master ${
                isQuizOpen ? "btn-close-action" : "btn-open-action"
              }`}
              onClick={handleToggleQuizStatus}
              disabled={togglingQuiz}
            >
              <Icon name={isQuizOpen ? "lock" : "arrow"} size={20} />
              <span>
                {togglingQuiz
                  ? "Memproses..."
                  : isQuizOpen
                  ? "TUTUP KUIS (KUNCI AKSES)"
                  : "BUKA / MULAI KUIS SEKARANG"}
              </span>
            </button>
          </section>

          {/* QUIZ STATS OVERVIEW */}
          <section className="admin-stats-grid" aria-label="Statistik Kuis">
            <div className="admin-stat-card">
              <span className="stat-label">Total Peserta Selesai</span>
              <strong className="stat-value">{totalSubmissions} orang</strong>
              <span className="stat-sub">Telah mengumpulkan kuis</span>
            </div>
            <div className="admin-stat-card">
              <span className="stat-label">Rata-rata Nilai</span>
              <strong className="stat-value text-gold">{avgScore}</strong>
              <span className="stat-sub">Skala 100</span>
            </div>
            <div className="admin-stat-card">
              <span className="stat-label">Nilai Tertinggi</span>
              <strong className="stat-value text-success">{highestScore}</strong>
              <span className="stat-sub">Skor maksimal</span>
            </div>
            <div className="admin-stat-card">
              <span className="stat-label">Total Jawaban Benar</span>
              <strong className="stat-value">{totalCorrectAll}</strong>
              <span className="stat-sub">Dari seluruh submission</span>
            </div>
          </section>

          {/* FILTER & SEARCH BAR */}
          <section className="admin-filter-bar">
            <div className="filter-group">
              <span className="filter-label">Filter Kelompok:</span>
              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${selectedGroupFilter === "all" ? "is-active" : ""}`}
                  onClick={() => setSelectedGroupFilter("all")}
                >
                  Semua ({submissions.length})
                </button>
                {officialGroups.map((g) => {
                  const count = submissions.filter((s) => s.groupNumber === g.number).length;
                  return (
                    <button
                      key={g.number}
                      type="button"
                      className={`filter-pill ${
                        selectedGroupFilter === g.number ? "is-active" : ""
                      }`}
                      onClick={() => setSelectedGroupFilter(g.number)}
                    >
                      {g.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="search-group">
              <input
                type="text"
                className="quiz-input"
                placeholder="Cari nama peserta atau kode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary-link"
                onClick={handleExportQuizExcel}
                disabled={exporting || submissions.length === 0}
              >
                <Icon name="download" size={16} />
                <span>{exporting ? "Menyiapkan..." : "Export Nilai (.xlsx)"}</span>
              </button>

              {submissions.length > 0 && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={handleResetAllQuizSubmissions}
                  title="Hapus seluruh data hasil kuis peserta"
                >
                  <Icon name="close" size={15} />
                  <span>Kosongkan Hasil Kuis</span>
                </button>
              )}
            </div>
          </section>

          {/* TABLE OF SUBMISSIONS */}
          <section className="admin-table-section panel">
            {filteredSubmissions.length === 0 ? (
              <div className="empty-table-state">
                <Icon name="compass" size={32} />
                <p>Belum ada data nilai peserta kuis yang sesuai filter.</p>
              </div>
            ) : (
              <div className="table-responsive-wrapper">
                <table className="admin-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Nama Peserta</th>
                      <th>Kode</th>
                      <th>Kelompok</th>
                      <th>Nilai</th>
                      <th>Benar</th>
                      <th>Salah</th>
                      <th>Durasi</th>
                      <th>Waktu Selesai</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((sub, index) => {
                      const mins = Math.floor(sub.timeSpentSeconds / 60);
                      const secs = sub.timeSpentSeconds % 60;
                      const timeStr = `${mins}m ${secs}s`;
                      const dateStr = new Date(sub.completedAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Jakarta",
                      });

                      return (
                        <tr key={sub.id}>
                          <td className="col-center">{index + 1}</td>
                          <td className="col-name">
                            <strong>{sub.participantName}</strong>
                          </td>
                          <td className="col-code">{sub.participantCode}</td>
                          <td className="col-group">{sub.groupName}</td>
                          <td className="col-score">
                            <span
                              className={`score-tag ${
                                sub.score >= 90
                                    ? "score-high"
                                  : sub.score >= 70
                                  ? "score-med"
                                  : "score-low"
                              }`}
                            >
                              {sub.score}
                            </span>
                          </td>
                          <td className="col-center text-success">{sub.correctCount}</td>
                          <td className="col-center text-danger">{sub.wrongCount}</td>
                          <td className="col-time">{timeStr}</td>
                          <td className="col-date">{dateStr} WIB</td>
                          <td className="col-center">
                            <button
                              type="button"
                              className="btn-table-delete-attendance"
                              onClick={() => handleDeleteSingleSubmission(sub.id, sub.participantName)}
                              title={`Hapus data nilai ${sub.participantName}`}
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      )}

      {/* =====================================================================
          TAB 2: REKAP KEHADIRAN AGENT (ABSENSI) & PENGELOLAAN
          ===================================================================== */}
      {activeAdminTab === "attendance" && (
        <section className="admin-attendance-section">
          {/* NOTICE BANNER */}
          {attendanceNotice && (
            <div className="notice success-notice" role="alert">
              <Icon name="check" size={16} />
              <span>{attendanceNotice}</span>
            </div>
          )}

          {/* ATTENDANCE CONTROLLER ACTION BAR */}
          <div className="admin-attendance-toolbar panel">
            <div className="toolbar-info">
              <span className="eyebrow">PENGELOLAAN DATA ABSENSI</span>
              <h3>Kendali Sesi & Data Kehadiran</h3>
              <p>
                Gunakan tombol buka kunci perangkat untuk memungkinkan pengujian ulang tanpa
                menghapus data kehadiran peserta lain yang telah tercatat.
              </p>
            </div>

            <div className="toolbar-buttons-cluster">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetDeviceLockOnBrowser}
                title="Buka kunci perangkat di browser ini tanpa menghapus absensi lama"
              >
                <Icon name="refresh" size={16} />
                <span>Buka Kunci Perangkat Ini (Reset Sesi)</span>
              </button>

              <button
                type="button"
                className="button button-gold"
                onClick={handleExportAttendanceExcel}
              >
                <Icon name="download" size={16} />
                <span>Download Rekap Absensi (.xlsx)</span>
              </button>

              <button
                type="button"
                className="button button-gold btn-download-all-zip"
                onClick={handleDownloadAllBarcodesZip}
                disabled={downloadingZip}
                title="Unduh seluruh 35 barcode peserta (file SVG dengan nama [Nama] - [NIK].svg) dalam 1 arsip ZIP"
              >
                <Icon name="download" size={16} />
                <span>{downloadingZip ? "Menyiapkan ZIP..." : "Download Semua Barcode (.zip)"}</span>
              </button>

              <button
                type="button"
                className="btn-danger-outline"
                onClick={handleResetAllAttendance}
                title="Hapus seluruh data kehadiran 35 peserta"
              >
                <Icon name="close" size={16} />
                <span>Kosongkan / Reset Semua Absen</span>
              </button>
            </div>
          </div>

          {/* ATTENDANCE STATS OVERVIEW */}
          <section className="admin-stats-grid">
            <div className="admin-stat-card">
              <span className="stat-label">Total Peserta Terdaftar</span>
              <strong className="stat-value">{totalRoster} orang</strong>
              <span className="stat-sub">4 Kelompok Resmi</span>
            </div>
            <div className="admin-stat-card">
              <span className="stat-label">Total Hadir / Terabsen</span>
              <strong className="stat-value text-success">{attendedCount} orang</strong>
              <span className="stat-sub">{attendancePercentage}% dari seluruh peserta</span>
            </div>
            <div className="admin-stat-card">
              <span className="stat-label">Belum Absen</span>
              <strong className="stat-value text-danger">{totalRoster - attendedCount} orang</strong>
              <span className="stat-sub">Menunggu verifikasi kehadiran</span>
            </div>
          </section>

          {/* SEARCH BAR */}
          <div className="admin-filter-bar">
            <div className="search-group" style={{ width: "100%", maxWidth: "420px" }}>
              <input
                type="text"
                className="quiz-input"
                placeholder="Cari nama, NIK, atau kelompok..."
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
              />
            </div>
            <span className="text-muted" style={{ fontSize: "12px", alignSelf: "center" }}>
              Menampilkan {filteredAttendance.length} dari {totalRoster} peserta
            </span>
          </div>

          {/* ATTENDANCE DATA TABLE */}
          <div className="admin-table-section panel">
            <div className="table-responsive-wrapper">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>NIK</th>
                    <th>Nama Detektif</th>
                    <th>Posisi</th>
                    <th>Dept</th>
                    <th>Kelompok</th>
                    <th>Rank</th>
                    <th>Status</th>
                    <th>Waktu Hadir</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((m) => {
                    const recordTime = attendanceRecords[m.nik];
                    const isPresent = Boolean(recordTime);
                    const formattedTime = recordTime
                      ? new Date(recordTime).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        }) + " WIB"
                      : "—";

                    return (
                      <tr key={m.nik} className={isPresent ? "row-present" : ""}>
                        <td className="col-center">{m.no}</td>
                        <td className="col-code">{m.nik}</td>
                        <td className="col-name">
                          <strong>{m.nama}</strong>
                        </td>
                        <td>{m.posisi}</td>
                        <td>{m.dept}</td>
                        <td className="col-group">
                          {m.namaKelompok} (Tim {m.groupNumber})
                        </td>
                        <td>{m.statusRank}</td>
                        <td>
                          <span
                            className={`score-tag ${
                              isPresent ? "score-high" : "score-low"
                            }`}
                          >
                            {isPresent ? "✓ Hadir" : "Belum"}
                          </span>
                        </td>
                        <td className="col-time">{formattedTime}</td>
                        <td className="col-center">
                          {isPresent ? (
                            <button
                              type="button"
                              className="btn-table-delete-attendance"
                              onClick={() => handleDeleteSingleAttendance(m.nik, m.nama)}
                              title="Hapus kehadiran peserta ini"
                            >
                              Hapus Absen
                            </button>
                          ) : (
                            <span className="text-muted" style={{ fontSize: "11px" }}>
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          TAB 3: KATALOG QR CODE PESERTA (35 AGENT)
          ===================================================================== */}
      {activeAdminTab === "catalog" && (
        <section className="catalog-section">
          <div className="catalog-toolbar panel">
            <div className="catalog-filters">
              <div className="filter-group-buttons">
                <span className="filter-lbl">Filter Kelompok:</span>
                {["ALL", "1", "2", "3", "4"].map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    className={`btn-filter-grp ${catalogGroup === grp ? "is-active" : ""}`}
                    onClick={() => setCatalogGroup(grp)}
                  >
                    {grp === "ALL" ? "Semua Tim (35)" : `Kelompok ${grp}`}
                  </button>
                ))}
              </div>

              <div className="filter-search-wrap">
                <input
                  type="text"
                  className="quiz-input"
                  placeholder="Cari nama, NIK, atau posisi..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="catalog-summary-stats">
              <span>
                Menampilkan <strong>{filteredCatalog.length}</strong> dari{" "}
                <strong>{totalRoster}</strong> peserta resmi
              </span>
              <button
                type="button"
                className="button button-gold btn-download-all-zip"
                onClick={handleDownloadAllBarcodesZip}
                disabled={downloadingZip}
                title="Unduh seluruh 35 barcode peserta (file SVG dengan nama [Nama] - [NIK].svg) dalam 1 arsip ZIP"
              >
                <Icon name="download" size={16} />
                <span>{downloadingZip ? "Menyiapkan ZIP..." : "Download Semua Barcode (.zip)"}</span>
              </button>
            </div>
          </div>

          <div className="catalog-cards-grid">
            {filteredCatalog.map((member) => {
              const isAttended = Boolean(attendanceRecords[member.nik]);
              return (
                <div
                  key={member.nik}
                  className={`catalog-member-card panel ${isAttended ? "is-attended" : ""}`}
                >
                  <div className="catalog-card-header">
                    <span className="member-num-tag">
                      #{String(member.no).padStart(2, "0")} · Kelompok {member.groupNumber}
                    </span>
                    <span className={`status-pill ${isAttended ? "pill-present" : "pill-absent"}`}>
                      {isAttended ? "✓ Hadir" : "Belum Hadir"}
                    </span>
                  </div>

                  <div className="catalog-card-body">
                    <h3 className="catalog-member-name">{member.nama}</h3>
                    <p className="catalog-member-pos">
                      {member.posisi} — <strong>{member.dept}</strong>
                    </p>
                    <div className="catalog-badges-row">
                      <span className="badge-rank">{member.statusRank}</span>
                      <span className="badge-team">{member.namaKelompok}</span>
                      <span className="badge-gender">{member.genderLabel}</span>
                    </div>

                    {/* BARCODE PREVIEW */}
                    <div className="catalog-barcode-block">
                      <span className="block-subheading">BARCODE IDENTITAS (CODE 128)</span>
                      <div
                        className="catalog-barcode-svg-box"
                        dangerouslySetInnerHTML={{
                          __html: generateCode128Svg(member.barcode, {
                            height: 48,
                            barWidth: 1.6,
                            color: "#161314",
                            bgColor: "#ffffff",
                            showText: true,
                          }),
                        }}
                      />
                    </div>

                    {/* QR CODE DISPLAY */}
                    <div className="catalog-qr-wrap">
                      <div
                        className="catalog-qr-svg"
                        dangerouslySetInnerHTML={{
                          __html: generateQrSvg(member.nik, {
                            size: 140,
                            color: "#161314",
                            bgColor: "#ffffff",
                            quietZone: 4,
                          }),
                        }}
                      />
                      <div className="catalog-barcode-mono">
                        <span>KODE NIK:</span>
                        <strong>{member.nik}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="catalog-card-footer">
                    <button
                      type="button"
                      className="btn-card-action btn-download-barcode"
                      onClick={() => handleDownloadSingleBarcode(member)}
                      title={`Download Barcode: ${member.nama} - ${member.nik}.svg`}
                    >
                      <Icon name="download" size={14} />
                      <span>Barcode (.svg)</span>
                    </button>
                    <button
                      type="button"
                      className="btn-card-action btn-download-qr"
                      onClick={() => handleDownloadQr(member)}
                      title={`Download QR: ${member.nama} - ${member.nik} - QR.svg`}
                    >
                      <Icon name="download" size={14} />
                      <span>QR (.svg)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
