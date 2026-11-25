// Provider menus may expose groups directly or under tabs (production API).
export function netlinkCatalogueGroups(menu) {
  const data=menu?.data?.data??menu?.data??menu;
  if(!data||typeof data!=="object")throw new Error("Μη αναγνωρίσιμη μορφή καταλόγου Netlink.");
  const entries=Array.isArray(data.groups)?data.groups:Array.isArray(data.tabs)?data.tabs.filter(t=>t&&t.disabled!==true).flatMap(t=>Array.isArray(t.groups)?t.groups:[]):null;
  if(!entries)throw new Error("Μη αναγνωρίσιμη μορφή καταλόγου Netlink.");
  return entries.filter(g=>g&&g.disabled!==true).map((g,index)=>({...g,catalogueKey:`netlink-group-${index}`,title:g.title??g.name??"Υπηρεσίες",products:(Array.isArray(g.products)?g.products:[]).filter(p=>p&&typeof p==="object").map(p=>({...p,productId:p.productId??p.id,title:p.title??p.name??String(p.productId??p.id??"Υπηρεσία")}))}));
}
