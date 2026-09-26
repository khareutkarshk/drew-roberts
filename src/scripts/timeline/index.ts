import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { chapterById, type ChapterId } from "../../data/chapters";
import { pathForChapter } from "./chapters";
import { setupTransitions } from "./transitions";
import { mountAccent, type AccentMode } from "../physics/accent";
import type { HeroWorld } from "../hero/world";

gsap.registerPlugin(ScrollTrigger);

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

function mountSmoothScroll(): { lenis: Lenis | null; destroy: () => void } {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return { lenis: null, destroy: () => {} };
	}

	const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
	lenis.on("scroll", ScrollTrigger.update);	const tick = (time: number) => lenis.raf(time * 1000);
	gsap.ticker.add(tick);
	gsap.ticker.lagSmoothing(0);

	// The mobile menu locks the page while it is open.
	const menuLock = new MutationObserver(() => {
		if (document.body.classList.contains("nav-open")) lenis.stop();
		else lenis.start();
	});
	menuLock.observe(document.body, { attributes: true, attributeFilter: ["class"] });

	return {
		lenis,
		destroy: () => {
			menuLock.disconnect();
			gsap.ticker.remove(tick);
			lenis.destroy();
		},
	};
}

export interface TimelineHandle {
	destroy: () => void;
	scrollToChapter: (id: ChapterId, instant?: boolean) => void;
}

export function mountTimeline(root: HTMLElement): TimelineHandle {
	const initial = (root.dataset.initialChapter as ChapterId) || "home";
	const nowIndex = root.querySelector<HTMLElement>("[data-nav-now-index]");
	const nowLabel = root.querySelector<HTMLElement>("[data-nav-now-label]");
	const progressFill = root.querySelector<HTMLElement>("[data-nav-progress]");
	const cleanups: Array<() => void> = [];
	const accents: Array<{ destroy: () => void }> = [];
	let heroWorld: HeroWorld | null = null;
	let active: ChapterId = initial;
	let syncingHistory = false;
	const smooth = mountSmoothScroll();
	cleanups.push(smooth.destroy);

	const setActive = (id: ChapterId, updateUrl = true) => {
		if (active === id && updateUrl) {
			/* still refresh aria */
		}
		active = id;
		const chapter = chapterById(id);
		if (nowIndex && chapter) nowIndex.textContent = chapter.index;
		if (nowLabel && chapter) nowLabel.textContent = chapter.label;
		document.querySelectorAll<HTMLAnchorElement>(".site-nav__links a[data-chapter-link]").forEach((a) => {
			const on = a.dataset.chapterLink === id;
			if (on) a.setAttribute("aria-current", "page");
			else a.removeAttribute("aria-current");
		});

		if (heroWorld) {
			if (id === "home") heroWorld.resume();
			else heroWorld.pause();
		}

		if (updateUrl && !syncingHistory) {
			const path = pathForChapter(id);
			const current = location.pathname.replace(/\/$/, "") || "/";
			if (current !== path) {
				history.replaceState({ chapter: id }, "", path);
			}
		}
	};

	const scrollToChapter = (id: ChapterId, instant = false) => {
		const el = root.querySelector<HTMLElement>(`[data-chapter="${id}"]`);
		if (!el) return;
		const lenis = smooth.lenis;
		if (!lenis) {
			el.scrollIntoView({ behavior: "auto", block: "start" });
			setActive(id);
			return;
		}
		lenis.scrollTo(el, {
			immediate: instant,
			force: true,
			duration: 1.6,
			easing: easeOutExpo,
			onComplete: () => setActive(id),
		});
		if (instant) setActive(id);
	};

	const killTransitions = setupTransitions(root, (id) => setActive(id, true));
	cleanups.push(killTransitions);

	if (progressFill) {
		const bar = ScrollTrigger.create({
			start: 0,
			end: "max",
			onUpdate: (self) => {
				progressFill.style.transform = `scaleX(${self.progress.toFixed(4)})`;
			},
		});
		cleanups.push(() => bar.kill());
	}

	document.querySelectorAll<HTMLAnchorElement>("[data-chapter-link]").forEach((a) => {
		const handler = (e: Event) => {
			const id = a.dataset.chapterLink as ChapterId;
			if (!id || !root.querySelector(`[data-chapter="${id}"]`)) return;
			e.preventDefault();
			document.body.classList.remove("nav-open");
			document.querySelector(".site-nav")?.classList.remove("is-open");
			const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
			if (toggle) {
				toggle.setAttribute("aria-expanded", "false");
				toggle.textContent = "Menu";
			}
			scrollToChapter(id);
		};
		a.addEventListener("click", handler);
		cleanups.push(() => a.removeEventListener("click", handler));
	});

	const onPop = () => {
		syncingHistory = true;
		const path = location.pathname.replace(/\/$/, "") || "/";
		const id = (["/", "/work", "/media", "/about", "/contact"].includes(path)
			? path === "/"
				? "home"
				: path.slice(1)
			: "home") as ChapterId;
		scrollToChapter(id, true);
		syncingHistory = false;
	};
	window.addEventListener("popstate", onPop);
	cleanups.push(() => window.removeEventListener("popstate", onPop));

	// Hero Matter
	const hero = root.querySelector<HTMLElement>("#hero");
	if (hero) {
		void import("../hero/world").then(({ mountHero }) => {
			heroWorld = mountHero(hero);
			if (active !== "home") heroWorld.pause();
			cleanups.push(() => heroWorld?.destroy());
		});
	}

	// Accent physics per chapter stage
	root.querySelectorAll<HTMLElement>("[data-accent]").forEach((el) => {
		const mode = (el.dataset.accentMode || "play") as AccentMode;
		const accent = mountAccent({ root: el, mode, delay: 160, trigger: el });
		accents.push(accent);
	});
	cleanups.push(() => accents.forEach((a) => a.destroy()));

	// Specimen card tilt
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (!reduce) {
		root.querySelectorAll<HTMLElement>("[data-specimen]").forEach((card) => {
			const shine = card.querySelector<HTMLElement>(".specimen__shine");
			const onMove = (e: PointerEvent) => {
				const r = card.getBoundingClientRect();
				const x = (e.clientX - r.left) / r.width - 0.5;
				const y = (e.clientY - r.top) / r.height - 0.5;
				card.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
				card.style.setProperty("--tilt-y", `${(x * 6).toFixed(2)}deg`);
				card.style.setProperty("--lift", "8px");
				if (shine) {
					shine.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`);
					shine.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
				}
			};
			const onLeave = () => {
				card.style.setProperty("--tilt-x", "0deg");
				card.style.setProperty("--tilt-y", "0deg");
				card.style.setProperty("--lift", "0px");
			};
			card.addEventListener("pointermove", onMove);
			card.addEventListener("pointerleave", onLeave);
			cleanups.push(() => {
				card.removeEventListener("pointermove", onMove);
				card.removeEventListener("pointerleave", onLeave);
			});
		});
	}

	// Initial chapter jump (after layout)
	requestAnimationFrame(() => {
		ScrollTrigger.refresh();
		if (initial !== "home") {
			scrollToChapter(initial, true);
		} else {
			setActive("home", false);
		}
	});

	const onResize = () => ScrollTrigger.refresh();
	window.addEventListener("resize", onResize);
	cleanups.push(() => window.removeEventListener("resize", onResize));

	return {
		destroy() {
			cleanups.forEach((fn) => fn());
			ScrollTrigger.getAll().forEach((t) => t.kill());
		},
		scrollToChapter,
	};
}
