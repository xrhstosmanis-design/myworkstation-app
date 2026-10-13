import React,{useState} from "react";
export default function ChatOperatorEntry({onChoose}){
 const [link,setLink]=useState(()=>localStorage.getItem("chatOperatorStoreLink")||""),[error,setError]=useState("");
 const submit=e=>{e.preventDefault();try{const url=new URL(link,location.origin),match=url.pathname.match(/^\/chat\/([A-Za-z0-9_-]{1,80})\/?$/);if(url.origin!==location.origin||!match)throw new Error("Βάλε τον σύνδεσμο Chat του καταστήματος που σου έδωσε ο ιδιοκτήτης.");setError("");localStorage.setItem("chatOperatorStoreLink",url.origin+"/chat/"+match[1]+"/");onChoose(match[1])}catch{setError("Βάλε τον σύνδεσμο Chat του καταστήματος που σου έδωσε ο ιδιοκτήτης.")}};
 return <form className="login-card chat-mobile-login" onSubmit={submit}><h2>Σύνδεση χειριστή</h2><p>Άνοιξε τον σύνδεσμο του καταστήματός σου ή επικόλλησέ τον εδώ. Μετά επίλεξε το όνομά σου και γράψε το προσωπικό σου PIN.</p><label>Σύνδεσμος καταστήματος<input type="url" required value={link} onChange={e=>setLink(e.target.value)} placeholder={location.origin+"/chat/…/"}/></label>{error&&<p role="alert">{error}</p>}<button>Συνέχεια με PIN</button></form>;
}
