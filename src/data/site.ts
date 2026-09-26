/** Shared verified positioning for client-facing pages. No invented metrics. */

export const brand = {
	name: "Drew Roberts",
	studio: "Drew Roberts Digital",
	tagline: "Digital Craftsman",
	base: "Orlando, FL",
	ens: "drewroberts.eth",
	email: "drew@drewroberts.com",
	availability: "Available for projects",
	siteUrl: "https://drewroberts.com",
	locale: "en_US",
};

export const seo = {
	titleDefault: "Drew Roberts — Digital Craftsman",
	descriptionDefault:
		"Drew Roberts — Digital Craftsman in Orlando, FL. Strategy, design, and code for products that need to ship. Available for projects.",
	keywords: [
		"Drew Roberts",
		"Drew Roberts Digital",
		"Digital Craftsman",
		"Orlando web developer",
		"Laravel developer",
		"Solidity",
		"Web3 Laravel",
		"growth marketing",
		"product builder",
	],
	ogImage: "/seo/og.jpg",
	profileImage: "/seo/profile.jpg",
	twitter: "@dr3wroberts",
};

/** Hero left panel — engagement lanes, not object inventory */
export const engagement = [
	{ n: "01", name: "Product", note: "Strategy through build" },
	{ n: "02", name: "Laravel", note: "Apps & packages that ship" },
	{ n: "03", name: "Growth", note: "Leads, SEO, paid channels" },
	{ n: "04", name: "Web3", note: "Solidity / EVM when it fits" },
	{ n: "05", name: "Audience", note: "Media instinct from SDS" },
];

export const voice = {
	/** Hero description — strategy + design + code */
	bio: "Strategy, design, and code for products that need to ship — Laravel apps, growth systems, and on-chain experiments from Orlando.",
	/** Shorter line for tight layouts */
	bioShort: "Strategy, design, and code for products that need to ship.",
	archive:
		"A builder's personal archive of software, media, experiments, and ideas — open for serious collaborations.",
};

export const cta = {
	bookLabel: "Book a Call",
	bookHref: `mailto:${brand.email}?subject=${encodeURIComponent("Project inquiry — Drew Roberts")}`,
	workLabel: "View work",
	workHref: "/work",
	contactLabel: "Contact",
	contactHref: "/contact",
};

export const stack = ["Laravel", "PHP", "Vue", "React", "Solidity", "EVM", "Tailwind", "Growth"];

/** Soft proof points — verified activity, not vanity counts */
export const proof = [
	{ label: "Studio", value: "Drew Roberts Digital" },
	{ label: "Stack", value: "Laravel · Solidity · Growth" },
	{ label: "Open source", value: "web3-laravel · standard · media" },
	{ label: "Identity", value: "drewroberts.eth" },
];

export const guides = [
	{
		for: "Clients",
		title: "For Clients",
		blurb:
			"Engagements scoped to ship — strategy through build, without the agency fog.",
		points: [
			"Clear scope, timeline, and decision owners up front",
			"Direct communication — you work with the builder, not a relay",
			"Milestones that leave the lab: demos, deploys, and next steps",
		],
	},
	{
		for: "Collaborators",
		title: "For Collaborators",
		blurb:
			"A working style for builders and designers who want room to move.",
		points: [
			"Async-friendly by default; sync when a decision needs heat",
			"Opinionated on stack and craft where it protects quality",
			"Flexible on process when the product needs air",
		],
	},
];

export const channels = [
	{
		label: "Book a Call",
		value: brand.email,
		href: cta.bookHref,
		primary: true,
	},
	{
		label: "GitHub",
		value: "drewroberts",
		href: "https://github.com/drewroberts",
	},
	{
		label: "X",
		value: "@dr3wroberts",
		href: "https://x.com/dr3wroberts",
	},
	{
		label: "LinkedIn",
		value: "drewroberts",
		href: "https://www.linkedin.com/in/drewroberts",
	},
	{
		label: "ENS",
		value: brand.ens,
		href: null as string | null,
	},
];
