/*
  * Copyright (c) 2024 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import axios from "axios";

export default class ImgurClient {
    private clientId: string;
    private clientSecret: string;
    private refreshToken: string;

    constructor(config: {clientId: string, clientSecret: string, refreshToken: string}) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.refreshToken = config.refreshToken;
    }

    public async uploadImage(image: string): Promise<string> {
        const imageType: "base64" | "url" = image.startsWith("http") ? "url" : image.startsWith("data:image") ? "base64" : null;

        if (!imageType) throw new Error("Invalid image type");

        var data = new FormData();
        data.append('image', image);
        data.append('type', imageType);

        return await this.request("/image", "POST", undefined, data);        
    }


    public async deleteImage(imageId: string): Promise<{}> {
        // is a url, extract the image id
        if (imageId.includes("imgur.com")) {
            imageId = imageId.split("/").pop().replace(/\.[^/.]+$/, "");
        }

        return await this.request(`/image/${imageId}`, "DELETE");
    }

    private async request(endpoint: string, method: "GET" | "POST" | "DELETE" | "PUT" = "GET", headers: any = {}, body?: any): Promise<any> {
        return await axios({
            url: `https://api.imgur.com/3${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`,
            method,
            headers: {
                "Authorization": `Client-ID ${this.clientId}`,
                ...(body?.getHeaders?.() ?? {}),
                ...headers
            },
            data: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
            maxBodyLength: Infinity,

        }).then(res => res.data?.data?.link);
    }
}