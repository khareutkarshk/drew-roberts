import Matter from "matter-js";
import { CATEGORY, placeElement, type StageMetrics } from "./shared";

const { Bodies, Body, Composite, Constraint, Sleeping } = Matter;

/** Distance from the tag's top edge to the eyelet the cord is tied through. */
const EYELET_INSET = 10;

export class Hanger {
	body: Matter.Body | null = null;
	private cord: Matter.Constraint | null = null;
	private w = 0;
	private h = 0;
	private anchor = { x: 0, y: 0 };
	private length = 0;

	constructor(
		private el: HTMLElement,
		private rope: SVGLineElement,
	) {}

	create(world: Matter.World, m: StageMetrics): void {
		this.el.style.width = "";
		this.el.style.height = "";
		if (getComputedStyle(this.el).display === "none") {
			this.w = this.h = 0;
			this.rope.setAttribute("x1", "0");
			this.rope.setAttribute("y1", "0");
			this.rope.setAttribute("x2", "0");
			this.rope.setAttribute("y2", "0");
			return;
		}
		this.w = this.el.offsetWidth;
		this.h = this.el.offsetHeight;
		this.el.style.width = `${this.w}px`;
		this.el.style.height = `${this.h}px`;

		this.anchor = { x: m.width * (m.compact ? 0.58 : 0.61), y: -4 };
		this.length = m.benchY * (m.compact ? 0.14 : 0.17);

		const body = Bodies.rectangle(
			this.anchor.x,
			this.anchor.y + this.length + this.h / 2 - EYELET_INSET,
			this.w,
			this.h,
			{
				label: "hanger",
				chamfer: { radius: 6 },
				friction: 0.4,
				restitution: 0.3,
				frictionAir: 0.022,
				sleepThreshold: 80,
				collisionFilter: {
					category: CATEGORY.artifact,
					mask: CATEGORY.wall | CATEGORY.coin | CATEGORY.artifact | CATEGORY.mouse,
				},
			},
		);
		Body.setMass(body, 0.9);

		const cord = Constraint.create({
			pointA: { ...this.anchor },
			bodyB: body,
			pointB: { x: 0, y: -this.h / 2 + EYELET_INSET },
			length: this.length,
			stiffness: 0.9,
			damping: 0.04,
		});

		this.body = body;
		this.cord = cord;
		Composite.add(world, [body, cord]);
		// A tag on a cord is never perfectly still when you walk in
		Body.setVelocity(body, { x: 0.9, y: 0 });
	}

	relayout(world: Matter.World, m: StageMetrics): void {
		this.clear(world);
		this.create(world, m);
	}

	reset(): void {
		if (!this.body || !this.cord) return;
		Body.setPosition(this.body, {
			x: this.anchor.x,
			y: this.anchor.y + this.length + this.h / 2 - EYELET_INSET,
		});
		Body.setAngle(this.body, 0);
		Body.setAngularVelocity(this.body, 0);
		Body.setVelocity(this.body, { x: 0.9, y: 0 });
		this.cord.pointB = { x: 0, y: -this.h / 2 + EYELET_INSET };
		Sleeping.set(this.body, false);
	}

	render(): void {
		const body = this.body;
		const cord = this.cord;
		if (!body || !cord) return;
		placeElement(this.el, body.position.x, body.position.y, this.w, this.h, body.angle);

		// Matter keeps pointB rotated with the body, so this is the live eyelet position
		const end = { x: body.position.x + cord.pointB.x, y: body.position.y + cord.pointB.y };
		this.rope.setAttribute("x1", this.anchor.x.toFixed(2));
		this.rope.setAttribute("y1", this.anchor.y.toFixed(2));
		this.rope.setAttribute("x2", end.x.toFixed(2));
		this.rope.setAttribute("y2", end.y.toFixed(2));
	}

	private clear(world: Matter.World): void {
		if (this.body) Composite.remove(world, this.body);
		if (this.cord) Composite.remove(world, this.cord);
		this.body = null;
		this.cord = null;
	}
}
