import Matter from "matter-js";
import {
	CATEGORY,
	clamp,
	placeElement,
	relativeSpeed,
	seeded,
	spawnDust,
	type StageMetrics,
} from "./shared";

const { Bodies, Body, Composite, Sleeping, Vector } = Matter;

type Kind = "slab" | "tag" | "ticket";

interface Pose {
	x: number;
	y: number;
	angle: number;
}

interface Piece {
	el: HTMLElement;
	body: Matter.Body;
	w: number;
	h: number;
}

interface Block {
	el: HTMLElement;
	kind: Kind;
	breakable: boolean;
	body: Matter.Body | null;
	w: number;
	h: number;
	home: Pose;
	broken: boolean;
	pieces: Piece[];
	dirty: boolean;
}

const MATERIAL: Record<Kind, Matter.IChamferableBodyDefinition & { massFor: (w: number, h: number) => number }> = {
	// Wood type: heavy, dead bounce, grips the block beneath it
	slab: {
		friction: 0.8,
		frictionStatic: 1,
		restitution: 0.06,
		frictionAir: 0.01,
		chamfer: { radius: 2 },
		massFor: (w, h) => 3 + (w * h) / 9000,
	},
	// Stamped aluminium: light, a little clink
	tag: {
		friction: 0.5,
		frictionStatic: 0.7,
		restitution: 0.22,
		frictionAir: 0.015,
		chamfer: { radius: 4 },
		massFor: () => 0.6,
	},
	// Card stock: heavy enough to sit still under a dropped coin, zero bounce
	ticket: {
		friction: 0.85,
		frictionStatic: 1.2,
		restitution: 0,
		frictionAir: 0.06,
		chamfer: { radius: 3 },
		massFor: () => 1.4,
		sleepThreshold: 25,
	},
};

const COLLIDES = {
	category: CATEGORY.artifact,
	mask: CATEGORY.wall | CATEGORY.coin | CATEGORY.artifact | CATEGORY.mouse,
};

export const COMPACT_COIN_X = 0.3;

const BREAK_SPEED_FROM_COIN = 7;
const BREAK_SPEED_OTHER = 12;

export class Artifacts {
	private blocks: Block[] = [];
	private byBody = new Map<Matter.Body, Block>();
	private pendingBreaks = new Set<Block>();
	/** Breaking is only allowed after the visitor has touched something, never during the intro. */
	armed = false;
	onBreak: (() => void) | null = null;

	constructor(
		private container: HTMLElement,
		private dust: HTMLElement,
	) {
		container.querySelectorAll<HTMLElement>("[data-artifact]").forEach((el) => {
			this.blocks.push({
				el,
				kind: el.dataset.artifact as Kind,
				breakable: el.hasAttribute("data-breakable"),
				body: null,
				w: 0,
				h: 0,
				home: { x: 0, y: 0, angle: 0 },
				broken: false,
				pieces: [],
				dirty: true,
			});
		});
	}

	bodies(): Matter.Body[] {
		const out: Matter.Body[] = [];
		for (const b of this.blocks) {
			if (b.body) out.push(b.body);
			for (const p of b.pieces) out.push(p.body);
		}
		return out;
	}

	create(world: Matter.World, m: StageMetrics): void {
		this.measure();
		this.computeHomes(m);
		for (const b of this.blocks) {
			if (!b.w) continue;
			b.body = this.makeBody(b.kind, b.home, b.w, b.h, b.body?.label ?? b.el.dataset.label ?? b.kind);
			this.byBody.set(b.body, b);
			Composite.add(world, b.body);
			b.dirty = true;
		}
	}

	/** Viewport changed: put everything back on the bench at the new scale. */
	relayout(world: Matter.World, m: StageMetrics): void {
		this.clear(world);
		this.create(world, m);
	}

	/** REPEAT: rebuild broken slabs and set every object back where it started, lifted slightly so it lands. */
	reset(world: Matter.World, m: StageMetrics): void {
		this.clear(world);
		this.create(world, m);
		for (const b of this.blocks) {
			if (!b.body) continue;
			Body.setPosition(b.body, { x: b.home.x, y: b.home.y - 14 });
		}
	}

	onCollision(pair: Matter.Pair): void {
		for (const [self, other] of [
			[pair.bodyA, pair.bodyB],
			[pair.bodyB, pair.bodyA],
		] as const) {
			const block = this.byBody.get(self);
			if (!block || !block.breakable || block.broken || !this.armed) continue;
			const speed = relativeSpeed(self, other);
			const threshold = other.label === "coin" ? BREAK_SPEED_FROM_COIN : BREAK_SPEED_OTHER;
			if (speed > threshold) this.pendingBreaks.add(block);
		}
	}

	/** Structural changes must happen outside Engine.update. */
	flush(world: Matter.World): void {
		if (!this.pendingBreaks.size) return;
		for (const block of this.pendingBreaks) this.split(world, block);
		this.pendingBreaks.clear();
		this.onBreak?.();
	}

	isDisturbed(): boolean {
		for (const b of this.blocks) {
			if (b.broken) return true;
			if (b.kind !== "slab" || !b.body) continue;
			const moved = Math.hypot(b.body.position.x - b.home.x, b.body.position.y - b.home.y);
			if (moved > b.h * 0.5 || Math.abs(b.body.angle) > 0.3) return true;
		}
		return false;
	}

	render(): void {
		for (const b of this.blocks) {
			if (b.body && (b.dirty || !b.body.isSleeping)) {
				placeElement(b.el, b.body.position.x, b.body.position.y, b.w, b.h, b.body.angle);
				b.dirty = false;
			}
			for (const p of b.pieces) {
				if (p.body.isSleeping) continue;
				placeElement(p.el, p.body.position.x, p.body.position.y, p.w, p.h, p.body.angle);
			}
		}
	}

	private clear(world: Matter.World): void {
		for (const b of this.blocks) {
			if (b.body) Composite.remove(world, b.body);
			for (const p of b.pieces) {
				Composite.remove(world, p.body);
				p.el.remove();
			}
			b.body = null;
			b.pieces = [];
			b.broken = false;
			b.el.classList.remove("is-broken");
		}
		this.byBody.clear();
		this.pendingBreaks.clear();
	}

	private measure(): void {
		for (const b of this.blocks) {
			b.el.style.width = "";
			b.el.style.height = "";
			if (getComputedStyle(b.el).display === "none") {
				b.w = b.h = 0;
				continue;
			}
			b.w = b.el.offsetWidth;
			b.h = b.el.offsetHeight;
			b.el.style.width = `${b.w}px`;
			b.el.style.height = `${b.h}px`;
		}
	}

	/**
	 * The arrangement a person would leave on a desk: type stacked on the right,
	 * tags in a loose pile on the left, the ticket dropped on top of them.
	 */
	private computeHomes(m: StageMetrics): void {
		const visible = this.blocks.filter((b) => b.w > 0);
		const slabs = visible.filter((b) => b.kind === "slab");
		const loose = [
			...visible.filter((b) => b.kind === "tag"),
			...visible.filter((b) => b.kind === "ticket"),
		];

		const right = m.width * (m.compact ? 0.965 : 0.915);
		const shifts = [-0.42, 0.2, -0.14, 0];
		let y = m.benchY;
		let stackLeft = right;
		for (let i = slabs.length - 1; i >= 0; i--) {
			const b = slabs[i];
			const x = clamp(right - b.w / 2 + (shifts[i] ?? 0) * b.h, b.w / 2 + 4, m.width - b.w / 2 - 4);
			b.home = { x, y: y - b.h / 2 - 0.5, angle: 0 };
			stackLeft = Math.min(stackLeft, x - b.w / 2);
			y -= b.h + 0.5;
		}

		// Phones have no spare floor: park the ticket beside the coin landing,
		// never under it — stacking the heavy coin on card stock jitters forever.
		if (m.compact) {
			const ticket = loose.find((b) => b.kind === "ticket");
			if (ticket) {
				const coinX = m.width * COMPACT_COIN_X;
				const coinClear = m.width * 0.22;
				const beside = coinX + coinClear + ticket.w / 2;
				const x = clamp(beside, ticket.w / 2 + 6, Math.min(stackLeft - ticket.w / 2 - 6, m.width - ticket.w / 2 - 6));
				ticket.home = { x, y: m.benchY - ticket.h / 2 - 0.5, angle: -0.04 };
				loose.splice(loose.indexOf(ticket), 1);
			}
		}

		// Tossed, not arranged: each piece starts tilted in the air and physics makes the pile
		const x0 = m.compact ? stackLeft : m.width * 0.04;
		const x1 = m.compact ? m.width - 6 : m.width * 0.34;
		let rowBase = (m.compact ? y : m.benchY) - 6;
		let cursor = x0;
		let rowH = 0;

		loose.forEach((b, i) => {
			const tilt = m.compact ? 0.06 : b.kind === "ticket" ? 0.18 : 0.5;
			const angle = (seeded(i, 3) - 0.5) * tilt * 2;
			const spanX = Math.abs(b.w * Math.cos(angle)) + Math.abs(b.h * Math.sin(angle));
			const spanY = Math.abs(b.w * Math.sin(angle)) + Math.abs(b.h * Math.cos(angle));
			if (cursor + spanX > x1 && cursor > x0) {
				rowBase -= rowH + 4;
				cursor = x0 + seeded(i, 5) * 20;
				rowH = 0;
			}
			const x = clamp(cursor + spanX / 2, spanX / 2 + 4, m.width - spanX / 2 - 4);
			b.home = { x, y: rowBase - spanY / 2, angle };
			cursor += spanX + 4 + seeded(i, 7) * 10;
			rowH = Math.max(rowH, spanY);
		});
	}

	private makeBody(kind: Kind, pose: Pose, w: number, h: number, label: string): Matter.Body {
		const { massFor, ...material } = MATERIAL[kind];
		const body = Bodies.rectangle(pose.x, pose.y, w, h, {
			sleepThreshold: 40,
			...material,
			angle: pose.angle,
			label,
			collisionFilter: COLLIDES,
		});
		Body.setMass(body, massFor(w, h));
		return body;
	}

	/** BREAK snaps where it was hit hardest-ish: a little past the middle, like real grain would. */
	private split(world: Matter.World, block: Block): void {
		const body = block.body;
		if (!body || block.broken) return;

		const cut = Math.round(block.w * 0.56);
		const halves = [
			{ side: "left", offset: -block.w / 2 + cut / 2, w: cut, shift: 0, dir: -1 },
			{ side: "right", offset: cut / 2, w: block.w - cut, shift: cut, dir: 1 },
		] as const;

		for (const half of halves) {
			const el = document.createElement("div");
			el.className = `artifact slab-piece slab-piece--${half.side}`;
			el.style.width = `${half.w}px`;
			el.style.height = `${block.h}px`;

			const face = block.el.cloneNode(true) as HTMLElement;
			face.className = `${block.el.className.replace("artifact", "").trim()} slab-piece__face`;
			face.removeAttribute("data-artifact");
			face.style.transform = `translateX(${-half.shift}px)`;
			face.style.width = `${block.w}px`;
			face.style.height = `${block.h}px`;
			el.appendChild(face);
			this.container.appendChild(el);

			const pos = Vector.add(body.position, Vector.rotate({ x: half.offset, y: 0 }, body.angle));
			const piece = this.makeBody("slab", { ...pos, angle: body.angle }, half.w, block.h, `break-${half.side}`);
			Body.setMass(piece, (body.mass * half.w) / block.w);
			const push = Vector.rotate({ x: half.dir * 3, y: -1.6 }, body.angle);
			Body.setVelocity(piece, Vector.add(body.velocity, push));
			Body.setAngularVelocity(piece, body.angularVelocity + half.dir * 0.07);
			Composite.add(world, piece);
			block.pieces.push({ el, body: piece, w: half.w, h: block.h });
			placeElement(el, piece.position.x, piece.position.y, half.w, block.h, piece.angle);
		}

		const crack = Vector.add(body.position, Vector.rotate({ x: -block.w / 2 + cut, y: 0 }, body.angle));
		spawnDust(this.dust, crack.x, crack.y, block.h * 0.6, 1);

		this.byBody.delete(body);
		Composite.remove(world, body);
		block.body = null;
		block.broken = true;
		block.el.classList.add("is-broken");
		for (const p of block.pieces) Sleeping.set(p.body, false);
	}
}
