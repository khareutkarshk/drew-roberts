import Matter from "matter-js";
import { Artifacts } from "./artifacts";
import { Coin, preloadCoin } from "./coin";
import { Hanger } from "./hanger";
import { Instructions } from "./instructions";
import {
	CATEGORY,
	STEP_MS,
	relativeSpeed,
	speedOf,
	type MouseHandlers,
	type StageMetrics,
} from "./shared";

const { Engine, Bodies, Body, Composite, Events, Mouse, MouseConstraint, Query } = Matter;

const WALL = 200;
const MAX_SPEED = 38;
const THROW_SPEED = 3.2;
const MAX_STEPS_PER_FRAME = 3;

type DragEvent = Matter.IEvent<Matter.MouseConstraint> & { body: Matter.Body };

interface ProximityZone {
	el: HTMLElement;
	className: string;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

function $<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
	const el = root.querySelector<T>(selector);
	if (!el) throw new Error(`Hero: missing ${selector}`);
	return el;
}

export class HeroWorld {
	private engine = Engine.create({
		gravity: { x: 0, y: 1, scale: 0.001 },
		enableSleeping: true,
		positionIterations: 8,
		velocityIterations: 6,
	});
	private walls: Matter.Body[] = [];
	private mouse: Matter.Mouse | null = null;
	private mouseConstraint: Matter.MouseConstraint | null = null;

	private stage: HTMLElement;
	private coin: Coin;
	private artifacts: Artifacts;
	private hanger: Hanger;
	private instructions: Instructions;

	private metrics: StageMetrics = { width: 1, height: 1, benchY: 1, compact: false };
	private pointer = { x: 0, y: 0, inside: false };
	private dragging: Matter.Body | null = null;
	private touchActive = false;
	private zones: ProximityZone[] = [];
	private captions = new Map<string, HTMLElement>();
	private activeGroup: string | null = null;

	private rafId = 0;
	private lastFrame = 0;
	private accumulator = 0;
	private frame = 0;
	private visible = true;
	private destroyed = false;
	private resetting = false;
	private cleanups: Array<() => void> = [];

	constructor(
		private root: HTMLElement,
		private reducedMotion: boolean,
	) {
		this.stage = $(root, "[data-stage]");
		this.coin = new Coin({
			layer: $(root, "[data-coin-layer]"),
			inner: $(root, ".hero__coin"),
			face: $<HTMLImageElement>(root, ".hero__coin-face"),
			edge: $<HTMLImageElement>(root, ".hero__coin-edge"),
			highlight: $(root, ".hero__highlight"),
			shadow: $(root, ".hero__shadow"),
			dust: $(root, ".hero__dust"),
		});
		this.artifacts = new Artifacts($(root, "[data-objects]"), $(root, ".hero__dust"));
		this.hanger = new Hanger($(root, "[data-hanger]"), $<SVGLineElement>(root, "[data-rope]"));
		this.instructions = new Instructions(
			$(root, ".hero__instruction"),
			$(root, ".hero__instruction-primary"),
			$(root, ".hero__instruction-secondary"),
			$(root, "[data-cycle]"),
		);
		root.querySelectorAll<HTMLElement>(".hero__caption li[data-for]").forEach((li) => {
			this.captions.set(li.dataset.for!, li);
		});
	}

	private groupOf(body: Matter.Body | null | undefined): string | null {
		if (!body) return null;
		const label = body.label;
		if (label.startsWith("slab-") || label.startsWith("break-")) return "slab";
		if (label.startsWith("tag-")) return "tag";
		return this.captions.has(label) ? label : null;
	}

	/** Handling an object lights up its line in the specimen caption. */
	private setActiveGroup(group: string | null): void {
		if (group === this.activeGroup) return;
		if (this.activeGroup) this.captions.get(this.activeGroup)?.classList.remove("is-active");
		if (group) this.captions.get(group)?.classList.add("is-active");
		this.activeGroup = group;
	}

	async init(): Promise<void> {
		await Promise.all([
			preloadCoin(),
			document.fonts?.load("800 72px Archivo"),
			document.fonts?.load("500 11px 'IBM Plex Mono'"),
		]);
		await document.fonts?.ready;
		if (this.destroyed) return;

		this.metrics = this.measure();
		const world = this.engine.world;
		this.buildWalls();
		this.coin.create(world, this.metrics, this.reducedMotion);
		this.artifacts.create(world, this.metrics);
		this.hanger.create(world, this.metrics);
		this.cacheZones();

		if (this.reducedMotion) {
			// Let everything come to rest off-screen, draw it once, and stop
			for (let i = 0; i < 360; i++) Engine.update(this.engine, STEP_MS);
			this.render(performance.now());
			this.root.dataset.reduced = "true";
			this.root.classList.add("is-ready");
			return;
		}

		this.setupPointer();
		this.bindLifecycle();
		this.render(performance.now());
		this.root.classList.add("is-ready");
		this.start();
	}

	destroy(): void {
		this.destroyed = true;
		this.stop();
		for (const fn of this.cleanups) fn();
		this.cleanups = [];
		this.instructions.destroy();
		Events.off(this.engine, "collisionStart");
		Composite.clear(this.engine.world, false, true);
		Engine.clear(this.engine);
		this.mouse = null;
		this.mouseConstraint = null;
	}

	private listen(
		target: EventTarget,
		type: string,
		fn: (event: never) => void,
		options?: AddEventListenerOptions,
	): void {
		const handler = fn as unknown as EventListener;
		target.addEventListener(type, handler, options);
		this.cleanups.push(() => target.removeEventListener(type, handler, options));
	}

	private measure(): StageMetrics {
		const rect = this.root.getBoundingClientRect();
		const bench = this.root.querySelector(".hero__bench");
		const benchY = bench ? bench.getBoundingClientRect().top - rect.top : rect.height * 0.8;
		return {
			width: Math.max(1, rect.width),
			height: Math.max(1, rect.height),
			benchY: Math.max(200, benchY),
			compact: rect.width < 640,
		};
	}

	/** The bench is the floor. Text below it is never under a resting object. */
	private buildWalls(): void {
		const world = this.engine.world;
		if (this.walls.length) Composite.remove(world, this.walls);
		const { width: w, benchY } = this.metrics;
		const opts: Matter.IChamferableBodyDefinition = {
			isStatic: true,
			restitution: 0.45,
			friction: 0.6,
			label: "wall",
			collisionFilter: { category: CATEGORY.wall, mask: CATEGORY.coin | CATEGORY.artifact },
		};
		this.walls = [
			Bodies.rectangle(w / 2, benchY + WALL / 2, w + WALL * 2, WALL, { ...opts, label: "bench" }),
			Bodies.rectangle(w / 2, -WALL / 2, w + WALL * 2, WALL, opts),
			Bodies.rectangle(-WALL / 2, benchY / 2, WALL, benchY + WALL * 2, opts),
			Bodies.rectangle(w + WALL / 2, benchY / 2, WALL, benchY + WALL * 2, opts),
		];
		Composite.add(world, this.walls);
	}

	private draggables(): Matter.Body[] {
		const list = this.artifacts.bodies();
		if (this.coin.body) list.push(this.coin.body);
		if (this.hanger.body) list.push(this.hanger.body);
		return list;
	}

	private localPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
		const rect = this.stage.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	private setupPointer(): void {
		const mouse = Mouse.create(this.stage);
		mouse.pixelRatio = 1;
		const handlers = mouse as unknown as MouseHandlers;

		// Matter always preventDefaults wheel and touch, which would trap page scrolling inside the hero
		this.stage.removeEventListener("wheel", handlers.mousewheel);
		this.stage.removeEventListener("touchstart", handlers.mousedown);
		this.stage.removeEventListener("touchmove", handlers.mousemove);
		this.stage.removeEventListener("touchend", handlers.mouseup);
		this.cleanups.push(() => {
			this.stage.removeEventListener("mousemove", handlers.mousemove);
			this.stage.removeEventListener("mousedown", handlers.mousedown);
			this.stage.removeEventListener("mouseup", handlers.mouseup);
		});

		const mc = MouseConstraint.create(this.engine, {
			mouse,
			constraint: { stiffness: 0.14, damping: 0.1, render: { visible: false } },
			collisionFilter: { category: CATEGORY.mouse, mask: CATEGORY.coin | CATEGORY.artifact },
		});
		Composite.add(this.engine.world, mc);
		this.mouse = mouse;
		this.mouseConstraint = mc;

		Events.on(mc, "startdrag", (event) => {
			const { body } = event as DragEvent;
			this.dragging = body;
			this.artifacts.armed = true;
			this.stage.dataset.cursor = "grabbing";
			this.setActiveGroup(this.groupOf(body));
			if (body === this.coin.body) {
				this.coin.markActive();
				this.instructions.grabbed();
			}
		});

		Events.on(mc, "enddrag", (event) => {
			const { body } = event as DragEvent;
			this.dragging = null;
			this.stage.dataset.cursor = "";
			this.setActiveGroup(null);
			if (body === this.coin.body && speedOf(body) > THROW_SPEED) {
				this.instructions.thrown();
			}
		});

		Events.on(this.engine, "collisionStart", (event: Matter.IEventCollision<Matter.Engine>) => {
			for (const pair of event.pairs) {
				const coin = this.coin.body;
				if (coin && (pair.bodyA === coin || pair.bodyB === coin)) {
					this.coin.impact(relativeSpeed(pair.bodyA, pair.bodyB));
				}
				this.artifacts.onCollision(pair);
			}
		});

		this.artifacts.onBreak = () => this.instructions.broke();

		this.listen(this.stage, "pointermove", (e: PointerEvent) => {
			const p = this.localPoint(e);
			this.pointer.x = p.x;
			this.pointer.y = p.y;
			this.pointer.inside = true;
			if (!this.dragging && e.pointerType === "mouse") {
				const hit = Query.point(this.draggables(), p)[0];
				this.stage.dataset.cursor = hit ? "grab" : "";
				this.setActiveGroup(this.groupOf(hit));
			}
		}, { passive: true });
		this.listen(this.stage, "pointerleave", () => {
			this.pointer.inside = false;
			if (!this.dragging) this.setActiveGroup(null);
		});

		// Keep a drag alive when the cursor leaves the hero mid-throw
		this.listen(window, "mousemove", (e: MouseEvent) => {
			if (mouse.button !== -1) handlers.mousemove(e);
		}, { passive: true });
		this.listen(window, "mouseup", (e: MouseEvent) => {
			if (mouse.button !== -1) handlers.mouseup(e);
		});

		// Touch only captures the gesture when it starts on an object; otherwise the page scrolls
		this.listen(this.stage, "touchstart", (e: TouchEvent) => {
			const touch = e.changedTouches[0];
			if (!touch || !Query.point(this.draggables(), this.localPoint(touch)).length) return;
			this.touchActive = true;
			handlers.mousedown(e);
		}, { passive: false });
		this.listen(this.stage, "touchmove", (e: TouchEvent) => {
			if (this.touchActive) handlers.mousemove(e);
		}, { passive: false });
		const endTouch = (e: TouchEvent) => {
			if (!this.touchActive) return;
			this.touchActive = false;
			handlers.mouseup(e);
		};
		this.listen(this.stage, "touchend", endTouch);
		this.listen(this.stage, "touchcancel", endTouch);

		this.listen($(this.root, "[data-repeat]"), "click", () => this.repeat());
	}

	private bindLifecycle(): void {
		let pending = 0;
		const resize = new ResizeObserver(() => {
			cancelAnimationFrame(pending);
			pending = requestAnimationFrame(() => this.handleResize());
		});
		resize.observe(this.root);
		// Late web fonts reflow the footer and move the bench without resizing the hero itself
		this.root.querySelectorAll(".hero__bottom, .hero__top").forEach((el) => resize.observe(el));

		const io = new IntersectionObserver(
			([entry]) => {
				this.visible = entry?.isIntersecting ?? true;
				this.visible && !document.hidden ? this.start() : this.stop();
			},
			{ threshold: 0.02 },
		);
		io.observe(this.root);

		this.listen(document, "visibilitychange", () => {
			document.hidden || !this.visible ? this.stop() : this.start();
		});

		this.cleanups.push(() => {
			cancelAnimationFrame(pending);
			resize.disconnect();
			io.disconnect();
		});
	}

	private handleResize(): void {
		if (this.destroyed) return;
		const prev = this.metrics;
		const next = this.measure();
		if (
			Math.abs(prev.width - next.width) < 1 &&
			Math.abs(prev.height - next.height) < 1 &&
			Math.abs(prev.benchY - next.benchY) < 1
		) {
			return;
		}
		this.metrics = next;
		this.buildWalls();

		// Same viewport, bench nudged (e.g. a font swap): carry the objects with it instead of re-homing
		if (Math.abs(prev.width - next.width) < 1 && Math.abs(prev.height - next.height) < 1) {
			const dy = next.benchY - prev.benchY;
			for (const body of this.draggables()) Body.translate(body, { x: 0, y: dy });
			this.cacheZones();
			this.render(performance.now());
			return;
		}

		this.releaseDrag();
		this.coin.relayout(prev, next);
		this.artifacts.relayout(this.engine.world, next);
		this.hanger.relayout(this.engine.world, next);
		this.cacheZones();
		this.render(performance.now());
	}

	private releaseDrag(): void {
		const mc = this.mouseConstraint;
		if (!mc) return;
		mc.constraint.bodyB = null;
		(mc as { body: Matter.Body | null }).body = null;
		this.dragging = null;
	}

	/** REPEAT: fade the bench out, put the objects back, let them land again. */
	private repeat(): void {
		if (this.resetting) return;
		this.resetting = true;
		this.releaseDrag();
		this.stage.classList.add("is-resetting");
		window.setTimeout(() => {
			if (this.destroyed) return;
			this.artifacts.reset(this.engine.world, this.metrics);
			this.hanger.reset();
			this.coin.reset(this.metrics);
			this.artifacts.armed = false;
			this.render(performance.now());
			this.stage.classList.remove("is-resetting");
			this.instructions.repeated();
			this.resetting = false;
		}, 280);
	}

	private start(): void {
		if (this.rafId || this.destroyed || this.reducedMotion) return;
		this.lastFrame = performance.now();
		this.accumulator = 0;
		this.rafId = requestAnimationFrame(this.loop);
	}

	private stop(): void {
		cancelAnimationFrame(this.rafId);
		this.rafId = 0;
	}

	/** Fixed timestep so a 120Hz display doesn't run the world at double speed. */
	private loop = (now: number): void => {
		this.rafId = requestAnimationFrame(this.loop);
		this.accumulator += Math.min(now - this.lastFrame, 100);
		this.lastFrame = now;

		let steps = 0;
		while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
			this.coin.beforeStep(this.pointer, this.dragging === this.coin.body);
			Engine.update(this.engine, STEP_MS);
			this.artifacts.flush(this.engine.world);
			this.accumulator -= STEP_MS;
			steps += 1;
		}
		if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

		this.capSpeeds();
		this.render(now);

		this.frame += 1;
		if (this.frame % 20 === 0 && this.artifacts.armed && this.artifacts.isDisturbed()) {
			this.instructions.disturbed();
		}
	};

	/** Thin objects thrown hard would otherwise tunnel through each other. */
	private capSpeeds(): void {
		for (const body of this.draggables()) {
			const speed = speedOf(body);
			if (speed <= MAX_SPEED) continue;
			const k = MAX_SPEED / speed;
			Body.setVelocity(body, { x: body.velocity.x * k, y: body.velocity.y * k });
		}
	}

	private render(now: number): void {
		this.coin.render(this.metrics, now, this.dragging === this.coin.body);
		this.artifacts.render();
		this.hanger.render();
		this.updateProximity();
	}

	/** Text rects are static, so they're read once per layout instead of every frame. */
	private cacheZones(): void {
		const rootRect = this.root.getBoundingClientRect();
		const pad = 36;
		this.zones = [
			[".site-nav__brand", "is-near-brand"],
			[".hero__meta", "is-near-meta"],
		].flatMap(([selector, className]) => {
			const el = this.root.querySelector<HTMLElement>(selector);
			if (!el || !el.offsetParent) return [];
			const r = el.getBoundingClientRect();
			return [{
				el,
				className,
				left: r.left - rootRect.left - pad,
				right: r.right - rootRect.left + pad,
				top: r.top - rootRect.top - pad,
				bottom: r.bottom - rootRect.top + pad,
			}];
		});
	}

	private updateProximity(): void {
		const coin = this.coin.body;
		if (!coin) return;
		const r = this.coin.size / 2;
		const { x, y } = coin.position;
		for (const z of this.zones) {
			const near = x + r > z.left && x - r < z.right && y + r > z.top && y - r < z.bottom;
			this.root.classList.toggle(z.className, near);
		}
	}
}

export function mountHero(root: HTMLElement): HeroWorld {
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const world = new HeroWorld(root, reduced);
	void world.init();
	return world;
}
