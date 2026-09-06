import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const ACTIVE_LIST="CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md";
const CHECKPOINT_PREFIX="CHECKPOINTS/CHANGES/";

export function validateCheckpointFiles(files=[]){
  const changed=[...new Set(files.map(value=>String(value).trim()).filter(Boolean))];
  const implementation=changed.filter(path=>
    !path.startsWith("CHECKPOINTS/")&&
    !path.startsWith("checkpoints/")&&
    !path.endsWith(".md")
  );
  if(!implementation.length)return {required:false,ok:true,errors:[]};
  const errors=[];
  if(!changed.includes(ACTIVE_LIST))errors.push(`Λείπει ενημέρωση της ενιαίας λίστας: ${ACTIVE_LIST}`);
  if(!changed.some(path=>path.startsWith(CHECKPOINT_PREFIX)&&path.endsWith(".md")))errors.push(`Λείπει νέο checkpoint στο ${CHECKPOINT_PREFIX}`);
  return {required:true,ok:errors.length===0,errors};
}

function changedFiles(base,head){
  if(!base||!head||/^0+$/.test(base))return [];
  return execFileSync("git",["diff","--name-only",base,head],{encoding:"utf8"}).split(/\r?\n/).filter(Boolean);
}

function main(){
  const [base,head]=process.argv.slice(2);
  const result=validateCheckpointFiles(changedFiles(base,head));
  if(!result.required){console.log("Δεν απαιτείται checkpoint: δεν άλλαξε κώδικας ή ρύθμιση.");return}
  if(!result.ok){for(const error of result.errors)console.error(error);process.exit(1)}
  console.log("Η ενιαία λίστα και το νέο checkpoint ενημερώθηκαν μαζί με την αλλαγή.");
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main();
