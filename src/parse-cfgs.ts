import fs from "fs";
import path from "path";
import { Cfg } from "./models/ovpn-cfg.model";

const SAVE_DIR = path.resolve(__dirname, "../cfg");

async function main() {
    const res = await fetch("https://www.vpngate.net/api/iphone/");
    const text = await res.text();

    const lines = text.split("\n").slice(2)
    const servers = [];

    for (const line of lines) {
        if (!line.trim() || line.startsWith("*")) continue;
        const cols = line.split(",");

        const [
            hostName,
            ip,
            score,
            ping,
            speed,
            countryLong,
            countryShort,
            numVpnSessions,
            uptime,
            totalUsers,
            totalTraffic,
            logType,
            operator,
            message,
            openVPNConfigBase64,
        ] = cols;

        if (!openVPNConfigBase64 || !ip) continue;
        if (countryLong.includes("Russia")) continue

        const decoded = Buffer.from(openVPNConfigBase64, "base64").toString("utf8");

        const portMatch = decoded.match(/remote\s+[^\s]+\s+(\d+)/);
        const port = portMatch ? portMatch[1] : "unknown";

        servers.push({ ip, port, config: decoded });
    }

    const unique = Object.values(
        servers.reduce((acc, s) => {
            if (!acc[s.ip]) acc[s.ip] = s;
            return acc;
        }, {} as Record<string, typeof servers[number]>)
    );

    console.log(`✅ Найдено ${unique.length} серверов (TCP + UDP, без России)`);

    if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

    for (const { ip, port, config } of unique) {
        const proto = config.includes("proto tcp") ? "tcp" : config.includes("proto udp") ? "udp" : "unknown"
        const cfg=`vpngate_${ip}_${proto}_${port}.ovpn`
        const filePath = path.join(SAVE_DIR, cfg)
        //fs.writeFileSync(filePath, config, "utf8")

    }

    console.log("💾 Конфиги сохранены в:", SAVE_DIR);
}

main().catch(console.error);
