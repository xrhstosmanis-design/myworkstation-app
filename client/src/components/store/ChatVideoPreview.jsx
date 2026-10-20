import React,{useEffect,useRef} from 'react';

/** Explicit playback of an already authorized, transient blob; no auto-play or local file. */
export default function ChatVideoPreview({url,onClose}){
  const player=useRef(null),close=useRef(onClose);
  useEffect(()=>{close.current=onClose},[onClose]);
  useEffect(()=>{
    const video=player.current;
    const stop=()=>{video?.pause();close.current?.()};
    const visibility=()=>{if(document.hidden)stop()};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);video?.pause();video?.removeAttribute('src');video?.load()};
  },[url]);
  return <video ref={player} src={url} controls playsInline disablePictureInPicture disableRemotePlayback style={{maxWidth:"100%",maxHeight:"60vh"}} preload="none" controlsList="nodownload noplaybackrate noremoteplayback" aria-label="Αναπαραγωγή βίντεο" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}/>;
}
