import { Document,Schema, model } from "mongoose";



export interface ICfg extends Document {
    cfg_name:string,
    times_used:number,
    active:boolean 
}

const CfgSchema = new Schema<ICfg>({
    cfg_name:{
        type:String,
        unique:true,
        trim:true
    },
    times_used:{
        type:Number,
        default:0
    },
    active:{
        type:Boolean,
        default:true
    }
}
)

export const Cfg = model<ICfg>('Cfg', CfgSchema)