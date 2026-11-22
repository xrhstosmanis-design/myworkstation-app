import React,{useEffect,useRef,useState} from 'react';
const KEYS=new Set(['Enter','Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown']);
export default function RemoteDesktopInput({frame,title,live,onInput}){
 const capture=useRef(null),generation=useRef(0),composing=useRef(null),[focused,setFocused]=useState(false),[notice,setNotice]=useState('');
 const release=()=>{generation.current++;composing.current=null;setFocused(false);if(capture.current)capture.current.value='';};
 useEffect(()=>{if(!live){capture.current?.blur();release();}},[live]);
 useEffect(()=>{const lost=()=>{capture.current?.blur();release();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',lost);return()=>{generation.current++;window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',lost);};},[]);
 const send=body=>{const version=generation.current;return onInput(body,()=>version===generation.current&&document.activeElement===capture.current&&document.hasFocus()&&document.visibilityState!=='hidden',version);};
 const text=value=>{if(!value)return;if(value.length>200||/[\u0000-\u001f\u007f]/.test(value)){setNotice('Χρησιμοποίησε το πεδίο κειμένου για αυτό το περιεχόμενο.');return;}send({type:'text',text:value}).then(sent=>{if(!sent&&document.activeElement===capture.current)setNotice('Δεν στάλθηκαν όλα τα πλήκτρα. Έλεγξε τη σύνδεση και το κείμενο στην απομακρυσμένη οθόνη.');});};
 const key=e=>{
  if(!live||composing.current!==null||e.nativeEvent.isComposing||e.keyCode===229)return;
  const altGraph=e.getModifierState?.('AltGraph');
  if((e.ctrlKey||e.metaKey||e.altKey)&&!altGraph){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v')return;e.preventDefault();setNotice('Οι συνδυασμοί Ctrl/Alt/Windows δεν υποστηρίζονται ακόμη.');return;}
  if(KEYS.has(e.key)){e.preventDefault();send({type:'key',key:e.key});}
  else if([...e.key].length===1){e.preventDefault();text(e.key);}
 };
 const click=(e,button)=>{if(!live)return;const r=e.currentTarget.getBoundingClientRect();onInput({type:'click',button,x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});capture.current?.focus({preventScroll:true});};
 return <section aria-label="Χειρισμός απομακρυσμένης οθόνης" style={{position:'relative'}}>
  <p role="status">{focused&&live?'Πληκτρολόγιο ενεργό στην απομακρυσμένη οθόνη.':'Κάνε κλικ στην οθόνη και γράψε κατευθείαν.'} <button type="button" onClick={()=>{capture.current?.blur();release();}}>Απελευθέρωση πληκτρολογίου</button></p>
  {notice&&<p role="status">{notice}</p>}
  <textarea ref={capture} aria-label="Άμεσο πληκτρολόγιο απομακρυσμένης οθόνης" disabled={!live} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{position:'absolute',width:1,height:1,padding:0,border:0,opacity:0.01}} onFocus={()=>{setFocused(true);setNotice('');}} onBlur={release} onKeyDown={key} onCompositionStart={()=>{composing.current=generation.current;}} onCompositionEnd={e=>{const valid=composing.current===generation.current;composing.current=null;if(valid&&document.activeElement===capture.current&&live)text(e.data);e.currentTarget.value='';}} onPaste={e=>{e.preventDefault();text(e.clipboardData.getData('text/plain'));}}/>
  <img alt={title} src={`data:image/jpeg;base64,${frame.jpeg}`} style={{width:'100%',opacity:live?1:.4,outline:focused&&live?'3px solid #0f766e':undefined,display:'block'}} onClick={e=>click(e,'left')} onContextMenu={e=>{e.preventDefault();click(e,'right');}}/>
 </section>;
}
