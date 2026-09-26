import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ChapterId } from "../../data/chapters";

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const REVEAL_ITEMS = [
	".specimen",
	".chain__item",
	".about-fact",
	".media-fact",
	".contact-list li",
	".guide",
	".story-copy > *",
	".story-quote",
	".contact-hero__email",
	".contact-note",
	".about-facts__cta",
].join(",");

export function setupTransitions(root: HTMLElement, onChapter: (id: ChapterId) => void): () => void {
	const chapterEls = [...root.querySelectorAll<HTMLElement>("[data-chapter]")];
	const ctx = gsap.context(() => {
		if (!reduceMotion()) {
			setupHeroExit(root);
			root.querySelectorAll<HTMLElement>("[data-gate]").forEach(setupGate);
			chapterEls.filter((el) => el.dataset.chapter !== "home").forEach(setupChapterReveal);
			setupItemReveals(root);
		}

		// Created after the pinned gates so their positions include pin spacing.
		const markers = [...root.querySelectorAll<HTMLElement>("[data-chapter], [data-gate]")];
		markers.forEach((el) => {
			const id = (el.dataset.chapter ?? el.dataset.gate) as ChapterId;
			ScrollTrigger.create({
				trigger: el,
				start: "top 55%",
				end: "bottom 45%",
				onEnter: () => onChapter(id),
				onEnterBack: () => onChapter(id),
			});
		});
	}, root);

	const refresh = () => ScrollTrigger.refresh();
	void document.fonts?.ready.then(refresh);
	window.addEventListener("load", refresh, { once: true });

	return () => {
		window.removeEventListener("load", refresh);
		ctx.revert();
	};
}

/** The bench sinks back and dims as the page pulls away from it. */
function setupHeroExit(root: HTMLElement): void {
	const home = root.querySelector<HTMLElement>('[data-chapter="home"]');
	const panel = home?.querySelector<HTMLElement>("[data-chapter-panel]");
	if (!home || !panel) return;

	gsap.fromTo(
		panel,
		{ yPercent: 0, scale: 1, opacity: 1, filter: "brightness(1)" },
		{
			yPercent: 22,
			scale: 0.9,
			opacity: 0.35,
			filter: "brightness(0.55)",
			ease: "none",
			scrollTrigger: {
				trigger: home,
				start: "top top",
				end: "bottom top",
				scrub: true,
			},
		},
	);
}

/**
 * Chapter card: wipes in from the right as it rises, then pins without spacing
 * so the next chapter slides up underneath it. The card tears out to the left
 * and uncovers that chapter already in place, so no screen is left empty.
 */
function setupGate(gate: HTMLElement): void {
	const panel = gate.querySelector<HTMLElement>("[data-gate-panel]");
	const title = gate.querySelector<HTMLElement>("[data-gate-title]");
	const index = gate.querySelector<HTMLElement>("[data-gate-index]");
	const band = gate.querySelector<HTMLElement>("[data-gate-band]");
	const mark = gate.querySelector<HTMLElement>("[data-gate-mark]");
	if (!panel || !title) return;

	gsap
		.timeline({
			defaults: { ease: "none" },
			scrollTrigger: { trigger: gate, start: "top bottom", end: "top top", scrub: 0.6 },
		})
		.fromTo(panel, { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "power2.out" }, 0)
		.fromTo(title, { xPercent: 60, skewX: -8 }, { xPercent: 0, skewX: 0, duration: 1, ease: "power3.out" }, 0)
		.fromTo(mark ?? [], { xPercent: 45, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 1 }, 0)
		.fromTo(index ?? [], { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, 0.4)
		.fromTo(band ?? [], { yPercent: 100 }, { yPercent: 0, duration: 0.5, ease: "power2.out" }, 0.5);

	gsap
		.timeline({
			defaults: { ease: "none" },
			scrollTrigger: {
				trigger: gate,
				start: "top top",
				end: "+=100%",
				pin: true,
				pinSpacing: false,
				scrub: 0.6,
			},
		})
		.to({}, { duration: 0.3 })
		.to(panel, { clipPath: "inset(0% 100% 0% 0%)", duration: 0.7, ease: "power2.inOut" })
		.to(title, { xPercent: -45, skewX: 8, duration: 0.7, ease: "power2.in" }, "<")
		.to(mark ?? [], { xPercent: -30, duration: 0.7 }, "<");
}

/** Chapter header: eyebrow slides, title unmasks upward, stage wipes in. */
function setupChapterReveal(chapter: HTMLElement): void {
	const q = gsap.utils.selector(chapter);
	const eyebrow = q(".archive__eyebrow")[0];
	const heading = q(".archive__title")[0];
	const lede = q(".archive__lede")[0];
	const hint = q("[class$='-hero__hint']")[0];
	const stage = q(".chain-bench, .press-stage, .action-stage, .signal-stage")[0];
	const rule = q(".archive__rule")[0];

	const tl = gsap.timeline({
		defaults: { ease: "power3.out" },
		scrollTrigger: {
			trigger: chapter,
			start: "top 78%",
			toggleActions: "play none none reverse",
		},
	});

	if (eyebrow) tl.from(eyebrow, { x: -48, opacity: 0, duration: 0.6 }, 0);
	if (heading)
		tl.fromTo(
			heading,
			{ yPercent: 60, opacity: 0, clipPath: "inset(0% 0% 100% 0%)" },
			{ yPercent: 0, opacity: 1, clipPath: "inset(0% 0% 0% 0%)", duration: 0.9 },
			0.08,
		);
	if (lede) tl.from(lede, { y: 32, opacity: 0, duration: 0.7 }, 0.3);
	if (hint) tl.from(hint, { y: 16, opacity: 0, duration: 0.5 }, 0.45);
	if (stage)
		tl.fromTo(
			stage,
			{ clipPath: "inset(0% 0% 0% 100%)", opacity: 0.4 },
			{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1, duration: 1, ease: "power4.inOut" },
			0.15,
		);
	if (rule) tl.from(rule, { scaleX: 0, transformOrigin: "left center", duration: 0.9, ease: "power2.inOut" }, 0.5);
}

/** Cards and list rows rise in small staggered batches as they arrive. */
function setupItemReveals(root: HTMLElement): void {
	const items = gsap.utils.toArray<HTMLElement>(root.querySelectorAll(REVEAL_ITEMS));
	if (!items.length) return;

	gsap.set(items, { opacity: 0, y: 56 });
	ScrollTrigger.batch(items, {
		start: "top 88%",
		onEnter: (batch) => {
			batch.forEach((el) => el.classList.add("is-revealing"));
			gsap.to(batch, {
				opacity: 1,
				y: 0,
				duration: 0.85,
				ease: "power3.out",
				stagger: 0.09,
				overwrite: true,
				clearProps: "transform",
				onComplete: () => batch.forEach((el) => el.classList.remove("is-revealing")),
			});
		},
		onLeaveBack: (batch) => {
			gsap.to(batch, { opacity: 0, y: 56, duration: 0.4, ease: "power2.in", overwrite: true });
		},
	});
}
