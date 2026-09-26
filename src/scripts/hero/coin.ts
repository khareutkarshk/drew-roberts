import Matter from "matter-js";
import { COMPACT_COIN_X } from "./artifacts";
import {
	CATEGORY,
	clamp,
	easeInOut,
	lerp,
	spawnDust,
	speedOf,
	type StageMetrics,
} from "./shared";

const { Bodies, Body, Composite, Sleeping } = Matter;

type Face = "front" | "back" | "edge";

const ASSETS = {
	front: "/coin/front.png",
	back: "/coin/back.png",
	edge: "/coin/edge.png",
} as const;

const BODY_RADIUS_RATIO = 0.46;
const FLIP_ANGULAR_THRESHOLD = 0.085;
const FLIP_COOLDOWN_MS = 900;
const FORCE_RADIUS = 160;
const FORCE_STRENGTH = 0.000018;
const HOVER_RADIUS = 110;
const IDLE_AFTER_MS = 4200;

export interface CoinElements {
	layer: HTMLElement;
	inner: HTMLElement;
	face: HTMLImageElement;
	edge: HTMLImageElement;
	highlight: HTMLElement;
	shadow: HTMLElement;
	dust: HTMLElement;
}

export function preloadCoin(): Promise<void> {
	return Promise.all(
		Object.values(ASSETS).map(
			(src) =>
				new Promise<void>((resolve) => {
					const img = new Image();
					img.onload = img.onerror = () => resolve();
					img.src = src;
				}),
		),
	).then(() => undefined);
}

function coinSize(m: StageMetrics): number {
	const byWidth =
		m.width < 640
			? clamp(m.width * 0.34, 140, 176)
			: m.width < 1024
				? clamp(m.width * 0.28, 220, 280)
				: clamp(m.width * 0.22, 260, 340);
	// Short viewports: leave room above the bench so the coin never crowds the header
	return Math.round(Math.min(byWidth, Math.max(130, m.benchY * 0.4)));
}

export class Coin {
	body: Matter.Body | null = null;
	size = 280;

	private showingFront = true;
	private flipping = false;
	private flipProgress = 0;
	private flipSwitched = false;
	private lastFlipAt = 0;
	private lastAngularSign = 0;
	private angularAccumulator = 0;

	private impactScale = 1;
	private highlightFlash = 0;
	private lastActiveAt = performance.now();
	private idleMix = 0;

	constructor(private els: CoinElements) {}

	create(world: Matter.World, m: StageMetrics, atRest: boolean): void {
		this.applySize(m);
		const radius = this.size * BODY_RADIUS_RATIO;
		const x = m.width * (m.compact ? COMPACT_COIN_X : 0.44);
		const y = atRest ? m.benchY - radius : m.benchY * 0.3;

		const body = Bodies.circle(x, y, radius, {
			label: "coin",
			restitution: 0.28,
			friction: 0.55,
			frictionStatic: 0.85,
			frictionAir: 0.024,
			sleepThreshold: 28,
			collisionFilter: {
				category: CATEGORY.coin,
				mask: CATEGORY.wall | CATEGORY.artifact | CATEGORY.mouse,
			},
		});
		Body.setMass(body, 8);
		if (!atRest) {
			Body.setAngularVelocity(body, 0.012);
			Body.setVelocity(body, { x: 0.15, y: 0.2 });
		}

		this.body = body;
		Composite.add(world, body);
		this.setFace("front");
	}

	/** Re-drop from above centre — used by REPEAT while the stage is faded out. */
	reset(m: StageMetrics): void {
		if (!this.body) return;
		Body.setPosition(this.body, { x: m.width * (m.compact ? COMPACT_COIN_X : 0.44), y: m.benchY * 0.3 });
		Body.setVelocity(this.body, { x: 0.15, y: 0.2 });
		Body.setAngle(this.body, 0);
		Body.setAngularVelocity(this.body, 0.012);
		Sleeping.set(this.body, false);
		this.flipping = false;
		this.showingFront = true;
		this.els.inner.style.setProperty("--flip-scale", "1");
		this.setFace("front");
	}

	relayout(prev: StageMetrics, next: StageMetrics): void {
		if (!this.body) return;
		const oldRadius = this.size * BODY_RADIUS_RATIO;
		this.applySize(next);
		const radius = this.size * BODY_RADIUS_RATIO;
		const scale = radius / oldRadius;
		if (Math.abs(scale - 1) > 0.01) Body.scale(this.body, scale, scale);

		const aboveBench = (prev.benchY - this.body.position.y) * (next.benchY / Math.max(1, prev.benchY));
		Body.setPosition(this.body, {
			x: clamp(this.body.position.x * (next.width / prev.width), radius + 2, next.width - radius - 2),
			y: clamp(next.benchY - aboveBench, radius + 2, next.benchY - radius),
		});
	}

	markActive(): void {
		this.lastActiveAt = performance.now();
	}

	/** Called once per physics step, before Engine.update. */
	beforeStep(pointer: { x: number; y: number; inside: boolean }, dragging: boolean): void {
		const coin = this.body;
		if (!coin || dragging || !pointer.inside) return;

		const dx = coin.position.x - pointer.x;
		const dy = coin.position.y - pointer.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 1 || dist > FORCE_RADIUS) return;

		if (coin.isSleeping) Sleeping.set(coin, false);

		if (dist < HOVER_RADIUS) {
			const proximity = 1 - dist / HOVER_RADIUS;
			const nudge = proximity * 0.000012 * coin.mass;
			Body.applyForce(coin, coin.position, { x: (dx / dist) * nudge, y: (dy / dist) * nudge * 0.6 });
			if (Math.abs(coin.angularVelocity) < 0.04) {
				Body.setAngularVelocity(coin, coin.angularVelocity + (dx > 0 ? -1 : 1) * proximity * 0.0008);
			}
		} else {
			const strength = FORCE_STRENGTH * (1 - dist / FORCE_RADIUS) * coin.mass;
			Body.applyForce(coin, coin.position, { x: (dx / dist) * strength, y: (dy / dist) * strength * 0.55 });
		}
	}

	impact(speed: number): void {
		if (!this.body || speed < 2.8) return;
		const intensity = clamp(speed / 10, 0.15, 1);
		this.impactScale = 1 - 0.045 * intensity;
		this.highlightFlash = 0.18 * intensity;
		spawnDust(
			this.els.dust,
			this.body.position.x,
			this.body.position.y + this.size * 0.36,
			this.size * 0.45,
			intensity,
		);
	}

	render(m: StageMetrics, now: number, dragging: boolean): void {
		const coin = this.body;
		if (!coin) return;

		const speed = speedOf(coin);
		if (dragging || speed > 0.4 || Math.abs(coin.angularVelocity) > 0.01) this.lastActiveAt = now;

		this.updateFlip(now, speed);

		// Idle breathing is visual-only so it never disturbs the resting stack around the coin
		const idleTarget = now - this.lastActiveAt > IDLE_AFTER_MS ? 1 : 0;
		this.idleMix = lerp(this.idleMix, idleTarget, 0.02);
		const t = now * 0.001;
		const idleAngle = Math.sin(t * 0.42) * 0.012 * this.idleMix;
		const idleLift = Math.sin(t * 0.7) * 0.8 * this.idleMix;

		const half = this.size / 2;
		const angle = coin.angle + idleAngle;
		this.els.layer.style.transform = `translate3d(${(coin.position.x - half).toFixed(2)}px, ${(coin.position.y - half - idleLift).toFixed(2)}px, 0)`;

		if (this.impactScale < 1) {
			this.impactScale = lerp(this.impactScale, 1, 0.12);
			if (1 - this.impactScale < 0.001) this.impactScale = 1;
		}
		this.highlightFlash *= 0.9;

		this.els.inner.style.setProperty("--impact-scale", this.impactScale.toFixed(4));
		this.els.inner.style.transform = `rotate(${angle.toFixed(4)}rad) scale(var(--impact-scale, 1)) scaleX(var(--flip-scale, 1))`;

		const fly = clamp(speed / 8, 0, 1);
		const highlight = clamp(
			0.22 + Math.abs(Math.sin(coin.angle)) * 0.18 + fly * 0.08 + this.highlightFlash,
			0.18,
			0.6,
		);
		this.els.layer.style.setProperty("--highlight-opacity", highlight.toFixed(3));
		this.els.highlight.style.setProperty(
			"--highlight-spin",
			`${(Math.sin(t * 0.35) * 4 * this.idleMix + (coin.angle * 180) / Math.PI * 0.15).toFixed(2)}deg`,
		);

		this.renderShadow(m, fly);
	}

	/** The shadow lives on the bench surface, so it stays put and softens as the coin lifts off. */
	private renderShadow(m: StageMetrics, fly: number): void {
		const coin = this.body!;
		const radius = this.size * BODY_RADIUS_RATIO;
		const gap = Math.max(0, m.benchY - (coin.position.y + radius));
		const lift = clamp(gap / (m.benchY * 0.55) + fly * 0.2, 0, 1);

		const w = this.size * 0.84;
		const h = this.size * 0.16;
		const scale = lerp(1, 0.55, lift);
		const offsetX = clamp(-coin.velocity.x * 1.2, -14, 14);
		const s = this.els.shadow.style;
		s.width = `${w}px`;
		s.height = `${h}px`;
		s.opacity = lerp(0.7, 0.16, lift).toFixed(3);
		s.filter = `blur(${lerp(4, 16, lift).toFixed(1)}px)`;
		s.transform = `translate3d(${(coin.position.x - w / 2 + offsetX).toFixed(2)}px, ${(m.benchY - h / 2).toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
	}

	private applySize(m: StageMetrics): void {
		this.size = coinSize(m);
		this.els.layer.style.width = `${this.size}px`;
		this.els.layer.style.height = `${this.size}px`;
	}

	private updateFlip(now: number, speed: number): void {
		const coin = this.body!;
		const inner = this.els.inner;

		if (this.flipping) {
			this.flipProgress = Math.min(1, this.flipProgress + 0.055);
			const p = this.flipProgress;
			if (p < 0.5) {
				const local = p / 0.5;
				inner.style.setProperty("--flip-scale", lerp(1, 0, easeInOut(local)).toFixed(3));
				if (local > 0.78) this.setFace("edge");
			} else {
				if (!this.flipSwitched) {
					this.showingFront = !this.showingFront;
					this.flipSwitched = true;
					this.setFace(this.showingFront ? "front" : "back");
				}
				inner.style.setProperty("--flip-scale", lerp(0, 1, easeInOut((p - 0.5) / 0.5)).toFixed(3));
			}
			if (p >= 1) {
				this.flipping = false;
				this.flipSwitched = false;
				inner.style.setProperty("--flip-scale", "1");
				this.lastFlipAt = now;
			}
			return;
		}

		const angVel = coin.angularVelocity;
		const sign = Math.sign(angVel) || this.lastAngularSign;
		this.angularAccumulator =
			sign !== 0 && sign === this.lastAngularSign
				? this.angularAccumulator + Math.abs(angVel)
				: Math.abs(angVel);
		this.lastAngularSign = sign;

		if (
			now - this.lastFlipAt > FLIP_COOLDOWN_MS &&
			Math.abs(angVel) > FLIP_ANGULAR_THRESHOLD &&
			this.angularAccumulator > 0.55 &&
			speed > 1.8
		) {
			this.flipping = true;
			this.flipProgress = 0;
			this.flipSwitched = false;
			this.angularAccumulator = 0;
		}
	}

	private setFace(face: Face): void {
		this.els.inner.dataset.face = face;
		if (face === "edge") return;
		const src = face === "front" ? ASSETS.front : ASSETS.back;
		if (!this.els.face.src.endsWith(src)) this.els.face.src = src;
		this.els.face.alt = face === "front" ? "Drew Coin, front" : "Drew Coin, back";
	}
}
