import type { Participant, RegisteredGroup } from "./registration";

export interface QuizOption {
  id: string;
  text: string;
}

export interface ClientQuizQuestion {
  id: string;
  category: "Detektif & Logika" | "Enigma Sai Bumi" | "Strategi Tim";
  question: string;
  options: QuizOption[];
}

export interface QuizSubmissionRecord {
  id: string;
  participantId: string;
  participantCode: string;
  participantName: string;
  groupNumber: number;
  groupName: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  timeSpentSeconds: number;
  completedAt: string;
}

export interface QuizQuestion {
  id: string;
  category: "Detektif & Logika" | "Enigma Sai Bumi" | "Strategi Tim";
  storyContext?: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
}

export interface QuizParticipantInfo {
  participantId: string;
  participantName: string;
  participantCode: string;
  groupNumber: number;
  groupName: string;
}

export interface QuizResult {
  participant: QuizParticipantInfo;
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  timeSpentSeconds: number;
  answers: Record<string, string>;
  completedAt: string;
  questions: QuizQuestion[];
}

export const QUIZ_DURATION_SECONDS = 300; // 5 menit

/**
 * Automatically detects participant's group number from registered database groups,
 * or based on official participant allocation (3x9 + 1x8 = 35).
 */
export function detectParticipantGroup(
  participant: Participant,
  registeredGroups: RegisteredGroup[],
  allParticipants: Participant[]
): number {
  // 1. Search in registered groups from database
  for (const group of registeredGroups) {
    if (group.members.some((m) => m.id === participant.id || m.code === participant.code)) {
      return group.groupNumber;
    }
  }

  // 2. Fallback based on sequence (3x9 + 1x8 = 35)
  const idx = allParticipants.findIndex(
    (p) => p.id === participant.id || p.code === participant.code
  );
  if (idx !== -1) {
    if (idx < 9) return 1;
    if (idx < 18) return 2;
    if (idx < 27) return 3;
    return 4;
  }

  return 1;
}

export const rawQuestionBank: Array<{
  id: string;
  category: "Detektif & Logika" | "Enigma Sai Bumi" | "Strategi Tim";
  storyContext?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}> = [
  {
    id: "q1",
    category: "Enigma Sai Bumi",
    storyContext: "Tim detektif menemukan inskripsi kuno di gerbang selatan Sai Bumi.",
    question: "Semboyan 'Sai Bumi Ruwa Jurai' yang menjadi lambang Provinsi Lampung memiliki arti filosofis yang mendalam, yaitu...",
    options: [
      "Satu bumi dua jurai / tradisi adat (Pepadun dan Saibatin)",
      "Satu tanah air dengan dua muara sungai besar",
      "Satu pulau penghubung dua lautan samudera",
      "Satu benteng pertahanan dua kerajaan maritim",
    ],
    correctIndex: 0,
    explanation: "'Sai Bumi Ruwa Jurai' berarti 'Satu Bumi Dua Ragam/Jurai', merujuk pada keharmonisan dua rumpun adat besar masyarakat Lampung yaitu adat Pepadun dan adat Saibatin.",
  },
  {
    id: "q2",
    category: "Detektif & Logika",
    storyContext: "Sebuah brankas berkode 4 angka ditemukan di markas rahasia.",
    question: "Petunjuk sandi: Angka pertama ganjil kelipatan 3, angka kedua genap prima, angka ketiga hasil penjumlahan angka pertama dan kedua, angka keempat adalah 0. Berapakah kode brankas tersebut?",
    options: [
      "3250",
      "9270",
      "3470",
      "6280",
    ],
    correctIndex: 0,
    explanation: "Ganjil kelipatan 3 (di bawah 10) adalah 3 atau 9. Genap prima satu-satunya adalah 2. Angka ketiga = 3 + 2 = 5. Angka keempat = 0. Jadi kombinasi tepat adalah 3250.",
  },
  {
    id: "q3",
    category: "Enigma Sai Bumi",
    storyContext: "Investigasi menuju ke titik nol gerbang pulau Sumatera.",
    question: "Monumen ikonik berbentuk mahkota pengantin wanita Lampung yang menjadi simbol selamat datang di ujung selatan Sumatera adalah...",
    options: [
      "Menara Siger",
      "Tugu Adipura",
      "Monumen Krakatau",
      "Gapura Radin Inten",
    ],
    correctIndex: 0,
    explanation: "Menara Siger di Bakauheni, Lampung Selatan, berbentuk mahkota Siger khas pengantin Lampung dan menjadi landmark titik nol Sumatera.",
  },
  {
    id: "q4",
    category: "Detektif & Logika",
    storyContext: "Empat detektif (Lupin, Jubun, Conan, Holmes) memberi kesaksian tentang siapa yang memegang kunci rahasia.",
    question: "Hanya satu detektif yang jujur:\n• Lupin: 'Kunci ada di Jubun'\n• Jubun: 'Kunci bukan di saya'\n• Conan: 'Kunci ada di Holmes'\n• Holmes: 'Conan berbohong'\nSiapakah yang jujur dan di mana kunci sebenarnya?",
    options: [
      "Holmes jujur, kunci bukan di Holmes dan bukan di Jubun",
      "Lupin jujur, kunci di Jubun",
      "Jubun jujur, kunci di Conan",
      "Conan jujur, kunci di Holmes",
    ],
    correctIndex: 0,
    explanation: "Pernyataan Conan dan Holmes saling bertolak belakang, salah satu dari mereka pasti benar. Karena hanya ada satu orang jujur, maka Lupin dan Jubun berbohong. Jika Jubun bohong ('Kunci bukan di saya' adalah dusta), kunci ada di Jubun — tapi jika kunci di Jubun, Lupin berkata jujur (kontradiksi: 2 orang jujur). Maka yang jujur adalah Holmes, dan Conan berbohong.",
  },
  {
    id: "q5",
    category: "Enigma Sai Bumi",
    storyContext: "Dalam selembar kain pusaka terdapat tenunan benang emas yang sarat pola simbolik misterius.",
    question: "Kain tenun tradisional kebanggaan Lampung yang dibuat dengan teknik sulam benang emas rumit dan bernilai seni tinggi disebut...",
    options: [
      "Kain Tapis",
      "Kain Songket Palembang",
      "Kain Ulos Batak",
      "Kain Sasirangan",
    ],
    correctIndex: 0,
    explanation: "Kain Tapis adalah kain tradisional tenun khas Lampung yang dihiasi benang emas atau perak dengan berbagai motif sakral dan alam.",
  },
  {
    id: "q6",
    category: "Strategi Tim",
    storyContext: "Misi investigasi The Sai Bumi Enigma menerapkan formasi tim yang ketat.",
    question: "Berdasarkan regulasi resmi tim The Sai Bumi Enigma, berapakah batas kuota jumlah anggota per kelompok yang diizinkan?",
    options: [
      "9 orang (maksimal 3 kelompok) dan 8 orang (hanya 1 kelompok)",
      "9 orang (maksimal 2 kelompok) dan 8 orang (maksimal 2 kelompok)",
      "10 orang (maksimal 3 kelompok) dan 5 orang (hanya 1 kelompok)",
      "Bebas sesuai kesepakatan masing-masing tim",
    ],
    correctIndex: 0,
    explanation: "Regulasi resmi menetapkan total 35 peserta terbagi dalam 4 kelompok: 3 kelompok berisi 9 orang dan 1 kelompok berisi 8 orang (3x9 + 1x8 = 35).",
  },
  {
    id: "q7",
    category: "Detektif & Logika",
    storyContext: "Sebuah pesan terenkripsi berbunyi: 'V-K-R-O-P-H-V'.",
    question: "Jika sandi menggunakan pergeseran Caesar mundur 3 huruf (D -> A, E -> B), kata asli dari 'V-K-R-O-P-H-V' adalah...",
    options: [
      "S-H-O-L-M-E-S",
      "D-E-T-E-K-T-I",
      "C-O-N-A-N-X-X",
      "L-U-P-I-N-S-S",
    ],
    correctIndex: 0,
    explanation: "V(-3)=S, K(-3)=H, R(-3)=O, O(-3)=L, P(-3)=M, H(-3)=E, V(-3)=S => SHOLMES.",
  },
  {
    id: "q8",
    category: "Enigma Sai Bumi",
    storyContext: "Tim menemukan jejak satwa langka yang menjadi maskot konservasi terkenal di Lampung.",
    question: "Taman Nasional di Lampung yang diakui dunia sebagai pusat konservasi dan suaka gajah Sumatera adalah...",
    options: [
      "Taman Nasional Way Kambas",
      "Taman Nasional Bukit Barisan Selatan",
      "Taman Nasional Ujung Kulon",
      "Taman Hutan Raya Wan Abdul Rachman",
    ],
    correctIndex: 0,
    explanation: "Pusat Konservasi Gajah (PKG) yang legendaris terletak di Taman Nasional Way Kambas, Kabupaten Lampung Timur.",
  },
  {
    id: "q9",
    category: "Detektif & Logika",
    storyContext: "Investigator menganalisis jejak waktu pelarian target.",
    question: "Kereta api dari Stasiun Tanjung Karang berangkat pukul 08.15 WIB dan menempuh jarak 180 km dengan kecepatan rata-rata 60 km/jam. Pukul berapa kereta tiba di stasiun tujuan?",
    options: [
      "11.15 WIB",
      "10.45 WIB",
      "11.45 WIB",
      "12.00 WIB",
    ],
    correctIndex: 0,
    explanation: "Waktu tempuh = 180 km / 60 km/jam = 3 jam. 08.15 + 3 jam = 11.15 WIB.",
  },
  {
    id: "q10",
    category: "Strategi Tim",
    storyContext: "Dalam sebuah tim investigasi, terjadi perbedaan penafsiran petunjuk lapangan.",
    question: "Prinsip utama yang paling efektif untuk memecahkan teka-teki misteri dalam kerja tim investigasi adalah...",
    options: [
      "Mengumpulkan seluruh fakta, mendengarkan sudut pandang setiap anggota, lalu memvalidasi hipotesis dengan bukti",
      "Mengikuti insting anggota yang paling vokal tanpa perlu menguji petunjuk",
      "Membagi tim menjadi individu-individu yang berjalan sendiri-sendiri tanpa koordinasi",
      "Mengabaikan petunjuk yang sulit dan fokus hanya pada petunjuk yang mudah",
    ],
    correctIndex: 0,
    explanation: "Kolaborasi detektif yang solid berakar pada mendengarkan setiap perspektif, menguji asumsi secara objektif, dan memvalidasi hipotesis berdasarkan bukti empiris.",
  },
  {
    id: "q11",
    category: "Enigma Sai Bumi",
    storyContext: "Legenda letusan dahsyat tahun 1883 yang mengubah iklim dunia tercatat di Selat Sunda.",
    question: "Gunung berapi legendaris di perairan Selat Sunda wilayah Lampung yang anak gunungnya masih aktif hingga kini adalah...",
    options: [
      "Gunung Krakatau (Anak Krakatau)",
      "Gunung Rajabasa",
      "Gunung Pesagi",
      "Gunung Seminung",
    ],
    correctIndex: 0,
    explanation: "Gunung Krakatau meletus dahsyat pada tahun 1883 di Selat Sunda, dan kini terdapat kompleks Anak Krakatau di perairan Lampung.",
  },
  {
    id: "q12",
    category: "Detektif & Logika",
    storyContext: "Seseorang berkata: 'Kemarin adalah dua hari setelah hari Senin'.",
    question: "Jika kemarin adalah dua hari setelah Senin, maka besok adalah hari apa?",
    options: [
      "Jumat",
      "Kamis",
      "Sabtu",
      "Rabu",
    ],
    correctIndex: 0,
    explanation: "Dua hari setelah Senin = Rabu. Jika kemarin adalah Rabu, maka hari ini adalah Kamis. Jadi besok adalah hari Jumat.",
  },
];

/** Fisher-Yates shuffle algorithm */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = result[i];
    const target = result[j];
    if (current !== undefined && target !== undefined) {
      result[i] = target;
      result[j] = current;
    }
  }
  return result;
}

/**
 * Generates a randomized quiz session with shuffled questions and shuffled options.
 * Each invocation returns a distinct randomized order so questions are never identical.
 */
export function generateRandomQuiz(questionCount = 10): QuizQuestion[] {
  const shuffledRaw = shuffleArray(rawQuestionBank).slice(0, questionCount);

  return shuffledRaw.map((item, index) => {
    // Original correct option text
    const correctText = item.options[item.correctIndex] ?? "";
    
    // Create option objects and shuffle them
    const mappedOptions: QuizOption[] = item.options.map((text, optIdx) => ({
      id: `opt_${item.id}_${optIdx}`,
      text,
    }));

    const shuffledOptions = shuffleArray(mappedOptions);
    const newCorrectOption = shuffledOptions.find((opt) => opt.text === correctText);
    const fallbackOptionId = shuffledOptions[0] ? shuffledOptions[0].id : `opt_${item.id}_0`;

    return {
      id: `${item.id}_${index}_${Math.random().toString(36).substring(2, 6)}`,
      category: item.category,
      storyContext: item.storyContext,
      question: item.question,
      options: shuffledOptions,
      correctOptionId: newCorrectOption?.id ?? fallbackOptionId,
      explanation: item.explanation,
    };
  });
}


/**
 * Strips correctOptionId and explanation so client inspection (DevTools)
 * cannot reveal answers or cheat during active quiz sessions.
 */
export function sanitizeQuestionForClient(q: QuizQuestion): ClientQuizQuestion {
  return {
    id: q.id,
    category: q.category,
    question: q.question,
    options: q.options,
  };
}
