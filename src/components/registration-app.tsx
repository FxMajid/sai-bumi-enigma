"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { event, formatRegistrationTime } from "@/config/event";
import type { DataConfiguration } from "@/config/runtime";
import { registrationSchema, validatePhoto, type RegisteredGroup, type RegistrationSnapshot } from "@/domain/registration";
import { createRegistrationRepository } from "@/repositories";
import { RepositoryError, type RegistrationRepository } from "@/repositories/registration-repository";
import { Icon } from "./icon";
import { ParticipantPicker } from "./participant-picker";
import { GroupPhoto } from "./group-photo";

function ConfigurationNotice({ reason }: { reason: Extract<DataConfiguration, { mode: "unavailable" }>["reason"] }) {
  return <section id="pendaftaran" className="configuration-panel panel" aria-labelledby="configuration-title">
    <div className="section-kicker"><Icon name="compass" /><span>MENYIAPKAN PERJALANAN</span></div>
    <h2 id="configuration-title">Pendaftaran belum dibuka.</h2>
    <p>{reason === "invalid-mode" ? "Mode data belum valid. Pengelola perlu memeriksa konfigurasi aplikasi." : "Konfigurasi backend belum lengkap. Daftar peserta dan pendaftaran akan tersedia setelah pengelola menyiapkan layanan acara."}</p>
    <div className="setup-instructions"><h3>Untuk pengelola aplikasi</h3><ol><li>Isi <code>.env.local</code> sendiri menggunakan <code>.env.example</code>. Jangan bagikan secret melalui chat.</li><li>Ikuti panduan migration dan import peserta di <code>docs/supabase-setup.md</code>, lalu restart server.</li><li>Untuk mencoba simulasi secara terpisah, atur <code>APP_DATA_MODE=demo</code>.</li></ol><p>Mode demo menggunakan data sintetis sementara dan tidak menghubungi database.</p></div>
    <p className="privacy-note"><Icon name="info" size={18} />Pada saat layanan aktif, nama anggota dan foto kelompok dapat dilihat oleh setiap pengunjung halaman ini.</p>
  </section>;
}

function StepTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="step-heading"><span className="step-number" aria-hidden="true">{number}</span><div><h3>{title}</h3><p>{description}</p></div></div>;
}

export function RegistrationApp({ configuration }: { configuration: DataConfiguration }) {
  const isDemo = configuration.mode === "demo";
  const repository = useRef<RegistrationRepository | null>(null);
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [groupNumber, setGroupNumber] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<8 | 9>(8);
  const [selections, setSelections] = useState<string[]>(Array(8).fill(""));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoAttempt = useRef(0);
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const snapshotRequest = useRef(0);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [photoExpiresAt, setPhotoExpiresAt] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RegisteredGroup | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [unregisteredSearch, setUnregisteredSearch] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (configuration.mode === "unavailable") return;
    let active = true;
    let ownedRepository: RegistrationRepository | null = null;
    async function load() {
      try {
        ownedRepository = await createRegistrationRepository(configuration);
        if (!active) { ownedRepository.dispose(); return; }
        repository.current = ownedRepository;
        const data = await ownedRepository.getSnapshot();
        if (active) { setSnapshot(data); setLoadState("ready"); }
      } catch {
        if (active) setLoadState("error");
      }
    }
    void load();
    return () => { active = false; ownedRepository?.dispose(); repository.current = null; };
  }, [configuration, attempt]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (success) { successRef.current?.focus(); successRef.current?.scrollIntoView({ block: "center" }); } }, [success]);
  useEffect(() => { if (submitError) errorRef.current?.focus(); }, [submitError]);

  const assigned = new Set(snapshot?.groups.flatMap((group) => group.members.map((member) => member.id)) ?? []);
  const takenGroups = new Set(snapshot?.groups.map((group) => group.groupNumber) ?? []);
  const selectedMembers = selections.flatMap((id) => snapshot?.participants.find((participant) => participant.id === id) ?? []);
  const unavailableIds = new Set(selections.filter((id) => id && !snapshot?.availableParticipants.some((p) => p.id === id)));
  const groupConflict = Boolean(groupNumber && takenGroups.has(groupNumber));
  const remaining = snapshot?.availableParticipants ?? [];
  const filteredRemaining = remaining.filter((participant) => `${participant.name} ${participant.code}`.toLocaleLowerCase("id-ID").includes(unregisteredSearch.toLocaleLowerCase("id-ID")));

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // Same file can be selected again after a failure.
    if (!file) return;
    const currentAttempt = ++photoAttempt.current;
    setPhotoExpiresAt(null);
    setPhotoLoading(true);
    setPhoto(null); setPreview(null); setPhotoError(null);
    const validationError = validatePhoto(file);
    if (validationError) { setPhotoError(validationError); setPhotoLoading(false); return; }
    let url: string | null = null;
    let serverAttempted = false;
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte);
      if ((file.type === "image/jpeg" && !jpeg) || (file.type === "image/png" && !png)) throw new Error("invalid image");
      setPhoto(file);
      serverAttempted = true;
      // Validate pixel/dimension limits on the server before decoding a preview.
      const staged = await repository.current?.stagePhoto(file);
      if (!staged) throw new Error("repository unavailable");
      if (currentAttempt !== photoAttempt.current) return;
      setPhotoExpiresAt(staged.expiresAt);
      url = URL.createObjectURL(file);
      const image = new window.Image(); image.src = url; await image.decode();
      if (currentAttempt !== photoAttempt.current) { URL.revokeObjectURL(url); return; }
      setPreview(url);
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      if (currentAttempt === photoAttempt.current) setPhotoError(error instanceof RepositoryError ? error.message : serverAttempted
        ? "Foto belum dapat diproses. Coba unggah kembali saat mengirim atau pilih foto lain."
        : "Foto tidak dapat dibaca. Pilih file JPG atau PNG yang valid.");
    } finally {
      if (currentAttempt === photoAttempt.current) setPhotoLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingLock.current || photoLoading || !repository.current) return;
    setSubmitted(true); setSubmitError(null);
    const parsed = registrationSchema.safeParse({ groupNumber: groupNumber ?? 0, memberCount, participantIds: selections, consent });
    const fileError = validatePhoto(photo);
    setPhotoError(fileError);
    if (!parsed.success || fileError || !photo) {
      setSubmitError("Pendaftaran belum lengkap. Periksa nomor kelompok, seluruh anggota, foto tim, dan persetujuan publikasi.");
      return;
    }
    if (!submissionUncertain && (groupConflict || unavailableIds.size > 0)) {
      setSubmitError("Sebagian pilihan sudah digunakan. Perbaiki kolom bertanda konflik; pilihan lain dan foto tetap tersedia."); return;
    }
    savingLock.current = true;
    setSaving(true);
    try {
      const result = await repository.current.register(parsed.data, photo);
      setSuccess(result); setSubmissionUncertain(false);
      // All panels use a new server snapshot; no optimistic registration arrays.
      await refresh();
    } catch (error) {
      setSubmissionUncertain(error instanceof RepositoryError && error.code === "UNAVAILABLE");
      if (error instanceof RepositoryError && error.code === "UPLOAD_EXPIRED") { setPhotoExpiresAt(null); setPhotoError(error.message); }
      setSubmitError(error instanceof RepositoryError ? error.message : "Pendaftaran belum dapat dikirim. Periksa koneksi lalu tekan kirim lagi.");
      if (error instanceof RepositoryError && ["CONFLICT", "REGISTRATION_CLOSED", "IDEMPOTENCY_CONFLICT", "UPLOAD_EXPIRED"].includes(error.code)) {
        try {
          const fresh = await repository.current.getSnapshot();
          setSnapshot(fresh);
          // Preserve field values and photo. Conflict markers derive from the fresh snapshot.
        } catch { setRefreshWarning(true); }
      }
    } finally { savingLock.current = false; setSaving(false); }
  }

  function resetForm() {
    setSuccess(null); setSubmissionUncertain(false); setPhotoExpiresAt(null); setGroupNumber(null); setSelections(Array(8).fill("")); setMemberCount(8);
    setPhoto(null); setPreview(null); setPhotoError(null); setConsent(false); setSubmitted(false); setSubmitError(null);
  }

  const refresh = useCallback(async () => {
    const current = repository.current;
    if (!current) return;
    const requestId = ++snapshotRequest.current;
    try {
      const data = await current.getSnapshot();
      if (repository.current === current && requestId === snapshotRequest.current) { setSnapshot(data); setRefreshWarning(false); }
    } catch {
      if (repository.current === current && requestId === snapshotRequest.current) setRefreshWarning(true);
    }
  }, []);

  useEffect(() => {
    if (loadState !== "ready") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    async function tick() {
      if (!active || document.hidden || running) return;
      running = true;
      try { if (!savingLock.current) await refresh(); }
      finally { running = false; if (active && !document.hidden) timer = setTimeout(() => void tick(), 30000); }
    }
    function visible() {
      if (timer) clearTimeout(timer);
      if (!document.hidden) void tick();
    }
    if (!document.hidden) timer = setTimeout(() => void tick(), 30000);
    document.addEventListener("visibilitychange", visible); window.addEventListener("focus", visible);
    return () => { active = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [loadState, refresh]);

  if (configuration.mode === "unavailable") return <>
    <ConfigurationNotice reason={configuration.reason} />
    <section id="kelompok" className="registered-section"><div className="section-heading"><div><span className="eyebrow">JEJAK KEBERSAMAAN</span><h2>Kelompok terdaftar</h2></div></div><div className="empty-panel"><Icon name="people" size={30} /><h3>Data belum tersedia</h3><p>Jumlah peserta, daftar kelompok, dan peserta yang belum terdaftar akan ditampilkan setelah koneksi database aktif.</p></div></section>
  </>;

  return <>
    {isDemo && <div className="demo-banner" role="note"><span className="demo-tag">DEMO</span><p>Anda sedang mencoba simulasi. Semua nama dan data adalah sintetis; foto dan pendaftaran hanya tersimpan sementara di tab ini, lalu hilang saat halaman dimuat ulang.</p></div>}
    {loadState === "loading" && <section id="pendaftaran" className="panel loading-panel" role="status"><div className="spinner" /><h2>Menyiapkan daftar peserta…</h2><p>{isDemo ? "Memuat data mode demo." : "Memuat daftar peserta acara."}</p></section>}
    {loadState === "error" && <section id="pendaftaran" className="notice error-notice" role="alert"><h2>Data belum dapat dimuat.</h2><p>Silakan coba lagi. Data yang gagal dimuat tidak diganti dengan data lain.</p><button className="button button-gold" onClick={() => { setLoadState("loading"); setAttempt((value) => value + 1); }}>Coba lagi</button></section>}
    {loadState === "ready" && snapshot && <>
      <div className="stats-row" aria-label={isDemo ? "Statistik peserta demo" : "Statistik peserta acara"}>
        {[{ label: "Total peserta", value: snapshot.statistics.total, icon: "people" as const }, { label: "Sudah terdaftar", value: snapshot.statistics.registered, icon: "check" as const }, { label: "Belum terdaftar", value: snapshot.statistics.unregistered, icon: "compass" as const }].map((stat) => <div key={stat.label} className="stat"><span className="stat-icon"><Icon name={stat.icon} size={22} /></span><div><strong>{stat.value}<span> orang</span></strong><p>{stat.label}</p></div></div>)}
      </div>
      {refreshWarning && <div className="notice" role="alert"><p>Data terbaru belum dapat dimuat. Daftar yang terlihat mungkin belum segar; pendaftaran yang sudah dikonfirmasi tetap berhasil.</p><button type="button" className="button button-outline" onClick={() => void refresh()}>Muat ulang data</button></div>}
      <div id="pendaftaran" className="registration-layout">
        <section className="panel registration-panel" aria-labelledby="registration-title">
          {success ? <div className="success-panel" ref={successRef} tabIndex={-1} role="status">
            <span className="success-mark"><Icon name="check" size={34} /></span><span className="eyebrow">{isDemo ? "SIMULASI PENDAFTARAN BERHASIL" : "PENDAFTARAN BERHASIL"}</span><h2 id="registration-title">Kelompok {success.groupNumber},<br /><em>siap melangkah.</em></h2><p>{success.members.length} anggota telah masuk ke daftar kelompok{isDemo ? " DEMO" : " acara"}.</p>
            <ul className="success-members">{success.members.map((member) => <li key={member.id}><Icon name="check" size={16} /><span>{member.name}</span><span className="participant-code">{member.code}</span></li>)}</ul><p className="small-text">{formatRegistrationTime(success.registeredAt)}{isDemo ? " · Data sementara, belum dikirim ke Supabase." : " · Pendaftaran telah tersimpan."}</p><button className="button button-gold" onClick={resetForm}>Kembali ke formulir <Icon name="arrow" size={18} /></button>
          </div> : <>
            <div className="form-heading"><div className="section-kicker"><span className="tiny-diamond" aria-hidden="true" /><span>FORMULIR KELOMPOK</span></div><h2 id="registration-title">Temukan rekan perjalanan.</h2><p>Siapkan nama seluruh anggota dan satu foto lengkap tim Anda. Kolom bertanda <span className="gold">*</span> wajib diisi.</p></div>
            {!snapshot.registrationOpen && !submissionUncertain ? <div className="notice"><h3>Pendaftaran sedang ditutup.</h3><p>Daftar kelompok tetap dapat dilihat. Hubungi panitia untuk informasi pembukaan pendaftaran.</p></div> : snapshot.groups.length === event.groupNumbers.length && !submissionUncertain ? <div className="notice"><h3>Seluruh kelompok sudah terisi.</h3><p>Lihat daftar kelompok dan anggota di bawah.</p></div> : <form noValidate onSubmit={handleSubmit}>
              {submitError && <div className="notice error-notice" role="alert" ref={errorRef} tabIndex={-1}><strong>Periksa pendaftaran Anda</strong><p>{submitError}</p></div>}
              <fieldset disabled={saving} className="form-step"><legend className="sr-only">Nomor kelompok</legend><StepTitle number="01" title="Pilih kelompok Anda" description="Satu nomor untuk satu tim. Kelompok terdaftar tidak dapat dipilih." />
                <div className="group-options" role="radiogroup" aria-label="Nomor kelompok" aria-required="true" aria-invalid={(submitted && !groupNumber) || groupConflict} aria-describedby={(submitted && !groupNumber) || groupConflict ? "group-error" : undefined}>
                  {event.groupNumbers.map((number) => <label key={number} className={`group-option ${takenGroups.has(number) ? "is-taken" : ""} ${groupNumber === number ? "is-selected" : ""}`}><input type="radio" name="groupNumber" value={number} checked={groupNumber === number} disabled={takenGroups.has(number)} onChange={() => setGroupNumber(number)} /><span className="group-option-top"><span>KELOMPOK</span>{groupNumber === number && <Icon name="check" size={15} />}</span><strong>{String(number).padStart(2, "0")}</strong><span className="group-status">{takenGroups.has(number) ? "Terdaftar" : "Tersedia"}</span></label>)}
                </div>{((submitted && !groupNumber) || groupConflict) && <p id="group-error" className="field-error">{groupConflict ? "Nomor ini baru saja digunakan kelompok lain. Pilih nomor lain." : "Pilih satu nomor kelompok yang tersedia."}</p>}
              </fieldset>
              <fieldset disabled={saving} className="form-step"><legend className="sr-only">Jumlah dan nama anggota</legend><StepTitle number="02" title="Lengkapi anggota tim" description="Pilih jumlah anggota, lalu cari setiap nama di daftar peserta." />
                <div className="member-count-row"><span id="member-count-label">Jumlah anggota <span className="gold">*</span></span><div className="count-options" role="radiogroup" aria-labelledby="member-count-label">{event.memberCounts.map((count) => <label className={memberCount === count ? "is-selected" : ""} key={count}><input type="radio" name="memberCount" value={count} checked={memberCount === count} onChange={() => { setMemberCount(count); setSelections((values) => Array.from({ length: count }, (_, index) => values[index] ?? "")); }} /><Icon name="people" size={17} />{count} orang</label>)}</div></div>
                <p id="member-help" className="field-help">Gunakan kode peserta untuk membedakan nama yang sama. Peserta yang sudah dipilih atau terdaftar tidak muncul di pilihan lain.</p>
                <div className="member-grid">{selections.map((value, index) => <ParticipantPicker key={index} index={index} value={value} participants={snapshot.participants} excluded={new Set([...assigned, ...selections.filter((_, i) => i !== index)])} invalid={(submitted && !value) || unavailableIds.has(value)} conflict={unavailableIds.has(value)} onChange={(id) => setSelections((values) => values.map((current, i) => i === index ? id : current))} />)}</div>
              </fieldset>
              <fieldset disabled={saving} className="form-step"><legend className="sr-only">Foto lengkap tim</legend><StepTitle number="03" title="Satu foto, seluruh cerita" description="JPG/PNG saja. File asli maksimal 3 MiB (3.145.728 byte), sisi maksimal 12.000 px dan total 40 megapixel. Foto diperiksa dan metadata dihapus server." />
                <div className={`photo-upload ${photoError ? "is-invalid" : ""} ${preview ? "has-photo" : ""}`}>
                  {preview ? <div className="photo-preview"><Image src={preview} alt="Preview foto lengkap tim yang akan didaftarkan" width={800} height={500} unoptimized /><span className="photo-caption"><Icon name="check" size={16} />Foto siap digunakan</span></div> : <div className="upload-placeholder"><span className="upload-icon"><Icon name="upload" size={26} /></span><strong>{photoLoading ? "Memeriksa dan mengunggah foto…" : "Lengkapi tim Anda dalam satu bingkai"}</strong><p>JPG atau PNG · Maksimal 3 MiB</p></div>}
                  <label className="button button-outline upload-button" htmlFor="team-photo"><Icon name="upload" size={16} />{preview ? "Ganti foto tim" : "Pilih foto tim"}<input id="team-photo" name="photo" className="file-input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" aria-required="true" aria-invalid={Boolean(photoError)} aria-describedby="photo-help photo-error" disabled={photoLoading || saving} onChange={(e) => void handlePhoto(e)} /></label>
                  {photo && <span className="file-name">{photo.name}</span>}
                </div><p id="photo-error" className="field-error" role={photoError ? "alert" : undefined}>{photoError}</p><p id="photo-help" className="field-help">Pastikan semua anggota terlihat jelas. Foto sementara tetap tersedia saat Anda memperbaiki pilihan yang konflik.{photoExpiresAt && !isDemo && <> Berlaku hingga {formatRegistrationTime(photoExpiresAt)}.</>}</p>
              </fieldset>
              <div className="submit-area"><div className="privacy-note"><Icon name="info" size={18} /><p><strong>Daftar ini terbuka untuk pengunjung.</strong> Nama anggota dan foto kelompok dapat dilihat oleh siapa pun yang membuka halaman ini.</p></div>
                <label className="consent-label"><input type="checkbox" checked={consent} disabled={saving} onChange={(e) => setConsent(e.target.checked)} aria-invalid={submitted && !consent} aria-describedby={submitted && !consent ? "consent-error" : undefined} /><span>Saya telah memeriksa data dan memastikan seluruh anggota menyetujui publikasi nama dan foto kelompok. <span className="gold">*</span></span></label>
                {submitted && !consent && <p id="consent-error" className="field-error">Persetujuan publikasi diperlukan sebelum mengirim.</p>}
                <div className="submit-summary" aria-live="polite"><span>RINGKASAN PENDAFTARAN</span><p>{groupNumber ? `Kelompok ${groupNumber}` : "Kelompok belum dipilih"} · {selectedMembers.length}/{memberCount} anggota · {photo ? "Foto siap" : "Foto belum dipilih"}</p></div>
                <button type="submit" className="button button-gold submit-button" disabled={saving || photoLoading}>{saving ? (isDemo ? "Menyimpan simulasi…" : "Menyimpan pendaftaran…") : (isDemo ? "Daftarkan kelompok — DEMO" : "Daftarkan kelompok")}{saving ? <span className="spinner small" /> : <Icon name="arrow" size={20} />}</button><p className="submit-footnote">{isDemo ? "Mode DEMO · Belum ada data yang dikirim ke Supabase." : "Periksa seluruh data dan foto sebelum mengirim pendaftaran."}</p>
              </div>
            </form>}
          </>}
        </section>
        <aside className="registration-aside" aria-label="Informasi dan ringkasan kelompok">
          <section className="panel recap-panel"><div className="section-kicker"><Icon name="compass" size={18} /><span>REKAN PERJALANAN ANDA</span></div><h2>{success ? `Kelompok ${success.groupNumber}` : groupNumber ? `Kelompok ${String(groupNumber).padStart(2, "0")}` : "Tim pilihan Anda"}</h2><p>{success ? (isDemo ? "Simulasi pendaftaran selesai." : "Pendaftaran kelompok selesai.") : "Lengkapi tim, lalu mulai perjalanan."}</p><div className="recap-divider" /><div className="recap-count"><span>Anggota terpilih</span><strong>{success ? success.members.length : selectedMembers.length}<span> / {success ? success.members.length : memberCount}</span></strong></div>
            <ol className="recap-members">{Array.from({ length: success ? success.members.length : memberCount }, (_, index) => {
              const member = success ? success.members[index] : snapshot.participants.find((participant) => participant.id === selections[index]);
              return <li key={index}><span className={`recap-index ${member ? "filled" : ""}`}>{String(index + 1).padStart(2, "0")}</span><span className={member ? "" : "recap-empty"}>{member ? <>{member.name}<small>{member.code}</small></> : "Belum dipilih"}</span>{member && <Icon name="check" size={14} />}</li>;
            })}</ol><div className="recap-photo"><Icon name={photo ? "check" : "upload"} size={17} /><span>{photo ? "Foto tim sudah siap" : "Foto tim belum diunggah"}</span></div>
          </section>
          <section className="guide-panel"><span className="eyebrow">SEBELUM MEMULAI</span><h3>Semua punya peran.<br />Semua ikut dalam cerita.</h3><ul><li><Icon name="check" size={16} />Satu perwakilan untuk satu kelompok.</li><li><Icon name="check" size={16} />Setiap peserta hanya di satu kelompok.</li><li><Icon name="check" size={16} />Siapkan foto lengkap 8 atau 9 anggota.</li></ul><p>Nama belum ada atau keliru? Hubungi panitia untuk memperbarui daftar peserta.</p></section>
        </aside>
      </div>
      <section id="kelompok" className="registered-section" aria-labelledby="registered-title"><div className="section-heading"><div><span className="eyebrow">JEJAK KEBERSAMAAN</span><h2 id="registered-title">Kelompok terdaftar<span className="heading-period">.</span></h2></div><span className="section-counter">{snapshot.groups.length} DARI {event.groupNumbers.length} KELOMPOK {isDemo && <span className="demo-tag">DEMO</span>}</span></div>
        {snapshot.groups.length === 0 ? <div className="empty-panel"><Icon name="people" size={28} /><h3>Cerita pertama menunggu Anda.</h3><p>Belum ada kelompok terdaftar. Jadilah tim pertama yang memulai.</p></div> : <div className="registered-grid">{[...snapshot.groups].sort((a, b) => a.groupNumber - b.groupNumber).map((group) => <article className="group-card panel" key={group.id}><div className="group-photo"><GroupPhoto groupId={group.id} demoUrl={group.photoUrl} isDemo={isDemo} label={`Foto kelompok ${group.groupNumber}${isDemo ? " — DEMO" : ""}`} /><span className="group-photo-badge">KELOMPOK {String(group.groupNumber).padStart(2, "0")}</span></div><div className="group-card-content"><div className="group-card-heading"><h3>Kelompok {String(group.groupNumber).padStart(2, "0")}</h3><span><Icon name="people" size={15} />{group.members.length} anggota</span></div><ul>{group.members.map((member) => <li key={member.id}><span>{member.name}</span><span className="participant-code">{member.code}</span></li>)}</ul><p className="registered-time"><Icon name="calendar" size={14} /><time dateTime={group.registeredAt}>{formatRegistrationTime(group.registeredAt)}</time></p></div></article>)}</div>}
      </section>
      <details className="unregistered panel"><summary><span className="unregistered-title"><Icon name="people" size={21} /><span>Peserta yang belum terdaftar ({remaining.length})</span></span><Icon name="chevron" size={20} /></summary><div className="unregistered-content"><p>Masih menunggu rekan perjalanan. Cari nama atau kode peserta di bawah.</p><label htmlFor="unregistered-search" className="sr-only">Cari peserta yang belum terdaftar</label><div className="search-shell"><Icon name="search" size={18} /><input id="unregistered-search" type="search" placeholder="Cari nama atau kode peserta…" value={unregisteredSearch} onChange={(e) => setUnregisteredSearch(e.target.value)} /></div><p className="small-text" role="status">{filteredRemaining.length} peserta ditampilkan</p>{filteredRemaining.length ? <ul className="unregistered-list">{filteredRemaining.map((participant) => <li key={participant.id}><span>{participant.name}</span><span className="participant-code">{participant.code}</span></li>)}</ul> : <div className="empty-search">{remaining.length === 0 ? "Semua peserta sudah tergabung dalam kelompok." : "Tidak ada nama atau kode yang cocok dengan pencarian."}</div>}</div></details>
    </>}
  </>;
}
