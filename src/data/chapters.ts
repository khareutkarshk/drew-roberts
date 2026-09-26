export type ChapterId = "home" | "work" | "media" | "about" | "contact";

export interface ChapterMeta {
	id: ChapterId;
	path: string;
	label: string;
	index: string;
	title: string;
	description: string;
	seam: "accent" | "paper" | "metal" | "dim";
}

export const chapters: ChapterMeta[] = [
	{
		id: "home",
		path: "/",
		label: "Home",
		index: "01",
		title: "Bench",
		description: "Interactive archive hero",
		seam: "accent",
	},
	{
		id: "work",
		path: "/work",
		label: "Work",
		index: "02",
		title: "Specimens",
		description: "Selected software and open-source specimens",
		seam: "accent",
	},
	{
		id: "media",
		path: "/media",
		label: "Media",
		index: "03",
		title: "Saturday Down South",
		description: "Co-founder media chapter",
		seam: "paper",
	},
	{
		id: "about",
		path: "/about",
		label: "About",
		index: "04",
		title: "Digital Craftsman",
		description: "Builder chain and guides",
		seam: "dim",
	},
	{
		id: "contact",
		path: "/contact",
		label: "Contact",
		index: "05",
		title: "Book a call",
		description: "Available for projects",
		seam: "metal",
	},
];

export function chapterById(id: string): ChapterMeta | undefined {
	return chapters.find((c) => c.id === id);
}

export function chapterByPath(pathname: string): ChapterMeta {
	const clean = pathname.replace(/\/$/, "") || "/";
	return chapters.find((c) => c.path === clean) ?? chapters[0];
}
