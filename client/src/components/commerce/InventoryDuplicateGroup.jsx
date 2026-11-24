import React,{useState} from "react";

const qty=value=>value===null||value===undefined?"—":Number(value).toLocaleString("el-GR",{maximumFractionDigits:3});

export default function InventoryDuplicateGroup({group, canMerge, onMerge}) {
  const [selectedIds, setSelectedIds] = useState(() =>
    group.items.length <= 4 ? group.items.map(item => item.id) : []
  );
  const label = {BARCODE:"Ίδιο barcode", SKU:"Ίδιος κωδικός", NAME:"Ίδια περιγραφή"}[group.kind];

  return <section>
    <h4>{label} · {group.value}</h4>
    <ul>{group.items.map(item => <li key={item.id}>
      <label>
        {canMerge && <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={event => {
          const checked = event.target.checked;
          setSelectedIds(ids => checked ? [...ids, item.id] : ids.filter(id => id !== item.id));
        }}/>}
        {item.name} · SKU {item.sku || "—"} · Στοκ {qty(item.stock)}
      </label>
    </li>)}</ul>
    {canMerge && <>
      {group.items.length > 4 && <p>Επίλεξε 2 έως 4 είδη για συγχώνευση.</p>}
      <button type="button" disabled={selectedIds.length < 2 || selectedIds.length > 4}
        onClick={() => onMerge(group.items.filter(item => selectedIds.includes(item.id)))}>
        Συγχώνευση επιλεγμένων
      </button>
    </>}
  </section>;
}
