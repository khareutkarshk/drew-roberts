import type { ChapterId } from "../../data/chapters";
import { chapters } from "../../data/chapters";

export const CHAPTER_IDS: ChapterId[] = chapters.map((c) => c.id);

export function pathForChapter(id: ChapterId): string {
	return chapters.find((c) => c.id === id)?.path ?? "/";
}

export function seamForChapter(id: ChapterId): string {
	return chapters.find((c) => c.id === id)?.seam ?? "accent";
}
