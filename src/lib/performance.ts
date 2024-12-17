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


import { DrBotGlobal } from "@src/interfaces/global.js";
import chalk from "chalk";
declare const global: DrBotGlobal;

const timers: {
    [key: string]: {
        startTime: bigint,
        paused?: bigint
    }
} = {}

export const start = (label: string, startTime = process.hrtime.bigint()) => {
    if (!label) throw new Error("A label must be provided to start the timer.")
    if (timers[label]) throw new Error("A timer with that label already exists.")
    timers[label] = {
        startTime: startTime
    }
    global.logger.debug(`Timer started with label: ${chalk.yellowBright(label)}`, "PERFORMANCE")
}
export const getTime = (label: string) => {
    const currentTime = process.hrtime.bigint()

    if (!label) throw new Error("A label must be provided to get the timer.")
    if (!timers[label]) throw new Error("A timer with that label doesn't exist.")
    const time = timers[label].paused
                ? timers[label].paused - timers[label].startTime
                : currentTime - timers[label].startTime
    const result = (Number(time) / 1000000).toFixed(5)
    if (parseFloat(result) >= 1000) return `${(Number(time) / 1000000000).toFixed(2)}s`
    return `${(Number(time) / 1000000).toFixed(3)}ms`
}
export const getRawTime = (label: string) => {
    const currentTime = process.hrtime.bigint()
    if (!label) throw new Error("A label must be provided to get the timer.")
    if (!timers[label]) throw new Error("A timer with that label doesn't exist.")

    // startTime - pausedTime if paused
    if (timers[label].paused) return timers[label].paused - timers[label].startTime
    return currentTime - timers[label].startTime
}
export const log = (label: string, time: bigint = getRawTime(label)) => {
    if (!label) throw new Error("A label must be provided to log the timer.")
    if (!timers[label]) throw new Error("A timer with that label doesn't exist.")
    global.logger.debug(`${chalk.yellowBright(label)} took ${chalk.yellowBright(formatRawTime(time))} to complete.`, "PERFORMANCE")

}
export const formatRawTime = (time: bigint) => {
    const result = (Number(time) / 1000000).toFixed(5)
    if (parseFloat(result) >= 1000) return `${(Number(time) / 1000000000).toFixed(2)}s`
    return `${(Number(time) / 1000000).toFixed(3)}ms`
}
export const pause = (labels: string | string[]) => {
    const currentTime = process.hrtime.bigint()
    if (!Array.isArray(labels)) labels = [labels]

    labels.forEach(label => {
        if (!label) throw new Error("A label must be provided to pause the timer.")
        if (!timers[label]) throw new Error(`A timer with label '${label}' doesn't exist.`)
        if (timers[label].paused) throw new Error("The timer is already paused for label: " + label)
        timers[label].paused = currentTime
    })
}
export const resume = (labels: string | string[]) => {
    const currentTime = process.hrtime.bigint()
    if (!Array.isArray(labels)) labels = [labels]

    labels.forEach(label => {
        if (!label) throw new Error("A label must be provided to resume the timer.")
        if (!timers[label]) throw new Error(`A timer with label '${label}' doesn't exist.`)
        if (!timers[label].paused) throw new Error(`The timer for label '${label}' must be paused to resume it.`)
        timers[label].startTime += currentTime - timers[label].paused
        delete timers[label].paused
    })
}

export const end = (label: string, options:{silent:boolean}={silent:false}) => {
    if (!label) throw new Error("A label must be provided to end the timer.")
    if (!timers[label]) throw new Error("A timer with that label doesn't exist.")
    const final = getRawTime(label)
    if (!options.silent) log(label, final)
    delete timers[label]
    return formatRawTime(final)
}

export default {
    start,
    getTime,
    getRawTime,
    log,
    formatRawTime,
    end,
    pause,
    resume
}