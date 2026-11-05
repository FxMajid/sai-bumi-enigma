-- Run intentionally once after reviewing the slug/dates, not as migration seed.
-- Leaves registration CLOSED until the committee finishes importing participants.
insert into public.events (slug, title, starts_on, ends_on, registration_open)
values ('the-sai-bumi-enigma-2026', 'THE SAI BUMI ENIGMA', '2026-11-24', '2026-11-27', false)
returning id, slug, starts_on, ends_on, registration_open;
