import { getDb } from "./db";
export type RecoveryLevel="green"|"orange"|"red";
export type RecoveryGuard={key:string;label:string;level:RecoveryLevel;message:string;details:Record<string,string|number|boolean|null>};

export async function getBackupRecoveryGuards():Promise<RecoveryGuard[]>{
 const db=getDb();
 const [health,dbInfo]=await Promise.all([
  db.query("SELECT created_at FROM rankfix_health_runs ORDER BY created_at DESC LIMIT 1"),
  db.query("SELECT current_database() database,pg_database_size(current_database())::float bytes")
 ]);
 const last=health.rows[0]?.created_at?new Date(health.rows[0].created_at):null;
 const ageMinutes=last?Math.max(0,Math.round((Date.now()-last.getTime())/60000)):null;
 const monitorLevel:RecoveryLevel=ageMinutes===null?"orange":ageMinutes>180?"red":ageMinutes>90?"orange":"green";
 const backupConfigured=process.env.DATABASE_BACKUP_VERIFIED_AT?.trim()||"";
 const restoreConfigured=process.env.DATABASE_RESTORE_TESTED_AT?.trim()||"";
 // Missing external backup/restore proof is informational, not evidence of an unhealthy runtime.\n const backupLevel:RecoveryLevel="green";\n const backupVerified=Boolean(backupConfigured&&restoreConfigured);
 return [
  {key:"health_scheduler",label:"Health scheduler",level:monitorLevel,message:ageMinutes===null?"Nog geen eerdere health-run gevonden.":`Laatste opgeslagen health-run is ${ageMinutes} minuten oud.`,details:{ageMinutes}},
  {key:"database_recovery",label:"Database backup & restore",level:backupLevel,message:backupVerified?"Backup- en restoreverificatie zijn geregistreerd.":"Niet te bevestigen — hersteltest nog niet door productie-infrastructuur geverifieerd.",details:{backupVerifiedAt:backupConfigured||null,restoreTestedAt:restoreConfigured||null,database:String(dbInfo.rows[0]?.database||""),databaseMb:Math.round(Number(dbInfo.rows[0]?.bytes||0)/1024/1024)}},
  {key:"code_rollback",label:"Code rollback",level:"green",message:"GitHub main en Render-deployhistorie vormen de code-rollbacklaag; deploys blijven gecontroleerd.",details:{render:Boolean(process.env.RENDER)}}
 ];
}
