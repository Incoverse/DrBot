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

import { DrBotGlobal } from "@src/interfaces/global.js"
import { MongoClient } from "mongodb"
import { fileURLToPath } from 'url';
import mingo, { Query } from "mingo";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import crypto from "crypto";
import { updateObject } from "mingo/updater";

type DataType = "user" | "server" | "offense" | "ticket"

const __filename = fileURLToPath(import.meta.url);

declare const global: DrBotGlobal

var method: string = "file"
var connectionClient: MongoClient = null

export let dataLocations = {
    ticketdata: null,
    offensedata: null,
    serverdata: null,
    userdata: null
};


export const returnFileName = () =>
    __filename.split(process.platform == "linux" ? "/" : "\\")[
      __filename.split(process.platform == "linux" ? "/" : "\\").length - 1
];

export async function checkMongoAvailability() {
    let client = null;
    try {
        client = new MongoClient(global.mongoConnectionString)
        await client.connect()
        const result = await client.db("admin").command({ ping: 1 })
        const res = result.ok === 1
        if (res) {
            connectionClient = client
            method = "mongo"
        } else method = "file"
        return res
    } catch (error) {
        global.logger.debugError("No MongoDB availability. Reason: " + error.toString(), returnFileName())
        method = "file"
        if (client) client.close()
        return false
    }
}

function parseDataType(input): { collection: string, filePathRelative: string } {
    switch (input) {
        case "user":
            return {
                collection: "USERDATA_" + global.app.config.mainServer,
                filePathRelative: `${global.app.config.development ? "development" : "production"}/userdata/${global.app.config.mainServer}.json`
            }
        case "server":
            return {
                collection: "SERVERDATA_" + global.app.config.mainServer,
                filePathRelative: `${global.app.config.development ? "development" : "production"}/serverdata/${global.app.config.mainServer}.json`
            }
        case "offense":
            return {
                collection: "OFFENSEDATA_" + global.app.config.mainServer,
                filePathRelative: `${global.app.config.development ? "development" : "production"}/offensedata/${global.app.config.mainServer}.json`
            }
        case "ticket":
            return {
                collection: "TICKETDATA_" + global.app.config.mainServer,
                filePathRelative: `${global.app.config.development ? "development" : "production"}/ticketdata/${global.app.config.mainServer}.json`
            }
        default:
            global.logger.debugError("Invalid data type: " + input, returnFileName())
            return { collection: null, filePathRelative: null }
    }
}

export async function setupFiles() {
    const shouldExist = [
        `${global.app.config.development ? "development" : "production"}/userdata/${global.app.config.mainServer}.json`,
        `${global.app.config.development ? "development" : "production"}/serverdata/${global.app.config.mainServer}.json`,
        `${global.app.config.development ? "development" : "production"}/offensedata/${global.app.config.mainServer}.json`,
        `${global.app.config.development ? "development" : "production"}/ticketdata/${global.app.config.mainServer}.json`
    ]
    for (const file of shouldExist) {
        let filePath = path.join(process.cwd(), global.app.config.backupStoragePath, file)
        if (!fs.existsSync(filePath)) {
            let dir = path.dirname(filePath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(filePath, "[]")
            global.logger.debug("Created file: " + chalk.yellowBright(file), returnFileName())
        }
    }
    dataLocations.userdata =    `userdata/${global.app.config.mainServer}.json`,
    dataLocations.serverdata =  `serverdata/${global.app.config.mainServer}.json`,
    dataLocations.offensedata = `offensedata/${global.app.config.mainServer}.json`
    dataLocations.ticketdata = `ticketdata/${global.app.config.mainServer}.json`
}



async function del(oneOrMany: "one" | "many", dataType: DataType, filter: object) {

    const { collection, filePathRelative } = parseDataType(dataType)

    if (method == "mongo") {
        try {
            const col = connectionClient.db(global.app.config.development ? "DrBot_DEVELOPMENT" : "DrBot").collection(collection)
            return oneOrMany == "one" ? await col.deleteOne(filter) : await col.deleteMany(filter)
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    } else {
        let filePath = path.join(process.cwd(), global.app.config.backupStoragePath, filePathRelative)

        try {
            let data = JSON.parse(fs.readFileSync(filePath, "utf-8")) ?? []
            let query = new Query(filter as any)
            let toBeDeleted = oneOrMany == "one" ? data.find((doc) => query.test(doc)) : data.filter((doc) => query.test(doc))
            
            if (oneOrMany == "one") {
                data = data.filter((doc) => doc?._id != toBeDeleted?._id)
            } else {
                data = data.filter((doc) => !query.test(doc))
            }
            fs.writeFileSync(filePath, JSON.stringify(data))
            return toBeDeleted
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        } 
    }
}





async function get(oneOrMany: "one" | "many", dataType: DataType, filter: object) {

    const { collection, filePathRelative } = parseDataType(dataType)

    if (method == "mongo") {
        try {
            const col = connectionClient.db(global.app.config.development ? "DrBot_DEVELOPMENT" : "DrBot").collection(collection)
            return oneOrMany == "one" ? await col.findOne(filter) : await col.find(filter).toArray()
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return null
        }
    } else {
        let filePath = path.join(process.cwd(), global.app.config.backupStoragePath, filePathRelative)

        try {
            let data = JSON.parse(fs.readFileSync(filePath, "utf-8")) ?? []
            let query = new Query(filter as any)
            return oneOrMany == "one" ? data.find((doc) => query.test(doc)) : data.filter((doc) => query.test(doc))
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return null
        }
    }
}


async function add(oneOrMany: "one" | "many", dataType: DataType, data: { [key: string]: any } | Array<{ [key: string]: any }>) {

    const { collection, filePathRelative } = parseDataType(dataType)
    
    if (method == "mongo") {
        try {
            const col = connectionClient.db(global.app.config.development ? "DrBot_DEVELOPMENT" : "DrBot").collection(collection)
            return oneOrMany == "one" ? await col.insertOne(data as { [key: string]: any }) : await col.insertMany(data as Array<{ [key: string]: any }>)
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    } else {
        let filePath = path.join(process.cwd(), global.app.config.backupStoragePath, filePathRelative)
        try {
            let alreadyExistingData = JSON.parse(fs.readFileSync(filePath, "utf-8")) ?? []
            let newData = []

            if (oneOrMany == "one") {
                (data as { [key: string]: any })._id = crypto.randomBytes(16).toString("hex")
                while (alreadyExistingData.some((d) => d._id == (data as { [key: string]: any })._id)) {
                    (data as { [key: string]: any })._id = crypto.randomBytes(16).toString("hex")
                }
                newData = [...alreadyExistingData, data]
            } else  {

                (data as Array<{ [key: string]: any }>).forEach((doc) => {
                    doc._id = crypto.randomBytes(16).toString("hex")
                    while (alreadyExistingData.some((d) => d._id == doc._id)) {
                        doc._id = crypto.randomBytes(16).toString("hex")
                    }
                })
                newData = [...alreadyExistingData, ...(data as Array<{ [key: string]: any }>)]

            }
            fs.writeFileSync(filePath, JSON.stringify(newData))
            return data
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    }

}



async function update(oneOrMany: "one" | "many", dataType: DataType, filter: object, data: object) {

    const { collection, filePathRelative } = parseDataType(dataType)

    if (method == "mongo") {
        try {
            const col = connectionClient.db(global.app.config.development ? "DrBot_DEVELOPMENT" : "DrBot").collection(collection)
            return oneOrMany == "one" ? await col.updateOne(filter, data) : await col.updateMany(filter, data)
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    } else {
        let filePath = path.join(process.cwd(), global.app.config.backupStoragePath, filePathRelative)

        try {
            let alreadyExistingData = JSON.parse(fs.readFileSync(filePath, "utf-8")) ?? []
            let query = new Query(filter as any)
            
            if (oneOrMany == "one") {
                let toUpdate = alreadyExistingData.find((doc) => query.test(doc))
                if (!toUpdate) return false
                delete (data as any)._id
                updateObject(toUpdate, data as any)
                alreadyExistingData.map((doc) => doc._id == toUpdate._id ? toUpdate : doc)
            } else {
                let toUpdate = alreadyExistingData.filter((doc) => query.test(doc))
                if (!toUpdate) return false
                delete (data as any)._id
                toUpdate.map((doc) => {updateObject(doc, data as any); return doc})
                alreadyExistingData.map((doc) => toUpdate.some((d) => d._id == doc._id) ? toUpdate.find((d) => d._id == doc._id) : doc)
            }

            fs.writeFileSync(filePath, JSON.stringify(alreadyExistingData))
            return true
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    }
}

async function replace(dataType: DataType, filter: object, data: object) {
    const { collection, filePathRelative } = parseDataType(dataType)

    if (method == "mongo") {
        try {
            const col = connectionClient.db(global.app.config.development ? "DrBot_DEVELOPMENT" : "DrBot").collection(collection)
            return await col.replaceOne(filter, data)
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    } else {
        let filePath = path.join(process.cwd(), global.app.config.backupStoragePath, filePathRelative)

        try {
            let alreadyExistingData = JSON.parse(fs.readFileSync(filePath, "utf-8")) ?? []
            let query = new Query(filter as any)
            let toUpdate = alreadyExistingData.find((doc) => query.test(doc))
            if (!toUpdate) return false
            delete (data as any)._id
            alreadyExistingData.map((doc) => doc._id == toUpdate._id ? data : doc)
            fs.writeFileSync(filePath, JSON.stringify(alreadyExistingData))
            return true
        } catch (error) {
            global.logger.error(error.toString(), returnFileName())
            return false
        }
    }
}

export async function setupMongo() {
    if (method == "file") return false

    const requiredCollections = [
        "USERDATA_" + global.app.config.mainServer,
        "SERVERDATA_" + global.app.config.mainServer,
        "OFFENSEDATA_" + global.app.config.mainServer,
        "TICKETDATA_" + global.app.config.mainServer
    ]

    try {
        const database = connectionClient.db(global.app.config.development ? "DrBot_DEVELOPMENT" : "DrBot");
        const collections = (await database.listCollections().toArray()).map((c) => c.name);
        for (const collection of requiredCollections) {
            if (!collections.includes(collection)) {
                await database.createCollection(collection)
                global.logger.debug(`Successfully created a missing collection in the database: ${chalk.yellow(collection)}`,returnFileName());
            }
        }
    } catch (error) {
        global.logger.error(error.toString(), returnFileName())
        return false
    }

    dataLocations.userdata =    "USERDATA_"    + global.app.config.mainServer
    dataLocations.serverdata =  "SERVERDATA_"  + global.app.config.mainServer
    dataLocations.offensedata = "OFFENSEDATA_" + global.app.config.mainServer
    dataLocations.ticketdata = "TICKETDATA_" + global.app.config.mainServer
    
}

export async function cleanup() {
    if (connectionClient) await connectionClient.close().then(() => global.logger.debug("Closed MongoDB connection.", returnFileName()))
}


export const insertOne:  (dataType: DataType, data: { [key: string]: any }) => Promise<any> = add.bind(null, "one")
export const insertMany: (dataType: DataType, data: Array<{ [key: string]: any }>) => Promise<any> = add.bind(null, "many")

export const findOne:    (dataType: DataType, filter: object) => Promise<any> = get.bind(null, "one")
export const find:       (dataType: DataType, filter: object) => Promise<any> = get.bind(null, "many")

export const deleteOne:  (dataType: DataType, filter: object) => Promise<any> = del.bind(null, "one")
export const deleteMany: (dataType: DataType, filter: object) => Promise<any> = del.bind(null, "many")

export const updateOne:  (dataType: DataType, filter: object, data: object) => Promise<any> = update.bind(null, "one")
export const updateMany: (dataType: DataType, filter: object, data: object) => Promise<any> = update.bind(null, "many")

export const replaceOne: (dataType: DataType, filter: object, data: object) => Promise<any> = replace


export default {
    get method() {
        return method //! This is so that you can read the value of method outside of this file, but can't change it
    },

    insertOne,
    insertMany,
    findOne,
    find,
    deleteOne,
    deleteMany,
    updateOne,
    updateMany,

    replaceOne,
    
    cleanup,
    checkMongoAvailability,
}

  