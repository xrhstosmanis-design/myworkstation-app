import React,{useEffect,useRef,useState} from "react";

export default function StoreChatGroups({api,storeId,onClose,isCurrentSession}) {
  const endpoint = `/api/store-chat/stores/${encodeURIComponent(storeId)}/groups`;
  const [roster,setRoster] = useState(null);
  const [moderation,setModeration] = useState(null);
  const [selected,setSelected] = useState(null);
  const [messages,setMessages] = useState([]);
  const [name,setName] = useState("");
  const [members,setMembers] = useState([]);
  const [draft,setDraft] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const mounted = useRef(false);
  const closeButton = useRef(null);
  const requestId = useRef(null);
  const messageUpdate = useRef(0);
  const active = () => mounted.current && isCurrentSession();
  const messagePath = id => `${endpoint}/${encodeURIComponent(id)}/messages`;

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    closeButton.current?.focus();
    let cancelled = false;
    api(endpoint).then(data => {
      if (!cancelled && active()) setRoster(data);
    }).catch(error => {
      if (!cancelled && active()) setError(error.message);
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      if (previous?.offsetParent) previous.focus();
      else document.querySelector(".store-chat-modal .chat-overflow")?.focus();
    };
  }, [endpoint]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    let pending = false;
    async function update() {
      if (pending || document.hidden || !active()) return;
      pending = true;
      const updateId = ++messageUpdate.current;
      try {
        const data = await api(messagePath(selected.id));
        if (!cancelled && active() && updateId === messageUpdate.current) setMessages(data.messages);
      } catch (error) {
        if (!cancelled && active() && updateId === messageUpdate.current) {
          setMessages([]);
          setError(error.message);
        }
      } finally {
        pending = false;
      }
    }
    update();
    const interval = setInterval(update, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selected]);

  function select(group) {
    requestId.current = null;
    setSelected(group);
    setMessages([]);
    setDraft("");
    setError("");
  }

  async function create(event) {
    event.preventDefault();
    if (!active() || busy || !name.trim() || !members.length) return;
    setBusy(true);
    setError("");
    try {
      const group = await api(endpoint,{method:"POST",body:JSON.stringify({name,memberIds:members})});
      if (!active()) return;
      setRoster(previous => ({...previous,groups:[...previous.groups,group]}));
      setName("");
      setMembers([]);
      select(group);
    } catch (error) {
      if (active()) setError(error.message);
    } finally {
      if (active()) setBusy(false);
    }
  }

  async function loadModeration() {
    try {
      const result = await api(`${endpoint}/moderation`);
      if (active()) setModeration(result.groups);
    } catch (error) {
      if (active()) setError(error.message);
    }
  }

  async function removeMember(member) {
    if (!active() || busy || !window.confirm(`Αφαίρεση του μέλους «${member.memberName}» από την ομάδα «${member.name}»;`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`${endpoint}/${encodeURIComponent(member.id)}/remove-member`, {
        method:"POST", body:JSON.stringify({userId:member.userId}),
      });
      const updated = await api(endpoint);
      if (!active()) return;
      setRoster(updated);
      if (selected && !updated.groups.some(group => group.id === selected.id)) select(null);
      await loadModeration();
    } catch (error) {
      if (active()) setError(error.message);
    } finally {
      if (active()) setBusy(false);
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!active() || !selected || busy || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      requestId.current ||= crypto.randomUUID();
      await api(messagePath(selected.id),{method:"POST",body:JSON.stringify({body:draft,requestId:requestId.current})});
      if (!active()) return;
      requestId.current = null;
      setDraft("");
      const updateId = ++messageUpdate.current;
      const data = await api(messagePath(selected.id));
      if (active() && updateId === messageUpdate.current) setMessages(data.messages);
    } catch (error) {
      if (active()) setError(error.message);
    } finally {
      if (active()) setBusy(false);
    }
  }

  return <section className="store-chat-tools-layer store-chat-groups" role="dialog" aria-modal="true"
    aria-label="Ομάδες προσωπικού" onKeyDown={event => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const focusable = [...event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary")]
          .filter(element => !element.closest("details:not([open])") || element.matches("summary"));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }}>
    <div className="store-chat-groups-header">
      <h3>Ομάδες προσωπικού</h3>
      <button ref={closeButton} type="button" onClick={onClose}>Κλείσιμο</button>
    </div>
    {error && <p className="store-chat-error" role="alert">{error}</p>}
    {roster?.mayModerate && <details onToggle={event => {
      if (event.currentTarget.open) void loadModeration();
    }}>
      <summary>Διαχείριση μελών ομάδων</summary>
      {moderation === null && <p>Φόρτωση μελών…</p>}
      {moderation?.length === 0 && <p>Δεν υπάρχουν ομάδες.</p>}
      {moderation?.filter(member => member.userId).map(member =>
        <div key={JSON.stringify([member.id,member.userId])}>
          <span>{member.name} · {member.memberName}</span>{" "}
          <button type="button" disabled={busy} onClick={() => removeMember(member)}>Αφαίρεση από ομάδα</button>
        </div>
      )}
    </details>}
    {roster && <>
      <label>Ομάδα
        <select value={selected?.id || ""} disabled={busy} onChange={event =>
          select(roster.groups.find(group => group.id === event.target.value) || null)}>
          <option value="">Επίλεξε ομάδα</option>
          {roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      {selected && <>
        <div className="store-chat-group-messages" role="log" aria-label="Μηνύματα ομάδας">
          {messages.map(message => <article key={message.id}>
            <b>{message.ownMessage ? "Εσύ" : message.senderName}</b>
            <p>{message.body}</p>
          </article>)}
        </div>
        <form onSubmit={send}>
          <label>Μήνυμα<textarea value={draft} onChange={event => {
            requestId.current = null;
            setDraft(event.target.value);
          }}
            maxLength={5000} disabled={busy}/></label>
          <button type="submit" disabled={busy || !draft.trim()}>Αποστολή</button>
        </form>
      </>}
      {roster.mayCreate && <details>
        <summary>Νέα ομάδα</summary>
        <form onSubmit={create}>
          <label>Όνομα ομάδας<input value={name} maxLength={80} disabled={busy}
            onChange={event => setName(event.target.value)}/></label>
          <fieldset disabled={busy}>
            <legend>Μέλη</legend>
            {roster.members.length === 0 && <p>Δεν υπάρχουν διαθέσιμοι υπάλληλοι με πρόσβαση στο Chat.</p>}
            {roster.members.map(member => <label key={member.id}>
              <input type="checkbox" checked={members.includes(member.id)} onChange={event => {
                const checked = event.target.checked;
                setMembers(previous => checked ? [...previous,member.id] : previous.filter(id => id !== member.id));
              }}/>{member.name}
            </label>)}
          </fieldset>
          <button type="submit" disabled={busy || !name.trim() || !members.length || members.length > 100}>Δημιουργία ομάδας</button>
        </form>
      </details>}
    </>}
    {!roster && !error && <p role="status">Φόρτωση ομάδων…</p>}
  </section>;
}
