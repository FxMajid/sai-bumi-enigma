import { expect, test } from "@playwright/test";
import type { Participant, RegisteredGroup, RegistrationSnapshot } from "../../src/domain/registration";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA9sAAAAASUVORK5CYII=", "base64");

test("safe default has configuration guidance and no synthetic counts", async ({ page }) => {
  await page.goto("http://127.0.0.1:3102");
  await expect(page.getByRole("heading", { name: "Pendaftaran belum dibuka." })).toBeVisible();
  await expect(page.getByText("Data belum tersedia", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Peserta Contoh", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Total peserta", { exact: true })).toHaveCount(0);
  const api = await page.request.get("http://127.0.0.1:3102/api/registration");
  expect(api.status()).toBe(503);
  expect((await api.json()).error.code).toBe("UNAVAILABLE");
});

test("configured but unreachable backend shows retry without demo fallback or secret exposure", async ({ page }) => {
  await page.goto("http://127.0.0.1:3103");
  await expect(page.getByRole("heading", { name: "Data belum dapat dimuat." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expect(page.getByText("Peserta Contoh", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Total peserta", { exact: true })).toHaveCount(0);
  expect(await page.content()).not.toContain("sb_secret_synthetic");
  const response = await page.request.get("http://127.0.0.1:3103/api/registration");
  expect(response.status()).toBe(503);
  expect(await response.text()).not.toMatch(/SQL|constraint|supabase\.co|sb_secret_/);
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByRole("heading", { name: "Data belum dapat dimuat." })).toBeVisible();
});

test("complete demo registration, duplicate-name identities, photo replacement and reset", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("combobox")).toHaveCount(8);
  await expect(page.getByRole("radio", { name: "KELOMPOK 02 Terdaftar" })).toBeDisabled();
  const fixturePhoto = page.locator(".group-photo img").first();
  await fixturePhoto.scrollIntoViewIfNeeded();
  await expect(fixturePhoto).toBeVisible();
  await expect.poll(() => fixturePhoto.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("registration-empty.png"), fullPage: true });
  await page.getByRole("radio", { name: "9 orang" }).check();
  await expect(page.getByRole("combobox")).toHaveCount(9);
  await page.getByRole("radio", { name: "8 orang" }).check();
  await page.getByRole("button", { name: "Daftarkan kelompok — DEMO" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Periksa pendaftaran Anda" })).toBeFocused();
  await page.getByRole("radio", { name: "KELOMPOK 01 Tersedia" }).check();
  for (let index = 0; index < 8; index++) {
    const picker = page.getByRole("combobox", { name: `Anggota ${String(index + 1).padStart(2, "0")}` });
    const code = `D-${String(index + 1).padStart(3, "0")}`;
    await picker.fill(code);
    await page.getByRole("option").filter({ hasText: code }).click();
  }
  const firstPicker = page.getByRole("combobox").first();
  await firstPicker.focus();
  await expect(page.getByRole("option").filter({ hasText: "D-002" })).toHaveCount(0);
  await firstPicker.press("Escape");
  await page.locator("#team-photo").setInputFiles({ name: "tim.png", mimeType: "image/png", buffer: image });
  await expect(page.getByText("Foto siap digunakan", { exact: true })).toBeVisible();
  await page.locator("#team-photo").setInputFiles({ name: "tim-ganti.png", mimeType: "image/png", buffer: image });
  await expect(page.getByText("tim-ganti.png", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: testInfo.outputPath("registration-complete.png"), fullPage: true });
  await page.getByRole("button", { name: "Daftarkan kelompok — DEMO" }).click();
  await expect(page.getByRole("heading", { name: "Kelompok 1, siap melangkah." })).toBeVisible();
  await expect(page.locator(".success-members li")).toHaveCount(8);
  await expect(page.locator(".group-card")).toHaveCount(2);
  await expect(page.getByText("Peserta yang belum terdaftar (20)", { exact: true })).toBeVisible();
  await page.getByText("Peserta yang belum terdaftar (20)", { exact: true }).click();
  await page.getByRole("searchbox", { name: "Cari peserta yang belum terdaftar" }).fill("tidak-ada");
  await expect(page.getByText("Tidak ada nama atau kode yang cocok dengan pencarian.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator(".group-card")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("keyboard selection and unreadable photos expose actionable validation", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("combobox").first();
  await picker.fill("D-001");
  await picker.press("Enter");
  await expect(picker).toHaveValue("Peserta Contoh · D-001");
  await page.locator("#team-photo").setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByText("Foto tidak dapat dibaca. Pilih file JPG atau PNG yang valid.", { exact: true })).toBeVisible();
  await page.locator("#team-photo").setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024 + 1) });
  await expect(page.getByText("Ukuran foto maksimal 3 MiB.", { exact: true })).toBeVisible();
});

test('Supabase UI preserves staged photo and other fields after 409, refreshes visibility, and renews signed photos', async ({page}) => {
  // Explicit HTTP contract fixture, never loaded by the production application.
  const participants: Participant[] = Array.from({length:36},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,code:`D-${String(i+1).padStart(3,'0')}`,name:i<2?'Peserta Contoh':`Peserta Demo ${String(i+1).padStart(2,'0')}`}));
  const snapshot = (groups:RegisteredGroup[]):RegistrationSnapshot => {
    const assigned=new Set(groups.flatMap(g=>g.members.map(m=>m.id)));
    const available=participants.filter(p=>!assigned.has(p.id));
    return {registrationOpen:true,participants,availableParticipants:available,groups,statistics:{total:participants.length,registered:assigned.size,unregistered:available.length}};
  };
  let data=snapshot([{id:crypto.randomUUID(),groupNumber:2,members:participants.slice(28,36),photoUrl:'/images/demo-team.svg',registeredAt:new Date().toISOString()}]);
  let reads=0, uploads=0, submits=0, signs=0;
  await page.route('**/api/registration', async route => {reads++; await route.fulfill({json:data});});
  await page.route('**/api/registration/session', async route => route.fulfill({json:{ready:true}}));
  await page.route('**/api/uploads', async route => {uploads++; await route.fulfill({json:{token:'t'.repeat(43),expiresAt:new Date(Date.now()+3600000).toISOString()}});});
  await page.route('**/api/groups/*/photo', async route => {signs++; await route.fulfill({json:{url:`http://127.0.0.1:3103/images/demo-team.svg?lease=${signs}`,expiresAt:new Date(Date.now()+12000).toISOString()}});});
  await page.route('**/api/registrations', async route => {
    submits++;
    const body=route.request().postDataJSON();
    if(submits===1){
      const other={id:crypto.randomUUID(),groupNumber:1,members:[data.participants[0]!,...data.participants.slice(9,16)],photoUrl:'/unused',registeredAt:new Date().toISOString()};
      data=snapshot([...data.groups,other]);
      await route.fulfill({status:409,json:{error:{code:'CONFLICT',message:'Nomor kelompok atau peserta sudah terdaftar.'}}});
    }else{
      const group={id:crypto.randomUUID(),groupNumber:body.registration.groupNumber,members:body.registration.participantIds.map((id:string)=>data.participants.find(p=>p.id===id)!),photoUrl:'/unused',registeredAt:new Date().toISOString()};
      data=snapshot([...data.groups,group]);
      await route.fulfill({json:group});
    }
  });
  await page.goto('http://127.0.0.1:3103');
  await expect(page.getByRole('combobox')).toHaveCount(8);
  await page.getByRole('radio',{name:'KELOMPOK 01 Tersedia'}).check();
  for(let i=0;i<8;i++){
    await page.getByRole('combobox').nth(i).fill(`D-${String(i+1).padStart(3,'0')}`);
    await page.getByRole('option').filter({hasText:`D-${String(i+1).padStart(3,'0')}`}).click();
  }
  await page.locator('#team-photo').setInputFiles({name:'team.png',mimeType:'image/png',buffer:image});
  await expect(page.getByText('Foto siap digunakan',{exact:true})).toBeVisible();
  await page.getByRole('checkbox').check();
  const button=page.getByRole('button',{name:'Daftarkan kelompok',exact:true});
  await button.evaluate((element:HTMLButtonElement)=>{element.click();element.click();});
  await expect(page.getByText('Nomor ini baru saja digunakan kelompok lain. Pilih nomor lain.',{exact:true})).toBeVisible();
  expect(submits).toBe(1); expect(uploads).toBe(1);
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('Peserta Contoh · D-002');
  await expect(page.getByRole('img',{name:'Preview foto lengkap tim yang akan didaftarkan'})).toBeVisible();
  await page.getByRole('radio',{name:'KELOMPOK 03 Tersedia'}).check();
  await page.getByRole('combobox').first().fill('D-009');
  await page.getByRole('option').filter({hasText:'D-009'}).click();
  await button.click();
  await expect(page.getByRole('heading',{name:'Kelompok 3, siap melangkah.'})).toBeVisible();
  expect(submits).toBe(2); expect(uploads).toBe(1);
  await expect(page.locator('.group-card')).toHaveCount(3);
  const priorSigns=signs;
  await expect.poll(()=>signs,{timeout:6000}).toBeGreaterThan(priorSigns);
  await page.clock.install();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const priorReads=reads;
  await page.clock.fastForward(61000);
  expect(reads).toBe(priorReads);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>reads).toBeGreaterThan(priorReads);
});
