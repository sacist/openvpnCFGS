import fs from "fs";
import path from "path";
import { Cfg } from "./models/ovpn-cfg.model";
import { connectDB } from "./helpers";

const SAVE_DIR = path.resolve("/cfg");
async function main() {
    await connectDB()
    const res = await fetch("http://flareproxy_server:1200?url=https://www.vpngate.net/api/iphone/&code=IF1Qxd5AZvCc",{
        method:"POST"
    })
    
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
        console.log(speed);
        
        if (!openVPNConfigBase64 || !ip) continue;
        if (countryLong.includes("Russia")) continue
        const speedNum = Number(speed)
        const decoded = Buffer.from(openVPNConfigBase64, "base64").toString("utf8");

        const portMatch = decoded.match(/remote\s+[^\s]+\s+(\d+)/);
        const port = portMatch ? portMatch[1] : "unknown";
        // if (isNaN(speedNum) || speedNum < 175000000) continue;
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
    let newCfgsCount=0
    for (const { ip, port, config } of unique) {
        const proto = config.includes("proto tcp") ? "tcp" : config.includes("proto udp") ? "udp" : "unknown"
        const cfg=`vpngate_${ip}_${proto}_${port}.ovpn`
        const filePath = path.join(SAVE_DIR, cfg)
        try {
            await Cfg.create({cfg_name:cfg})
            fs.writeFileSync(filePath, config, "utf8")
            newCfgsCount++
        } catch (e:any) {
            if (e.code !== 11000) throw e
        }
    }
    const inactiveCfgsJson=await Cfg.find({active:false})
    let deletedCfgsCount=0
    if(inactiveCfgsJson.length!==0){
        const inactiveCfgs=inactiveCfgsJson.map((val)=>val.cfg_name)
        const configs = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith(".ovpn"))
        for(const cfg of configs){
            if(inactiveCfgs.includes(cfg)){
                try {
                    fs.unlinkSync(path.join(SAVE_DIR, cfg))
                    deletedCfgsCount++
                } catch (e) {
                    console.log('Ошибка удаления конфига')   
                }
            }
        }
    }
    console.log(`${newCfgsCount} Новых конфигов сохранено в:`, SAVE_DIR)
    console.log(`${deletedCfgsCount} Неактивных конфигов удалено в:`, SAVE_DIR)
    process.exit(0)
}

main().catch((e)=>{
    console.log(e)
    process.exit(0)
});
