import Matter from "matter-js";

export const CATEGORY = {
	mouse: 0x0001,
	wall: 0x0002,
	coin: 0x0004,
	artifact: 0x0008,
} as const;

export const STEP_MS = 1000 / 60;

export interface StageMetrics {
	width: number;
	height: number;
	/** Y of the bench surface, relative to the hero. Everything rests on it. */
	benchY: number;
	compact: boolean;
}

/** Matter's Mouse exposes its DOM handlers at runtime but the typings omit them. */
export type MouseHandlers = Record<
	"mousedown" | "mousemove" | "mouseup" | "mousewheel",
	(event: Event) => void
>;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function easeInOut(t: number): number {
	return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function speedOf(body: Matter.Body): number {
	return Math.hypot(body.velocity.x, body.velocity.y);
}

export function relativeSpeed(a: Matter.Body, b: Matter.Body): number {
	return Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
}

/** Deterministic jitter so the bench looks arranged by hand, not randomised on every load. */
export function seeded(index: number, salt = 1): number {
	const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
	return x - Math.floor(x);
}

export function placeElement(
	el: HTMLElement,
	x: number,
	y: number,
	w: number,
	h: number,
	angle: number,
): void {
	el.style.transform = `translate3d(${(x - w / 2).toFixed(2)}px, ${(y - h / 2).toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`;
}

export function spawnDust(layer: HTMLElement, x: number, y: number, spread: number, intensity: number): void {
	const count = Math.round(3 + intensity * 4);
	for (let i = 0; i < count; i++) {
		const particle = document.createElement("span");
		particle.className = "hero__dust-particle";
		particle.style.left = `${x + (Math.random() - 0.5) * spread}px`;
		particle.style.top = `${y + (Math.random() - 0.5) * 8}px`;
		layer.appendChild(particle);

		const driftX = (Math.random() - 0.5) * 18;
		const driftY = -6 - Math.random() * 14;
		particle.animate(
			[
				{ opacity: 0.45, transform: "translate(0, 0) scale(1)" },
				{ opacity: 0, transform: `translate(${driftX}px, ${driftY}px) scale(0.4)` },
			],
			{ duration: 280 + Math.random() * 220, easing: "ease-out", fill: "forwards" },
		).onfinish = () => particle.remove();
	}
}
