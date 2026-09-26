type Phase = "idle" | "build" | "settled" | "broke";

const COPY: Record<Phase, [string, string]> = {
	idle: ["", ""],
	build: ["", ""],
	settled: ["", ""],
	broke: ["You broke it.", "That's step three."],
};

/** Session-only interaction copy. Deliberately not persisted. */
export class Instructions {
	private phase: Phase = "idle";
	private timer = 0;
	private cycled = false;

	constructor(
		private root: HTMLElement,
		private primary: HTMLElement,
		private secondary: HTMLElement,
		private cycle: HTMLElement,
	) {
		this.render();
	}

	grabbed(): void {
		/* no onboarding copy */
	}

	thrown(): void {
		if (this.phase === "broke") return;
		this.set("build");
		this.settleAfter(2400);
	}

	broke(): void {
		this.set("broke");
		this.showCycle(true);
		this.settleAfter(4200);
	}

	disturbed(): void {
		this.showCycle(true);
	}

	repeated(): void {
		this.cycled = true;
		this.showCycle(false);
		this.primary.textContent = "Build. Ship. Break. Repeat.";
		this.secondary.textContent = "";
		this.root.dataset.phase = "build";
		this.phase = "build";
		this.root.classList.toggle("has-copy", true);
		this.settleAfter(2600);
	}

	destroy(): void {
		window.clearTimeout(this.timer);
	}

	private settleAfter(ms: number): void {
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.set("settled"), ms);
	}

	private showCycle(visible: boolean): void {
		this.cycle.hidden = !visible;
	}

	private set(phase: Phase): void {
		this.phase = phase;
		this.render();
	}

	private render(): void {
		const [primary, secondary] =
			this.phase === "settled" && this.cycled ? ["Build. Ship. Break. Repeat.", ""] : COPY[this.phase];
		this.root.dataset.phase = this.phase;
		this.primary.textContent = primary;
		this.secondary.textContent = secondary;
		this.root.classList.toggle("has-copy", Boolean(primary || secondary));
	}
}
