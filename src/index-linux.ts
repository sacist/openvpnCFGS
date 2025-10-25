import path from "path"
import { Cfg } from './models/ovpn-cfg.model'
import 'dotenv/config'
import { connectDB } from "./helpers"
import { spawn} from "child_process"
const CFG_DIR = path.resolve("./cfg")
const openvpn_path = "C:\\Program Files\\OpenVPN\\bin\\openvpn.exe"
import { Agent, fetch } from "undici"

export const connectToVpn = async (task: () => Promise<any>) => {
    await connectDB()

    const tryConnect = async (): Promise<void> => {
        const configToUse = await Cfg.findOne({ times_used: { $lt: 6 }, active: true })
        if (!configToUse) throw new Error('Нет доступных конфигов')

        const configPath = path.join(CFG_DIR, configToUse.cfg_name)
        const vpnProcess = spawn("openvpn", [
            "--config", configPath,
            "--data-ciphers", "AES-256-GCM:AES-128-GCM:AES-128-CBC",
            "--dhcp-option", "DNS", "8.8.8.8",
            "--dhcp-option", "DNS", "1.1.1.1"
        ])
        return new Promise<void>((resolve, reject) => {
            let connected = false
            let outputBuffer = ""
            const timeout = setTimeout(() => {
                if (!connected) {
                    vpnProcess.kill("SIGINT")
                    reject(new Error("Таймаут подключения VPN"))
                }
            }, 165000)

            vpnProcess.stdout.on("data", async (data) => {
                outputBuffer += data.toString()
                process.stdout.write(`Vpn: ${data.toString()}`)

                if (!connected && outputBuffer.includes("Initialization Sequence Completed")) {
                    console.log('Впн Подключен')
                    connected = true
                    clearTimeout(timeout)

                    try {
                        await task()
                        await configToUse.updateOne({ times_used: configToUse.times_used + 1 })
                        resolve()
                    } catch (e) {
                        console.error(e)
                        reject(e)
                    } finally {
                        vpnProcess.kill("SIGINT")
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
            await Cfg.updateOne({ _id: configToUse._id }, { active: false })
            await new Promise(r => setTimeout(r, 1000))
            return tryConnect()
        })
    }

    return tryConnect()
}

const fetchIp = async () => {
    const res = await fetch("https://api.ipify.org", {
        dispatcher: new Agent({ connectTimeout: 60000 })
    })
    console.log('Фетч удался')
}

(async () => {
    for (let i = 0; i < 10; i++) {
        await connectToVpn(fetchIp)
    }
})()
