export interface Specimen {
	index: string;
	title: string;
	blurb: string;
	tags: string[];
	href: string;
	quiet?: boolean;
}

/** Verified public repositories only — no invented clients or metrics. */
export const specimens: Specimen[] = [
	{
		index: "01",
		title: "web3-laravel",
		blurb:
			"Protocol-first Laravel toolkit for wallets, EVM JSON-RPC, and transaction signing — PHP apps that talk to the chain.",
		tags: ["Laravel", "Web3", "EVM", "PHP"],
		href: "https://github.com/roberts/web3-laravel",
	},
	{
		index: "02",
		title: "standard",
		blurb:
			"Drew Roberts Contract Standard for ERC-20 tokens. Transparency first. Don't trust, verify.",
		tags: ["Solidity", "ERC-20", "Ethereum"],
		href: "https://github.com/roberts/standard",
	},
	{
		index: "03",
		title: "leads",
		blurb:
			"Laravel package for multi-step lead generation — capture, qualify, and route inquiries without bolting on a bloated CRM.",
		tags: ["Laravel", "Growth", "PHP"],
		href: "https://github.com/roberts/leads",
	},
	{
		index: "04",
		title: "media",
		blurb: "Laravel package for opinionated usage of images and video in real projects.",
		tags: ["Laravel", "Media", "PHP"],
		href: "https://github.com/drewroberts/media",
	},
	{
		index: "05",
		title: "blog",
		blurb: "Laravel package for an opinionated blogging layer — ship posts, not scaffolding.",
		tags: ["Laravel", "Content", "PHP"],
		href: "https://github.com/drewroberts/blog",
	},
	{
		index: "06",
		title: "agent-skills",
		blurb: "Public experiments in agent skills and tooling — how builders extend the bench.",
		tags: ["Experiments", "AI"],
		href: "https://github.com/drewroberts/agent-skills",
		quiet: true,
	},
];
