import Matter from "matter-js";

const { Engine, Bodies, Body, Composite, Constraint, Mouse, MouseConstraint } = Matter;

const STEP_MS = 1000 / 60;
const WALL = 80;

export type AccentMode = "drop" | "tip" | "nudge" | "play" | "hang" | "cascade" | "signal";

export interface AccentOptions {
	root: HTMLElement;
	mode?: AccentMode;
	/** Delay before the body becomes active (ms). */
	delay?: number;
	/** Only start after this element intersects the viewport. */
	trigger?: HTMLElement | null;
}

type BodyEl = Matter.Body & {
	__el: HTMLElement;
	__anchor?: { x: number; y: number };
	__cord?: HTMLElement | null;
};

/**
 * Light Matter.js accent for archive pages.
 * One to a few bodies, soft gravity, pauses off-screen / reduced-motion.
 */
export class PhysicsAccent {
	private engine = Engine.create({
		gravity: { x: 0, y: 0.9, scale: 0.001 },
		enableSleeping: true,
	});
	private walls: Matter.Body[] = [];
	private bodies: BodyEl[] = [];
	private elements: HTMLElement[] = [];
	private mouse: Matter.Mouse | null = null;
	private mouseConstraint: Matter.MouseConstraint | null = null;
	private rafId = 0;
	private last = 0;
	private accumulator = 0;
	private destroyed = false;
	private visible = true;
	private started = false;
	private mode: AccentMode;
	private tipped = false;
	private windTimer = 0;
	private cascadeTimers: number[] = [];
	private cleanups: Array<() => void> = [];
	private reduced: boolean;

	constructor(private options: AccentOptions) {
		this.mode = options.mode ?? "drop";
		this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}

	init(): void {
		if (this.destroyed) return;
		this.elements = [...this.options.root.querySelectorAll<HTMLElement>("[data-accent-body]")];
		if (!this.elements.length) return;

		if (this.reduced) {
			this.placeStatic();
			this.options.root.classList.add("is-ready");
			return;
		}

		const start = () => {
			if (this.started || this.destroyed) return;
			this.started = true;
			window.setTimeout(() => {
				if (this.destroyed) return;
				this.build();
				this.options.root.classList.add("is-ready");
				this.bindLifecycle();
				this.start();
			}, this.options.delay ?? 120);
		};

		const trigger = this.options.trigger ?? this.options.root;
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					io.disconnect();
					start();
				}
			},
			{ threshold: 0.15 },
		);
		io.observe(trigger);
		this.cleanups.push(() => io.disconnect());
	}

	destroy(): void {
		this.destroyed = true;
		this.stop();
		for (const id of this.cascadeTimers) window.clearTimeout(id);
		this.cascadeTimers = [];
		for (const fn of this.cleanups) fn();
		this.cleanups = [];
		if (this.mouseConstraint) Composite.remove(this.engine.world, this.mouseConstraint);
		Composite.clear(this.engine.world, false, true);
		Engine.clear(this.engine);
		this.mouse = null;
		this.mouseConstraint = null;
	}

	private placeStatic(): void {
		const { width, height } = this.measure();
		const n = this.elements.length;
		this.elements.forEach((el, i) => {
			const w = el.offsetWidth || 80;
			const h = el.offsetHeight || 30;
			if (this.mode === "cascade") {
				const floor = height - 36;
				const gap = width / (n + 1);
				const x = gap * (i + 1) - w / 2;
				const y = floor - h - 4;
				el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${((i % 2) - 0.5) * 0.08}rad)`;
				return;
			}
			if (this.mode === "signal") {
				const floor = height * 0.62;
				const isCoin = el.classList.contains("signal-coin");
				const x = isCoin
					? width * 0.5 - w / 2
					: width * (0.16 + ((i - (isCoin ? 0 : 0)) / Math.max(1, n - 1)) * 0.68) - w / 2;
				const y = floor - h - (isCoin ? 10 : 4);
				el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${isCoin ? 0 : ((i % 3) - 1) * 0.05}rad)`;
				el.style.opacity = "1";
				return;
			}
			const x =
				this.mode === "hang"
					? width * (this.elements.length === 1 ? 0.5 : 0.18 + (i / Math.max(1, n - 1 || 1)) * 0.64) -
						w / 2
					: width * (0.18 + (i / Math.max(1, n - 1 || 1)) * 0.55) - w / 2;
			const y =
				this.mode === "hang"
					? height * (this.elements.length === 1 ? 0.38 : 0.28 + (i % 2) * 0.12)
					: height * 0.55 - h / 2;
			el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${this.mode === "hang" && this.elements.length === 1 ? 0.08 : ((i % 3) - 1) * 0.06}rad)`;
			const cord = this.options.root.querySelector<HTMLElement>(
				`[data-cord="${el.dataset.accentBody}"]`,
			);
			if (cord && this.mode === "hang") {
				const ax = x + w / 2;
				const ay = 28;
				const len = Math.max(8, y + 10 - ay);
				cord.style.height = `${len}px`;
				cord.style.transform = `translate3d(${ax}px, ${ay}px, 0)`;
				cord.style.opacity = "0.55";
			}
		});
	}

	private measure(): { width: number; height: number } {
		const rect = this.options.root.getBoundingClientRect();
		return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
	}

	private build(): void {
		const { width, height } = this.measure();
		const world = this.engine.world;

		if (this.mode === "hang") {
			this.buildHang(width, height);
			this.render();
			return;
		}

		if (this.mode === "cascade") {
			this.buildCascade(width, height);
			this.render();
			return;
		}

		if (this.mode === "signal") {
			this.buildSignal(width, height);
			this.render();
			return;
		}

		const wallOpts: Matter.IChamferableBodyDefinition = {
			isStatic: true,
			restitution: 0.12,
			friction: 0.85,
		};
		const floorInset = this.mode === "play" ? 34 : 0;
		this.walls = [
			Bodies.rectangle(width / 2, height - floorInset + WALL / 2, width + WALL * 2, WALL, wallOpts),
			Bodies.rectangle(width / 2, -WALL / 2, width + WALL * 2, WALL, wallOpts),
			Bodies.rectangle(-WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
			Bodies.rectangle(width + WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
		];
		Composite.add(world, this.walls);

		if (this.mode === "play") {
			this.engine.gravity.y = 1.05;
		}

		const n = this.elements.length;
		this.bodies = this.elements.map((el, i) => {
			const w = Math.max(20, el.offsetWidth);
			const h = Math.max(16, el.offsetHeight);
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;

			const col = n <= 1 ? 0.55 : 0.18 + (i / Math.max(1, n - 1)) * 0.64;
			const startX = width * col + (Math.random() - 0.5) * 18;
			// Spawn inside the arena — above the top wall traps bodies forever
			const startY =
				this.mode === "tip" || this.mode === "nudge"
					? height * 0.42
					: h / 2 + 14 + (i % 3) * (h + 10) + Math.random() * 8;

			const body = Bodies.rectangle(startX, startY, w, h, {
				chamfer: { radius: Math.min(6, h / 2.5) },
				restitution: 0.12,
				friction: 0.65,
				frictionStatic: 0.85,
				frictionAir: 0.016,
				density: 0.002,
				sleepThreshold: 45,
				label: el.dataset.accentBody || `accent-${i}`,
			}) as BodyEl;
			Body.setMass(body, 0.5 + i * 0.08);
			Body.setAngle(body, ((i % 3) - 1) * 0.1);
			if (this.mode === "drop" || this.mode === "play") {
				Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.2, y: 0.8 + Math.random() * 0.6 });
			}
			body.__el = el;
			return body;
		});
		Composite.add(world, this.bodies);

		// Touch devices keep native page scroll over the arena; drag is mouse-only.
		const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
		const interactive = finePointer && (this.mode === "nudge" || this.mode === "tip" || this.mode === "play");
		if (interactive) {
			this.options.root.dataset.interactive = "true";
			const mouse = Mouse.create(this.options.root);
			mouse.pixelRatio = 1;
			const handlers = mouse as unknown as Record<string, (e: Event) => void>;
			// Don't trap page scroll inside accent arenas
			this.options.root.removeEventListener("wheel", handlers.mousewheel);
			this.options.root.removeEventListener("touchstart", handlers.mousedown);
			this.options.root.removeEventListener("touchmove", handlers.mousemove);
			this.options.root.removeEventListener("touchend", handlers.mouseup);

			const mc = MouseConstraint.create(this.engine, {
				mouse,
				constraint: { stiffness: 0.14, damping: 0.12, render: { visible: false } },
			});
			Composite.add(world, mc);
			this.mouse = mouse;
			this.mouseConstraint = mc;

			this.cleanups.push(() => {
				this.options.root.removeEventListener("mousemove", handlers.mousemove);
				this.options.root.removeEventListener("mousedown", handlers.mousedown);
				this.options.root.removeEventListener("mouseup", handlers.mouseup);
			});
		}

		if (this.mode === "tip") {
			const onEnter = () => {
				if (this.tipped || !this.bodies[0]) return;
				this.tipped = true;
				Body.setAngularVelocity(this.bodies[0], -0.04);
				Body.applyForce(this.bodies[0], this.bodies[0].position, { x: -0.0008, y: 0 });
			};
			const ticket = this.options.root.closest(".archive__main")?.querySelector(".ticket-hero");
			ticket?.addEventListener("pointerenter", onEnter, { once: true });
			this.cleanups.push(() => ticket?.removeEventListener("pointerenter", onEnter));
		}

		this.render();
	}

	/** Contact signal desk — coin lands, then channel seals settle. No mouse. */
	private buildSignal(width: number, height: number): void {
		const world = this.engine.world;
		this.engine.gravity.y = 1.08;
		this.engine.enableSleeping = true;

		// Raised dock — pieces rest in the visual middle, not crushed to the footer
		const floorInset = Math.round(height * 0.38);
		const wallOpts: Matter.IChamferableBodyDefinition = {
			isStatic: true,
			restitution: 0.2,
			friction: 0.8,
		};
		this.walls = [
			Bodies.rectangle(width / 2, height - floorInset + WALL / 2, width + WALL * 2, WALL, wallOpts),
			Bodies.rectangle(width / 2, -WALL / 2, width + WALL * 2, WALL, wallOpts),
			Bodies.rectangle(-WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
			Bodies.rectangle(width + WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
		];
		Composite.add(world, this.walls);

		const seals = this.elements.filter((el) => !el.classList.contains("signal-coin"));
		const coinEl = this.elements.find((el) => el.classList.contains("signal-coin"));
		const dockY = height - floorInset;

		this.bodies = [];

		if (coinEl) {
			const size = Math.max(56, coinEl.offsetWidth || 72);
			coinEl.style.width = `${size}px`;
			coinEl.style.height = `${size}px`;
			const coin = Bodies.circle(width * 0.5, size / 2 + 36, size / 2, {
				restitution: 0.38,
				friction: 0.4,
				frictionAir: 0.018,
				density: 0.0026,
				sleepThreshold: 50,
				label: "signal-coin",
			}) as BodyEl;
			Body.setVelocity(coin, { x: 0.25, y: 0.95 });
			Body.setAngularVelocity(coin, 0.035);
			coin.__el = coinEl;
			this.bodies.push(coin);
			Composite.add(world, coin);
		}

		const sealCount = seals.length;
		seals.forEach((el, i) => {
			el.style.opacity = "0";
			const id = window.setTimeout(() => {
				if (this.destroyed) return;
				const w = Math.max(36, el.offsetWidth);
				const h = Math.max(24, el.offsetHeight);
				el.style.width = `${w}px`;
				el.style.height = `${h}px`;
				el.style.opacity = "1";

				const col = sealCount <= 1 ? 0.5 : 0.16 + (i / Math.max(1, sealCount - 1)) * 0.68;
				const body = Bodies.rectangle(width * col, 40 + h / 2 + i * 10, w, h, {
					chamfer: { radius: Math.min(6, h / 2.5) },
					restitution: 0.2,
					friction: 0.55,
					frictionAir: 0.016,
					density: 0.0016,
					sleepThreshold: 45,
					label: el.dataset.accentBody || `seal-${i}`,
				}) as BodyEl;
				Body.setVelocity(body, {
					x: (Math.random() - 0.5) * 0.7,
					y: 0.85 + Math.random() * 0.3,
				});
				Body.setAngularVelocity(body, ((i % 2) - 0.5) * 0.05);
				body.__el = el;
				this.bodies.push(body);
				Composite.add(world, body);
			}, 420 + i * 150);
			this.cascadeTimers.push(id);
		});

		this.cascadeTimers.push(
			window.setTimeout(() => {
				if (this.destroyed) return;
				const coin = this.bodies.find((b) => b.label === "signal-coin");
				if (!coin) return;
				Body.applyForce(coin, coin.position, { x: 0.0009, y: -0.0014 });
				Body.setAngularVelocity(coin, 0.04);
			}, 1400),
		);

		// Keep dock marker aligned with physics floor
		const dock = this.options.root.querySelector<HTMLElement>(".signal-dock");
		if (dock) dock.style.top = `${dockY}px`;
	}

	/** Chain-of-action dominos — tip in sequence, no mouse. */
	private buildCascade(width: number, height: number): void {
		const world = this.engine.world;
		this.engine.gravity.y = 1.2;
		this.engine.enableSleeping = false;

		const floorInset = 38;
		const wallOpts: Matter.IChamferableBodyDefinition = {
			isStatic: true,
			restitution: 0.04,
			friction: 0.9,
		};
		this.walls = [
			Bodies.rectangle(width / 2, height - floorInset + WALL / 2, width + WALL * 2, WALL, wallOpts),
			Bodies.rectangle(width / 2, -WALL / 2, width + WALL * 2, WALL, wallOpts),
			Bodies.rectangle(-WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
			Bodies.rectangle(width + WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
		];
		Composite.add(world, this.walls);

		const n = this.elements.length;
		const floorY = height - floorInset;
		const span = Math.min(width * 0.78, n * 62);
		const start = (width - span) / 2;
		const pins: Matter.Constraint[] = [];

		this.bodies = this.elements.map((el, i) => {
			const w = Math.max(28, el.offsetWidth);
			const h = Math.max(90, el.offsetHeight);
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;

			const x = start + (span / Math.max(1, n - 1 || 1)) * i;
			const y = floorY - h / 2 - 0.5;

			const body = Bodies.rectangle(x, y, w, h, {
				chamfer: { radius: 3 },
				restitution: 0.06,
				friction: 0.4,
				frictionStatic: 0.6,
				frictionAir: 0.02,
				density: 0.0018,
				label: el.dataset.accentBody || `cascade-${i}`,
			}) as BodyEl;
			Body.setAngle(body, 0);
			body.__el = el;

			// Pin upright until the cascade releases each slab
			const pin = Constraint.create({
				pointA: { x, y: floorY - 1 },
				bodyB: body,
				pointB: { x: 0, y: h / 2 - 1 },
				stiffness: 1,
				length: 0,
				render: { visible: false },
			});
			pins.push(pin);
			Composite.add(world, [body, pin]);
			return body;
		});

		for (const id of this.cascadeTimers) window.clearTimeout(id);
		this.cascadeTimers = [];

		this.cascadeTimers.push(
			window.setTimeout(() => {
				if (this.destroyed || !this.bodies[0]) return;
				this.options.root.classList.add("is-cascading");
				this.bodies.forEach((body, i) => {
					const id = window.setTimeout(() => {
						if (this.destroyed) return;
						const pin = pins[i];
						if (pin) Composite.remove(world, pin);
						Body.setAngularVelocity(body, 0.18 + i * 0.012);
						Body.setVelocity(body, { x: 1.4 + i * 0.08, y: -0.15 });
						Body.applyForce(body, { x: body.position.x, y: body.bounds.min.y + 6 }, {
							x: 0.004,
							y: 0,
						});
						body.__el.classList.add("is-tipped");
					}, i * 260);
					this.cascadeTimers.push(id);
				});
			}, 520),
		);
	}

	/** Hanging press credentials — soft wind, no mouse. */
	private buildHang(width: number, height: number): void {
		const world = this.engine.world;
		this.engine.gravity.y = 0.68;
		this.engine.enableSleeping = false;

		const wallOpts: Matter.IChamferableBodyDefinition = {
			isStatic: true,
			restitution: 0.02,
			friction: 0.5,
		};
		this.walls = [
			Bodies.rectangle(-WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
			Bodies.rectangle(width + WALL / 2, height / 2, WALL, height + WALL * 2, wallOpts),
			Bodies.rectangle(width / 2, height + WALL / 2, width + WALL * 2, WALL, wallOpts),
		];
		Composite.add(world, this.walls);

		const n = this.elements.length;
		const single = n === 1;
		const railY = single ? 36 : 32;

		this.bodies = this.elements.map((el, i) => {
			const w = Math.max(24, el.offsetWidth);
			const h = Math.max(28, el.offsetHeight);
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;

			const col = single ? 0.5 : 0.18 + (i / Math.max(1, n - 1)) * 0.64;
			const ax = width * col;
			const rope = single ? Math.min(height * 0.28, 78) : 56 + (i % 3) * 18;
			const startX = ax + (single ? 22 : ((i % 2) - 0.5) * 14);
			const startY = railY + rope + h / 2;
			const hitch = single ? 10 : 2;

			const body = Bodies.rectangle(startX, startY, w, h, {
				chamfer: { radius: Math.min(4, h / 4) },
				restitution: 0.12,
				friction: 0.25,
				frictionAir: single ? 0.045 : 0.035,
				density: 0.0016,
				label: el.dataset.accentBody || `hang-${i}`,
			}) as BodyEl;
			Body.setMass(body, single ? 0.55 : 0.35 + i * 0.05);
			Body.setAngle(body, single ? 0.18 : ((i % 3) - 1) * 0.1);
			Body.setAngularVelocity(body, single ? -0.012 : ((i % 2) - 0.5) * 0.015);
			body.__el = el;
			body.__anchor = { x: ax, y: railY };
			body.__cord = this.options.root.querySelector<HTMLElement>(
				`[data-cord="${el.dataset.accentBody}"]`,
			);

			const constraint = Constraint.create({
				pointA: { x: ax, y: railY },
				bodyB: body,
				pointB: { x: 0, y: -h / 2 + hitch },
				stiffness: single ? 0.98 : 0.92,
				damping: single ? 0.14 : 0.08,
				length: rope,
				render: { visible: false },
			});
			Composite.add(world, [body, constraint]);
			return body;
		});

		this.bodies.forEach((body, i) => {
			Body.applyForce(body, body.position, {
				x: (i % 2 === 0 ? 1 : -1) * (single ? 0.0007 : 0.001),
				y: 0,
			});
		});
	}

	private gust(): void {
		if (this.mode !== "hang" || !this.bodies.length) return;
		const single = this.bodies.length === 1;
		const dir = Math.random() > 0.5 ? 1 : -1;
		this.bodies.forEach((body, i) => {
			const amp = single ? 0.00022 : 0.0004;
			Body.applyForce(body, body.position, {
				x: dir * (amp + Math.random() * amp) * (1 + (i % 3) * 0.1),
				y: 0,
			});
			if (!single) {
				Body.setAngularVelocity(body, body.angularVelocity + dir * 0.006 * (Math.random() - 0.3));
			}
		});
	}

	private bindLifecycle(): void {
		const io = new IntersectionObserver(
			([entry]) => {
				this.visible = entry?.isIntersecting ?? true;
				this.visible && !document.hidden ? this.start() : this.stop();
			},
			{ threshold: 0.05 },
		);
		io.observe(this.options.root);
		this.cleanups.push(() => io.disconnect());

		const onVis = () => {
			document.hidden || !this.visible ? this.stop() : this.start();
		};
		document.addEventListener("visibilitychange", onVis);
		this.cleanups.push(() => document.removeEventListener("visibilitychange", onVis));

		let pending = 0;
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(pending);
			pending = requestAnimationFrame(() => this.handleResize());
		});
		ro.observe(this.options.root);
		this.cleanups.push(() => {
			cancelAnimationFrame(pending);
			ro.disconnect();
		});
	}

	private handleResize(): void {
		if (this.destroyed || !this.bodies.length) return;
		this.stop();
		for (const id of this.cascadeTimers) window.clearTimeout(id);
		this.cascadeTimers = [];
		Composite.clear(this.engine.world, false, true);
		this.walls = [];
		this.bodies = [];
		this.mouse = null;
		this.mouseConstraint = null;
		this.windTimer = 0;
		this.tipped = false;
		this.options.root.classList.remove("is-cascading");
		this.build();
		this.start();
	}

	private start(): void {
		if (this.rafId || this.destroyed || this.reduced) return;
		this.last = performance.now();
		this.accumulator = 0;
		this.rafId = requestAnimationFrame(this.loop);
	}

	private stop(): void {
		cancelAnimationFrame(this.rafId);
		this.rafId = 0;
	}

	private loop = (now: number): void => {
		this.rafId = requestAnimationFrame(this.loop);
		const dt = Math.min(now - this.last, 64);
		this.accumulator += dt;
		this.last = now;

		if (this.mode === "hang") {
			this.windTimer += dt;
			if (this.windTimer > (this.bodies.length === 1 ? 3200 : 2200) + Math.random() * 1100) {
				this.windTimer = 0;
				this.gust();
			}
		}

		let steps = 0;
		while (this.accumulator >= STEP_MS && steps < 3) {
			Engine.update(this.engine, STEP_MS);
			this.accumulator -= STEP_MS;
			steps += 1;
		}
		this.render();
	};

	private render(): void {
		for (const body of this.bodies) {
			const el = body.__el;
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			el.style.transform = `translate3d(${(body.position.x - w / 2).toFixed(2)}px, ${(body.position.y - h / 2).toFixed(2)}px, 0) rotate(${body.angle.toFixed(4)}rad)`;

			if (body.__anchor && body.__cord) {
				const ax = body.__anchor.x;
				const ay = body.__anchor.y;
				const hitch = this.bodies.length === 1 ? 10 : 2;
				const bx = body.position.x;
				const by = body.position.y - h / 2 + hitch;
				const dx = bx - ax;
				const dy = by - ay;
				const len = Math.max(4, Math.hypot(dx, dy));
				const angle = Math.atan2(dx, dy);
				body.__cord.style.height = `${len.toFixed(1)}px`;
				body.__cord.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) rotate(${angle.toFixed(4)}rad)`;
				body.__cord.style.opacity = "0.75";
			}
		}
	}
}

export function mountAccent(options: AccentOptions): PhysicsAccent {
	const accent = new PhysicsAccent(options);
	accent.init();
	return accent;
}
