/**
 * Steam 屏的「太空侵略者」。
 *
 * 状态全在 CPU（编队位置、击落、子弹、飞船），shader 只按 uniform 把精灵画进字符格
 * （见 shaders.ts 的 effectInvaders）。坐标单位都是字符 cell，x 向右、y 向上，
 * 编队的纵向位置用「距顶部多少格」表示。
 *
 * 飞船跟着光标左右移动、自动开火；没有光标（触屏 / 光标离开）时自动瞄准。
 * 打光一波或编队压到飞船上方就重开一波。
 */

// 与 shader 里 invaderBit 的偏移 / 宽度一致：squid / crab / crab / octopus
const SPRITES = [
  { off: 2, w: 8 },
  { off: 0, w: 11 },
  { off: 0, w: 11 },
  { off: 0, w: 12 },
];
const ROWS = 4;
const SHIP_W = 13;
const SHOT_SPEED = 58; // cell / s

export class Invaders {
  cols = 6;
  gapX = 16;
  gapY = 11;
  x = 4;
  yTop = 0;
  frame = 0;
  kill = 0;
  boom = { col: -1, row: -1, age: 9 };
  shots: { x: number; y: number }[] = [];
  shipX = 0;
  shipY = 0;

  private dir = 1;
  private stepT = 0;
  private fireT = 0;
  private resetT = -1;
  private gw = 0;
  private gh = 0;
  private wobble = 0;
  /** 竖屏：文案压在下半屏，飞船没地方放，只留编队 */
  private portrait = false;

  /** 字符格尺寸变化时重排编队 */
  layout(gw: number, gh: number) {
    if (gw === this.gw && gh === this.gh) return;
    this.gw = gw;
    this.gh = gh;
    this.gapX = gw < 90 ? 13 : 16;
    this.cols = Math.max(3, Math.min(7, Math.floor(((gw - 12) / this.gapX) * 0.78)));
    this.portrait = gh > gw * 1.1;
    this.shipY = this.portrait ? -100 : Math.max(3, Math.round(gh * 0.12));
    this.shipX = (gw - SHIP_W) / 2;
    this.reset();
  }

  private width() {
    return (this.cols - 1) * this.gapX + 12;
  }

  private reset() {
    this.x = 4;
    this.yTop = Math.max(2, Math.round(this.gh * 0.12));
    this.dir = 1;
    this.kill = 0;
    this.shots = [];
    this.resetT = -1;
    this.stepT = 0;
  }

  private alive() {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < this.cols; c++) if (!((this.kill >> (r * 8 + c)) & 1)) n++;
    return n;
  }

  private step() {
    const nx = this.x + this.dir * 2;
    if (nx < 3 || nx + this.width() > this.gw - 3) {
      this.dir = -this.dir;
      this.yTop += 2;
      const bottom = this.yTop + (ROWS - 1) * this.gapY + 8;
      const limit = this.portrait ? this.gh * 0.55 : this.gh - this.shipY - 12;
      if (bottom > limit) this.reset();
    } else {
      this.x = nx;
    }
    this.frame ^= 1;
  }

  /** 子弹 (sx, sy) 是否打中一个还活着的敌人；打中就记下 */
  private hit(sx: number, sy: number) {
    const topY = this.gh - 1 - this.yTop;
    const lx = sx - this.x;
    const ly = topY - sy;
    if (lx < 0 || ly < 0) return false;
    const col = Math.floor(lx / this.gapX);
    const row = Math.floor(ly / this.gapY);
    if (col >= this.cols || row >= ROWS) return false;
    const px = lx - col * this.gapX;
    const py = ly - row * this.gapY;
    const s = SPRITES[row];
    if (py >= 8 || px < s.off || px >= s.off + s.w) return false;
    const bit = row * 8 + col;
    if ((this.kill >> bit) & 1) return false;
    this.kill |= 1 << bit;
    this.boom = { col, row, age: 0 };
    return true;
  }

  /** 自动驾驶：瞄准离飞船最近、还有活口的那一列 */
  private aim() {
    let best = this.shipX;
    let bestD = Infinity;
    for (let c = 0; c < this.cols; c++) {
      let any = false;
      for (let r = 0; r < ROWS; r++) if (!((this.kill >> (r * 8 + c)) & 1)) any = true;
      if (!any) continue;
      const cx = this.x + c * this.gapX + 5 - (SHIP_W >> 1);
      const d = Math.abs(cx - this.shipX);
      if (d < bestD) {
        bestD = d;
        best = cx;
      }
    }
    return best + Math.sin(this.wobble) * 3;
  }

  update(dt: number, mouseX: number, mouseActive: boolean) {
    if (!this.gw) return;
    this.wobble += dt * 1.7;
    const target = mouseActive ? mouseX * this.gw - SHIP_W / 2 : this.aim();
    this.shipX += (target - this.shipX) * Math.min(1, dt * (mouseActive ? 12 : 3));
    this.shipX = Math.max(1, Math.min(this.gw - SHIP_W - 1, this.shipX));

    const total = this.cols * ROWS;
    const alive = this.alive();
    if (alive === 0 && this.resetT < 0) this.resetT = 1.4;
    if (this.resetT >= 0) {
      this.resetT -= dt;
      if (this.resetT < 0) this.reset();
    }

    // 敌人越少走得越快（原版的味道）
    const interval = 0.1 + (0.34 * alive) / total;
    this.stepT += dt;
    while (this.stepT > interval) {
      this.stepT -= interval;
      this.step();
    }

    this.fireT -= dt;
    if (!this.portrait && this.fireT <= 0 && this.shots.length < 3 && alive > 0) {
      this.shots.push({ x: Math.round(this.shipX + 6), y: this.shipY + 8 });
      this.fireT = 0.5;
    }
    this.shots = this.shots.filter((s) => {
      s.y += SHOT_SPEED * dt;
      if (this.hit(s.x, Math.floor(s.y)) || this.hit(s.x, Math.floor(s.y) + 2)) return false;
      return s.y < this.gh;
    });
    this.boom.age += dt;
  }
}
