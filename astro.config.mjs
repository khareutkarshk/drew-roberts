// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
	site: "https://drewroberts.com",
	trailingSlash: "never",
	integrations: [
		sitemap({
			filter: (page) => !page.includes("/404"),
			serialize(item) {
				const path = new URL(item.url).pathname.replace(/\/$/, "") || "/";
				if (path === "/") {
					item.priority = 1.0;
				} else if (path === "/work" || path === "/contact") {
					item.priority = 0.9;
				} else {
					item.priority = 0.7;
				}
				item.lastmod = new Date().toISOString();
				return item;
			},
		}),
	],
});
