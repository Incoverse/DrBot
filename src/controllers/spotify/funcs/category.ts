import type SpotifyClient from "../client";
import type { CategoriesResponse, CategoryObject } from "../types";

/** @deprecated Get a list of categories used to tag items in Spotify. */
export async function getSeveral(this: SpotifyClient, options: {
	locale?: string;
	limit?: number;
	offset?: number;
} = {}): Promise<CategoriesResponse["categories"] | null> {
	return this.api.get("/browse/categories", {
		params: options
	}).then((res) => {
		return (res.data as CategoriesResponse).categories;
	}).catch((e) => {
		this.logger.warn("Error fetching browse categories:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get a single category used to tag items in Spotify. */
export async function get(this: SpotifyClient, categoryId: string, options: {
	locale?: string;
} = {}): Promise<CategoryObject | null> {
	return this.api.get(`/browse/categories/${categoryId}`, {
		params: options
	}).then((res) => {
		return res.data as CategoryObject;
	}).catch((e) => {
		this.logger.warn("Error fetching browse category:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}
