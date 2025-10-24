import path from "path"
import fs from "fs"
import { Cfg } from "./models/ovpn-cfg.model"
import "dotenv/config"
import mongoose from "mongoose"
import { spawn } from "child_process"

const CFG_DIR = path.resolve("./cfg")
const MONGO_URI = process.env.MONGO_URI

const connectDB = async () => {
  try {
    if (!MONGO_URI) throw new Error("no mongo_uri in env")
    await mongoose.connect(MONGO_URI)
    console.log("✅ Connected to MongoDB")
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err)
    process.exit(1)
  }
}

export const connectToVpn = async (task: () => Promise<any>) => {
  await connectDB()

  const configs = fs.readdirSync(CFG_DIR).filter(f => f.endsWith(".ovpn"))
  for (const cfg of configs) {
    try {
      await Cfg.create({ cfg_name: cfg })
    } catch (e: any) {
      if (e.code !== 11000) throw e
    }
  }

  const tryConnect = async (): Promise<void> => {
    const configToUse = await Cfg.findOne({ times_used: { $lt: 6 } })
    if (!configToUse) throw new Error("Нет доступных конфигов")

    const configPath = path.join(CFG_DIR, configToUse.cfg_name)
    const vpnProcess = spawn("openvpn", [
      "--config", configPath,
      "--data-ciphers", "AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-128-CBC"
    ])

    return new Promise<void>((resolve, reject) => {
      let connected = false
      let outputBuffer = ""

      const timeout = setTimeout(() => {
        if (!connected) {
          vpnProcess.kill("SIGINT")
          reject(new Error("Таймаут подключения VPN"))
        }
      }, 20000)

      vpnProcess.stdout.on("data", async (data) => {
        const output = data.toString()
        outputBuffer += output
        process.stdout.write(`Vpn: ${output}`)

        if (!connected && outputBuffer.includes("Initialization Sequence Completed")) {
          connected = true
          clearTimeout(timeout)
          try {
            await task()
            await configToUse.updateOne({ times_used: configToUse.times_used + 1 })
            resolve()
          } catch (e) {
            console.error(e)
            vpnProcess.kill()
            reject(e)
          } finally {
            vpnProcess.kill()
          }
        }
      })

      vpnProcess.stderr.on("data", data => {
        process.stderr.write(`Vpn ERR: ${data.toString()}`)
      })

      vpnProcess.on("exit", (code) => {
        if (!connected) {
          clearTimeout(timeout)
          reject(new Error(`VPN процесс завершился до подключения (${configToUse.cfg_name}), код ${code}`))
        }
      })
    }).catch(async (err) => {
      console.error("Ошибка подключения VPN:", err.message)
      await Cfg.deleteOne({ _id: configToUse._id })
      try { fs.unlinkSync(configPath) } catch { }
      await new Promise(r => setTimeout(r, 1000))
      return tryConnect()
    })
  }

  return tryConnect()
}

const fetchIp = async () => {
  const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(20000) })
  const json = await res.json()
  console.log("🌐 IP:", json.ip)
}

(async () => {
  for (let i = 0; i < 10; i++) {
    console.log(`\n=== 🔁 Подключение #${i + 1} ===`)
    await connectToVpn(fetchIp)
  }
})()
