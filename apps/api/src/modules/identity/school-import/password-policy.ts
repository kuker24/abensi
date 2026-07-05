import { randomInt } from 'node:crypto';

const FIRST_WORDS = ['Biru', 'Madu', 'Nusa', 'Riau', 'Sari', 'Mega', 'Padi', 'Ceria', 'Jaya', 'Bumi', 'Fajar', 'Lestari'];
const SECOND_WORDS = ['Padi', 'Riau', 'Bumi', 'Nusa', 'Maju', 'Aman', 'Ceria', 'Jaya', 'Surya', 'Mekar', 'Hijau', 'Damai'];
const SYMBOLS = ['#', '@', '!'];

function pick(list: string[]) {
  return list[randomInt(0, list.length)];
}

export function generateSchoolImportPassword() {
  const first = pick(FIRST_WORDS).slice(0, 4).padEnd(4, 'a');
  let second = pick(SECOND_WORDS).slice(0, 4).padEnd(4, 'a');
  if (second.toLowerCase() === first.toLowerCase()) second = 'Aman';
  const number = String(randomInt(1000, 10000));
  const password = `${first}-${second}${pick(SYMBOLS)}${number}`;
  return password.length === 14 ? password : `Biru-Padi#${number}`;
}
