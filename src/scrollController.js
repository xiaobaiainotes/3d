import { clamp01 } from './math.js';
import { SCROLL_SPRING } from './config.js';

export class ScrollController {
  constructor() {
    this.target = 0;
    this.value = 0;
    this.velocity = 0;
    this.stiffness = SCROLL_SPRING.stiffness;
    this.damping = SCROLL_SPRING.damping;
  }

  update(dt) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    this.target = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    this.target = clamp01(this.target);

    const displacement = this.target - this.value;
    const acceleration = displacement * this.stiffness - this.velocity * this.damping;
    this.velocity += acceleration * dt;
    this.value += this.velocity * dt;
    this.value = clamp01(this.value);
    return this.value;
  }

  get progress() {
    return this.value;
  }

  sectionProgress(start, end) {
    const length = end - start;
    if (length <= 0) return 0;
    return clamp01((this.progress - start) / length);
  }
}

