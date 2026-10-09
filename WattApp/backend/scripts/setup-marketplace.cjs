require('dotenv').config();
const {Client}=require('pg');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
 await client.connect();
 try{
  await client.query(fs.readFileSync(path.join(__dirname,'../sql/backend-marketplace.sql'),'utf8'));
  await client.query(fs.readFileSync(path.join(__dirname,'../sql/backend-dashboard.sql'),'utf8'));
  await client.query(fs.readFileSync(path.join(__dirname,'../sql/backend-marketplace-sellers.sql'),'utf8'));
  await client.query(fs.readFileSync(path.join(__dirname,'../sql/backend-seller-portal.sql'),'utf8'));
  const result=await client.query("select count(*)::int as tables from pg_class where relname like 'market_%' and relkind='r' and relrowsecurity");
  console.log(`Marketplace ready: ${result.rows[0].tables} tables with RLS. No vendors or products were seeded.`);
 }finally{await client.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
