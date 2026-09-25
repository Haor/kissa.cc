/**
 * Steam 屏的「太空侵略者」。
 *
 * 状态全在 CPU（编队位置、击落、子弹、飞船），shader 只按 uniform 把精灵画进字符格
 * （见 shaders.ts 的 effectInvaders）。坐标单位都是字符 cell，x 向右、y 向上，
 * 编队的纵向位置用「距顶部多少格」表示。
 *
 * 横屏：飞船跟着光标左右移动、自动开火；没有光标（触屏 / 光标离开）时自动瞄准。
 * 竖屏：下半屏是文案，没地方放飞船 —— 编队缩成两行排在图标上方，Steam 图标
 * 自己当炮台，从圆边上朝敌人斜着开火。
 * 打光一波或编队压到飞船（炮台）上方就重开一波。
 */

// 与 shader 里 invaderBit 的偏移 / 宽度一致：squid / crab / crab / octopus
const SPRITES = [
  { off: 2, w: 8 },
  { off: 0, w: 11 },
  { off: 0, w: 11 },
  { off: 0, w: 12 },
];
const SHIP_W = 13;
const SHOT_SPEED = 58; // cell / s

/** 竖屏炮台 = Steam 图标：圆心和半径（cell） */
export type Turret = { x: number; y: number; r: number };

type Shot = { x: number; y: number; dx: number; dy: number };

export class Invaders {
  cols = 6;
  rows = 4;
  gapX = 16;
  gapY = 11;
  x = 4;
  yTop = 0;
  frame = 0;
  kill = 0;
  boom = { col: -1, row: -1, age: 9 };
  /** 子弹：弹头位置（cell，连续值）+ 飞行方向（单位向量） */
  shots: Shot[] = [];
  shipX = 0;
  shipY = 0;
  /** 炮口闪光：位置 + 距上次开火的秒数 */
  muzzle = { x: 0, y: 0, age: 9 };

  private dir = 1;
  private stepT = 0;
  private fireT = 0;
  private resetT = -1;
  private gw = 0;
  private gh = 0;
  private wobble = 0;
  private turret: Turret | null = null;
  private nShot = 0;

  /** 字符格尺寸变化时重排编队；竖屏传入炮台（图标）位置 */
  layout(gw: number, gh: number, turret: Turret | null) {
    const t = this.turret;
    const same =
      t === turret ||
      (t && turret && t.x === turret.x && t.y === turret.y && t.r === turret.r);
    if (gw === this.gw && gh === this.gh && same) return;
    this.gw = gw;
    this.gh = gh;
    this.turret = turret;
    if (turret) {
      // 竖屏：两行（squid + crab），列数看屏宽，给编队留出左右行军的余量
      this.rows = 2;
      this.gapX = 14;
      this.gapY = 10;
      this.cols = Math.max(2, Math.min(4, Math.floor((gw - 2 - 8 - 11) / this.gapX) + 1));
      this.shipY = -100;
    } else {
      this.rows = 4;
      this.gapX = gw < 90 ? 13 : 16;
      this.gapY = 11;
      this.cols = Math.max(3, Math.min(7, Math.floor(((gw - 12) / this.gapX) * 0.78)));
      this.shipY = Math.max(3, Math.round(gh * 0.12));
    }
    this.shipX = (gw - SHIP_W) / 2;
    this.reset();
  }

  private width() {
    return (this.cols - 1) * this.gapX + 12;
  }

  /** 行军的左右留白 */
  private margin() {
    return this.turret ? 1 : 3;
  }

  private reset() {
    this.x = this.margin() + 1;
    this.yTop = Math.max(2, Math.round(this.gh * (this.turret ? 0.075 : 0.12)));
    this.dir = 1;
    this.kill = 0;
    this.shots = [];
    this.resetT = -1;
    this.stepT = 0;
  }

  private dead(r: number, c: number) {
    return ((this.kill >> (r * 8 + c)) & 1) === 1;
  }

  private alive() {
    let n = 0;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (!this.dead(r, c)) n++;
    return n;
  }

  private step() {
    const turret = this.turret;
    const nx = this.x + this.dir * (turret ? 1 : 2);
    if (nx < this.margin() || nx + this.width() > this.gw - this.margin()) {
      this.dir = -this.dir;
      this.yTop += turret ? 1 : 2;
      const bottom = this.yTop + (this.rows - 1) * this.gapY + 8;
      // 压到炮台（图标顶）或飞船上方就重开
      const limit = turret ? this.gh - (turret.y + turret.r) - 1 : this.gh - this.shipY - 12;
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
    if (col >= this.cols || row >= this.rows) return false;
    const px = lx - col * this.gapX;
    const py = ly - row * this.gapY;
    const s = SPRITES[row];
    if (py >= 8 || px < s.off || px >= s.off + s.w) return false;
    if (this.dead(row, col)) return false;
    this.kill |= 1 << (row * 8 + col);
    this.boom = { col, row, age: 0 };
    return true;
  }

  /** 自动驾驶：瞄准离飞船最近、还有活口的那一列 */
  private aim() {
    let best = this.shipX;
    let bestD = Infinity;
    for (let c = 0; c < this.cols; c++) {
      let any = false;
      for (let r = 0; r < this.rows; r++) if (!this.dead(r, c)) any = true;
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

  /** 竖屏炮台：轮流挑一列里最靠下的活口，从图标圆边上朝它开一枪 */
  private fireTurret(t: Turret) {
    for (let k = 0; k < this.cols; k++) {
      const c = (this.nShot + k) % this.cols;
      let row = -1;
      for (let r = this.rows - 1; r >= 0; r--) {
        if (!this.dead(r, c)) {
          row = r;
          break;
        }
      }
      if (row < 0) continue;
      this.nShot = c + 1;
      // 目标 = 精灵中心，稍微往行军方向提前一点；带点手抖，大概三成会打空
      const tx = this.x + c * this.gapX + 6 + this.dir * 1.5 + (Math.random() - 0.5) * 11;
      const ty = this.gh - 1 - (this.yTop + row * this.gapY + 4);
      let dx = tx - t.x;
      let dy = ty - t.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const mx = t.x + dx * t.r * 0.9;
      const my = t.y + dy * t.r * 0.9;
      this.shots.push({ x: mx, y: my, dx, dy });
      this.muzzle = { x: mx, y: my, age: 0 };
      return;
    }
  }

  update(dt: number, mouseX: number, mouseActive: boolean) {
    if (!this.gw) return;
    this.wobble += dt * 1.7;
    const turret = this.turret;
    if (!turret) {
      const target = mouseActive ? mouseX * this.gw - SHIP_W / 2 : this.aim();
      this.shipX += (target - this.shipX) * Math.min(1, dt * (mouseActive ? 12 : 3));
      this.shipX = Math.max(1, Math.min(this.gw - SHIP_W - 1, this.shipX));
    }

    const total = this.cols * this.rows;
    const alive = this.alive();
    if (alive === 0 && this.resetT < 0) this.resetT = 1.4;
    if (this.resetT >= 0) {
      this.resetT -= dt;
      if (this.resetT < 0) this.reset();
    }

    // 敌人越少走得越快（原版的味道）
    const interval = (turret ? 0.14 : 0.1) + (0.34 * alive) / total;
    this.stepT += dt;
    while (this.stepT > interval) {
      this.stepT -= interval;
      this.step();
    }

    this.fireT -= dt;
    if (this.fireT <= 0 && this.shots.length < 3 && alive > 0) {
      if (turret) {
        this.fireTurret(turret);
        this.fireT = 0.9 + Math.random() * 0.5;
      } else {
        this.shots.push({ x: Math.round(this.shipX + 6) + 0.5, y: this.shipY + 10, dx: 0, dy: 1 });
        this.fireT = 0.5;
      }
    }
    this.shots = this.shots.filter((s) => {
      s.x += s.dx * SHOT_SPEED * dt;
      s.y += s.dy * SHOT_SPEED * dt;
      // 弹头和弹头后一格都查一次，掉帧时也不会穿过去
      if (this.hit(Math.floor(s.x), Math.floor(s.y))) return false;
      if (this.hit(Math.floor(s.x - s.dx), Math.floor(s.y - s.dy))) return false;
      return s.y < this.gh + 3 && s.x > -3 && s.x < this.gw + 3;
    });
    this.boom.age += dt;
    this.muzzle.age += dt;
  }
}
