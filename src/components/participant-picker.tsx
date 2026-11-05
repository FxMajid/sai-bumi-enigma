"use client";

import { useId, useRef, useState } from "react";
import type { Participant } from "@/domain/registration";
import { Icon } from "./icon";

export function ParticipantPicker({ index, value, participants, excluded, onChange, invalid, conflict }: {
  index: number;
  value: string;
  participants: Participant[];
  excluded: Set<string>;
  onChange: (value: string) => void;
  invalid: boolean;
  conflict?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = participants.find((participant) => participant.id === value);
  const options = participants.filter((participant) => !excluded.has(participant.id) && `${participant.name} ${participant.code}`.toLocaleLowerCase("id-ID").includes(query.toLocaleLowerCase("id-ID")));
  const active = options[activeIndex];
  const choose = (participant: Participant) => {
    onChange(participant.id);
    setOpen(false);
    setQuery("");
  };

  return <div className="participant-field" onBlur={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id}>Anggota {String(index + 1).padStart(2, "0")} <span aria-hidden="true">*</span></label>
    <div className={`picker-shell ${invalid ? "is-invalid" : ""}`}>
      <span className="picker-icon"><Icon name={selected ? "check" : "search"} size={17} /></span>
      <input
        ref={input} id={id} role="combobox" autoComplete="off"
        aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list"
        aria-activedescendant={open && active ? `${id}-${active.id}` : undefined}
        aria-invalid={invalid} aria-required="true" aria-describedby={invalid ? `${id}-error` : "member-help"}
        placeholder="Cari nama atau kode peserta"
        value={open ? query : selected ? `${selected.name} · ${selected.code}` : ""}
        onFocus={() => { setOpen(true); setQuery(""); setActiveIndex(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); if (value) onChange(""); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            const next = e.key === "ArrowDown" ? Math.min(activeIndex + 1, options.length - 1) : Math.max(activeIndex - 1, 0);
            setActiveIndex(Math.max(next, 0));
            document.getElementById(`${id}-${options[Math.max(next, 0)]?.id}`)?.scrollIntoView({ block: "nearest" });
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (active) choose(active);
          } else if (e.key === "Escape") {
            e.preventDefault(); setOpen(false);
          }
        }}
      />
      {value ? <button type="button" className="clear-picker" aria-label={`Hapus anggota ${index + 1}`} onClick={() => { onChange(""); setQuery(""); input.current?.focus(); }}><Icon name="close" size={15} /></button> : <span className="picker-chevron"><Icon name="chevron" size={14} /></span>}
    </div>
    {open && <div id={`${id}-options`} role="listbox" aria-label={`Pilihan anggota ${index + 1}`} className="picker-options">
      {options.length ? options.map((participant, optionIndex) => <div
        key={participant.id} id={`${id}-${participant.id}`} role="option"
        aria-selected={value === participant.id}
        className={`picker-option ${optionIndex === activeIndex ? "is-active" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setActiveIndex(optionIndex)}
        onClick={() => choose(participant)}
      ><span>{participant.name}</span><span className="participant-code">{participant.code}</span></div>) : <p className="picker-empty">Tidak ada peserta yang cocok atau tersedia.</p>}
    </div>}
    {invalid && <p id={`${id}-error`} className="field-error">{conflict ? "Peserta ini sudah terdaftar atau tidak lagi tersedia. Pilih pengganti." : "Pilih peserta untuk anggota ini."}</p>}
  </div>;
}
