// A store report must remain tied to its current CommerceHub, including replies
// that arrive after React has changed the selected store.
const loads = new WeakMap();
export function reportContextIsCurrent(root) {
  if (!root?.isConnected) return false;
  const hub = root.closest('.commerce-hub');
  return !hub || Boolean(root.dataset.reportStoreId &&
    root.dataset.reportStoreId === hub.dataset.reportStoreId);
}
export function beginReportLoad(root) {
  const token = {};
  loads.set(root, token);
  return () => loads.get(root) === token && reportContextIsCurrent(root);
}
