// One SQLite-backed Durable Object serializes quota reservations across all isolates.
// Only a SHA-256 UID hash, counters and short leases are stored. No document content.
export const LIMITS={userDaily:20,globalDaily:300,perMinute:3,concurrent:4,leaseMs:75000};
export class EditLimits{
  constructor(state){this.storage=state.storage;}
  async fetch(request){
    const {action,user,lease}=await request.json();
    if(!/^[a-f0-9]{64}$/.test(user||'')||!/^[-\w]{36}$/.test(lease||''))return Response.json({allowed:false},{status:400});
    const now=Date.now(),day=Math.floor(now/86400000),minute=Math.floor(now/60000);
    const result=await this.storage.transaction(async storage=>{
      let bucket=await storage.get('quota');
      if(!bucket||bucket.day!==day)bucket={day,total:0,users:{},active:{}};
      for(const [id,item]of Object.entries(bucket.active))if(item.until<=now)delete bucket.active[id];
      if(action==='release'){
        if(bucket.active[lease]?.user===user)delete bucket.active[lease];
        await storage.put('quota',bucket);return{allowed:true};
      }
      if(action!=='reserve')return{allowed:false,retryAfter:60};
      const entry=bucket.users[user]||{daily:0,minute,count:0};
      if(entry.minute!==minute){entry.minute=minute;entry.count=0;}
      const daily=bucket.total>=LIMITS.globalDaily||entry.daily>=LIMITS.userDaily;
      if(daily)return{allowed:false,retryAfter:Math.ceil(((day+1)*86400000-now)/1000),code:'DAILY_LIMIT'};
      if(entry.count>=LIMITS.perMinute||Object.keys(bucket.active).length>=LIMITS.concurrent||Object.values(bucket.active).some(item=>item.user===user))return{allowed:false,retryAfter:60,code:'RATE_LIMIT'};
      entry.daily++;entry.count++;bucket.users[user]=entry;bucket.total++;
      bucket.active[lease]={user,until:now+LIMITS.leaseMs};
      await storage.put('quota',bucket);return{allowed:true};
    });
    return Response.json(result);
  }
}
