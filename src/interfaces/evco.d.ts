
interface DrBotCacheContainer {
    validUntil: number | Date,
    data: any

} 
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
    Pick<T, Exclude<keyof T, Keys>> 
    & {
        [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
    }[Keys]

type DrBotEvCoSettings = RequireAtLeastOne<{
    devOnly: boolean;
    mainOnly: boolean;
}, 'devOnly' | 'mainOnly'> & {
    unloadTimeoutMS?: number;
    setupTimeoutMS?: number;
}