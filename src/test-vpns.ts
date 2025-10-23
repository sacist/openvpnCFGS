import { spawn } from "child_process"
import fs from "fs"
import path from "path"

const CFG_DIR = path.resolve("./cfg")

async function connectVPN(configName: string): Promise<boolean> {
  const configPath = path.join(CFG_DIR, configName)

  return new Promise<boolean>((resolve) => {
    const vpnProcess = spawn("openvpn", [
      "--config", configPath,
      "--data-ciphers", "AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-128-CBC"
    ])

    let connected = false
    let timeout: NodeJS.Timeout

    vpnProcess.stdout.on("data", async (data) => {
      const output = data.toString()
      process.stdout.write(`[${configName}] ${output}`)

      if (!connected && output.includes("Initialization Sequence Completed")) {
        connected = true
        clearTimeout(timeout)

        console.log(`✅ Подключен: ${configName}`)
        try {
          const res = await fetch("https://api.ipify.org?format=json",{ signal: AbortSignal.timeout(5000) })
          const ip = await res.json()
          console.log(`🌍 Внешний IP: ${ip.ip}`)

          vpnProcess.kill("SIGINT");
          resolve(true);
        } catch (err) {
          console.error(`❌ Ошибка при запросе IP для ${configName}:`, err)
          vpnProcess.kill("SIGINT")
          resolve(false)
        }
      }
    });

    vpnProcess.stderr.on("data", (data) => {
      process.stderr.write(`[${configName} ERROR] ${data.toString()}`)
    });

    timeout = setTimeout(() => {
      console.log(`⏱️ Таймаут при подключении ${configName}`)
      vpnProcess.kill("SIGINT")
      resolve(false)
    }, 8000)

    vpnProcess.on("exit", (code) => {
      if (!connected) console.log(`🔚 Завершено без подключения (${configName}), код ${code}`)
    });

    vpnProcess.on("error", (err) => {
      console.error(`🚨 Ошибка процесса для ${configName}:`, err)
      resolve(false)
    });
  });
}

async function main() {
  if (!fs.existsSync(CFG_DIR)) {
    console.error("❌ Папка cfg не найдена.")
    return;
  }

  const configs = fs.readdirSync(CFG_DIR).filter(f => f.endsWith(".ovpn"))
  if (!configs.length) {
    console.error("❌ Конфиги не найдены в ./cfg")
    return;
  }

  console.log(`🌐 Проверяем ${configs.length} VPN конфигов...\n`)

  let success = 0;
  let failed = 0;

  for (const cfg of configs) {
    console.log(`🔄 Проверка: ${cfg}`)
    const ok = await connectVPN(cfg)
    if (ok) {
      success++;
    } else {
      failed++;
      console.log(`🗑️ Удаляем нерабочий: ${cfg}`)
      try {
        fs.unlinkSync(path.join(CFG_DIR, cfg));
      } catch (err) {
        console.error(`Ошибка удаления ${cfg}:`, err)
      }
    }

    console.log("—".repeat(60))
  }

  console.log(`✅ Готово! Рабочих VPN: ${success}, удалено нерабочих: ${failed}`)
}

main().catch(console.error)
