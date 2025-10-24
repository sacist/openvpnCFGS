import mongoose from "mongoose"
import 'dotenv/config'
const MONGO_URI = process.env.MONGO_URI
export const connectDB = async () => {
    try {
        if (!MONGO_URI) throw new Error('no mongo_uri in env')
        await mongoose.connect(MONGO_URI)
        console.log("✅ Connected to MongoDB")
    } catch (err) {
        console.error("❌ Failed to connect to MongoDB:", err)
        process.exit(1)
    }
}