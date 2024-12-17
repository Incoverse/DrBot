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
declare const global: DrBotGlobal;

import {readFileSync,writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve } from "path";
import * as threads from "worker_threads"

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");


interface DrBotWorker extends threads.Worker {
    run?: (...imports: any) => void
}

export function generateWorker(code: Function, imports:string="", workerData?: object) {
    writeFileSync(`${__dirname}/worker.js`, `
    import { parentPort, workerData } from "worker_threads"
    ${imports}
    parentPort.once("message", (imports) => {
        ${code.toString().replace(code.name, "run_function")}
        if (run_function.constructor.name != "AsyncFunction") parentPort.postMessage(run_function(workerData, ...imports))
        else run_function(workerData, ...imports).then(result => parentPort.postMessage(result))
    });
`)
    let worker: DrBotWorker = new threads.Worker(`${__dirname}/worker.js`, {workerData, env: process.env, argv: process.argv})
    worker.once("error", (error) => {
        global.logger.debugError(`Error in worker: ${error}`, returnFileName())
        // console.error(error)
    })
    worker.run = (...imports) => {
        worker.postMessage(imports)
    }
    return worker
}

export const returnFileName = () =>
  __filename.split(process.platform == "linux" ? "/" : "\\")[
    __filename.split(process.platform == "linux" ? "/" : "\\").length - 1
  ];