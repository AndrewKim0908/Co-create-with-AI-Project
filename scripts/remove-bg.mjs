import { Jimp } from 'jimp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const src  = path.join(root, 'public', 'assets', 'logo3.png');
const dest = path.join(root, 'public', 'assets', 'logo-transparent.png');

// 사이안 색상 범위 (logo3.png 기준: ~#06b6d4)
const CYAN = { rMax: 50, gMin: 150, gMax: 220, bMin: 180, bMax: 255 };
// 경계 안티앨리어싱 제거 threshold: 순수 사이안과의 거리
const TARGET_R = 6, TARGET_G = 182, TARGET_B = 212;
const THRESHOLD = 80;

const img = await Jimp.read(src);
img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
  const r = this.bitmap.data[idx];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];

  // 사이안 범위 내에 있는지 1차 판정
  const inRange =
    r <= CYAN.rMax &&
    g >= CYAN.gMin && g <= CYAN.gMax &&
    b >= CYAN.bMin && b <= CYAN.bMax;

  // 목표 사이안 색과의 유클리드 거리로 2차 판정
  const dist = Math.sqrt((r - TARGET_R) ** 2 + (g - TARGET_G) ** 2 + (b - TARGET_B) ** 2);
  const isCyan = inRange && dist < THRESHOLD;

  if (!isCyan) {
    this.bitmap.data[idx + 3] = 0; // 사이안이 아니면 투명
  }
});

await img.write(dest);
console.log(`저장 완료: ${dest}`);
