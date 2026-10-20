import React,{useEffect,useRef} from 'react';

/** Explicit playback of an already authorized, transient blob; no auto-play or local file. */
export default function ChatVoicePreview({url,onClose}){
  const player=useRef(null),close=useRef(onClose);
  useEffect(()=>{close.current=onClose},[onClose]);
  useEffect(()=>{
    const audio=player.current;
    const stop=()=>{audio?.pause();close.current?.()};
    const visibility=()=>{if(document.hidden)stop()};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);audio?.pause();audio?.removeAttribute('src');audio?.load()};
  },[url]);
  return <audio ref={player} src={url} controls preload="none" controlsList="nodownload noplaybackrate" aria-label="Αναπαραγωγή φωνητικού" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}/>;
}
