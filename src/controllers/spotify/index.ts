import { Controller } from "@/lib/base/controller";
import Communication from "@/lib/communication";
import { EncryptedField } from "@/lib/enc-field";
import { invalidateCache, parseDuration } from "@/lib/misc";
import chalk from "chalk";
import { eq, Table, type RecordId } from "surrealdb";
import z, { ZodType } from "zod";
import SpotifyClient from "./client";
import { SpotifyAuthDBSchema, type SpotifyAuthDB } from "./types";

type StoredToken = {
  streamer: {
    id: RecordId;
    twitch?: {
      display_name: string;
      login: string;
      id: RecordId;
    },
    discord?: {
      username: string; 
      display_name: string;
      id: RecordId;
    },
    spotify?: {
      display_name: string;
      has_premium: boolean;
      id: RecordId;
    }
  };
  auth: string;
};
export default class SpotifyController extends Controller {
  constructor() {
    super("SPOT", "#1DB954");
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      spotify: z.object({
        authEndpoint: z.string()
          .describe("The endpoint for Spotify authentication")
          .default("/spotify/auth")
          .refine((endpoint: string) => endpoint.startsWith("/"), "Auth endpoint must start with a slash"),
        generatedCodeValidity: z.string()
          .describe("The validity duration for generated Spotify auth codes. Supports values accepted by parseDuration, such as '15m', '1h 30m', '2mo', '1w2d', and '500ms'.")
          .default("15m")
          .refine((duration: string) => {
            return !Number.isNaN(parseDuration(duration));
          }, "Generated code validity must be a valid duration string supported by parseDuration, such as '15m', '1h 30m', or '2mo'.")
      }).default({ authEndpoint: "/spotify/auth", generatedCodeValidity: "15m" }),  
    }) satisfies z.ZodType<Pick<WaiterConfig, "spotify">>;
  }

  public async exec() {
    if (!global.spotify) global.spotify = {
      controller: this,
      communication: new Communication(),
      clients: new Map<string, SpotifyClient>(),
    };


    await this.createAccounts();

    const streamerTokensLive = await global.db.live(new Table("streamer_tokens")).where(eq("type", "spotify")).fetch("streamer", "streamer.spotify", "streamer.twitch", "streamer.discord");

    
    streamerTokensLive.subscribe(async (event) => {
      const displayName = 
        (event.value as any).streamer.spotify?.display_name ||
        (event.value as any).streamer.twitch?.display_name ||
        (event.value as any).streamer.discord?.display_name ||
          "Unknown";
      const id = 
        (event.value as any).streamer.spotify?.id.id.toString() ||
        (event.value as any).streamer.twitch?.id.id.toString() ||
        (event.value as any).streamer.discord?.id.id.toString() ||
          "??????";
      if (event.action === "CREATE") {
        const encryptedAuth = EncryptedField.fromDB((event.value as any).auth);

        if (!encryptedAuth.isSet()) {
          return;
        }

        console.info(`A spotify token was created for ${displayName} (ID: ${id}). Attempting to set up Spotify client...`);

        let auth: SpotifyAuthDB;
        
        try {
          if (!encryptedAuth.validate()) {
            throw new Error("Encrypted auth field is not valid. Decryption failed.");
          }
          const unvalidatedAuth = encryptedAuth.get();
          const parsedAuth = SpotifyAuthDBSchema.safeParse(unvalidatedAuth);
          if (!parsedAuth.success)
            throw new Error(parsedAuth.error.message);
          auth = parsedAuth.data;
        } catch (error) {
          this.logger.error("Error parsing stored Spotify auth for new streamer token:", error?.message || error);
          this.logger.debug("Clearing invalid Spotify auth from database for streamer token with ID " + (event.value as any).id);
          await global.db.query('DELETE streamer_tokens WHERE id = $tokenId', {
            tokenId: (event.value as any).id
          });
          return; // Abort processing this event
        }
        
        const newClient = await SpotifyClient.create(auth, (event.value as any).streamer?.id.id.toString() ?? null);
        global.spotify.clients.set(newClient.IAM.id, newClient);

        await this.createAccounts();
        
        this.logger.great(`New Spotify account added: ${chalk.yellow(newClient.IAM.display_name)} (ID: ${chalk.yellow(newClient.IAM.id)})`);
        await invalidateCache(id);

      } else if (event.action === "DELETE") {
        const deletedStreamerId = (event.value as any).streamer?.spotify?.id.id.toString();

        if (!deletedStreamerId) {
          this.logger.warn("Received DELETE event for streamer token without streamer ID. Cannot determine which streamer was deleted. Ignoring.");
          return;
        }

        const deletedAccount = global.spotify.clients.get(deletedStreamerId);

        this.logger.warn(`Spotify token for ${deletedAccount.IAM.display_name} (ID: ${deletedAccount.IAM.id}) was deleted from database. Cleaning up...`);

        if (deletedAccount) {
          await deletedAccount.cleanup();
        }

        global.spotify.clients.delete(deletedStreamerId);

        await invalidateCache(deletedStreamerId);

        this.logger.log("Successfully cleaned up after deleted Spotify token.");



      }
    })
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Currently connected to ${chalk.yellow(global.spotify.clients.size)} Spotify account${global.spotify.clients.size !== 1 ? "s" : ""}${global.spotify.clients.size > 0 ? ":" : "."}`);
    for (const client of global.spotify.clients.values()) {
      this.logger.log(`  - ${chalk.yellow(client.IAM.display_name)} ${chalk.dim(`(ID: ${chalk.yellow(client.IAM.id)})`)}`);
    }
  }

    public async createAccounts(accountInit = async (client: SpotifyClient) => true) {
      const storedTokens: StoredToken[] = (await global.db.query("SELECT streamer, auth FROM streamer_tokens WHERE type = 'spotify' FETCH streamer, streamer.spotify").collect().then((res)=>res[0] as StoredToken[]))
        .filter(token => !global.spotify.clients.has(token.streamer.spotify!.id.id.toString())); // Only attempt to create streamers for tokens that don't already have a streamer instance
  
  
      for (const tokenRecord of storedTokens) {

        const displayName = tokenRecord.streamer.twitch?.display_name || tokenRecord.streamer.discord?.display_name || "Unknown";
        const login = tokenRecord.streamer.twitch?.login || tokenRecord.streamer.discord?.username || "unknown";


        this.logger.debug(`Found stored spotify token for streamer: ${displayName} (${login})`);
        
        const encryptedAuth = EncryptedField.fromDB(tokenRecord.auth);
        let auth: SpotifyAuthDB | null = null;
        
        if (encryptedAuth.isSet()) {
          try {
            if (!encryptedAuth.validate()) {
              throw new Error("Encrypted auth field is not valid. Decryption failed.");
            }
            const unvalidatedAuth = encryptedAuth.get();
            const parsedAuth = SpotifyAuthDBSchema.safeParse(unvalidatedAuth);
            if (!parsedAuth.success)
              throw new Error(parsedAuth.error.message);
            auth = parsedAuth.data;
          } catch (error) {
            this.logger.error("Error parsing stored Spotify auth:", error?.message || error);
            this.logger.debug("Clearing invalid Spotify auth from database.");
            await global.db.query('DELETE streamer_tokens WHERE streamer = $streamerId AND type = "spotify"', {
              streamerId: tokenRecord.streamer.id
            });
            continue; // Skip to next token
          }
        }
  
        if (!auth) {
          this.logger.warn(`No valid Spotify auth found for streamer ${displayName} (${login}). Skipping streamer initialization.`);
          continue;
        }
        
        const client = await SpotifyClient.create(auth, tokenRecord.streamer.id.id.toString());
        global.spotify.clients.set(client.IAM.id, client);
        await accountInit(client);
      }
    }
}
