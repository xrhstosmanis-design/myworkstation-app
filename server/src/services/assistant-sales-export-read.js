import {salesOnlyQuestion} from './assistant-question-intent.js';
import {businessQuestionPeriod} from './assistant-business-reports.js';

// Conversation text supplies a topic/period, never values or permission. Only a
// format-only current request opts into a fresh sales read; normal questions
// retain their existing tool choice and clarification paths.
export function salesExportReadPeriod(question,{now=new Date()}={}){
 const lines=String(question||'').trim().split(/\r?\n/);
 if(!/^(?:σε\s+)?(?:csv|pdf|excel|xlsx|word|docx)[.!;;?]?$/iu.test(lines[0].trim())||!salesOnlyQuestion(question))return null;
 const prefix='Η νεότερη περίοδος αυτής της αναζήτησης είναι: ';
 const latest=lines.filter(line=>line.startsWith(prefix));
 if(latest.length>1)return null;
 const topicPrefix='Προηγούμενο θέμα της ίδιας συνομιλίας: ';
 const topics=lines.filter(line=>line.startsWith(topicPrefix));
 if(topics.length!==1)return null;
 // The effective question can still contain the old topic's "χθες". Resolve
 // the explicitly retained latest sales period independently of that topic.
 return businessQuestionPeriod(latest.length?latest[0].slice(prefix.length):topics[0].slice(topicPrefix.length),{now});
}
