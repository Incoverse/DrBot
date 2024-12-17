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

(async()=>{
    const fs = await import('fs');
    const path = await import('path');
    const { resolveTsPaths } = await import("resolve-tspaths");

    await resolveTsPaths()

    if (!fs.existsSync(process.cwd() + "/pre-dist")) {
        fs.mkdirSync(process.cwd() + "/pre-dist")
        console.log("Done!")
        return
    }

    const files = fs.readdirSync(process.cwd() + "/pre-dist", { encoding: "utf-8", recursive: true}).filter(file => fs.lstatSync(process.cwd() + "/pre-dist/" + file).isFile())
    if (!fs.existsSync(process.cwd() + "/dist")) {
        fs.mkdirSync(process.cwd() + "/dist")
    }

    const distFiles = fs.readdirSync(process.cwd() + "/dist", { encoding: "utf-8", recursive: true}).filter(file => fs.lstatSync(process.cwd() + "/dist/" + file).isFile())
    const srcFiles = fs.readdirSync(process.cwd() + "/src", { encoding: "utf-8", recursive: true}).filter(file => fs.lstatSync(process.cwd() + "/src/" + file).isFile())
    for (const file of distFiles) {
        if (!srcFiles.includes(file.replace(/\.js$/m, ".ts"))) {
            console.log("Deleting file", file)
            fs.unlinkSync(process.cwd() + "/dist/" + file)
        }
    }

    for (const file of files) {

        const folder = path.dirname(file)
        if (!fs.existsSync(path.join(process.cwd(), "dist", folder))) {
            fs.mkdirSync(path.join(process.cwd(), "dist", folder), { recursive: true })
        }

        if (fs.existsSync(path.join(process.cwd(), "dist", file))) {
            fs.writeFileSync(path.join(process.cwd(), "dist", file), fs.readFileSync(path.join(process.cwd(), "pre-dist", file)))
            fs.unlinkSync(path.join(process.cwd(), "pre-dist", file))
            if (fs.readdirSync(path.join(process.cwd(), "pre-dist", folder)).length === 0) {
                if (folder == ".") continue
                console.log("Deleting", file, "folder")
                fs.rmSync(path.join(process.cwd(), "pre-dist", folder), { recursive: true })
            }
        } else {
            console.log("Adding file", file)
            fs.renameSync(path.join(process.cwd(), "pre-dist", file), path.join(process.cwd(), "dist", file))
        }
    }

    const remains = fs.readdirSync(path.join(process.cwd(), "pre-dist"), { encoding: "utf-8", recursive: true})
    if (remains.length > 0) {
        for (const file of remains) {
            if (fs.existsSync(path.join(process.cwd(),"pre-dist",file)) && fs.lstatSync(path.join(process.cwd(), "pre-dist", file)).isDirectory()) {
                if (file == ".") continue
                console.log("Deleting", file, "folder")
                fs.rmSync(path.join(process.cwd(), "pre-dist", file), { recursive: true })
            } 
        }
    }

    console.log("Done!")
})()
